import { auth } from "@/lib/auth";

/**
 * Protected-resource metadata (RFC 9728) for the MCP endpoint: tells MCP clients which
 * authorization server issues its tokens. The MCP plugin serves it from Better Auth's handler,
 * which Next only mounts at /api/auth, so the request is forwarded.
 */
const forward = (request: Request) => auth.handler(request);

export const GET = forward;
export const HEAD = forward;
