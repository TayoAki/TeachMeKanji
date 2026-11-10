import "server-only";
import { join } from "node:path";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/server";
import {
  appImagesFile,
  applyAppName,
  applyChanges,
  IMAGES_FILE,
  readAppImages,
  contractRules,
  formatIssues,
  projectContext,
  refreshTemplate,
  type ProjectFiles,
} from "@appbuilder/contract";
import { readTree } from "@appbuilder/contract/node";
import {
  activeRun,
  addMessage,
  assertProjectRate,
  canEdit,
  canManage,
  canSeeSource,
  commitVersion,
  createProject,
  getCurrentFiles,
  getStorage,
  LimitReached,
  listProjectsFor,
  newId,
  PLANS,
  projectAccess,
  publishProject,
  RateLimited,
  repoRoot,
  updateProject,
  userPlan,
  VersionConflict,
  versionNumbers,
  WindowLimiter,
  type Access,
  type Project,
  type Viewer,
} from "@appbuilder/core";
import { schema } from "@appbuilder/db";
import { setAppCloud } from "./app-cloud-switch";
import { appOrigin } from "./auth";
import { fetchPublicImage, ImageFetchError, MAX_IMAGE_BYTES, sniffImage } from "./images";
import { db, HttpError } from "./server";
import { templateFiles } from "./template";

/**
 * The MCP server: the tools an AI assistant the user already pays for (Claude, ChatGPT,
 * Cursor…) uses to build apps here. The assistant writes the code; every write goes through the
 * same validator as the built-in agent, and only a passing project is saved as a version.
 */

type ToolResult = { content: Array<{ type: "text"; text: string }>; isError?: boolean };

const ok = (text: string): ToolResult => ({ content: [{ type: "text", text }] });
const fail = (text: string): ToolResult => ({ content: [{ type: "text", text }], isError: true });

/** Writes are cheap for the assistant and cost us storage: 300 an hour per user. */
const writes = new WindowLimiter(300, 3_600_000);

const INSTRUCTIONS = `This server builds real mobile apps (Expo / React Native) that run live in the user's browser and on their phone.
Workflow: create_project (or list_projects), then get_app_rules for that project, then write_files with complete file contents. write_files validates the whole project and saves a new version only when it passes; if it reports problems, fix them and write again. Give the user the link from get_preview_link: the app runs there and updates after every write.`;

const WORKFLOW = `How to build with these tools
1. Read every rule above. They are enforced: write_files rejects code that breaks them.
2. A new app's first write_files must include at least app/(tabs)/_layout.tsx, app/(tabs)/index.tsx, theme/tokens.ts (exactly 5 theme packs), data/schema.ts and data/seed.ts, plus the other screens and components. Platform files already exist; never write them.
3. Always send complete files, never diffs. Send related files together (a screen and the component it imports) so the project validates.
4. If write_files reports problems, nothing was saved: fix them and write again.
5. Keep seed data realistic: every screen must render with it and with no route params.
6. After saving, share the preview link with the user.`;

async function viewerFor(userId: string): Promise<Viewer> {
  const [row] = await db()
    .select({
      id: schema.user.id,
      email: schema.user.email,
      emailVerified: schema.user.emailVerified,
    })
    .from(schema.user)
    .where(eq(schema.user.id, userId));
  if (!row) throw new HttpError(401, "This connection's account no longer exists.");
  return row;
}

async function requireMcpPlan(userId: string) {
  const plan = await userPlan(db(), userId);
  if (!PLANS[plan].mcp) {
    throw new HttpError(
      403,
      `Building from an AI assistant is part of the Pro plan. Upgrade at ${appOrigin}/pricing, then try again.`,
    );
  }
  return plan;
}

async function access(
  viewer: Viewer,
  projectId: string,
  need: (access: Access) => boolean,
): Promise<{ project: Project; access: Access }> {
  const found = await projectAccess(db(), projectId, viewer);
  if (!found || !need(found.access)) {
    throw new HttpError(404, "No project with that id that you can change. Call list_projects.");
  }
  return found;
}

function workspaceUrl(projectId: string) {
  return `${appOrigin}/projects/${projectId}`;
}

let example: Promise<ProjectFiles> | null = null;
/** A hand-written reference app, shown to the assistant for the shape of tokens and tabs. */
function exampleFiles(): Promise<ProjectFiles> {
  example ??= readTree(join(repoRoot(), "fixtures/habit-tracker"));
  return example;
}

/** Turn thrown errors into tool errors the assistant can act on. */
function guard<A>(fn: (args: A) => Promise<ToolResult>) {
  return async (args: A): Promise<ToolResult> => {
    try {
      return await fn(args);
    } catch (error) {
      if (
        error instanceof HttpError ||
        error instanceof LimitReached ||
        error instanceof RateLimited
      ) {
        return fail(error.message);
      }
      if (error instanceof VersionConflict) {
        return fail(
          "The project changed while you were writing (someone edited it). Call get_app_rules or read_files to see the current files, then write again.",
        );
      }
      throw error;
    }
  };
}

/** One server instance per request, bound to the user the access token belongs to. */
export function buildMcpServer(userId: string, clientName: string): McpServer {
  const server = new McpServer(
    { name: "app-builder", version: "1.0.0" },
    { instructions: INSTRUCTIONS },
  );

  server.registerTool(
    "list_projects",
    {
      title: "List projects",
      description: "The apps you own or can edit, newest first.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
    },
    guard(async () => {
      const viewer = await viewerFor(userId);
      const projects = (await listProjectsFor(db(), viewer)).filter((p) => canEdit(p.role));
      if (projects.length === 0) return ok("No projects yet. Use create_project to start one.");
      return ok(
        projects
          .map(
            (p) =>
              `${p.id} · ${p.name} · ${p.role} · ${p.currentVersionId ? "built" : "not built yet"} · updated ${p.updatedAt.toISOString().slice(0, 10)}`,
          )
          .join("\n"),
      );
    }),
  );

  server.registerTool(
    "create_project",
    {
      title: "Create a project",
      description:
        "Start a new app. Returns its id; then call get_app_rules with it and write the app with write_files.",
      inputSchema: z.object({
        name: z.string().min(1).max(60).describe("The app's name, e.g. 'Habit Loop'"),
        description: z.string().min(1).max(2000).describe("What the app does, in the user's words"),
      }),
    },
    guard(async ({ name, description }) => {
      await requireMcpPlan(userId);
      await assertProjectRate(db(), userId);
      const project = await createProject(db(), {
        ownerId: userId,
        prompt: description,
        platforms: "both",
        name: name.trim(),
      });
      return ok(
        `Created "${project.name}" (id ${project.id}).\nNext: get_app_rules with project_id "${project.id}", then write the whole app with write_files.\nThe user can watch it at ${workspaceUrl(project.id)}`,
      );
    }),
  );

  server.registerTool(
    "get_app_rules",
    {
      title: "Get the app rules",
      description:
        "The rules every app must follow (allowed packages, theming, data, navigation), plus the project's current files and routes. Call before writing.",
      inputSchema: z.object({
        project_id: z.string().describe("From create_project or list_projects"),
      }),
      annotations: { readOnlyHint: true },
    },
    guard(async ({ project_id }) => {
      const viewer = await viewerFor(userId);
      const { project } = await access(viewer, project_id, canSeeSource);
      const { versionId, files } = await getCurrentFiles(db(), project.id);
      const current = refreshTemplate(versionId ? files : {}, await templateFiles());
      let text = `${contractRules()}\n\n${WORKFLOW}\n\n${projectContext(current)}`;
      if (!versionId) {
        const ex = await exampleFiles();
        text += `\n\nThis project has no app yet. For the shape of the required files, here is part of another app (don't copy its content):\n\n${[
          "app/(tabs)/_layout.tsx",
          "theme/tokens.ts",
          "data/schema.ts",
        ]
          .map((p) => `<file path="${p}">\n${ex[p] ?? ""}\n</file>`)
          .join("\n\n")}`;
      }
      return ok(text);
    }),
  );

  server.registerTool(
    "read_files",
    {
      title: "Read files",
      description:
        "Without paths: every file in the project with its size. With paths: their full contents.",
      inputSchema: z.object({
        project_id: z.string(),
        paths: z.array(z.string()).max(40).optional(),
      }),
      annotations: { readOnlyHint: true },
    },
    guard(async ({ project_id, paths }) => {
      const viewer = await viewerFor(userId);
      const { project } = await access(viewer, project_id, canSeeSource);
      const { files } = await getCurrentFiles(db(), project.id);
      if (!paths?.length) {
        const list = Object.keys(files).sort();
        return ok(
          list.length
            ? list.map((p) => `${p} (${files[p]!.length} chars)`).join("\n")
            : "No files yet: the app hasn't been written.",
        );
      }
      let budget = 300_000;
      const out: string[] = [];
      for (const path of paths) {
        const source = files[path];
        if (source === undefined) {
          out.push(`<missing path="${path}" />`);
          continue;
        }
        if (source.length > budget) {
          out.push(`<skipped path="${path}">too much in one call; read it separately</skipped>`);
          continue;
        }
        budget -= source.length;
        out.push(`<file path="${path}">\n${source}\n</file>`);
      }
      return ok(out.join("\n\n"));
    }),
  );

  server.registerTool(
    "write_files",
    {
      title: "Write files",
      description:
        "Create, replace or delete files. The whole project is validated; it is saved as a new version only if it passes, otherwise you get the problems to fix. Send complete files.",
      inputSchema: z.object({
        project_id: z.string(),
        files: z
          .array(z.object({ path: z.string(), content: z.string() }))
          .max(60)
          .describe("Complete contents of each file to create or replace"),
        delete: z.array(z.string()).max(60).optional().describe("Paths to delete"),
        summary: z
          .string()
          .min(1)
          .max(200)
          .describe("One line describing the change, shown in the project's history"),
      }),
    },
    guard(async ({ project_id, files: writesIn, delete: removes, summary }) => {
      const plan = await requireMcpPlan(userId);
      const viewer = await viewerFor(userId);
      const { project } = await access(viewer, project_id, canEdit);
      if (!writes.take(userId))
        throw new HttpError(429, "Too many writes this hour. Try again later.");
      if (await activeRun(db(), project.id)) {
        throw new HttpError(
          409,
          "The built-in agent is working on this project. Try again in a minute.",
        );
      }
      const current = await getCurrentFiles(db(), project.id);
      const write: Record<string, string> = {};
      for (const f of writesIn) write[f.path] = f.content;
      const result = applyChanges(
        current.files,
        await templateFiles(),
        { write, remove: removes ?? [] },
        { maxScreens: PLANS[plan].maxScreensPerProject },
      );
      const warnings = result.issues.filter((i) => i.severity !== "error");
      if (!result.ok) {
        const problems = [
          ...result.rejected.map((r) => `REJECTED ${r.path}: ${r.reason}`),
          formatIssues(result.issues.filter((i) => i.severity === "error")),
        ].filter(Boolean);
        return fail(`Nothing was saved. Fix these and write again:\n${problems.join("\n")}`);
      }
      if (result.changed.length === 0) return ok("No changes: the files are already like that.");
      const files = current.versionId ? result.files : applyAppName(result.files, project.name);
      const version = await commitVersion(db(), {
        projectId: project.id,
        files,
        kind: "ai_edit",
        summary: summary.slice(0, 200),
        createdBy: userId,
        ...(current.versionId ? { expectedParentId: current.versionId } : {}),
      });
      if (project.status !== "ready") await updateProject(db(), project.id, { status: "ready" });
      await addMessage(db(), {
        projectId: project.id,
        role: "assistant",
        content: {
          text: `${summary} (from ${clientName})`,
          changed: result.changed,
          versionId: version.id,
        },
      });
      const number = (await versionNumbers(db(), [version.id])).get(version.id);
      return ok(
        [
          `Saved version ${number ?? ""}. Changed: ${result.changed.join(", ")}.`,
          warnings.length ? `Warnings (not blocking):\n${formatIssues(warnings)}` : "",
          `Live preview: ${workspaceUrl(project.id)}`,
        ]
          .filter(Boolean)
          .join("\n"),
      );
    }),
  );

  server.registerTool(
    "add_image",
    {
      title: "Add an image",
      description:
        'Add an image to the app (for example one you generated), then show it with <AiImage name="..." /> from components/AiImage. Give exactly one of: image (a file from this conversation), image_url (a public https URL) or image_base64.',
      inputSchema: z.object({
        project_id: z.string(),
        name: z
          .string()
          .regex(/^[a-z][a-z0-9-]{0,39}$/)
          .describe('Short name used in code, e.g. "hero" or "empty-state"'),
        image: z
          .object({
            download_url: z.string(),
            file_id: z.string().optional(),
            mime_type: z.string().optional(),
            file_name: z.string().optional(),
          })
          .optional()
          .describe("A file from the conversation, such as an image you generated"),
        image_url: z.string().optional().describe("A public https URL of a PNG, JPEG, GIF or WebP"),
        image_base64: z.string().optional().describe("The image bytes, base64-encoded"),
      }),
      // ChatGPT passes files from the conversation (uploaded or generated) in these fields.
      _meta: { "openai/fileParams": ["image"] },
    },
    guard(async ({ project_id, name, image, image_url, image_base64 }) => {
      await requireMcpPlan(userId);
      const viewer = await viewerFor(userId);
      const { project } = await access(viewer, project_id, canEdit);
      if (!writes.take(userId))
        throw new HttpError(429, "Too many writes this hour. Try again later.");
      const sources = [image?.download_url, image_url, image_base64].filter(Boolean);
      if (sources.length !== 1) {
        throw new HttpError(400, "Give exactly one of image, image_url or image_base64.");
      }
      let data: Buffer;
      let mime: string | null;
      if (image_base64) {
        data = Buffer.from(image_base64.replace(/^data:[^,]*,/, ""), "base64");
        if (data.byteLength > MAX_IMAGE_BYTES)
          throw new HttpError(400, "Images must be under 8 MB.");
        mime = sniffImage(data);
        if (!mime) throw new HttpError(400, "That isn't a PNG, JPEG, GIF or WebP image.");
      } else {
        try {
          ({ data, mime } = await fetchPublicImage((image?.download_url ?? image_url)!));
        } catch (error) {
          if (error instanceof ImageFetchError) throw new HttpError(400, error.message);
          throw error;
        }
      }
      const current = await getCurrentFiles(db(), project.id);
      if (!current.versionId)
        throw new HttpError(400, "Write the app first, then add images to it.");
      if (await activeRun(db(), project.id)) {
        throw new HttpError(
          409,
          "The built-in agent is working on this project. Try again in a minute.",
        );
      }

      // Images are stored and served by us: cap each app at 100 images and 100 MB.
      const [usage] = await db()
        .select({
          count: sql<number>`count(*)::int`,
          bytes: sql<number>`coalesce(sum(${schema.projectAsset.bytes}), 0)::bigint`.mapWith(
            Number,
          ),
        })
        .from(schema.projectAsset)
        .where(
          and(
            eq(schema.projectAsset.projectId, project.id),
            eq(schema.projectAsset.purpose, "app_image"),
          ),
        );
      if ((usage?.count ?? 0) >= 100 || (usage?.bytes ?? 0) + data.byteLength > 100 * 1024 * 1024) {
        throw new HttpError(
          507,
          "This app has reached its image storage limit (100 images, 100 MB).",
        );
      }
      const id = newId("img");
      const storageKey = `projects/${project.id}/images/${id}`;
      await getStorage().put(storageKey, data, mime);
      await db().insert(schema.projectAsset).values({
        id,
        projectId: project.id,
        storageKey,
        fileName: name,
        mime,
        bytes: data.byteLength,
        purpose: "app_image",
      });
      const files = refreshTemplate(current.files, await templateFiles());
      const origin = (process.env.APP_PUBLIC_URL || appOrigin).replace(/\/$/, "");
      files[IMAGES_FILE] = appImagesFile({
        ...readAppImages(files),
        [name]: `${origin}/api/app-images/${id}`,
      });
      await commitVersion(db(), {
        projectId: project.id,
        files,
        kind: "ai_edit",
        summary: `Added image "${name}"`,
        createdBy: userId,
        expectedParentId: current.versionId,
      });
      return ok(
        `Added image "${name}". Show it with <AiImage name="${name}" style={{ height: 200, borderRadius: theme.radius.md }} /> (import { AiImage } from the project's components/AiImage).`,
      );
    }),
  );

  server.registerTool(
    "get_preview_link",
    {
      title: "Get the preview link",
      description: "Where the user can try the app (and open it on their phone).",
      inputSchema: z.object({ project_id: z.string() }),
      annotations: { readOnlyHint: true },
    },
    guard(async ({ project_id }) => {
      const viewer = await viewerFor(userId);
      const { project } = await access(viewer, project_id, canSeeSource);
      return ok(
        [
          `Workspace (live preview, phone QR code, editing): ${workspaceUrl(project.id)}`,
          project.publishedSlug ? `Published web app: ${appOrigin}/p/${project.publishedSlug}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
      );
    }),
  );

  server.registerTool(
    "set_app_cloud",
    {
      title: "Turn App Cloud on or off",
      description:
        "App Cloud stores the app's data in the cloud per user and enables sign-in (useAuth from data/auth). Off: data stays on the device. Owner only.",
      inputSchema: z.object({ project_id: z.string(), enabled: z.boolean() }),
    },
    guard(async ({ project_id, enabled }) => {
      await requireMcpPlan(userId);
      const viewer = await viewerFor(userId);
      const { project } = await access(viewer, project_id, canManage);
      await setAppCloud({
        project,
        userId,
        enabled,
        apiOrigin: (process.env.APP_PUBLIC_URL || appOrigin).replace(/\/$/, ""),
      });
      return ok(
        enabled
          ? "App Cloud is on. Data is saved per user in the cloud; the app may now have sign-in screens built with useAuth() from data/auth."
          : "App Cloud is off. Data stays on each device.",
      );
    }),
  );

  server.registerTool(
    "publish",
    {
      title: "Publish",
      description: "Publish the current version as a public web app. Owner only.",
      inputSchema: z.object({ project_id: z.string() }),
    },
    guard(async ({ project_id }) => {
      await requireMcpPlan(userId);
      const viewer = await viewerFor(userId);
      const { project } = await access(viewer, project_id, canManage);
      if (!project.currentVersionId)
        throw new HttpError(400, "Write the app before publishing it.");
      const slug = await publishProject(db(), project);
      return ok(`Published at ${appOrigin}/p/${slug}`);
    }),
  );

  return server;
}
