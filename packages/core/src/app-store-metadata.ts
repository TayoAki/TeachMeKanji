/**
 * Fill an app's App Store Connect record with what App Builder already has for it, using the
 * owner's App Store Connect API key, and submit it for review (with a pre-order when asked).
 *
 * Filling (fillAppStoreConnect, run when a build is sent to TestFlight):
 * - links: Privacy Policy, Support and Marketing URLs (the pages App Builder hosts for the app);
 * - the Store listing's subtitle, description, keywords and promotional text;
 * - the primary category, the age-rating answers and the content rights declaration;
 * - the version's copyright and the App Review contact, notes and demo account;
 * - a free price, and the screenshots the Store listing step made (App Asset Library).
 * Only editable records change (a version being prepared, or one that was rejected). An empty
 * field is filled; a link is updated only when it's empty or one of the platform's own; nothing
 * the owner typed or chose is replaced. Each part runs on its own, so one refusal doesn't stop
 * the rest.
 *
 * Submitting (submitForReview, a separate step once Apple has processed the build): attach the
 * build, make the app available everywhere (as a pre-order with its release date when asked),
 * and send the version to App Review. What Apple's API can't do is listed for the owner.
 */
import type { StoreListing } from "@appbuilder/contract";
import { appStoreConnectToken, type AppStoreConnectKey } from "./store-credentials";

const API = "https://api.appstoreconnect.apple.com";

/** Version and app info states whose metadata can still be edited. */
const EDITABLE = new Set([
  "PREPARE_FOR_SUBMISSION",
  "DEVELOPER_REJECTED",
  "REJECTED",
  "METADATA_REJECTED",
  "INVALID_BINARY",
]);

export interface ReviewContact {
  contactFirstName: string;
  contactLastName: string;
  contactPhone: string;
  contactEmail: string;
}

export interface AppStoreFill {
  privacyPolicyUrl: string;
  supportUrl: string;
  marketingUrl: string;
  /** The store listing App Builder wrote for the app, if any. */
  listing?: Pick<StoreListing, "subtitle" | "description" | "keywords" | "promotionalText"> | null;
  /** The platform's origin: links that start with it are the platform's own and kept current. */
  platformOrigin: string;
  /** App Store category id, e.g. "HEALTH_AND_FITNESS". */
  categoryId?: string | null;
  /** Age-rating answers (ageRatingAnswers); only unanswered questions are sent. */
  ageRating?: Record<string, string | boolean>;
  contentRights?: "DOES_NOT_USE_THIRD_PARTY_CONTENT" | "USES_THIRD_PARTY_CONTENT";
  /** e.g. "2026 Example LLC" (Apple adds the ©). */
  copyright?: string;
  /** The App Review contact; with notes and the demo account when the app has accounts. */
  review?: ReviewContact & {
    notes: string;
    demoAccount: { email: string; password: string } | null;
  };
  /** Make the app free when it has no price yet. */
  free?: boolean;
  /**
   * The screenshots, in order; uploaded when the version has none. `load` gives one at the exact
   * pixel size Apple asks for (PNG, no transparency).
   */
  screenshots?: Array<{
    name: string;
    load: (size: { width: number; height: number }) => Promise<Buffer>;
  }>;
}

export interface AppStoreFillResult {
  /** What was set, e.g. ["Privacy Policy URL", "Support URL"]. */
  filled: string[];
  /** Why nothing (or not everything) could be filled; "" when all went well. */
  note: string;
}

interface Resource {
  id: string;
  type?: string;
  attributes: Record<string, unknown>;
  relationships?: Record<string, { data?: { id: string; type: string } | null }>;
}

/** A refusal from App Store Connect, with Apple's reasons. */
export class AscError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly reasons: string[] = [],
  ) {
    super(message);
  }
}

/** A small App Store Connect API client: JSON:API calls with a fresh token. */
class Asc {
  private readonly token: string;
  constructor(
    key: AppStoreConnectKey,
    private readonly fetchImpl: typeof fetch,
  ) {
    this.token = appStoreConnectToken(key);
  }

  async call(
    method: "GET" | "POST" | "PATCH" | "DELETE",
    path: string,
    body?: unknown,
  ): Promise<{ data: Resource[]; status: number }> {
    const response = await this.fetchImpl(`${API}${path.startsWith("/v") ? "" : "/v1"}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${this.token}`,
        ...(body ? { "content-type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20_000),
    });
    const json = (await response.json().catch(() => ({}))) as {
      data?: Resource | Resource[] | null;
      errors?: Array<{
        detail?: string;
        title?: string;
        meta?: { associatedErrors?: Record<string, Array<{ detail?: string; title?: string }>> };
      }>;
    };
    if (!response.ok) {
      const first = json.errors?.[0];
      const why = first?.detail || first?.title || `status ${response.status}`;
      // Submission refusals list the real reasons under meta.associatedErrors.
      const reasons = (json.errors ?? []).flatMap((e) =>
        Object.values(e.meta?.associatedErrors ?? {})
          .flat()
          .map((a) => a.detail || a.title || "")
          .filter(Boolean),
      );
      throw new AscError(
        `App Store Connect refused ${method === "GET" ? "a lookup" : "a change"}: ${why}`,
        response.status,
        reasons,
      );
    }
    const data = Array.isArray(json.data) ? json.data : json.data ? [json.data] : [];
    return { data, status: response.status };
  }

  /** A request outside the API (pre-signed upload URLs take no token). */
  upload(url: string, init: RequestInit): Promise<Response> {
    return this.fetchImpl(url, init);
  }

  async get(path: string): Promise<Resource[]> {
    return (await this.call("GET", path)).data;
  }

  /** GET that treats 404 as nothing there. */
  async find(path: string): Promise<Resource[]> {
    try {
      return await this.get(path);
    } catch (error) {
      if (error instanceof AscError && error.status === 404) return [];
      throw error;
    }
  }
}

const editable = (resource: Resource, ...fields: string[]) =>
  fields.some((f) => EDITABLE.has(String(resource.attributes[f] ?? "")));

async function editableInfo(asc: Asc, appId: string) {
  return (await asc.get(`/apps/${appId}/appInfos?limit=10`)).find((i) =>
    editable(i, "state", "appStoreState"),
  );
}

async function editableVersion(asc: Asc, appId: string) {
  return (await asc.get(`/apps/${appId}/appStoreVersions?filter[platform]=IOS&limit=10`)).find(
    (v) => editable(v, "appVersionState", "appStoreState"),
  );
}

const NO_VERSION =
  "There's no version being prepared in App Store Connect; add one (＋ Version or Platform) and send again.";

export async function fillAppStoreConnect(
  key: AppStoreConnectKey,
  ascAppId: string,
  fill: AppStoreFill,
  fetchImpl: typeof fetch = fetch,
): Promise<AppStoreFillResult> {
  const asc = new Asc(key, fetchImpl);
  const filled = new Set<string>();
  const notes = new Set<string>();
  const ours = (value: string) =>
    Boolean(fill.platformOrigin) && value.startsWith(fill.platformOrigin.replace(/\/$/, ""));
  /** The changes to make to one localization, and their labels. */
  const changes = (
    current: Record<string, unknown>,
    links: Array<[field: string, value: string, label: string]>,
    texts: Array<[field: string, value: string | undefined, label: string]>,
  ) => {
    const attributes: Record<string, string> = {};
    const labels: string[] = [];
    for (const [field, value, label] of links) {
      const now = String(current[field] ?? "");
      if (value && now !== value && (!now || ours(now))) {
        attributes[field] = value;
        labels.push(label);
      }
    }
    // The listing is written in English, so it only fills English localizations.
    if (String(current.locale ?? "").startsWith("en"))
      for (const [field, value, label] of texts) {
        if (value && !String(current[field] ?? "").trim()) {
          attributes[field] = value;
          labels.push(label);
        }
      }
    return { attributes, labels };
  };
  /** Run one part; a refusal or an outage is noted, and the other parts still run. */
  const part = async (work: () => Promise<void>) => {
    try {
      await work();
    } catch (error) {
      notes.add(
        error instanceof AscError
          ? error.message
          : "App Store Connect couldn't be reached to fill the app's record; it'll be filled on the next send.",
      );
    }
  };

  let info: Resource | undefined;
  let version: Resource | undefined;
  await part(async () => {
    info = await editableInfo(asc, ascAppId);
    if (!info) notes.add("App information can't be edited while the app is in review.");
  });
  await part(async () => {
    version = await editableVersion(asc, ascAppId);
    if (!version) notes.add(NO_VERSION);
  });

  // App information: the Privacy Policy URL and the subtitle, the category, the age rating.
  if (info) {
    const infoId = info.id;
    await part(async () => {
      for (const loc of await asc.get(`/appInfos/${infoId}/appInfoLocalizations?limit=50`)) {
        const { attributes, labels } = changes(
          loc.attributes,
          [["privacyPolicyUrl", fill.privacyPolicyUrl, "Privacy Policy URL"]],
          [["subtitle", fill.listing?.subtitle, "Subtitle"]],
        );
        if (!labels.length) continue;
        await asc.call("PATCH", `/appInfoLocalizations/${loc.id}`, {
          data: { type: "appInfoLocalizations", id: loc.id, attributes },
        });
        labels.forEach((l) => filled.add(l));
      }
    });
    if (fill.categoryId)
      await part(async () => {
        const [current] = await asc.find(`/appInfos/${infoId}/relationships/primaryCategory`);
        if (current) return;
        await asc.call("PATCH", `/appInfos/${infoId}`, {
          data: {
            type: "appInfos",
            id: infoId,
            relationships: {
              primaryCategory: { data: { type: "appCategories", id: fill.categoryId } },
            },
          },
        });
        filled.add("Category");
      });
    if (fill.ageRating)
      await part(async () => {
        const [declaration] = await asc.get(`/appInfos/${infoId}/ageRatingDeclaration`);
        if (!declaration) return;
        const attributes = Object.fromEntries(
          Object.entries(fill.ageRating!).filter(
            ([k]) => declaration.attributes[k] === null || declaration.attributes[k] === undefined,
          ),
        );
        if (!Object.keys(attributes).length) return;
        await asc.call("PATCH", `/ageRatingDeclarations/${declaration.id}`, {
          data: { type: "ageRatingDeclarations", id: declaration.id, attributes },
        });
        filled.add("Age rating");
      });
  }

  // The app: content rights.
  if (fill.contentRights)
    await part(async () => {
      const [app] = await asc.get(`/apps/${ascAppId}`);
      if (!app || app.attributes.contentRightsDeclaration) return;
      await asc.call("PATCH", `/apps/${ascAppId}`, {
        data: {
          type: "apps",
          id: ascAppId,
          attributes: { contentRightsDeclaration: fill.contentRights },
        },
      });
      filled.add("Content rights");
    });

  // The version being prepared: links and listing text, copyright, App Review, screenshots.
  if (version) {
    const v = version;
    let english: Resource | undefined;
    await part(async () => {
      for (const loc of await asc.get(
        `/appStoreVersions/${v.id}/appStoreVersionLocalizations?limit=50`,
      )) {
        if (!english && String(loc.attributes.locale ?? "").startsWith("en")) english = loc;
        const { attributes, labels } = changes(
          loc.attributes,
          [
            ["supportUrl", fill.supportUrl, "Support URL"],
            ["marketingUrl", fill.marketingUrl, "Marketing URL"],
          ],
          [
            ["description", fill.listing?.description, "Description"],
            ["keywords", fill.listing?.keywords, "Keywords"],
            ["promotionalText", fill.listing?.promotionalText, "Promotional text"],
          ],
        );
        if (!labels.length) continue;
        await asc.call("PATCH", `/appStoreVersionLocalizations/${loc.id}`, {
          data: { type: "appStoreVersionLocalizations", id: loc.id, attributes },
        });
        labels.forEach((l) => filled.add(l));
      }
    });
    if (fill.copyright && !String(v.attributes.copyright ?? "").trim())
      await part(async () => {
        await asc.call("PATCH", `/appStoreVersions/${v.id}`, {
          data: { type: "appStoreVersions", id: v.id, attributes: { copyright: fill.copyright } },
        });
        filled.add("Copyright");
      });
    if (fill.review) await part(() => fillReview(asc, v.id, fill.review!, filled));
    if (fill.screenshots?.length && english) {
      const loc = english;
      await part(() => uploadScreenshots(asc, ascAppId, loc.id, fill.screenshots!, filled));
    }
  }

  // A free price, when the app has none yet.
  if (fill.free)
    await part(async () => {
      if ((await asc.find(`/apps/${ascAppId}/appPriceSchedule`)).length) return;
      const points = await asc.get(
        `/apps/${ascAppId}/appPricePoints?filter[territory]=USA&limit=200`,
      );
      const free = points.find((p) => Number(p.attributes.customerPrice) === 0);
      if (!free) return;
      await asc.call("POST", `/appPriceSchedules`, {
        data: {
          type: "appPriceSchedules",
          relationships: {
            app: { data: { type: "apps", id: ascAppId } },
            baseTerritory: { data: { type: "territories", id: "USA" } },
            manualPrices: { data: [{ type: "appPrices", id: "${price-usa}" }] },
          },
        },
        included: [
          {
            type: "appPrices",
            id: "${price-usa}",
            attributes: { startDate: null, endDate: null },
            relationships: { appPricePoint: { data: { type: "appPricePoints", id: free.id } } },
          },
        ],
      });
      filled.add("Price (free)");
    });

  return { filled: [...filled], note: [...notes].join(" ") };
}

/** Create the version's App Review details, or fill the empty ones. */
async function fillReview(
  asc: Asc,
  versionId: string,
  review: NonNullable<AppStoreFill["review"]>,
  filled: Set<string>,
) {
  const wanted: Record<string, string | boolean | null> = {
    contactFirstName: review.contactFirstName,
    contactLastName: review.contactLastName,
    contactPhone: review.contactPhone,
    contactEmail: review.contactEmail,
    notes: review.notes,
    demoAccountRequired: Boolean(review.demoAccount),
    ...(review.demoAccount
      ? {
          demoAccountName: review.demoAccount.email,
          demoAccountPassword: review.demoAccount.password,
        }
      : {}),
  };
  const [existing] = await asc.find(`/appStoreVersions/${versionId}/appStoreReviewDetail`);
  if (!existing) {
    await asc.call("POST", `/appStoreReviewDetails`, {
      data: {
        type: "appStoreReviewDetails",
        attributes: wanted,
        relationships: { appStoreVersion: { data: { type: "appStoreVersions", id: versionId } } },
      },
    });
    filled.add("App Review information");
    return;
  }
  const attributes = Object.fromEntries(
    Object.entries(wanted).filter(([k, value]) => {
      const now = existing.attributes[k];
      // The demo account is App Builder's own: keep its password current.
      if (
        k === "demoAccountPassword" &&
        review.demoAccount &&
        existing.attributes.demoAccountName === review.demoAccount.email
      )
        return now !== value;
      return (now === null || now === undefined || now === "") && value !== "";
    }),
  );
  if (!Object.keys(attributes).length) return;
  await asc.call("PATCH", `/appStoreReviewDetails/${existing.id}`, {
    data: { type: "appStoreReviewDetails", id: existing.id, attributes },
  });
  filled.add("App Review information");
}

/**
 * Upload the screenshots to the app's asset library and place them on the version's English
 * localization, for each iPhone screenshot size Apple asks for (read from its reference data),
 * unless that size already has screenshots.
 */
async function uploadScreenshots(
  asc: Asc,
  appId: string,
  localizationId: string,
  shots: NonNullable<AppStoreFill["screenshots"]>,
  filled: Set<string>,
) {
  const [refData] = await asc.get(`/appAssetLibraryRefData?filter[features]=APP_STORE_VERSIONS`);
  const ref = (refData?.attributes ?? {}) as {
    placementProfileGroups?: Array<{
      placementProfileGroupId: string;
      platform: string;
      displayClassId: string;
    }>;
    placementTypes?: Array<{
      placementTypeId: string;
      specMappings?: Array<{ placementGroupId: string; specs: string[] }>;
    }>;
    imageSpecs?: Array<{
      specId: string;
      dimensions: { minWidth: number; maxWidth: number; minHeight: number; maxHeight: number };
    }>;
  };
  // The large and medium Dynamic Island iPhones: Apple requires one of them.
  const groups = (ref.placementProfileGroups ?? [])
    .filter(
      (g) =>
        g.platform === "IPHONE_APP_STORE" &&
        /^IPHONE_DYNAMIC_ISLAND_(LARGE|MEDIUM)_PROFILE$/.test(g.placementProfileGroupId),
    )
    .map((g) => g.placementProfileGroupId);
  const mappings =
    ref.placementTypes?.find((t) => t.placementTypeId === "APP_SCREENSHOT")?.specMappings ?? [];
  const [library] = await asc.get(`/apps/${appId}/assetLibrary`);
  if (!library || !groups.length) return;

  let uploaded = false;
  for (const group of groups) {
    const existing = await asc.find(
      `/appStoreVersionLocalizations/${localizationId}/placements?filter[placementType]=APP_SCREENSHOT&filter[placementGroup]=${group}&limit=1`,
    );
    if (existing.length) continue;
    // The portrait size Apple takes for this group: the largest fixed size it lists.
    const sizes = (mappings.find((m) => m.placementGroupId === group)?.specs ?? [])
      .map((id) => ref.imageSpecs?.find((s) => s.specId === id)?.dimensions)
      .filter((d): d is NonNullable<typeof d> => Boolean(d) && d!.maxHeight > d!.maxWidth)
      .sort((a, b) => b.maxWidth - a.maxWidth);
    const size = sizes[0];
    if (!size) continue;
    const placements: string[] = [];
    for (const shot of shots.slice(0, 10)) {
      const png = await shot.load({ width: size.maxWidth, height: size.maxHeight });
      const imageId = await uploadImage(
        asc,
        library.id,
        `${shot.name}-${size.maxWidth}x${size.maxHeight}.png`,
        png,
      );
      const { data } = await asc.call("POST", `/appAssetLibraryPlacements`, {
        data: {
          type: "appAssetLibraryPlacements",
          attributes: { placementType: "APP_SCREENSHOT", placementGroup: group },
          relationships: {
            image: { data: { type: "appAssetLibraryImages", id: imageId } },
            appStoreVersionLocalization: {
              data: { type: "appStoreVersionLocalizations", id: localizationId },
            },
          },
        },
      });
      if (data[0]) placements.push(data[0].id);
    }
    if (placements.length > 1)
      await asc.call("POST", `/appAssetLibraryPlacementOrderingRequests`, {
        data: {
          type: "appAssetLibraryPlacementOrderingRequests",
          attributes: { placementGroup: group },
          relationships: {
            orderedPlacements: {
              data: placements.map((id) => ({ type: "appAssetLibraryPlacements", id })),
            },
            appStoreVersionLocalization: {
              data: { type: "appStoreVersionLocalizations", id: localizationId },
            },
          },
        },
      });
    uploaded ||= placements.length > 0;
  }
  if (uploaded) filled.add("Screenshots");
}

/** Reserve, upload and commit one image in the app's asset library; resolves its id. */
async function uploadImage(asc: Asc, libraryId: string, fileName: string, png: Buffer) {
  const { data } = await asc.call("POST", `/appAssetLibraryImages`, {
    data: {
      type: "appAssetLibraryImages",
      attributes: { fileName, fileSize: png.length, category: "APP_SCREENSHOTS_AND_PREVIEWS" },
      relationships: { assetLibrary: { data: { type: "appAssetLibraries", id: libraryId } } },
    },
  });
  const image = data[0]!;
  const operations = (image.attributes.uploadOperations ?? []) as Array<{
    method: string;
    url: string;
    offset: number;
    length: number;
    requestHeaders?: Array<{ name: string; value: string }>;
  }>;
  for (const op of operations) {
    // The upload URLs are pre-signed: no token.
    const response = await asc.upload(op.url, {
      method: op.method,
      headers: Object.fromEntries((op.requestHeaders ?? []).map((h) => [h.name, h.value])),
      body: new Uint8Array(png.subarray(op.offset, op.offset + op.length)),
      signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok)
      throw new AscError(
        `Uploading a screenshot failed (status ${response.status}).`,
        response.status,
      );
  }
  await asc.call("PATCH", `/appAssetLibraryImages/${image.id}`, {
    data: { type: "appAssetLibraryImages", id: image.id, attributes: { uploaded: true } },
  });
  return image.id;
}

export interface SubmitOptions {
  /** The app's version, e.g. "1.0.0" (app.json); the App Store version is set to match. */
  versionString: string;
  /** A pre-order: the release date (YYYY-MM-DD, 2 to 180 days ahead). */
  preOrderDate?: string | null;
}

export interface SubmitResult {
  submitted: boolean;
  /** What's done, e.g. ["Build 12 attached", "Available for pre-order until 2027-01-15"]. */
  done: string[];
  /** Why it couldn't be submitted, in Apple's words. */
  problems: string[];
}

/**
 * Submit the version being prepared for App Review: attach the newest processed build of
 * `versionString`, make the app available in every territory (for pre-order until the release
 * date when asked, which needs a manual release), and send it to App Review.
 */
export async function submitForReview(
  key: AppStoreConnectKey,
  ascAppId: string,
  options: SubmitOptions,
  fetchImpl: typeof fetch = fetch,
): Promise<SubmitResult> {
  const asc = new Asc(key, fetchImpl);
  const done: string[] = [];
  try {
    const version = await editableVersion(asc, ascAppId);
    if (!version) return { submitted: false, done, problems: [NO_VERSION] };

    // The newest processed build of this version.
    const [build] = await asc.get(
      `/builds?filter[app]=${ascAppId}&filter[preReleaseVersion.version]=${encodeURIComponent(options.versionString)}&filter[processingState]=VALID&sort=-uploadedDate&limit=1`,
    );
    if (!build)
      return {
        submitted: false,
        done,
        problems: [
          `No processed build of version ${options.versionString} yet. Send to TestFlight first; Apple processes a build for 10 to 30 minutes after it's uploaded.`,
        ],
      };

    const attributes: Record<string, string> = {};
    if (version.attributes.versionString !== options.versionString)
      attributes.versionString = options.versionString;
    if (options.preOrderDate) attributes.releaseType = "MANUAL";
    if (Object.keys(attributes).length)
      await asc.call("PATCH", `/appStoreVersions/${version.id}`, {
        data: { type: "appStoreVersions", id: version.id, attributes },
      });
    await asc.call("PATCH", `/appStoreVersions/${version.id}/relationships/build`, {
      data: { type: "builds", id: build.id },
    });
    done.push(`Build ${String(build.attributes.version ?? "")} attached`.trim());

    await makeAvailable(asc, ascAppId, options.preOrderDate ?? null);
    done.push(
      options.preOrderDate
        ? `Available for pre-order everywhere, releasing ${options.preOrderDate}`
        : "Available in every country and region",
    );

    // An open draft submission is reused; otherwise a new one.
    const [draft] = await asc.find(
      `/reviewSubmissions?filter[app]=${ascAppId}&filter[platform]=IOS&filter[state]=READY_FOR_REVIEW&limit=1`,
    );
    const submissionId =
      draft?.id ??
      (
        await asc.call("POST", `/reviewSubmissions`, {
          data: {
            type: "reviewSubmissions",
            attributes: { platform: "IOS" },
            relationships: { app: { data: { type: "apps", id: ascAppId } } },
          },
        })
      ).data[0]!.id;
    if (!draft)
      await asc.call("POST", `/reviewSubmissionItems`, {
        data: {
          type: "reviewSubmissionItems",
          relationships: {
            reviewSubmission: { data: { type: "reviewSubmissions", id: submissionId } },
            appStoreVersion: { data: { type: "appStoreVersions", id: version.id } },
          },
        },
      });
    await asc.call("PATCH", `/reviewSubmissions/${submissionId}`, {
      data: { type: "reviewSubmissions", id: submissionId, attributes: { submitted: true } },
    });
    done.push("Submitted to App Review");
    return { submitted: true, done, problems: [] };
  } catch (error) {
    if (error instanceof AscError)
      return {
        submitted: false,
        done,
        problems: error.reasons.length ? error.reasons : [error.message],
      };
    return {
      submitted: false,
      done,
      problems: ["App Store Connect couldn't be reached. Try again in a minute."],
    };
  }
}

/**
 * Make the app available in every territory: a new availability when it has none, or, for a
 * pre-order, the release date on each territory where it's available.
 */
async function makeAvailable(asc: Asc, appId: string, preOrderDate: string | null) {
  const [current] = await asc.find(`/apps/${appId}/appAvailabilityV2`);
  const preOrder = preOrderDate ? { releaseDate: preOrderDate, preOrderEnabled: true } : {};
  if (!current) {
    // Every territory (about 175: one page).
    const territories = (await asc.get(`/territories?limit=200`)).map((t) => t.id);
    await asc.call("POST", `/v2/appAvailabilities`, {
      data: {
        type: "appAvailabilities",
        attributes: { availableInNewTerritories: true },
        relationships: {
          app: { data: { type: "apps", id: appId } },
          territoryAvailabilities: {
            data: territories.map((t) => ({ type: "territoryAvailabilities", id: `\${${t}}` })),
          },
        },
      },
      included: territories.map((t) => ({
        type: "territoryAvailabilities",
        id: `\${${t}}`,
        attributes: { available: true, ...preOrder },
        relationships: { territory: { data: { type: "territories", id: t } } },
      })),
    });
    return;
  }
  if (!preOrderDate) return;
  const territories = await asc.get(
    `/v2/appAvailabilities/${current.id}/territoryAvailabilities?limit=200`,
  );
  for (const t of territories.filter((t) => t.attributes.available)) {
    if (t.attributes.releaseDate === preOrderDate && t.attributes.preOrderEnabled) continue;
    await asc.call("PATCH", `/territoryAvailabilities/${t.id}`, {
      data: { type: "territoryAvailabilities", id: t.id, attributes: preOrder },
    });
  }
}
