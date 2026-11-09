import { createServer, request, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDeviceRouter, isBlockedPath, tokenFromHost } from "./device-router";

const DOMAIN = "dev.example.com";
const TOKEN = "a1b2c3d4e5f6a7b8c9d0e1f2";

let metro: Server;
let router: Server;
let routerPort: number;

function port(server: Server) {
  return (server.address() as AddressInfo).port;
}

function get(path: string, host: string, headers: Record<string, string> = {}) {
  return new Promise<{ status: number; body: string }>((resolve, reject) => {
    const req = request(
      { host: "127.0.0.1", port: routerPort, path, headers: { host, ...headers } },
      (res) => {
        let body = "";
        res.on("data", (d) => (body += d));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body }));
      },
    );
    req.on("error", reject);
    req.end();
  });
}

beforeAll(async () => {
  // Stands in for Metro: echoes what it received, and accepts WebSocket-style upgrades.
  metro = createServer((req, res) => {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ path: req.url, headers: req.headers }));
  });
  metro.on("upgrade", (req, socket) => {
    socket.write(
      "HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n",
    );
    socket.on("data", (d) => socket.write(`echo:${d}`));
    socket.on("end", () => socket.end());
  });
  await new Promise<void>((r) => metro.listen(0, "127.0.0.1", r));
  router = createDeviceRouter({
    resolve: (host) => (tokenFromHost(host, DOMAIN) === TOKEN ? port(metro) : null),
  });
  await new Promise<void>((r) => router.listen(0, "127.0.0.1", r));
  routerPort = port(router);
});

afterAll(async () => {
  router.closeAllConnections();
  metro.closeAllConnections();
  await new Promise((r) => router.close(r));
  await new Promise((r) => metro.close(r));
});

describe("phone preview router", () => {
  it("reads the session token from the subdomain and nothing else", () => {
    expect(tokenFromHost(`${TOKEN}.${DOMAIN}`, DOMAIN)).toBe(TOKEN);
    expect(tokenFromHost(`${TOKEN.toUpperCase()}.DEV.EXAMPLE.COM:443`, DOMAIN)).toBe(TOKEN);
    expect(tokenFromHost(DOMAIN, DOMAIN)).toBeNull();
    expect(tokenFromHost(`x.${TOKEN}.${DOMAIN}`, DOMAIN)).toBeNull();
    expect(tokenFromHost(`short.${DOMAIN}`, DOMAIN)).toBeNull();
    expect(tokenFromHost(`${TOKEN}.dev.example.com.evil.net`, DOMAIN)).toBeNull();
    expect(tokenFromHost(undefined, DOMAIN)).toBeNull();
  });

  it("forwards a session's requests to its dev server with the public host and https", async () => {
    const res = await get("/index.bundle?platform=ios", `${TOKEN}.${DOMAIN}`, {
      "x-forwarded-proto": "https",
    });
    expect(res.status).toBe(200);
    const seen = JSON.parse(res.body) as { path: string; headers: Record<string, string> };
    expect(seen.path).toBe("/index.bundle?platform=ios");
    expect(seen.headers["x-forwarded-host"]).toBe(`${TOKEN}.${DOMAIN}`);
    expect(seen.headers["x-forwarded-proto"]).toBe("https");
  });

  it("answers 404 for unknown subdomains and for the debugger and editor endpoints", async () => {
    expect((await get("/", `ffffffffffffffffffffffff.${DOMAIN}`)).status).toBe(404);
    expect((await get("/", "web-production.up.railway.app")).status).toBe(404);
    for (const path of ["/json/list", "/inspector/debug?device=1", "/open-stack-frame"]) {
      expect(isBlockedPath(path)).toBe(true);
      expect((await get(path, `${TOKEN}.${DOMAIN}`)).status).toBe(404);
    }
    expect(isBlockedPath("/hot")).toBe(false);
    expect(isBlockedPath("/node_modules/expo-router/entry.bundle")).toBe(false);
  });

  it("carries WebSocket upgrades (fast refresh) both ways", async () => {
    const reply = await new Promise<string>((resolve, reject) => {
      const req = request({
        host: "127.0.0.1",
        port: routerPort,
        path: "/hot",
        headers: { host: `${TOKEN}.${DOMAIN}`, connection: "Upgrade", upgrade: "websocket" },
      });
      req.on("upgrade", (res, socket) => {
        expect(res.statusCode).toBe(101);
        socket.once("data", (d) => {
          resolve(String(d));
          socket.destroy();
        });
        socket.write("ping");
      });
      req.on("error", reject);
      req.end();
    });
    expect(reply).toBe("echo:ping");
  });
});
