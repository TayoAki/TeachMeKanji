import { describe, expect, it } from "vitest";
import { expoAccount } from "./expo-account";

function fakeFetch(status: number, body: unknown): typeof fetch {
  return (async (_url: string | URL | Request, init?: RequestInit) => {
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer tok_123");
    return new Response(JSON.stringify(body), { status });
  }) as typeof fetch;
}

describe("expoAccount", () => {
  it("names the user a personal token belongs to", async () => {
    const account = await expoAccount(
      "tok_123",
      fakeFetch(200, { data: { meActor: { __typename: "User", username: "tayom" } } }),
    );
    expect(account).toEqual({ username: "tayom", robot: false });
  });

  it("flags robot tokens, which Expo Go accounts never match", async () => {
    const account = await expoAccount(
      "tok_123",
      fakeFetch(200, { data: { meActor: { __typename: "Robot", firstName: "ci" } } }),
    );
    expect(account).toEqual({ username: "ci (robot)", robot: true });
  });

  it("returns null when Expo rejects the token", async () => {
    expect(await expoAccount("tok_123", fakeFetch(401, {}))).toBeNull();
    expect(
      await expoAccount(
        "tok_123",
        fakeFetch(200, { data: null, errors: [{ message: "The bearer token is invalid." }] }),
      ),
    ).toBeNull();
  });

  it("returns undefined when Expo can't be reached", async () => {
    const offline = (async () => {
      throw new TypeError("fetch failed");
    }) as typeof fetch;
    expect(await expoAccount("tok_123", offline)).toBeUndefined();
  });
});
