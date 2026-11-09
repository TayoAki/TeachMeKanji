import { describe, expect, it } from "vitest";
import { GitHubClient, pushSnapshot } from "./github";

function fakeGitHub() {
  const calls: Array<{ method: string; path: string; body: unknown }> = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    const path = url.replace("https://api.github.com", "");
    const body = init.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method: init.method!, path, body });
    const json = (value: unknown) => new Response(JSON.stringify(value), { status: 200 });
    if (path === "/user/repos")
      return json({
        default_branch: "main",
        html_url: "https://github.com/me/app",
        owner: { login: "me" },
        name: "app",
      });
    if (path === "/repos/me/app")
      return json({
        default_branch: "main",
        html_url: "https://github.com/me/app",
        owner: { login: "me" },
        name: "app",
      });
    if (path.endsWith("/git/ref/heads/main")) return json({ object: { sha: "base" } });
    if (path.endsWith("/git/blobs")) return json({ sha: `blob-${calls.length}` });
    if (path.endsWith("/git/trees")) return json({ sha: "tree" });
    if (path.endsWith("/git/commits")) return json({ sha: "commit" });
    if (path.endsWith("/pulls")) return json({ html_url: "https://github.com/me/app/pull/1" });
    return json({});
  }) as unknown as typeof fetch;
  return { client: new GitHubClient("token", fetchImpl), calls };
}

const files = { "app/(tabs)/index.tsx": "export default () => null;\n", "package.json": "{}\n" };

describe("pushSnapshot", () => {
  it("creates a repo and commits straight to its default branch", async () => {
    const { client, calls } = fakeGitHub();
    const result = await pushSnapshot(client, {
      owner: "",
      repo: "app",
      create: true,
      private: true,
      files,
      message: "v1",
      branch: "x",
    });
    expect(result).toEqual({
      repoUrl: "https://github.com/me/app",
      branch: "main",
      commitSha: "commit",
      pullRequestUrl: null,
    });
    expect(calls[0]).toMatchObject({
      method: "POST",
      path: "/user/repos",
      body: { auto_init: true, private: true },
    });
    expect(calls.filter((c) => c.path.endsWith("/git/blobs"))).toHaveLength(2);
    expect(calls.at(-1)).toMatchObject({
      method: "PATCH",
      path: "/repos/me/app/git/refs/heads/main",
      body: { sha: "commit" },
    });
  });

  it("pushes to a new branch with a pull request for existing repos", async () => {
    const { client, calls } = fakeGitHub();
    const result = await pushSnapshot(client, {
      owner: "me",
      repo: "app",
      create: false,
      private: true,
      files,
      message: "v2",
      branch: "appbuilder/v2",
    });
    expect(result.pullRequestUrl).toBe("https://github.com/me/app/pull/1");
    expect(calls.some((c) => c.method === "PATCH")).toBe(false);
    expect(calls.find((c) => c.path === "/repos/me/app/git/refs")?.body).toEqual({
      ref: "refs/heads/appbuilder/v2",
      sha: "commit",
    });
    expect(calls.at(-1)?.body).toMatchObject({ head: "appbuilder/v2", base: "main" });
  });
});
