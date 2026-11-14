/**
 * On-device preview: one Expo dev server (Metro) per project that someone is previewing on a
 * phone. Expo Go loads the app from it; when a new version is committed the files are
 * rewritten in place and Metro's fast refresh updates the phone.
 *
 * Sessions live in the device_session table. The web app creates them (status "starting") and
 * refreshes lastSeenAt while the QR dialog is open; this manager starts, syncs and stops them.
 *
 * Phones reach the dev servers one of three ways:
 * - DEVICE_PREVIEW_DOMAIN: a wildcard domain routed to this worker; each session gets a random
 *   subdomain (see device-router.ts). The way to run it on a platform such as Railway.
 * - DEVICE_PREVIEW_HOSTS: a pool of fixed public hosts routed to this worker, comma-separated
 *   (Railway's own `*.up.railway.app` addresses: the worker's, plus relay services that forward
 *   to it over the private network). One session per host; when all are taken, a new session
 *   says so instead of ending someone else's. No custom domain needed.
 * - DEVICE_PREVIEW_SINGLE_HOST: one fixed public host. One session at a time: a new one ends the
 *   previous one.
 * - DEVICE_PREVIEW_TUNNEL=1: Expo's shared tunnel.
 * - Otherwise the LAN address (DEVICE_PREVIEW_HOST or the first IPv4), for self-hosting.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { lstat, mkdir, readFile, readlink, symlink, unlink, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { networkInterfaces } from "node:os";
import { join } from "node:path";
import { and, eq, lt, or } from "drizzle-orm";
import { withoutNativeSupportChat } from "@appbuilder/contract";
import {
  dataDir,
  decryptSecret,
  expoAccount,
  exportBundle,
  getCurrentFiles,
} from "@appbuilder/core";
import { schema, type Database } from "@appbuilder/db";
import { createDeviceRouter, normalizeHost, tokenFromHost } from "./device-router";
import { childEnv, materialize, syncFiles } from "./project";

const IDLE_MINUTES = Number(process.env.DEVICE_PREVIEW_IDLE_MINUTES || 15);

interface Session {
  child: ChildProcess;
  port: number;
  versionId: string | null;
  /** The session's subdomain when phones come in through the router. */
  token?: string;
  /** The session's host from the pool (DEVICE_PREVIEW_HOSTS / DEVICE_PREVIEW_SINGLE_HOST). */
  host?: string;
  /** Whose Expo account the dev server is signed in as. */
  userId: string | null;
}

/** The wildcard's parent domain (`dev.example.com` for `*.dev.example.com`), if routed. */
export function previewDomain(): string {
  return (process.env.DEVICE_PREVIEW_DOMAIN || "").toLowerCase().replace(/^\*\./, "");
}

/** One fixed public host for one session at a time, when there is no wildcard domain. */
export function previewSingleHost(): string {
  if (previewDomain()) return "";
  return normalizeHost((process.env.DEVICE_PREVIEW_SINGLE_HOST || "").replace(/^https?:\/\//, ""));
}

/**
 * Fixed public hosts phones can reach this worker on, one session each: DEVICE_PREVIEW_HOSTS,
 * else DEVICE_PREVIEW_SINGLE_HOST. Empty with a wildcard domain (it has a host per session).
 */
export function previewHostPool(): string[] {
  if (previewDomain()) return [];
  const pool = (process.env.DEVICE_PREVIEW_HOSTS || "")
    .split(",")
    .map((host) =>
      normalizeHost(
        host
          .trim()
          .replace(/^https?:\/\//, "")
          .replace(/\/.*$/, ""),
      ),
    )
    .filter(Boolean);
  if (pool.length) return [...new Set(pool)];
  const single = previewSingleHost();
  return single ? [single] : [];
}

/** The first host of the pool no running session holds, or null when every one is taken. */
export function pickPreviewHost(pool: string[], inUse: Iterable<string>): string | null {
  const taken = new Set(inUse);
  return pool.find((host) => !taken.has(host)) ?? null;
}

let runtimeInstall: Promise<string> | null = null;

/**
 * The pinned SDK dependencies every session symlinks to: the copy baked into the image when
 * there is one (EXPO_RUNTIME_DIR, see the Dockerfile), otherwise installed here once.
 */
export function ensureRuntime(templatePackageJson: string): Promise<string> {
  runtimeInstall ??= (async () => {
    const baked = process.env.EXPO_RUNTIME_DIR;
    if (baked && existsSync(join(baked, "node_modules/expo/package.json")))
      return join(baked, "node_modules");
    const dir = dataDir("expo-runtime");
    if (!existsSync(join(dir, "node_modules/expo/package.json"))) {
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, "package.json"), templatePackageJson);
      await run("npm", ["install", "--no-audit", "--no-fund"], dir);
    }
    return join(dir, "node_modules");
  })().catch((error) => {
    runtimeInstall = null;
    throw error;
  });
  return runtimeInstall;
}

function run(
  command: string,
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv = childEnv(),
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env });
    let output = "";
    child.stdout.on("data", (d) => (output += d));
    child.stderr.on("data", (d) => (output += d));
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) return resolve(output);
      void npmStack(output).then((stack) => {
        const message = `${command} ${args.join(" ")} failed (${code}):\n${stack || output.slice(-2000)}`;
        console.error(`worker: ${message}\n${output.slice(-2000)}`);
        reject(new Error(message));
      });
    });
  });
}

/** Point a session's node_modules at the runtime, replacing a link to an older runtime. */
async function linkNodeModules(link: string, target: string) {
  const current = await lstat(link).catch(() => null);
  if (current?.isSymbolicLink() && (await readlink(link)) === target) return;
  if (current?.isSymbolicLink()) await unlink(link);
  else if (current) return; // a real directory: leave it alone
  await symlink(target, link, "dir");
}

/** npm prints only the error's message; the stack that explains it is in its debug log. */
async function npmStack(output: string): Promise<string> {
  const logPath = /complete log of this run can be found in:\s*(\S+)/.exec(output)?.[1];
  if (!logPath) return "";
  try {
    const lines = (await readFile(logPath, "utf8")).split("\n");
    const start = lines.findIndex((line) => / verbose stack /.test(line));
    const versions = lines.filter((line) => / verbose (node|npm)  ?v/.test(line)).slice(0, 2);
    return start < 0 ? "" : [...versions, ...lines.slice(start, start + 12)].join("\n");
  } catch {
    return "";
  }
}

export function previewHost(): string {
  if (process.env.DEVICE_PREVIEW_HOST) return process.env.DEVICE_PREVIEW_HOST;
  for (const addresses of Object.values(networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.family === "IPv4" && !address.internal) return address.address;
    }
  }
  return "localhost";
}

async function freePort(start = 8100): Promise<number> {
  for (let port = start; port < start + 200; port++) {
    const free = await new Promise<boolean>((resolve) => {
      const server = createServer();
      server.once("error", () => resolve(false));
      server.listen(port, () => server.close(() => resolve(true)));
    });
    if (free) return port;
  }
  throw new Error("No free port for a device preview");
}

async function waitForStatus(port: number, timeoutMs = 120_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/status`);
      if ((await response.text()).includes("running")) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("The Expo dev server did not start in time");
}

export class DeviceManager {
  private sessions = new Map<string, Session>();
  private busy = false;

  constructor(private readonly db: Database) {}

  /**
   * Accept phones on one port and route them to their session's dev server: by subdomain with
   * a wildcard domain, by host with a pool of fixed hosts.
   */
  listen(port = Number(process.env.PORT || 8090)): void {
    const domain = previewDomain();
    const pool = previewHostPool();
    if (!domain && !pool.length) return;
    createDeviceRouter({
      resolve: (host) => {
        const sessions = [...this.sessions.values()];
        if (!domain) return sessions.find((session) => session.host === host)?.port ?? null;
        const token = tokenFromHost(host, domain);
        return sessions.find((session) => token && session.token === token)?.port ?? null;
      },
      // Pool hosts are always public https addresses, even when a relay in front of this
      // worker reached it over plain http on the private network.
      https: !domain,
    }).listen(port, () =>
      console.log(
        `worker: phone previews at ${domain ? `*.${domain}` : pool.join(", ")} (port ${port})`,
      ),
    );
  }

  /** Hosts from the pool held by sessions other than this project's. */
  private hostsInUse(projectId: string): string[] {
    return [...this.sessions.entries()]
      .filter(([id, session]) => id !== projectId && session.host)
      .map(([, session]) => session.host!);
  }

  /** With one shared host, a new session takes the host over from the previous one. */
  private async releaseSingleHost(projectId: string) {
    for (const other of [...this.sessions.keys()]) {
      if (other === projectId) continue;
      this.kill(other);
      await this.update(other, {
        status: "error",
        url: null,
        error:
          "Another phone preview started. This server shows one at a time; close and reopen to take it back.",
      });
    }
  }

  async tick(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      await this.stopIdle();
      const rows = await this.db.select().from(schema.deviceSession);
      for (const row of rows) {
        // "starting" while a dev server runs is a restart request: someone else opened it (it
        // must run as their Expo account) or the viewer just connected their Expo account.
        if (row.status === "starting" && this.sessions.has(row.projectId)) this.kill(row.projectId);
        if (row.status === "starting" && !this.sessions.has(row.projectId))
          await this.start(row.projectId, row.userId);
        else if (row.status === "running") await this.sync(row.projectId);
        else if (row.status === "stopped") this.kill(row.projectId);
      }
    } finally {
      this.busy = false;
    }
  }

  /**
   * The Expo token to run a session's dev server with. On a physical iPhone, Expo Go only opens a
   * dev server signed in as the phone's own Expo account; a token Expo rejects would break the
   * preview for every phone, so it is checked first. `note` explains what won't work.
   */
  private async expoLogin(userId: string | null): Promise<{ token?: string; note: string | null }> {
    if (!userId) return { note: null };
    const [row] = await this.db
      .select()
      .from(schema.integration)
      .where(and(eq(schema.integration.userId, userId), eq(schema.integration.provider, "expo")));
    if (!row) return { note: null };
    const token = decryptSecret(row.encryptedToken);
    const account = await expoAccount(token);
    if (account === null)
      return {
        note: "Expo rejected your saved access token, so an iPhone can't open this preview. Connect a new one below.",
      };
    if (account?.robot)
      return {
        note: "Your saved Expo token is a robot token. On iPhone, Expo Go needs a personal access token from your own account.",
      };
    return { token, note: null };
  }

  private async start(projectId: string, userId: string | null = null) {
    try {
      const { versionId, files } = await getCurrentFiles(this.db, projectId);
      if (!versionId) throw new Error("Build the app first");
      // A fixed host from the pool. A single host is taken over (the old behaviour); a pool of
      // several is shared, and a full pool says so rather than ending someone's preview.
      const domain = previewDomain();
      const pool = previewHostPool();
      const takeOver = !domain && pool.length === 1 && !process.env.DEVICE_PREVIEW_HOSTS;
      if (takeOver) await this.releaseSingleHost(projectId);
      const host = pool.length ? pickPreviewHost(pool, this.hostsInUse(projectId)) : null;
      if (pool.length && !host) {
        await this.update(projectId, {
          status: "error",
          url: null,
          error: `All ${pool.length} phone previews are in use right now. Each one frees up after ${IDLE_MINUTES} minutes without use, so try again in a few minutes.`,
        });
        return;
      }
      const nodeModules = await ensureRuntime(files["package.json"] ?? "{}");
      const dir = dataDir("device", projectId);
      await mkdir(dir, { recursive: true });
      await materialize(exportBundle("Preview", withoutNativeSupportChat(files)), dir);
      await linkNodeModules(join(dir, "node_modules"), nodeModules);
      const expo = await this.expoLogin(userId);

      const port = await freePort();
      const tunnel = !domain && !host && process.env.DEVICE_PREVIEW_TUNNEL === "1";
      // 96 random bits: the subdomain is the only thing standing between a stranger and the app.
      const token = domain ? randomBytes(12).toString("hex") : undefined;
      const publicHost = token ? `${token}.${domain}` : (host ?? "");
      // Expo's CLI straight from the runtime, not through npx: no npm at runtime.
      const child = spawn(
        process.execPath,
        [
          join(nodeModules, "expo/bin/cli"),
          "start",
          "--port",
          String(port),
          publicHost ? "--localhost" : tunnel ? "--tunnel" : "--lan",
        ],
        {
          cwd: dir,
          env: childEnv({
            EXPO_NO_TELEMETRY: "1",
            BROWSER: "none",
            // Signs the dev server in as the viewer, so Expo Go on their iPhone accepts it.
            ...(expo.token ? { EXPO_TOKEN: expo.token } : {}),
            // Manifest and bundle URLs must point at the public subdomain, not localhost.
            ...(publicHost ? { EXPO_PACKAGER_PROXY_URL: `https://${publicHost}` } : {}),
          }),
          stdio: ["ignore", "pipe", "pipe"],
          // Its own process group, so stopping it also stops the Metro that npx launches.
          detached: true,
        },
      );
      let log = "";
      child.stdout?.on("data", (d) => (log = (log + d).slice(-4000)));
      child.stderr?.on("data", (d) => (log = (log + d).slice(-4000)));
      child.on("exit", (code) => {
        if (this.sessions.get(projectId)?.child === child) {
          this.sessions.delete(projectId);
          void this.update(projectId, {
            status: "error",
            error: `Dev server exited (${code}): ${log.slice(-500)}`,
          });
        }
      });
      this.sessions.set(projectId, {
        child,
        port,
        versionId,
        token,
        host: host ?? undefined,
        userId,
      });
      await waitForStatus(port);
      const url = publicHost
        ? `exps://${publicHost}` // Expo Go opens exps:// over https
        : tunnel
          ? (/exp:\/\/[^\s]+/.exec(log)?.[0] ?? null)
          : `exp://${previewHost()}:${port}`;
      // While running, `error` carries a warning for the dialog (what won't work on iPhone).
      await this.update(projectId, { status: "running", url, port, versionId, error: expo.note });
    } catch (error) {
      this.kill(projectId);
      await this.update(projectId, {
        status: "error",
        error: (error as Error).message.slice(0, 1000),
      });
    }
  }

  /** Write the newest version's files into a running session; Metro refreshes the phone. */
  private async sync(projectId: string) {
    const session = this.sessions.get(projectId);
    if (!session) {
      await this.update(projectId, { status: "starting" }); // worker restarted: start again
      return;
    }
    const { versionId, files } = await getCurrentFiles(this.db, projectId);
    if (!versionId || versionId === session.versionId) return;
    // Only what changed: Metro is watching this directory.
    await syncFiles(
      exportBundle("Preview", withoutNativeSupportChat(files)),
      dataDir("device", projectId),
    );
    session.versionId = versionId;
    await this.update(projectId, { versionId });
  }

  private async stopIdle() {
    const cutoff = new Date(Date.now() - IDLE_MINUTES * 60_000);
    const idle = await this.db
      .select({ projectId: schema.deviceSession.projectId })
      .from(schema.deviceSession)
      .where(or(lt(schema.deviceSession.lastSeenAt, cutoff)));
    for (const { projectId } of idle) {
      this.kill(projectId);
      await this.db
        .delete(schema.deviceSession)
        .where(eq(schema.deviceSession.projectId, projectId));
    }
  }

  private kill(projectId: string) {
    const session = this.sessions.get(projectId);
    if (!session) return;
    this.sessions.delete(projectId);
    try {
      // The whole group: npx, and the expo/Metro process it started.
      if (session.child.pid) process.kill(-session.child.pid, "SIGTERM");
    } catch {
      session.child.kill("SIGTERM");
    }
  }

  private async update(
    projectId: string,
    patch: Partial<typeof schema.deviceSession.$inferInsert>,
  ) {
    await this.db
      .update(schema.deviceSession)
      .set(patch)
      .where(eq(schema.deviceSession.projectId, projectId));
  }

  stopAll() {
    for (const projectId of [...this.sessions.keys()]) this.kill(projectId);
  }
}
