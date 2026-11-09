/**
 * On-device preview: one Expo dev server (Metro) per project that someone is previewing on a
 * phone. Expo Go loads the app from it; when a new version is committed the files are
 * rewritten in place and Metro's fast refresh updates the phone.
 *
 * Sessions live in the device_session table. The web app creates them (status "starting") and
 * refreshes lastSeenAt while the QR dialog is open; this manager starts, syncs and stops them.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, symlink, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { networkInterfaces } from "node:os";
import { join } from "node:path";
import { eq, lt, or } from "drizzle-orm";
import { dataDir, exportBundle, getCurrentFiles } from "@appbuilder/core";
import { schema, type Database } from "@appbuilder/db";
import { childEnv, materialize } from "./project";

const IDLE_MINUTES = Number(process.env.DEVICE_PREVIEW_IDLE_MINUTES || 15);

interface Session {
  child: ChildProcess;
  port: number;
  versionId: string | null;
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
      const tunnel = process.env.DEVICE_PREVIEW_TUNNEL === "1";
      const child = spawn(
        "npx",
        ["expo", "start", "--port", String(port), tunnel ? "--tunnel" : "--lan"],
        {
          cwd: dir,
          env: childEnv({ EXPO_NO_TELEMETRY: "1", BROWSER: "none" }),
          stdio: ["ignore", "pipe", "pipe"],
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
      this.sessions.set(projectId, { child, port, versionId });
      await waitForStatus(port);
      const url = tunnel
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
    session.child.kill("SIGTERM");
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
