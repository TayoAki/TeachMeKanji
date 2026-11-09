/**
 * Who an Expo access token belongs to. Phone previews need it: on a physical iPhone, Expo Go only
 * opens a dev server signed in as the same Expo account as the phone, and a token Expo rejects
 * makes the dev server fail for every phone.
 */
export interface ExpoAccount {
  /** The name Expo Go compares with its own signed-in account. */
  username: string;
  /** Robot tokens work for builds but never match an Expo Go account. */
  robot: boolean;
}

const QUERY =
  "query { meActor { __typename ... on UserActor { username } ... on PartnerActor { username } ... on Robot { firstName } } }";

/**
 * The token's account, `null` when Expo rejects the token, or `undefined` when Expo couldn't be
 * reached (callers then go ahead without knowing).
 */
export async function expoAccount(
  token: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ExpoAccount | null | undefined> {
  let response: Response;
  try {
    response = await fetchImpl("https://api.expo.dev/graphql", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ query: QUERY }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return undefined;
  }
  if (response.status === 401 || response.status === 403) return null;
  const body = (await response.json().catch(() => null)) as {
    data?: { meActor?: { __typename?: string; username?: string; firstName?: string } | null };
    errors?: Array<{ message?: string; extensions?: { errorCode?: string } }>;
  } | null;
  const actor = body?.data?.meActor;
  if (actor?.__typename === "Robot")
    return { username: actor.firstName ? `${actor.firstName} (robot)` : "robot", robot: true };
  if (actor?.username) return { username: actor.username, robot: false };
  if (body?.errors?.length || (body && body.data?.meActor === null)) return null;
  return undefined;
}
