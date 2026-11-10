/**
 * App Cloud: the built-in backend for generated apps. Each generated app gets its own users
 * (anonymous device users by default, email/password when the app adds sign-in) and per-user
 * collections of JSON records. Generated apps reach it through data/remote.ts and
 * data/auth.ts in the template.
 */
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { and, count, desc, eq, gt, inArray, isNotNull, isNull, lt, sql } from "drizzle-orm";
import { schema, type Database } from "@appbuilder/db";
import { sha256 } from "./crypto";
import { newId } from "./ids";

const { appPushToken, appRecord, appSession, appUser } = schema;
const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

export const APP_CLOUD_LIMITS = {
  recordsPerProject: 20_000,
  /** Per user, so one device can't use up the app's storage. */
  recordsPerAnonymousUser: 500,
  recordsPerAccount: 5_000,
  recordBytes: 32 * 1024,
  recordsPerRequest: 200,
  sessionDays: 90,
  /** The workspace preview's sessions are short: editors can lose access. */
  previewSessionHours: 24,
  /** Anonymous users who never saved anything are removed after this long. */
  idleAnonymousDays: 30,
};

/** The one app user the workspace preview acts as (see previewSession). */
const PREVIEW_USER = "Preview";

const COLLECTION = /^[a-z][a-z0-9_]{0,40}$/;
const RECORD_ID = /^[A-Za-z0-9_-]{1,64}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class AppCloudError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export type AppUser = typeof appUser.$inferSelect;

function isPreviewUser(user: AppUser): boolean {
  return user.email === null && user.name === PREVIEW_USER;
}

function isUniqueViolation(error: unknown): boolean {
  const e = error as { code?: string; cause?: { code?: string } } | null;
  return e?.code === "23505" || e?.cause?.code === "23505";
}

export function publicUser(user: AppUser) {
  return { id: user.id, email: user.email, name: user.name, anonymous: user.email === null };
}

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt, 32);
  return `scrypt.${salt.toString("base64url")}.${hash.toString("base64url")}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, salt, hash] = stored.split(".");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64url");
  const actual = await scryptAsync(password, Buffer.from(salt, "base64url"), expected.length);
  return timingSafeEqual(actual, expected);
}

async function createSession(
  db: Database,
  user: AppUser,
  ttlMs = APP_CLOUD_LIMITS.sessionDays * 86_400_000,
): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await db.insert(appSession).values({
    tokenHash: sha256(token),
    appUserId: user.id,
    projectId: user.projectId,
    expiresAt: new Date(Date.now() + ttlMs),
  });
  return token;
}

export async function createAnonymousUser(db: Database, projectId: string) {
  const [user] = await db
    .insert(appUser)
    .values({ id: newId("au"), projectId })
    .returning();
  return { user: user!, token: await createSession(db, user!) };
}

export async function sessionUser(
  db: Database,
  projectId: string,
  token: string | null,
): Promise<AppUser | null> {
  if (!token) return null;
  const [row] = await db
    .select({ user: appUser })
    .from(appSession)
    .innerJoin(appUser, eq(appUser.id, appSession.appUserId))
    .where(
      and(
        eq(appSession.tokenHash, sha256(token)),
        eq(appSession.projectId, projectId),
        gt(appSession.expiresAt, new Date()),
      ),
    );
  return row?.user ?? null;
}

export async function signOutApp(db: Database, token: string): Promise<void> {
  await db.delete(appSession).where(eq(appSession.tokenHash, sha256(token)));
}

/**
 * Create an email account. If the caller is an anonymous user, that user is upgraded in place,
 * so the data they created before signing up stays theirs. The workspace preview's shared user
 * is never upgraded: its tokens are handed to every editor.
 */
export async function signUpApp(
  db: Database,
  projectId: string,
  input: { email: string; password: string; name?: string },
  current: AppUser | null,
) {
  const email = input.email.trim().toLowerCase();
  if (!EMAIL.test(email)) throw new AppCloudError(400, "Enter a valid email address.");
  if (input.password.length < 8)
    throw new AppCloudError(400, "Passwords need at least 8 characters.");
  const [existing] = await db
    .select({ id: appUser.id })
    .from(appUser)
    .where(and(eq(appUser.projectId, projectId), eq(appUser.email, email)));
  if (existing) throw new AppCloudError(409, "An account with this email already exists.");

  const passwordHash = await hashPassword(input.password);
  const name = input.name?.trim().slice(0, 80) || email.split("@")[0]!;
  let user: AppUser;
  try {
    if (current && current.email === null && !isPreviewUser(current)) {
      [user] = (await db
        .update(appUser)
        .set({ email, name, passwordHash })
        .where(eq(appUser.id, current.id))
        .returning()) as [AppUser];
    } else {
      [user] = (await db
        .insert(appUser)
        .values({ id: newId("au"), projectId, email, name, passwordHash })
        .returning()) as [AppUser];
    }
  } catch (error) {
    // Two sign-ups with the same email at once: the unique index decides.
    if (isUniqueViolation(error)) {
      throw new AppCloudError(409, "An account with this email already exists.");
    }
    throw error;
  }
  return { user, token: await createSession(db, user) };
}

export async function signInApp(
  db: Database,
  projectId: string,
  input: { email: string; password: string },
) {
  const email = input.email.trim().toLowerCase();
  const [user] = await db
    .select()
    .from(appUser)
    .where(and(eq(appUser.projectId, projectId), eq(appUser.email, email)));
  if (!user?.passwordHash || !(await verifyPassword(input.password, user.passwordHash))) {
    throw new AppCloudError(401, "Wrong email or password.");
  }
  return { user, token: await createSession(db, user) };
}

/**
 * Delete an app user and everything stored for them: their sessions, records and push tokens go
 * with the row. Apple requires apps that let people create an account to let them delete it
 * in the app (App Review Guideline 5.1.1(v)). The workspace preview's shared user is emptied
 * instead of deleted, so the other editors' previews keep working.
 */
export async function deleteAppUser(db: Database, user: AppUser): Promise<{ preview: boolean }> {
  if (isPreviewUser(user)) {
    await db.delete(appRecord).where(eq(appRecord.ownerId, user.id));
    await db.delete(appPushToken).where(eq(appPushToken.userId, user.id));
    return { preview: true };
  }
  await db
    .delete(appUser)
    .where(and(eq(appUser.id, user.id), eq(appUser.projectId, user.projectId)));
  return { preview: false };
}

function checkCollection(collection: string) {
  if (!COLLECTION.test(collection)) throw new AppCloudError(400, "Invalid collection name.");
}

export async function listRecords(db: Database, owner: AppUser, collection: string) {
  checkCollection(collection);
  const rows = await db
    .select({ id: appRecord.id, data: appRecord.data })
    .from(appRecord)
    .where(
      and(
        eq(appRecord.projectId, owner.projectId),
        eq(appRecord.ownerId, owner.id),
        eq(appRecord.collection, collection),
      ),
    )
    .orderBy(appRecord.createdAt, appRecord.id);
  return rows.map((r) => ({ ...r.data, id: r.id }));
}

/**
 * Insert or replace records (bulk), enforcing the size, per-user and per-project limits. The
 * limits are checked under a per-project lock, so concurrent writes can't overshoot them.
 */
export async function putRecords(
  db: Database,
  owner: AppUser,
  collection: string,
  records: Array<Record<string, unknown>>,
): Promise<void> {
  checkCollection(collection);
  if (records.length === 0) return;
  if (records.length > APP_CLOUD_LIMITS.recordsPerRequest)
    throw new AppCloudError(400, "Too many records in one request.");
  const values = records.map((record) => {
    const id = String(record.id ?? "");
    if (!RECORD_ID.test(id))
      throw new AppCloudError(400, "Every record needs an id of letters, numbers, '-' or '_'.");
    const { id: _ignored, ...data } = record;
    void _ignored;
    if (Buffer.byteLength(JSON.stringify(data)) > APP_CLOUD_LIMITS.recordBytes) {
      throw new AppCloudError(413, "A record is larger than 32 KB.");
    }
    return { projectId: owner.projectId, ownerId: owner.id, collection, id, data };
  });
  // The same id twice in one request: the last one wins (an upsert can't touch a row twice).
  const unique = [...new Map(values.map((v) => [v.id, v])).values()];
  const ids = unique.map((v) => v.id);
  await db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${"app-cloud:" + owner.projectId}))`,
    );
    const [{ existing }] = (await tx
      .select({ existing: count() })
      .from(appRecord)
      .where(
        and(
          eq(appRecord.projectId, owner.projectId),
          eq(appRecord.ownerId, owner.id),
          eq(appRecord.collection, collection),
          inArray(appRecord.id, ids),
        ),
      )) as [{ existing: number }];
    const added = ids.length - existing;
    if (added > 0) {
      const [usage] = (await tx
        .select({
          total: count(),
          mine: sql<number>`count(*) filter (where ${appRecord.ownerId} = ${owner.id})`.mapWith(
            Number,
          ),
        })
        .from(appRecord)
        .where(eq(appRecord.projectId, owner.projectId))) as [{ total: number; mine: number }];
      const perUser =
        owner.email === null
          ? APP_CLOUD_LIMITS.recordsPerAnonymousUser
          : APP_CLOUD_LIMITS.recordsPerAccount;
      if (usage.mine + added > perUser) {
        throw new AppCloudError(507, "This account has reached its storage limit.");
      }
      if (usage.total + added > APP_CLOUD_LIMITS.recordsPerProject) {
        throw new AppCloudError(507, "This app has reached its storage limit.");
      }
    }
    await tx
      .insert(appRecord)
      .values(unique)
      .onConflictDoUpdate({
        target: [appRecord.projectId, appRecord.ownerId, appRecord.collection, appRecord.id],
        set: { data: sql`excluded.data`, updatedAt: new Date() },
      });
  });
}

export async function deleteRecord(
  db: Database,
  owner: AppUser,
  collection: string,
  id: string,
): Promise<void> {
  checkCollection(collection);
  await db
    .delete(appRecord)
    .where(
      and(
        eq(appRecord.projectId, owner.projectId),
        eq(appRecord.ownerId, owner.id),
        eq(appRecord.collection, collection),
        eq(appRecord.id, id),
      ),
    );
}

/** What the project owner sees in the workspace's Data tab. */
export async function appDataSummary(db: Database, projectId: string) {
  const [users] = await db
    .select({
      total: count(),
      signedUp: sql<number>`count(${appUser.email})::int`,
    })
    .from(appUser)
    .where(eq(appUser.projectId, projectId));
  const collections = await db
    .select({ name: appRecord.collection, records: count() })
    .from(appRecord)
    .where(eq(appRecord.projectId, projectId))
    .groupBy(appRecord.collection)
    .orderBy(appRecord.collection);
  const recent = await db
    .select({
      collection: appRecord.collection,
      id: appRecord.id,
      data: appRecord.data,
      updatedAt: appRecord.updatedAt,
      owner: sql<string>`coalesce(${appUser.email}, 'anonymous')`,
    })
    .from(appRecord)
    .innerJoin(appUser, eq(appUser.id, appRecord.ownerId))
    .where(eq(appRecord.projectId, projectId))
    .orderBy(desc(appRecord.updatedAt))
    .limit(50);
  const accounts = await db
    .select({ email: appUser.email, name: appUser.name, createdAt: appUser.createdAt })
    .from(appUser)
    .where(and(eq(appUser.projectId, projectId), isNotNull(appUser.email)))
    .orderBy(desc(appUser.createdAt))
    .limit(50);
  return {
    users: { total: users?.total ?? 0, signedUp: users?.signedUp ?? 0 },
    collections,
    recent,
    accounts,
  };
}

export async function clearAppData(db: Database, projectId: string): Promise<void> {
  await db.delete(appUser).where(eq(appUser.projectId, projectId));
}

function previewUserFilter(projectId: string) {
  return and(
    eq(appUser.projectId, projectId),
    isNull(appUser.email),
    eq(appUser.name, PREVIEW_USER),
  );
}

/**
 * The workspace preview acts as one stable app user per project, so its data persists across
 * reloads. Its sessions last a day, and removing a member revokes them.
 */
export async function previewSession(db: Database, projectId: string): Promise<string> {
  const [existing] = await db.select().from(appUser).where(previewUserFilter(projectId));
  const user =
    existing ??
    (
      await db
        .insert(appUser)
        .values({ id: newId("au"), projectId, name: PREVIEW_USER })
        .returning()
    )[0]!;
  return createSession(db, user, APP_CLOUD_LIMITS.previewSessionHours * 3_600_000);
}

export async function revokePreviewSessions(db: Database, projectId: string): Promise<void> {
  const users = db.select({ id: appUser.id }).from(appUser).where(previewUserFilter(projectId));
  await db.delete(appSession).where(inArray(appSession.appUserId, users));
}

/**
 * Housekeeping (the worker runs it hourly): drop expired sessions, and anonymous users who
 * never saved anything. A device whose user was removed simply gets a new one.
 */
export async function pruneAppCloud(db: Database): Promise<{ sessions: number; users: number }> {
  const sessions = await db
    .delete(appSession)
    .where(lt(appSession.expiresAt, new Date()))
    .returning({ tokenHash: appSession.tokenHash });
  const users = await db
    .delete(appUser)
    .where(
      and(
        isNull(appUser.email),
        sql`${appUser.name} is distinct from ${PREVIEW_USER}`,
        lt(
          appUser.createdAt,
          new Date(Date.now() - APP_CLOUD_LIMITS.idleAnonymousDays * 86_400_000),
        ),
        sql`not exists (select 1 from ${appRecord} where ${appRecord.ownerId} = ${appUser.id})`,
      ),
    )
    .returning({ id: appUser.id });
  return { sessions: sessions.length, users: users.length };
}
