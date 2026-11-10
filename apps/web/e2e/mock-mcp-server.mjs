/**
 * A stand-in for a connector's remote MCP server and its OAuth server, for the e2e suite
 * (CONNECTOR_LINEAR_URL / CONNECTOR_NOTION_URL point here). It speaks the MCP authorization
 * spec: protected-resource metadata, authorization-server metadata, dynamic client
 * registration, authorization code + PKCE (approved at once, as if the user clicked Allow),
 * and an MCP endpoint that only answers valid Bearer tokens.
 */
import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";

export const MOCK_MCP_PORT = Number(process.env.MOCK_MCP_PORT || 3005);
const base = `http://localhost:${MOCK_MCP_PORT}`;
const codes = new Map();
const tokens = new Set(["lin_api_e2e_good_token", "sk_e2e_good_revenuecat_token"]);

function send(res, status, body, headers = {}) {
  res.writeHead(status, { "content-type": "application/json", ...headers });
  res.end(typeof body === "string" ? body : JSON.stringify(body));
}

async function readBody(req) {
  let data = "";
  for await (const chunk of req) data += chunk;
  return data;
}

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", base);
  if (url.pathname === "/health") return send(res, 200, { ok: true });
  if (url.pathname === "/.well-known/oauth-protected-resource/mcp")
    return send(res, 200, { resource: `${base}/mcp`, authorization_servers: [base] });
  if (url.pathname === "/.well-known/oauth-authorization-server")
    return send(res, 200, {
      issuer: base,
      authorization_endpoint: `${base}/authorize`,
      token_endpoint: `${base}/token`,
      registration_endpoint: `${base}/register`,
      code_challenge_methods_supported: ["S256"],
    });
  if (url.pathname === "/register" && req.method === "POST") {
    const body = JSON.parse(await readBody(req));
    return send(res, 201, { client_id: `e2e-client-${randomBytes(4).toString("hex")}`, ...body });
  }
  if (url.pathname === "/authorize") {
    const redirect = new URL(url.searchParams.get("redirect_uri"));
    const code = randomBytes(8).toString("hex");
    codes.set(code, url.searchParams.get("code_challenge"));
    redirect.searchParams.set("code", code);
    redirect.searchParams.set("state", url.searchParams.get("state") ?? "");
    res.writeHead(302, { location: redirect.toString() });
    return res.end();
  }
  if (url.pathname === "/token" && req.method === "POST") {
    const form = new URLSearchParams(await readBody(req));
    const challenge = codes.get(form.get("code"));
    const verifier = form.get("code_verifier") ?? "";
    if (!challenge || createHash("sha256").update(verifier).digest("base64url") !== challenge)
      return send(res, 400, { error: "invalid_grant" });
    codes.delete(form.get("code"));
    const access = `e2e-access-${randomBytes(8).toString("hex")}`;
    tokens.add(access);
    return send(res, 200, {
      access_token: access,
      refresh_token: `e2e-refresh-${randomBytes(8).toString("hex")}`,
      expires_in: 3600,
      token_type: "Bearer",
    });
  }
  if (url.pathname === "/mcp" && req.method === "POST") {
    const token = (req.headers.authorization ?? "").replace(/^Bearer /, "");
    if (!tokens.has(token))
      return send(
        res,
        401,
        { error: "invalid_token" },
        {
          "www-authenticate": `Bearer resource_metadata="${base}/.well-known/oauth-protected-resource/mcp"`,
        },
      );
    const body = JSON.parse(await readBody(req));
    // Notifications get no response body, as in the MCP spec.
    if (body.id === undefined) return send(res, 202, {});
    if (body.method === "tools/list")
      return send(res, 200, {
        jsonrpc: "2.0",
        id: body.id,
        result: {
          tools: [
            { name: "search_issues", inputSchema: { type: "object" } },
            { name: "get_issue", inputSchema: { type: "object" } },
          ],
        },
      });
    return send(
      res,
      200,
      {
        jsonrpc: "2.0",
        id: body.id,
        result: {
          protocolVersion: "2025-06-18",
          capabilities: { tools: {} },
          serverInfo: { name: "e2e-mcp", version: "1.0.0" },
        },
      },
      { "mcp-session-id": "e2e-session" },
    );
  }
  send(res, 404, { error: "not found" });
}).listen(MOCK_MCP_PORT, () => console.log(`mock MCP server on ${base}`));
