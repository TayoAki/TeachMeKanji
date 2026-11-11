import "server-only";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import {
  canEdit,
  canManage,
  FeedbackError,
  InsufficientCredits,
  isAdminEmail,
  isAdminToken,
  LimitReached,
  projectAccess,
  RateLimited,
  reportError,
  RunInProgress,
  VersionConflict,
  type Access,
  type Viewer,
} from "@appbuilder/core";
import { getDb } from "@appbuilder/db";
import { auth } from "./auth";

export const db = () => getDb();

export interface SessionUser extends Viewer {
  name: string;
  image: string | null;
  emailVerified: boolean;
}

export async function getViewer(): Promise<SessionUser | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    image: session.user.image ?? null,
    emailVerified: session.user.emailVerified,
  };
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function requireViewer(): Promise<SessionUser> {
  const viewer = await getViewer();
  if (!viewer) throw new HttpError(401, "Sign in to continue.");
  return viewer;
}

/**
 * The operator: a signed-in user listed in ADMIN_EMAILS, or a request carrying ADMIN_API_TOKEN.
 * Anyone else gets a 404, so the admin surface doesn't advertise itself.
 */
export async function requireAdmin(request?: Request): Promise<SessionUser | null> {
  if (request && isAdminToken(request.headers.get("authorization"))) return null;
  const viewer = await getViewer();
  if (!viewer || !isAdminEmail(viewer.email)) throw new HttpError(404, "Not found.");
  return viewer;
}

/** Load a project the viewer may access at the given level, or throw a 404/403. */
export async function requireProject(projectId: string, need: "view" | "edit" | "manage" = "view") {
  const viewer = await getViewer();
  const result = await projectAccess(db(), projectId, viewer);
  if (!result)
    throw new HttpError(viewer ? 404 : 401, viewer ? "Project not found." : "Sign in to continue.");
  const allowed: Record<typeof need, (a: Access) => boolean> = {
    view: () => true,
    edit: canEdit,
    manage: canManage,
  };
  if (!allowed[need](result.access) || !viewer) {
    if (need !== "view") throw new HttpError(403, "You don't have permission to do that.");
  }
  return { ...result, viewer };
}

/** Wrap a route handler: maps domain errors to HTTP responses. */
export function route<Args extends unknown[]>(handler: (...args: Args) => Promise<Response>) {
  return async (...args: Args): Promise<Response> => {
    try {
      return await handler(...args);
    } catch (error) {
      if (error instanceof HttpError || error instanceof FeedbackError)
        return NextResponse.json({ error: error.message }, { status: error.status });
      if (error instanceof InsufficientCredits) {
        return NextResponse.json(
          {
            error: `You need ${error.needed} credits for this (you have ${error.balance}).`,
            code: "credits",
          },
          { status: 402 },
        );
      }
      if (error instanceof RunInProgress || error instanceof VersionConflict) {
        return NextResponse.json({ error: error.message, code: "conflict" }, { status: 409 });
      }
      if (error instanceof RateLimited) {
        return NextResponse.json({ error: error.message, code: "rate_limited" }, { status: 429 });
      }
      if (error instanceof LimitReached)
        return NextResponse.json({ error: error.message, code: "limit" }, { status: 403 });
      reportError(error, { where: "api" });
      return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
    }
  };
}

export async function readJson<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new HttpError(400, "Invalid JSON body.");
  }
}
