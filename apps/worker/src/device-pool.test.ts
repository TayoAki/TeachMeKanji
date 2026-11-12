import { createServer, request, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { metroCacheDir, pickPreviewHost, previewHostPool } from "./device";
import { createDeviceRouter } from "./device-router";

const POOL = ["worker-production.up.railway.app", "preview-relay-1.up.railway.app"];

describe("phone preview host pool", () => {
  it("reads the pool from DEVICE_PREVIEW_HOSTS, else the single host, never with a wildcard", () => {
    const saved = { ...process.env };
    try {
      process.env.DEVICE_PREVIEW_HOSTS =
        " https://Worker-Production.up.railway.app/ ,preview-relay-1.up.railway.app,, worker-production.up.railway.app";
      expect(previewHostPool()).toEqual(POOL);
      delete process.env.DEVICE_PREVIEW_HOSTS;
      process.env.DEVICE_PREVIEW_SINGLE_HOST = "worker-production.up.railway.app";
      expect(previewHostPool()).toEqual([POOL[0]]);
      process.env.DEVICE_PREVIEW_DOMAIN = "*.dev.example.com";
      expect(previewHostPool()).toEqual([]);
    } finally {
      process.env = saved;
    }
  });

  it("gives each session a free host, and none once every host is taken", () => {
    expect(pickPreviewHost(POOL, [])).toBe(POOL[0]);
    expect(pickPreviewHost(POOL, [POOL[0]!])).toBe(POOL[1]);
    expect(pickPreviewHost(POOL, POOL)).toBeNull();
    expect(pickPreviewHost([], [])).toBeNull();
  });
});

describe("phone preview router behind a relay", () => {
  let metro: Server;
  let router: Server;
  beforeAll(async () => {
    metro = createServer((req, res) => res.end(JSON.stringify(req.headers)));
    await new Promise<void>((r) => metro.listen(0, "127.0.0.1", r));
    const metroPort = (metro.address() as AddressInfo).port;
    router = createDeviceRouter({
      resolve: (host) => (host === POOL[1] ? metroPort : null),
      https: true,
    });
    await new Promise<void>((r) => router.listen(0, "127.0.0.1", r));
  });
  afterAll(async () => {
    await new Promise((r) => router.close(r));
    await new Promise((r) => metro.close(r));
  });

  const get = (host: string) =>
    new Promise<{ status: number; body: string }>((resolve, reject) => {
      const req = request(
        {
          host: "127.0.0.1",
          port: (router.address() as AddressInfo).port,
          path: "/",
          // A relay reached this worker over plain http on the private network.
          headers: { host, "x-forwarded-proto": "http" },
        },
        (res) => {
          let body = "";
          res.on("data", (d) => (body += d));
          res.on("end", () => resolve({ status: res.statusCode ?? 0, body }));
        },
      );
      req.on("error", reject);
      req.end();
    });

  it("routes each pool host to its own session and tells Metro the phone used https", async () => {
    const res = await get(POOL[1]!);
    expect(res.status).toBe(200);
    const headers = JSON.parse(res.body) as Record<string, string>;
    expect(headers["x-forwarded-host"]).toBe(POOL[1]);
    expect(headers["x-forwarded-proto"]).toBe("https");
    expect((await get(POOL[0]!)).status).toBe(404);
  });
});

describe("phone preview Metro cache", () => {
  // Sessions share one node_modules, so a shared Metro cache hands one project the route
  // context compiled for another, and the phone opens the other project's app.
  it("is one folder per project, outside the folder Metro watches", () => {
    const saved = process.env.APP_DATA_DIR;
    try {
      process.env.APP_DATA_DIR = "/data";
      expect(metroCacheDir("p1")).toBe("/data/device-cache/p1");
      expect(metroCacheDir("p2")).not.toBe(metroCacheDir("p1"));
      expect(metroCacheDir("p1").startsWith("/data/device/")).toBe(false);
    } finally {
      if (saved === undefined) delete process.env.APP_DATA_DIR;
      else process.env.APP_DATA_DIR = saved;
    }
  });
});
