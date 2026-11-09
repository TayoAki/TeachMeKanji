/**
 * Public entry point for phone previews on hosts that expose one HTTPS domain per service
 * (Railway, Fly, Render...): a wildcard domain such as `*.dev.example.com` points at this
 * router, and each preview session gets a random subdomain that is forwarded to its own Metro
 * dev server on localhost. Expo Go opens it as `exps://<token>.dev.example.com`.
 *
 * The token is the only credential, so it is long and random, and the endpoints that would let
 * a visitor debug the phone's JS or open files on the server are never forwarded.
 */
import { request, createServer, type IncomingMessage, type Server } from "node:http";
import type { Duplex } from "node:stream";

/** Metro/Expo endpoints a phone never needs: the JS debugger and "open in editor". */
const BLOCKED_PATHS = [
  /^\/inspector(\/|$)/,
  /^\/json(\/|$)/,
  /^\/open-stack-frame(\/|$)/,
  /^\/open-url(\/|$)/,
  /^\/debugger-frontend(\/|$)/,
  /^\/launch-js-devtools(\/|$)/,
  /^\/_expo\/debugger(\/|$)/,
];

export interface DeviceRouterOptions {
  /** The wildcard's parent, e.g. `dev.example.com` for `*.dev.example.com`. */
  domain: string;
  /** The local Metro port for a subdomain token, or null when no session has it. */
  resolve: (token: string) => number | null;
}

/** The subdomain token in a Host header, or null when the host isn't `<token>.<domain>`. */
export function tokenFromHost(host: string | undefined, domain: string): string | null {
  if (!host) return null;
  const name = host.toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "");
  const suffix = `.${domain.toLowerCase()}`;
  if (!name.endsWith(suffix)) return null;
  const token = name.slice(0, -suffix.length);
  return /^[a-z0-9]{16,63}$/.test(token) ? token : null;
}

export function isBlockedPath(url: string | undefined): boolean {
  const path = (url ?? "/").split("?")[0]!;
  return BLOCKED_PATHS.some((pattern) => pattern.test(path));
}

/** What Metro needs to build URLs the phone can reach: the public host and https. */
function forwardedHeaders(req: IncomingMessage): Record<string, string> {
  const host = req.headers.host ?? "";
  // The platform's edge terminates TLS and says so; without one (local tests) it's plain http.
  const proto = String(req.headers["x-forwarded-proto"] ?? "http")
    .split(",")[0]!
    .trim();
  return { "x-forwarded-host": host, "x-forwarded-proto": proto };
}

function target(req: IncomingMessage, options: DeviceRouterOptions): number | null {
  if (isBlockedPath(req.url)) return null;
  const token = tokenFromHost(req.headers.host, options.domain);
  return token ? options.resolve(token) : null;
}

export function createDeviceRouter(options: DeviceRouterOptions): Server {
  const server = createServer((req, res) => {
    const port = target(req, options);
    if (!port) {
      res.writeHead(404, { "content-type": "text/plain" }).end("No preview here.");
      return;
    }
    const upstream = request(
      {
        host: "127.0.0.1",
        port,
        method: req.method,
        path: req.url,
        headers: { ...req.headers, ...forwardedHeaders(req) },
      },
      (response) => {
        res.writeHead(response.statusCode ?? 502, response.headers);
        response.pipe(res);
      },
    );
    upstream.on("error", () => {
      if (!res.headersSent) res.writeHead(502, { "content-type": "text/plain" });
      res.end("The preview server isn't answering.");
    });
    req.pipe(upstream);
  });

  // Fast refresh and the dev menu use WebSockets (/hot, /message).
  server.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const port = target(req, options);
    if (!port) {
      socket.end("HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n");
      return;
    }
    const upstream = request({
      host: "127.0.0.1",
      port,
      method: req.method,
      path: req.url,
      headers: { ...req.headers, ...forwardedHeaders(req) },
    });
    upstream.on("upgrade", (response, upstreamSocket, upstreamHead) => {
      const lines = [`HTTP/1.1 ${response.statusCode} ${response.statusMessage}`];
      for (let i = 0; i < response.rawHeaders.length; i += 2)
        lines.push(`${response.rawHeaders[i]}: ${response.rawHeaders[i + 1]}`);
      socket.write(lines.join("\r\n") + "\r\n\r\n");
      if (upstreamHead.length) socket.write(upstreamHead);
      if (head.length) upstreamSocket.write(head);
      upstreamSocket.pipe(socket).pipe(upstreamSocket);
      // When either side goes away (the phone locks, Metro restarts), drop the other too.
      for (const event of ["close", "error"]) {
        upstreamSocket.on(event, () => socket.destroy());
        socket.on(event, () => upstreamSocket.destroy());
      }
    });
    upstream.on("response", (response) => {
      // Upstream refused the upgrade: pass its answer on and close.
      socket.end(`HTTP/1.1 ${response.statusCode} ${response.statusMessage}\r\n\r\n`);
    });
    upstream.on("error", () => socket.destroy());
    upstream.end();
  });

  return server;
}
