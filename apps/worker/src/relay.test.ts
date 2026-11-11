import { createServer, request, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
// @ts-expect-error -- the relay is a dependency-free .mjs file with its own tiny image.
import { createRelay, parseTarget } from "../../../relay/relay.mjs";
import { createDeviceRouter } from "./device-router";

const RELAY_HOST = "preview-relay-1.up.railway.app";
let metro: Server;
let router: Server;
let relay: Server;
const portOf = (server: Server) => (server.address() as AddressInfo).port;

beforeAll(async () => {
  // Metro stands-in: echoes the headers it saw, and accepts WebSocket upgrades.
  metro = createServer((req, res) => res.end(JSON.stringify(req.headers)));
  metro.on("upgrade", (_req, socket) => {
    socket.write(
      "HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n",
    );
    socket.on("data", (d) => socket.write(`echo:${d}`));
  });
  await new Promise<void>((r) => metro.listen(0, "127.0.0.1", r));
  // The worker's phone router, as in pool mode.
  router = createDeviceRouter({
    resolve: (host) => (host === RELAY_HOST ? portOf(metro) : null),
    https: true,
  });
  await new Promise<void>((r) => router.listen(0, "127.0.0.1", r));
  relay = createRelay({ target: { host: "127.0.0.1", port: portOf(router) } });
  await new Promise<void>((r) => relay.listen(0, "127.0.0.1", r));
});

afterAll(() => {
  // Upgraded (WebSocket) sockets aren't tracked by closeAllConnections; don't wait on them.
  for (const server of [relay, router, metro]) {
    server.closeAllConnections();
    server.close();
  }
});

describe("phone-preview relay", () => {
  it("reads its target", () => {
    expect(parseTarget("worker.railway.internal:8090")).toEqual({
      host: "worker.railway.internal",
      port: 8090,
    });
    expect(parseTarget("[fd12::1]:8090")).toEqual({ host: "fd12::1", port: 8090 });
    expect(() => parseTarget("worker")).toThrow(/host:port/);
  });

  it("carries a phone's request through to its session with the relay's own host", async () => {
    const body = await new Promise<string>((resolve, reject) => {
      const req = request(
        { host: "127.0.0.1", port: portOf(relay), path: "/", headers: { host: RELAY_HOST } },
        (res) => {
          let text = "";
          res.on("data", (d) => (text += d));
          res.on("end", () => resolve(text));
        },
      );
      req.on("error", reject);
      req.end();
    });
    const headers = JSON.parse(body) as Record<string, string>;
    expect(headers["x-forwarded-host"]).toBe(RELAY_HOST);
    expect(headers["x-forwarded-proto"]).toBe("https");
  });

  it("carries fast refresh (WebSocket) both ways", async () => {
    const reply = await new Promise<string>((resolve, reject) => {
      const req = request({
        host: "127.0.0.1",
        port: portOf(relay),
        path: "/hot",
        headers: { host: RELAY_HOST, connection: "Upgrade", upgrade: "websocket" },
      });
      req.on("upgrade", (res, socket) => {
        expect(res.statusCode).toBe(101);
        socket.write("ping");
        socket.once("data", (d) => {
          resolve(String(d));
          socket.destroy();
        });
      });
      req.on("error", reject);
      req.end();
    });
    expect(reply).toBe("echo:ping");
  });

  it("answers 502 when the worker isn't there", async () => {
    const dead = createRelay({ target: { host: "127.0.0.1", port: 1 } });
    await new Promise<void>((r) => dead.listen(0, "127.0.0.1", r));
    const status = await new Promise<number>((resolve) => {
      request({ host: "127.0.0.1", port: portOf(dead), path: "/" }, (res) =>
        resolve(res.statusCode ?? 0),
      ).end();
    });
    expect(status).toBe(502);
    dead.closeAllConnections();
    dead.close();
  });
});
