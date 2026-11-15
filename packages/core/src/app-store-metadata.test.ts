import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { fillAppStoreConnect, type AppStoreFill } from "./app-store-metadata";
import { parseAppStoreConnectKey } from "./store-credentials";

const key = parseAppStoreConnectKey(
  JSON.stringify({
    keyId: "ABC123DEFG",
    issuerId: "57246542-96fe-1a63-e053-0824d011072a",
    teamId: "TEAM123456",
    teamType: "INDIVIDUAL",
    privateKey: generateKeyPairSync("ec", { namedCurve: "P-256" })
      .privateKey.export({ type: "pkcs8", format: "pem" })
      .toString(),
  }),
);

const fill: AppStoreFill = {
  privacyPolicyUrl: "https://build.example/apps/p_1/privacy",
  supportUrl: "https://build.example/apps/p_1/support",
  marketingUrl: "https://build.example/apps/p_1",
  listing: {
    subtitle: "Water, on time",
    description: "Drink enough water.",
    keywords: "water,hydration",
    promotionalText: "Now with streaks.",
  },
  platformOrigin: "https://build.example",
};

/** A fake App Store Connect: GETs answer from `data`, PATCHes are recorded. */
function appleApi(data: Record<string, unknown[]>, refuse?: string) {
  const patches: Array<{ path: string; attributes: Record<string, string> }> = [];
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    const path = new URL(url).pathname.replace("/v1", "");
    expect(String((init?.headers as Record<string, string>).authorization)).toMatch(/^Bearer /);
    if (init?.method === "PATCH") {
      if (refuse && path.startsWith(refuse))
        return Response.json(
          { errors: [{ detail: "An attribute value is invalid." }] },
          { status: 409 },
        );
      const body = JSON.parse(String(init.body)) as {
        data: { attributes: Record<string, string> };
      };
      patches.push({ path, attributes: body.data.attributes });
      return Response.json({ data: {} });
    }
    return Response.json({ data: data[path] ?? [] });
  }) as typeof fetch;
  return { fetchImpl, patches };
}

const editable = {
  "/apps/123/appInfos": [
    { id: "info-live", attributes: { state: "READY_FOR_DISTRIBUTION" } },
    { id: "info-next", attributes: { state: "PREPARE_FOR_SUBMISSION" } },
  ],
  "/appInfos/info-next/appInfoLocalizations": [
    { id: "ail-en", attributes: { locale: "en-US", privacyPolicyUrl: null, subtitle: null } },
    {
      id: "ail-fr",
      attributes: { locale: "fr-FR", privacyPolicyUrl: "https://mine.example/p", subtitle: null },
    },
  ],
  "/apps/123/appStoreVersions": [
    { id: "v1", attributes: { appVersionState: "PREPARE_FOR_SUBMISSION" } },
  ],
  "/appStoreVersions/v1/appStoreVersionLocalizations": [
    {
      id: "vl-en",
      attributes: {
        locale: "en-US",
        supportUrl: "https://build.example/apps/p_1/old-support",
        marketingUrl: null,
        description: "My own words.",
        keywords: null,
        promotionalText: "",
      },
    },
  ],
};

describe("filling App Store Connect", () => {
  it("fills empty and platform links, and only empty English listing text", async () => {
    const apple = appleApi(editable);
    const result = await fillAppStoreConnect(key, "123", fill, apple.fetchImpl);
    expect(apple.patches).toEqual([
      {
        path: "/appInfoLocalizations/ail-en",
        attributes: { privacyPolicyUrl: fill.privacyPolicyUrl, subtitle: "Water, on time" },
      },
      {
        // The platform's own old link is updated; the owner's description is kept.
        path: "/appStoreVersionLocalizations/vl-en",
        attributes: {
          supportUrl: fill.supportUrl,
          marketingUrl: fill.marketingUrl,
          keywords: "water,hydration",
          promotionalText: "Now with streaks.",
        },
      },
    ]);
    // The French record keeps the owner's own privacy link and gets no English text.
    expect(result.filled).toEqual([
      "Privacy Policy URL",
      "Subtitle",
      "Support URL",
      "Marketing URL",
      "Keywords",
      "Promotional text",
    ]);
    expect(result.note).toBe("");
  });

  it("changes nothing when everything is already filled", async () => {
    const apple = appleApi(editable);
    await fillAppStoreConnect(key, "123", fill, apple.fetchImpl);
    const done = structuredClone(editable);
    for (const loc of [
      ...done["/appInfos/info-next/appInfoLocalizations"],
      ...done["/appStoreVersions/v1/appStoreVersionLocalizations"],
    ])
      for (const patch of apple.patches.filter((p) => p.path.endsWith(`/${loc.id}`)))
        Object.assign(loc.attributes, patch.attributes);
    const again = appleApi(done);
    expect((await fillAppStoreConnect(key, "123", fill, again.fetchImpl)).filled).toEqual([]);
    expect(again.patches).toEqual([]);
  });

  it("says why when there's no version to fill or Apple refuses a change", async () => {
    const noVersion = appleApi({ ...editable, "/apps/123/appStoreVersions": [] });
    const result = await fillAppStoreConnect(key, "123", fill, noVersion.fetchImpl);
    expect(result.filled).toEqual(["Privacy Policy URL", "Subtitle"]);
    expect(result.note).toMatch(/no version being prepared/);

    const refused = appleApi(editable, "/appStoreVersionLocalizations");
    const partial = await fillAppStoreConnect(key, "123", fill, refused.fetchImpl);
    expect(partial.filled).toEqual(["Privacy Policy URL", "Subtitle"]);
    expect(partial.note).toBe("App Store Connect refused a change: An attribute value is invalid.");

    const offline = await fillAppStoreConnect(key, "123", fill, (async () => {
      throw new TypeError("fetch failed");
    }) as typeof fetch);
    expect(offline).toEqual({
      filled: [],
      note: "App Store Connect couldn't be reached to fill the app's links; they'll be filled on the next send.",
    });
  });
});
