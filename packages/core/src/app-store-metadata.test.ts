import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { fillAppStoreConnect, submitForReview, type AppStoreFill } from "./app-store-metadata";
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
      note: "App Store Connect couldn't be reached to fill the app's record; it'll be filled on the next send.",
    });
  });

  it("fills the rest of an empty record: category, age rating, rights, copyright, review, price, screenshots", async () => {
    const api = fullApi({
      ...editable,
      "/appInfos/info-next/ageRatingDeclaration": [
        { id: "age-1", attributes: { gambling: false, contests: null, advertising: null } },
      ],
      "/apps/123": [{ id: "123", attributes: { contentRightsDeclaration: null } }],
      "/apps/123/appPricePoints": [
        { id: "pp-99", attributes: { customerPrice: "0.99" } },
        { id: "pp-free", attributes: { customerPrice: "0.0" } },
      ],
      "/appAssetLibraryRefData": [refData],
      "/apps/123/assetLibrary": [{ id: "lib-1", attributes: {} }],
    });
    const sizes: Array<{ width: number; height: number }> = [];
    const result = await fillAppStoreConnect(
      key,
      "123",
      { ...fill, ...extras(sizes) },
      api.fetchImpl,
    );
    expect(result.note).toBe("");
    expect(result.filled).toEqual(
      expect.arrayContaining([
        "Category",
        "Age rating",
        "Content rights",
        "Copyright",
        "App Review information",
        "Screenshots",
        "Price (free)",
      ]),
    );
    const body = (method: string, path: string) =>
      api.requests.find((r) => r.method === method && r.path === path)?.body as {
        data: { attributes?: Record<string, unknown>; relationships?: Record<string, unknown> };
        included?: Array<{ relationships: Record<string, { data: { id: string } }> }>;
      };
    // Only the unanswered age-rating questions are sent.
    const age = body("PATCH", "/ageRatingDeclarations/age-1").data.attributes!;
    expect(age.gambling).toBeUndefined();
    expect(age.contests).toBe("NONE");
    expect(age.advertising).toBe(false);
    expect(body("PATCH", "/appInfos/info-next").data.relationships).toEqual({
      primaryCategory: { data: { type: "appCategories", id: "HEALTH_AND_FITNESS" } },
    });
    expect(body("PATCH", "/apps/123").data.attributes).toEqual({
      contentRightsDeclaration: "DOES_NOT_USE_THIRD_PARTY_CONTENT",
    });
    expect(body("POST", "/appStoreReviewDetails").data.attributes).toMatchObject({
      contactFirstName: "Ada",
      contactPhone: "+1 555 010 0000",
      demoAccountRequired: false,
      notes: "Try the habit.",
    });
    expect(
      body("POST", "/appPriceSchedules").included![0]!.relationships.appPricePoint!.data.id,
    ).toBe("pp-free");
    // Screenshots: Apple's portrait size for the group, uploaded, placed in order.
    expect(sizes).toEqual([
      { width: 1290, height: 2796 },
      { width: 1290, height: 2796 },
    ]);
    expect(api.uploads).toHaveLength(2);
    expect(api.requests.filter((r) => r.path === "/appAssetLibraryPlacements")).toHaveLength(2);
    expect(
      body("POST", "/appAssetLibraryPlacementOrderingRequests").data.relationships,
    ).toMatchObject({ orderedPlacements: { data: [{ id: "id-3" }, { id: "id-5" }] } });
  });

  it("keeps everything the owner already set", async () => {
    const api = fullApi({
      ...editable,
      "/apps/123/appStoreVersions": [
        {
          id: "v1",
          attributes: { appVersionState: "PREPARE_FOR_SUBMISSION", copyright: "2025 Mine" },
        },
      ],
      "/appInfos/info-next/relationships/primaryCategory": [{ id: "EDUCATION", attributes: {} }],
      "/appInfos/info-next/ageRatingDeclaration": [
        { id: "age-1", attributes: { contests: "NONE" } },
      ],
      "/apps/123": [
        { id: "123", attributes: { contentRightsDeclaration: "USES_THIRD_PARTY_CONTENT" } },
      ],
      "/appStoreVersions/v1/appStoreReviewDetail": [
        {
          id: "rd-1",
          attributes: {
            contactFirstName: "Grace",
            contactLastName: "Hopper",
            contactPhone: "+1 555 999",
            contactEmail: "grace@example.com",
            notes: "",
            demoAccountRequired: false,
          },
        },
      ],
      "/apps/123/appPriceSchedule": [{ id: "ps-1", attributes: {} }],
      "/appAssetLibraryRefData": [refData],
      "/apps/123/assetLibrary": [{ id: "lib-1", attributes: {} }],
      "/appStoreVersionLocalizations/vl-en/placements": [{ id: "pl-mine", attributes: {} }],
    });
    const sizes: Array<{ width: number; height: number }> = [];
    const extra = extras(sizes);
    await fillAppStoreConnect(
      key,
      "123",
      { ...fill, ...extra, ageRating: { contests: "NONE" } },
      api.fetchImpl,
    );
    const changed = api.requests.filter((r) => r.method !== "GET").map((r) => r.path);
    expect(changed).not.toContain("/appInfos/info-next");
    expect(changed).not.toContain("/ageRatingDeclarations/age-1");
    expect(changed).not.toContain("/apps/123");
    expect(changed).not.toContain("/appStoreVersions/v1");
    expect(changed).not.toContain("/appPriceSchedules");
    expect(sizes).toEqual([]);
    // Only the empty review notes are filled; the owner's contact stays.
    const review = api.requests.find((r) => r.path === "/appStoreReviewDetails/rd-1")?.body as {
      data: { attributes: Record<string, unknown> };
    };
    expect(review.data.attributes).toEqual({ notes: "Try the habit." });
  });

  it("submits for review with a pre-order: version, build, availability, submission", async () => {
    const api = fullApi({
      "/apps/123/appStoreVersions": [
        {
          id: "v1",
          attributes: { appVersionState: "PREPARE_FOR_SUBMISSION", versionString: "1.0" },
        },
      ],
      "/builds": [{ id: "b-12", attributes: { version: "12" } }],
      "/territories": [
        { id: "USA", attributes: {} },
        { id: "CAN", attributes: {} },
      ],
    });
    const result = await submitForReview(
      key,
      "123",
      { versionString: "1.0.0", preOrderDate: "2027-01-15" },
      api.fetchImpl,
    );
    expect(result).toEqual({
      submitted: true,
      done: [
        "Build 12 attached",
        "Available for pre-order everywhere, releasing 2027-01-15",
        "Submitted to App Review",
      ],
      problems: [],
    });
    const body = (path: string) =>
      api.requests.find((r) => r.method !== "GET" && r.path === path)?.body as {
        data: Record<string, unknown> & { attributes?: Record<string, unknown> };
        included?: Array<{ attributes: Record<string, unknown> }>;
      };
    expect(body("/appStoreVersions/v1").data.attributes).toEqual({
      versionString: "1.0.0",
      releaseType: "MANUAL",
    });
    expect(body("/appStoreVersions/v1/relationships/build").data).toEqual({
      type: "builds",
      id: "b-12",
    });
    const availability = body("/v2/appAvailabilities");
    expect(availability.included!.map((t) => t.attributes)).toEqual([
      { available: true, releaseDate: "2027-01-15", preOrderEnabled: true },
      { available: true, releaseDate: "2027-01-15", preOrderEnabled: true },
    ]);
    // Created after the availability (id-1): the submission is id-2, its item id-3.
    expect(body("/reviewSubmissions/id-2").data.attributes).toEqual({ submitted: true });
  });

  it("says what's missing: no processed build, or Apple's reasons for refusing", async () => {
    const noBuild = fullApi({
      "/apps/123/appStoreVersions": [
        {
          id: "v1",
          attributes: { appVersionState: "PREPARE_FOR_SUBMISSION", versionString: "1.0.0" },
        },
      ],
    });
    const waiting = await submitForReview(
      key,
      "123",
      { versionString: "1.0.0" },
      noBuild.fetchImpl,
    );
    expect(waiting.submitted).toBe(false);
    expect(waiting.problems[0]).toMatch(/No processed build of version 1.0.0 yet/);

    const refused = fullApi(
      {
        "/apps/123/appStoreVersions": [
          {
            id: "v1",
            attributes: { appVersionState: "PREPARE_FOR_SUBMISSION", versionString: "1.0.0" },
          },
        ],
        "/builds": [{ id: "b-12", attributes: { version: "12" } }],
        "/apps/123/appAvailabilityV2": [{ id: "av-1", attributes: {} }],
      },
      {
        "PATCH /reviewSubmissions/id-1": {
          status: 409,
          body: {
            errors: [
              {
                code: "STATE_ERROR.ENTITY_STATE_INVALID",
                detail:
                  "This resource cannot be reviewed, please check associated errors to see why.",
                meta: {
                  associatedErrors: {
                    "/apps/123": [{ detail: "You must provide App Privacy details." }],
                  },
                },
              },
            ],
          },
        },
      },
    );
    const result = await submitForReview(key, "123", { versionString: "1.0.0" }, refused.fetchImpl);
    expect(result.submitted).toBe(false);
    expect(result.problems).toEqual(["You must provide App Privacy details."]);
  });
});

const refData = {
  id: "ref",
  attributes: {
    placementProfileGroups: [
      {
        placementProfileGroupId: "IPHONE_DYNAMIC_ISLAND_LARGE_PROFILE",
        platform: "IPHONE_APP_STORE",
        displayClassId: "IPHONE_DYNAMIC_ISLAND_LARGE_DISPLAY",
      },
      { placementProfileGroupId: "MAC_PROFILE", platform: "MAC_APP_STORE", displayClassId: "MAC" },
    ],
    placementTypes: [
      {
        placementTypeId: "APP_SCREENSHOT",
        specMappings: [
          { placementGroupId: "IPHONE_DYNAMIC_ISLAND_LARGE_PROFILE", specs: ["s1", "s2"] },
        ],
      },
    ],
    imageSpecs: [
      {
        specId: "s1",
        dimensions: { minWidth: 1290, maxWidth: 1290, minHeight: 2796, maxHeight: 2796 },
      },
      {
        specId: "s2",
        dimensions: { minWidth: 2796, maxWidth: 2796, minHeight: 1290, maxHeight: 1290 },
      },
    ],
  },
};

function extras(sizes: Array<{ width: number; height: number }>): Partial<AppStoreFill> {
  return {
    categoryId: "HEALTH_AND_FITNESS",
    ageRating: { gambling: false, contests: "NONE", advertising: false },
    contentRights: "DOES_NOT_USE_THIRD_PARTY_CONTENT",
    copyright: "2026 Example LLC",
    review: {
      contactFirstName: "Ada",
      contactLastName: "Lovelace",
      contactPhone: "+1 555 010 0000",
      contactEmail: "ada@example.com",
      notes: "Try the habit.",
      demoAccount: null,
    },
    free: true,
    screenshots: ["home", "stats"].map((name) => ({
      name,
      load: async (size: { width: number; height: number }) => {
        sizes.push(size);
        return Buffer.from(`png:${name}`);
      },
    })),
  };
}

/**
 * A fuller fake App Store Connect: GETs answer from `data` (by path), POSTs create resources
 * with ids, uploads to the pre-signed URL are recorded, and `fail` refuses chosen calls.
 */
function fullApi(
  data: Record<string, unknown[]>,
  fail: Record<string, { status: number; body: unknown }> = {},
) {
  const requests: Array<{ method: string; path: string; body: unknown }> = [];
  const uploads: string[] = [];
  let next = 0;
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    const u = new URL(url);
    const method = init?.method ?? "GET";
    if (u.host === "upload.example") {
      uploads.push(u.pathname);
      return new Response(null, { status: 200 });
    }
    const path = u.pathname.replace(/^\/v1/, "");
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    requests.push({ method, path, body });
    const refusal = fail[`${method} ${path}`];
    if (refusal) return Response.json(refusal.body, { status: refusal.status });
    if (method === "GET") return Response.json({ data: data[path] ?? [] });
    if (method === "POST") {
      const id = `id-${++next}`;
      const attributes =
        path === "/appAssetLibraryImages"
          ? {
              uploadOperations: [
                {
                  method: "PUT",
                  url: `https://upload.example/${id}`,
                  offset: 0,
                  length: body.data.attributes.fileSize,
                  requestHeaders: [{ name: "Content-Type", value: "image/png" }],
                },
              ],
            }
          : {};
      return Response.json({ data: { id, type: body.data.type, attributes } }, { status: 201 });
    }
    return Response.json({ data: { id: path.split("/").pop(), attributes: {} } });
  }) as typeof fetch;
  return { fetchImpl, requests, uploads };
}
