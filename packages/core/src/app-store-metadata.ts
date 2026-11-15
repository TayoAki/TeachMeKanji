/**
 * Fill an app's App Store Connect record with what App Builder already has for it, using the
 * owner's App Store Connect API key: the Privacy Policy, Support and Marketing URLs (the pages
 * App Builder hosts for every app) and, where the owner left them empty, the listing text the
 * Store listing step wrote. Runs when a build is sent to TestFlight, so the record is ready to
 * submit for review.
 *
 * Only editable records change (a new app's first version, or one that's being prepared or was
 * rejected). An empty field is filled; a link is updated only when it's empty or one of the
 * platform's own; text the owner typed is never replaced.
 */
import type { StoreListing } from "@appbuilder/contract";
import { appStoreConnectToken, type AppStoreConnectKey } from "./store-credentials";

const API = "https://api.appstoreconnect.apple.com/v1";

/** Version and app info states whose metadata can still be edited. */
const EDITABLE = new Set([
  "PREPARE_FOR_SUBMISSION",
  "DEVELOPER_REJECTED",
  "REJECTED",
  "METADATA_REJECTED",
  "INVALID_BINARY",
]);

export interface AppStoreFill {
  privacyPolicyUrl: string;
  supportUrl: string;
  marketingUrl: string;
  /** The store listing App Builder wrote for the app, if any. */
  listing?: Pick<StoreListing, "subtitle" | "description" | "keywords" | "promotionalText"> | null;
  /** The platform's origin: links that start with it are the platform's own and kept current. */
  platformOrigin: string;
}

export interface AppStoreFillResult {
  /** What was set, e.g. ["Privacy Policy URL", "Support URL"]. */
  filled: string[];
  /** Why nothing (or not everything) could be filled; "" when all went well. */
  note: string;
}

interface Resource {
  id: string;
  attributes: Record<string, unknown>;
}

class AscError extends Error {}

export async function fillAppStoreConnect(
  key: AppStoreConnectKey,
  ascAppId: string,
  fill: AppStoreFill,
  fetchImpl: typeof fetch = fetch,
): Promise<AppStoreFillResult> {
  const token = appStoreConnectToken(key);
  const call = async (
    method: "GET" | "PATCH",
    path: string,
    body?: unknown,
  ): Promise<Resource[]> => {
    const response = await fetchImpl(`${API}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        ...(body ? { "content-type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15_000),
    });
    const json = (await response.json().catch(() => ({}))) as {
      data?: Resource | Resource[];
      errors?: Array<{ detail?: string; title?: string }>;
    };
    if (!response.ok) {
      const why =
        json.errors?.[0]?.detail || json.errors?.[0]?.title || `status ${response.status}`;
      throw new AscError(
        `App Store Connect refused ${method === "GET" ? "a lookup" : "a change"}: ${why}`,
      );
    }
    return Array.isArray(json.data) ? json.data : json.data ? [json.data] : [];
  };

  const filled = new Set<string>();
  const notes: string[] = [];
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
  const editable = (resource: Resource, ...fields: string[]) =>
    fields.some((f) => EDITABLE.has(String(resource.attributes[f] ?? "")));

  try {
    // App information: the Privacy Policy URL and the subtitle.
    const infos = await call("GET", `/apps/${ascAppId}/appInfos?limit=10`);
    const info = infos.find((i) => editable(i, "state", "appStoreState"));
    if (!info) notes.push("App information can't be edited while the app is in review.");
    else
      for (const loc of await call("GET", `/appInfos/${info.id}/appInfoLocalizations?limit=50`)) {
        const { attributes, labels } = changes(
          loc.attributes,
          [["privacyPolicyUrl", fill.privacyPolicyUrl, "Privacy Policy URL"]],
          [["subtitle", fill.listing?.subtitle, "Subtitle"]],
        );
        if (!labels.length) continue;
        await call("PATCH", `/appInfoLocalizations/${loc.id}`, {
          data: { type: "appInfoLocalizations", id: loc.id, attributes },
        });
        labels.forEach((l) => filled.add(l));
      }

    // The version being prepared: Support and Marketing URLs, description, keywords, promo text.
    const versions = await call(
      "GET",
      `/apps/${ascAppId}/appStoreVersions?filter[platform]=IOS&limit=10`,
    );
    const version = versions.find((v) => editable(v, "appVersionState", "appStoreState"));
    if (!version)
      notes.push(
        "There's no version being prepared in App Store Connect; add one (＋ Version or Platform) and send again to fill its links.",
      );
    else
      for (const loc of await call(
        "GET",
        `/appStoreVersions/${version.id}/appStoreVersionLocalizations?limit=50`,
      )) {
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
        await call("PATCH", `/appStoreVersionLocalizations/${loc.id}`, {
          data: { type: "appStoreVersionLocalizations", id: loc.id, attributes },
        });
        labels.forEach((l) => filled.add(l));
      }
  } catch (error) {
    notes.push(
      error instanceof AscError
        ? error.message
        : "App Store Connect couldn't be reached to fill the app's links; they'll be filled on the next send.",
    );
  }
  return { filled: [...filled], note: notes.join(" ") };
}
