/**
 * Phone-preview relay. Railway gives each service one `*.up.railway.app` address and no
 * wildcard, so phone previews get one public address per relay: this tiny service forwards
 * everything it receives (HTTP and WebSocket upgrades, for fast refresh) to the worker's phone
 * router over Railway's private network, keeping the phone's Host header so the worker knows
 * which preview session it's for (DEVICE_PREVIEW_HOSTS lists every relay's address).
 *
 * No dependencies. Settings: RELAY_TARGET (default worker.railway.internal:8090) and PORT.
 */
import { createServer, request } from "node:http";
import { fileURLToPath } from "node:url";

/** `host:port`, with IPv6 hosts in brackets. */
export function parseTarget(value) {
  const match = /^\[?([^\]]+?)\]?:(\d+)$/.exec(String(value).trim());
  if (!match) throw new Error(`RELAY_TARGET must be host:port, got "${value}"`);
  return { host: match[1], port: Number(match[2]) };
}

export function createRelay({ target }) {
  const server = createServer((req, res) => {
    const upstream = request(
      { ...target, method: req.method, path: req.url, headers: req.headers },
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

  server.on("upgrade", (req, socket, head) => {
    const upstream = request({
      ...target,
      method: req.method,
      path: req.url,
      headers: req.headers,
    });
    upstream.on("upgrade", (response, upstreamSocket, upstreamHead) => {
      const lines = [`HTTP/1.1 ${response.statusCode} ${response.statusMessage}`];
      for (let i = 0; i < response.rawHeaders.length; i += 2)
        lines.push(`${response.rawHeaders[i]}: ${response.rawHeaders[i + 1]}`);
      socket.write(lines.join("\r\n") + "\r\n\r\n");
      if (upstreamHead.length) socket.write(upstreamHead);
      if (head.length) upstreamSocket.write(head);
      upstreamSocket.pipe(socket).pipe(upstreamSocket);
      for (const event of ["close", "error"]) {
        upstreamSocket.on(event, () => socket.destroy());
        socket.on(event, () => upstreamSocket.destroy());
      }
    });
    upstream.on("response", (response) => {
      socket.end(`HTTP/1.1 ${response.statusCode} ${response.statusMessage}\r\n\r\n`);
    });
    upstream.on("error", () => socket.destroy());
    upstream.end();
  });
  return server;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const target = parseTarget(process.env.RELAY_TARGET || "worker.railway.internal:8090");
  const port = Number(process.env.PORT || 8080);
  createRelay({ target }).listen(port, () =>
    console.log(`relay: :${port} → ${target.host}:${target.port}`),
  );
}
