/**
 * Bug reports and feature requests from the builder. Users send them with the context that
 * helps reproduce a bug (the page, the browser, the builder's recent errors, the project's last
 * failed run); the team triages them (status and a reply the user sees) and is told about new
 * ones through FEEDBACK_WEBHOOK_URL (Slack or Discord) and FEEDBACK_EMAIL.
 */
import { and, count, desc, eq, gt } from "drizzle-orm";
import {
  schema,
  type Database,
  type FeedbackContext,
  type FeedbackKind,
  type FeedbackStatus,
} from "@appbuilder/db";
import { projectAccess, type Viewer } from "./authz";
import { emailProviderSet, sendEmail } from "./email";
import { newId } from "./ids";
import { RateLimited } from "./limits";
import { reportError } from "./report";
import type { Storage } from "./storage";

const { feedback, agentRun, project, user } = schema;

export const FEEDBACK_LIMITS = {
  title: 120,
  body: 5000,
  images: 3,
  imageBytes: 5 * 1024 * 1024,
  perHour: 10,
} as const;

export const FEEDBACK_KINDS: readonly FeedbackKind[] = ["bug", "request", "other"];
export const FEEDBACK_STATUSES: readonly FeedbackStatus[] = [
  "new",
  "planned",
  "in_progress",
  "done",
  "wont_do",
];
export const FEEDBACK_STATUS_LABELS: Record<FeedbackStatus, string> = {
  new: "New",
  planned: "Planned",
  in_progress: "In progress",
  done: "Done",
  wont_do: "Won't do",
};
const KIND_LABELS: Record<FeedbackKind, string> = {
  bug: "Bug",
  request: "Feature request",
  other: "Feedback",
};

export class FeedbackError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export type Feedback = typeof feedback.$inferSelect;

/** Whether this email may triage feedback (ADMIN_EMAILS, comma-separated). */
export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
    .includes(email.toLowerCase());
}

function imageType(data: Buffer): { extension: string; contentType: string } | null {
  if (data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
    return { extension: "png", contentType: "image/png" };
  if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff)
    return { extension: "jpg", contentType: "image/jpeg" };
  if (
    data.subarray(0, 4).toString("latin1") === "RIFF" &&
    data.subarray(8, 12).toString("latin1") === "WEBP"
  )
    return { extension: "webp", contentType: "image/webp" };
  if (data.subarray(0, 6).toString("latin1").startsWith("GIF8"))
    return { extension: "gif", contentType: "image/gif" };
  return null;
}

/** Keep only the context keys we know, each trimmed; the server adds the rest. */
function cleanContext(raw: unknown): FeedbackContext {
  const input = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const text = (value: unknown, max: number) =>
    typeof value === "string" && value ? value.slice(0, max) : undefined;
  const errors = Array.isArray(input.errors)
    ? input.errors
        .filter((e): e is string => typeof e === "string" && e.length > 0)
        .slice(-10)
        .map((e) => e.slice(0, 400))
    : [];
  return {
    path: text(input.path, 200),
    userAgent: text(input.userAgent, 300),
    viewport: text(input.viewport, 20),
    ...(errors.length ? { errors } : {}),
  };
}

export async function submitFeedback(
  db: Database,
  storage: Storage,
  input: {
    viewer: Viewer & { name: string };
    kind: unknown;
    title: unknown;
    body: unknown;
    projectId?: string | null;
    context?: unknown;
    /** Attach the project's last failed run (the sender can switch technical details off). */
    includeRunError?: boolean;
    images?: Buffer[];
  },
): Promise<Feedback> {
  const kind = FEEDBACK_KINDS.find((k) => k === input.kind);
  if (!kind) throw new FeedbackError(400, "Choose bug, feature request or other.");
  const title = String(input.title ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, FEEDBACK_LIMITS.title);
  const body = String(input.body ?? "")
    .trim()
    .slice(0, FEEDBACK_LIMITS.body);
  if (title.length < 3) throw new FeedbackError(400, "Give it a short title.");
  if (body.length < 10) throw new FeedbackError(400, "Add a few words of detail.");
  const images = input.images ?? [];
  if (images.length > FEEDBACK_LIMITS.images)
    throw new FeedbackError(400, `Attach at most ${FEEDBACK_LIMITS.images} screenshots.`);
  const types = images.map((data) => {
    if (data.length > FEEDBACK_LIMITS.imageBytes)
      throw new FeedbackError(413, "Each screenshot must be under 5 MB.");
    const type = imageType(data);
    if (!type) throw new FeedbackError(400, "Screenshots must be PNG, JPEG, WebP or GIF images.");
    return type;
  });

  const [recent] = await db
    .select({ n: count() })
    .from(feedback)
    .where(
      and(
        eq(feedback.userId, input.viewer.id),
        gt(feedback.createdAt, new Date(Date.now() - 3_600_000)),
      ),
    );
  if ((recent?.n ?? 0) >= FEEDBACK_LIMITS.perHour)
    throw new RateLimited("You've sent a lot of reports this hour. Try again in a little while.");

  // Only a project the user can open is linked, with its last failed run as a clue.
  const context = cleanContext(input.context);
  let projectId: string | null = null;
  if (input.projectId) {
    const access = await projectAccess(db, input.projectId, input.viewer);
    if (access) {
      projectId = input.projectId;
    }
    if (projectId && input.includeRunError !== false) {
      const [failed] = await db
        .select({ kind: agentRun.kind, error: agentRun.error, at: agentRun.finishedAt })
        .from(agentRun)
        .where(and(eq(agentRun.projectId, projectId), eq(agentRun.status, "failed")))
        .orderBy(desc(agentRun.createdAt))
        .limit(1);
      if (failed?.error)
        context.lastFailedRun = {
          kind: failed.kind,
          error: failed.error.slice(0, 400),
          at: (failed.at ?? new Date()).toISOString(),
        };
    }
  }
  const build = process.env.RAILWAY_GIT_COMMIT_SHA || process.env.GIT_COMMIT_SHA;
  if (build) context.build = build.slice(0, 12);

  const id = newId("fb");
  const keys: string[] = [];
  for (const [i, data] of images.entries()) {
    const key = `feedback/${id}/${i}.${types[i]!.extension}`;
    await storage.put(key, data, types[i]!.contentType);
    keys.push(key);
  }
  const [row] = await db
    .insert(feedback)
    .values({ id, userId: input.viewer.id, projectId, kind, title, body, context, images: keys })
    .returning();
  void notifyTeam(row!, input.viewer).catch((error) =>
    reportError(error, { where: "feedback-notify" }),
  );
  return row!;
}

/** Tell the team about a new report: a Slack/Discord webhook and/or an email. */
async function notifyTeam(row: Feedback, viewer: { email: string; name: string }) {
  const appUrl = (process.env.APP_PUBLIC_URL || process.env.BETTER_AUTH_URL || "").replace(
    /\/$/,
    "",
  );
  const link = appUrl ? `${appUrl}/admin/feedback#${row.id}` : row.id;
  const headline = `${KIND_LABELS[row.kind]}: ${row.title}`;
  const text = `${headline}\nFrom ${viewer.name} <${viewer.email}>${row.context.path ? ` on ${row.context.path}` : ""}\n\n${row.body.slice(0, 1500)}${row.images.length ? `\n\n${row.images.length} screenshot(s)` : ""}\n\n${link}`;
  const webhook = process.env.FEEDBACK_WEBHOOK_URL;
  if (webhook) {
    // `text` for Slack, `content` for Discord (each ignores the other's field).
    await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, content: text.slice(0, 1900) }),
    });
  }
  const to = process.env.FEEDBACK_EMAIL;
  if (to && emailProviderSet()) await sendEmail({ to, subject: headline, text });
}

/** A user's own reports, newest first. */
export async function listUserFeedback(db: Database, userId: string) {
  return db
    .select()
    .from(feedback)
    .where(eq(feedback.userId, userId))
    .orderBy(desc(feedback.createdAt))
    .limit(100);
}

/** Every report with who sent it, for triage. */
export async function listFeedback(
  db: Database,
  filter: { status?: FeedbackStatus; kind?: FeedbackKind } = {},
) {
  const where = [
    ...(filter.status ? [eq(feedback.status, filter.status)] : []),
    ...(filter.kind ? [eq(feedback.kind, filter.kind)] : []),
  ];
  return db
    .select({
      feedback,
      userEmail: user.email,
      userName: user.name,
      projectName: project.name,
    })
    .from(feedback)
    .innerJoin(user, eq(user.id, feedback.userId))
    .leftJoin(project, eq(project.id, feedback.projectId))
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(feedback.createdAt))
    .limit(500);
}

/**
 * Triage: set the status and/or the reply. The user is emailed when either changes (with a
 * real email provider), and sees both in Settings → Your reports either way.
 */
export async function updateFeedback(
  db: Database,
  id: string,
  patch: { status?: unknown; reply?: unknown },
): Promise<Feedback> {
  const [current] = await db.select().from(feedback).where(eq(feedback.id, id));
  if (!current) throw new FeedbackError(404, "Not found.");
  const status =
    patch.status === undefined ? current.status : FEEDBACK_STATUSES.find((s) => s === patch.status);
  if (!status) throw new FeedbackError(400, "Unknown status.");
  const reply =
    patch.reply === undefined
      ? current.reply
      : String(patch.reply ?? "")
          .trim()
          .slice(0, FEEDBACK_LIMITS.body) || null;
  const [row] = await db
    .update(feedback)
    .set({ status, reply, updatedAt: new Date() })
    .where(eq(feedback.id, id))
    .returning();
  if ((status !== current.status || reply !== current.reply) && emailProviderSet()) {
    const [owner] = await db
      .select({ email: user.email })
      .from(user)
      .where(eq(user.id, row!.userId));
    const appUrl = (process.env.APP_PUBLIC_URL || process.env.BETTER_AUTH_URL || "").replace(
      /\/$/,
      "",
    );
    if (owner)
      await sendEmail({
        to: owner.email,
        subject: `Your report: ${row!.title} — ${FEEDBACK_STATUS_LABELS[status]}`,
        text: `Thanks for your ${KIND_LABELS[row!.kind].toLowerCase()} "${row!.title}". Its status is now: ${FEEDBACK_STATUS_LABELS[status]}.${reply ? `\n\n${reply}` : ""}\n\nSee all your reports: ${appUrl}/settings#feedback`,
      }).catch((error) => reportError(error, { where: "feedback-reply" }));
  }
  return row!;
}

/** A report's screenshot, for its sender or the team. */
export async function feedbackImage(
  db: Database,
  storage: Storage,
  id: string,
  index: number,
  viewer: { id: string; admin: boolean },
) {
  const [row] = await db.select().from(feedback).where(eq(feedback.id, id));
  if (!row || (row.userId !== viewer.id && !viewer.admin)) return null;
  const key = row.images[index];
  return key ? storage.get(key) : null;
}
