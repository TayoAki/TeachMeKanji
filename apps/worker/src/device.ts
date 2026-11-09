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
 * - DEVICE_PREVIEW_SINGLE_HOST: one fixed public host routed to this worker (Railway's own
 *   `*.up.railway.app` address). One session at a time: a new one ends the previous one. Meant
 *   for trying phone previews before setting up a wildcard domain.
 * - DEVICE_PREVIEW_TUNNEL=1: Expo's shared tunnel.
 * - Otherwise the LAN address (DEVICE_PREVIEW_HOST or the first IPv4), for self-hosting.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, symlink, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { networkInterfaces } from "node:os";
import { join } from "node:path";
import { eq, lt, or } from "drizzle-orm";
import { dataDir, exportBundle, getCurrentFiles } from "@appbuilder/core";
import { schema, type Database } from "@appbuilder/db";
import { createDeviceRouter, normalizeHost, tokenFromHost } from "./device-router";
import { childEnv, materialize } from "./project";

const IDLE_MINUTES = Number(process.env.DEVICE_PREVIEW_IDLE_MINUTES || 15);

interface Session {
  child: ChildProcess;
  port: number;
  versionId: string | null;
  /** The session's subdomain when phones come in through the router. */
  token?: string;
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

let runtimeInstall: Promise<string> | null = null;

/** Install the pinned SDK dependencies once; every session symlinks to them. */
export function ensureRuntime(templatePackageJson: string): Promise<string> {
  runtimeInstall ??= (async () => {
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
    child.on("exit", (code) =>
      code === 0
        ? resolve(output)
        : reject(
            new Error(`${command} ${args.join(" ")} failed (${code}):\n${output.slice(-2000)}`),
          ),
    );
  });
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

  /** With DEVICE_PREVIEW_DOMAIN set, accept phones on one port and route them by subdomain. */
  listen(port = Number(process.env.PORT || 8090)): void {
    const domain = previewDomain();
    const single = previewSingleHost();
    if (!domain && !single) return;
    createDeviceRouter({
      resolve: (host) => {
        const sessions = [...this.sessions.values()];
        if (single) return host === single ? (sessions[0]?.port ?? null) : null;
        const token = tokenFromHost(host, domain);
        return sessions.find((session) => token && session.token === token)?.port ?? null;
      },
    }).listen(port, () =>
      console.log(`worker: phone previews at ${single || `*.${domain}`} (port ${port})`),
    );
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
        if (row.status === "starting" && !this.sessions.has(row.projectId))
          await this.start(row.projectId);
        else if (row.status === "running") await this.sync(row.projectId);
        else if (row.status === "stopped") this.kill(row.projectId);
      }
    } finally {
      this.busy = false;
    }
  }

  private async start(projectId: string) {
    try {
      const { versionId, files } = await getCurrentFiles(this.db, projectId);
      if (!versionId) throw new Error("Build the app first");
      const nodeModules = await ensureRuntime(files["package.json"] ?? "{}");
      const dir = dataDir("device", projectId);
      await mkdir(dir, { recursive: true });
      await materialize(exportBundle("Preview", files), dir);
      if (!existsSync(join(dir, "node_modules")))
        await symlink(nodeModules, join(dir, "node_modules"), "dir");

      const port = await freePort();
      const domain = previewDomain();
      const single = previewSingleHost();
      const tunnel = !domain && !single && process.env.DEVICE_PREVIEW_TUNNEL === "1";
      // 96 random bits: the subdomain is the only thing standing between a stranger and the app.
      const token = domain ? randomBytes(12).toString("hex") : undefined;
      const publicHost = token ? `${token}.${domain}` : single;
      if (single) await this.releaseSingleHost(projectId);
      const child = spawn(
        "npx",
        [
          "expo",
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
      this.sessions.set(projectId, { child, port, versionId, token });
      await waitForStatus(port);
      const url = publicHost
        ? `exps://${publicHost}` // Expo Go opens exps:// over https
        : tunnel
          ? (/exp:\/\/[^\s]+/.exec(log)?.[0] ?? null)
          : `exp://${previewHost()}:${port}`;
      await this.update(projectId, { status: "running", url, port, versionId, error: null });
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
    await materialize(exportBundle("Preview", files), dataDir("device", projectId));
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
