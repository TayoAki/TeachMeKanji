import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { AppCloudError, reportError, sessionUser, type AppUser } from "@appbuilder/core";
import { schema } from "@appbuilder/db";
import { db } from "./server";

/**
 * The App Cloud API is called by generated apps from anywhere (phones, the sandboxed preview,
 * published web apps), so it's CORS-open and authenticated by bearer tokens, never cookies.
 */
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Max-Age": "86400",
};

export function preflight() {
  return new Response(null, { status: 204, headers: CORS });
}

export function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: CORS });
}

export interface AppContext {
  projectId: string;
  token: string | null;
  user: AppUser | null;
  requireUser: () => AppUser;
}

/**
 * `requires`: "cloud" (the default) for App Cloud's data, accounts, push and AI; "analytics" for
 * usage events, which work whether or not the app keeps its data in App Cloud.
 */
export function appRoute<P extends { projectId: string }>(
  handler: (request: Request, ctx: AppContext, params: P) => Promise<Response>,
  options: { requires?: "cloud" | "analytics" } = {},
) {
  return async (request: Request, context: { params: Promise<P> }): Promise<Response> => {
    try {
      const params = await context.params;
      const [project] = await db()
        .select({
          id: schema.project.id,
          backend: schema.project.backend,
          analytics: schema.project.analytics,
        })
        .from(schema.project)
        .where(and(eq(schema.project.id, params.projectId), isNull(schema.project.deletedAt)));
      if (options.requires === "analytics") {
        if (!project?.analytics) throw new AppCloudError(404, "Analytics is off for this app.");
      } else if (!project || project.backend !== "cloud") {
        throw new AppCloudError(404, "App Cloud isn't enabled for this app.");
      }
      const header = request.headers.get("authorization") ?? "";
      const token = header.startsWith("Bearer ") ? header.slice(7).trim() || null : null;
      const user = await sessionUser(db(), project.id, token);
      return await handler(
        request,
        {
          projectId: project.id,
          token,
          user,
          requireUser: () => {
            if (!user) throw new AppCloudError(401, "Not signed in.");
            return user;
          },
        },
        params,
      );
    } catch (error) {
      if (error instanceof AppCloudError) return json({ error: error.message }, error.status);
      // reportError redacts query parameters: they hold end users' emails and records.
      reportError(error, { where: "app-cloud", method: request.method });
      return json({ error: "Something went wrong." }, 500);
    }
  };
}

/** Request bodies: small for auth, enough for 200 records of 32 KB for writes. */
export const BODY_LIMITS = { auth: 16 * 1024, records: 7 * 1024 * 1024 };

/** Parse a JSON body, reading at most `maxBytes` (whatever Content-Length claims). */
export async function body<T>(request: Request, maxBytes = BODY_LIMITS.auth): Promise<T> {
  const tooLarge = () => new AppCloudError(413, "Request body is too large.");
  if (Number(request.headers.get("content-length") ?? 0) > maxBytes) throw tooLarge();
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (request.body) {
    const reader = request.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw tooLarge();
      }
      chunks.push(value);
    }
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as T;
  } catch {
    throw new AppCloudError(400, "Invalid JSON body.");
  }
}
