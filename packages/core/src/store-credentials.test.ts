import { createVerify, generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  appStoreConnectToken,
  checkAppStoreConnectKey,
  checkPlayServiceAccount,
  parseAppStoreConnectKey,
  parsePlayServiceAccount,
  StoreKeyError,
} from "./store-credentials";

const ec = generateKeyPairSync("ec", { namedCurve: "P-256" });
const rsa = generateKeyPairSync("rsa", { modulusLength: 2048 });
const ascKey = {
  keyId: "ABC123DEFG",
  issuerId: "57246542-96fe-1a63-e053-0824d011072a",
  teamId: "TEAM123456",
  teamType: "INDIVIDUAL",
  privateKey: ec.privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
};

describe("store credentials", () => {
  it("parses an App Store Connect key and refuses incomplete ones", () => {
    expect(parseAppStoreConnectKey(JSON.stringify(ascKey)).keyId).toBe("ABC123DEFG");
    expect(() => parseAppStoreConnectKey(JSON.stringify({ ...ascKey, privateKey: "abc" }))).toThrow(
      StoreKeyError,
    );
    expect(() => parseAppStoreConnectKey(JSON.stringify({ ...ascKey, issuerId: "x" }))).toThrow(
      /issuer ID/,
    );
  });

  it("signs App Store Connect tokens Apple can verify (ES256), and reads Apple's answer", async () => {
    const key = parseAppStoreConnectKey(JSON.stringify(ascKey));
    const [header, payload, signature] = appStoreConnectToken(key, 1_700_000_000_000).split(".");
    expect(JSON.parse(Buffer.from(header!, "base64url").toString())).toEqual({
      alg: "ES256",
      kid: "ABC123DEFG",
      typ: "JWT",
    });
    expect(JSON.parse(Buffer.from(payload!, "base64url").toString())).toMatchObject({
      iss: ascKey.issuerId,
      aud: "appstoreconnect-v1",
      exp: 1_700_000_600,
    });
    const valid = createVerify("SHA256")
      .update(`${header}.${payload}`)
      .verify(
        { key: ec.publicKey, dsaEncoding: "ieee-p1363" },
        Buffer.from(signature!, "base64url"),
      );
    expect(valid).toBe(true);
    const answer = (status: number) => (async () => new Response("{}", { status })) as typeof fetch;
    expect(await checkAppStoreConnectKey(key, answer(200))).toBe(true);
    expect(await checkAppStoreConnectKey(key, answer(401))).toBe(false);
    expect(await checkAppStoreConnectKey(key, answer(503))).toBeUndefined();
  });

  it("checks a Google Play service account by exchanging a signed assertion", async () => {
    const account = parsePlayServiceAccount(
      JSON.stringify({
        type: "service_account",
        client_email: "builder@my-app.iam.gserviceaccount.com",
        private_key: rsa.privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
      }),
    );
    let assertion = "";
    const google = (async (_url: string, init: RequestInit) => {
      assertion = new URLSearchParams(String(init.body)).get("assertion") ?? "";
      return new Response(JSON.stringify({ access_token: "x" }), { status: 200 });
    }) as typeof fetch;
    expect(await checkPlayServiceAccount(account, google)).toBe(true);
    const [header, payload, signature] = assertion.split(".");
    expect(
      createVerify("RSA-SHA256")
        .update(`${header}.${payload}`)
        .verify(rsa.publicKey, Buffer.from(signature!, "base64url")),
    ).toBe(true);
    expect(() => parsePlayServiceAccount('{"type":"user"}')).toThrow(StoreKeyError);
  });
});
