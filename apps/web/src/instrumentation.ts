import type { Instrumentation } from "next";

/** Report every server error (pages, route handlers, server actions) once, in one place. */
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  // Every route runs on Node.js; the check also keeps Node-only modules out of the Edge bundle.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { reportError } = await import("@appbuilder/core");
  reportError(error, {
    where: "next",
    path: request.path,
    method: request.method,
    route: context.routePath,
  });
};
