import { and, eq } from "drizzle-orm";
import type { ProjectFiles } from "@appbuilder/contract";
import { decryptSecret, exportBundle, getCurrentFiles, versionNumbers } from "@appbuilder/core";
import { schema } from "@appbuilder/db";
import { AgentError } from "../agents/agents";
import type { HandlerContext, HandlerResult } from "./context";

type Fetch = typeof fetch;

export class GitHubClient {
  constructor(
    private readonly token: string,
    private readonly fetchImpl: Fetch = fetch,
    private readonly api = "https://api.github.com",
  ) {}

  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const response = await this.fetchImpl(`${this.api}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
        "User-Agent": "app-builder",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new AgentError(
        `GitHub ${method} ${path} failed (${response.status}): ${text.slice(0, 300)}`,
      );
    }
    return (response.status === 204 ? undefined : await response.json()) as T;
  }
}

export interface PushResult {
  repoUrl: string;
  branch: string;
  commitSha: string;
  pullRequestUrl: string | null;
}

/**
 * Push a snapshot with the Git Data API (no git binary): blobs -> tree -> commit -> ref.
 * The first push to a new repo goes to its default branch; later pushes go to a new branch
 * with a pull request, so nothing lands on main without review.
 */
export async function pushSnapshot(
  gh: GitHubClient,
  input: {
    owner: string;
    repo: string;
    create: boolean;
    private: boolean;
    files: ProjectFiles;
    message: string;
    branch: string;
  },
): Promise<PushResult> {
  let repo: { default_branch: string; html_url: string; owner: { login: string }; name: string };
  if (input.create) {
    // auto_init gives the repo a first commit; the Git Data API can't commit to an empty repo.
    repo = await gh.request("POST", "/user/repos", {
      name: input.repo,
      private: input.private,
      auto_init: true,
      description: "Created with App Builder",
    });
  } else {
    repo = await gh.request("GET", `/repos/${input.owner}/${input.repo}`);
  }
  const full = `${repo.owner.login}/${repo.name}`;
  const base = await gh.request<{ object: { sha: string } }>(
    "GET",
    `/repos/${full}/git/ref/heads/${repo.default_branch}`,
  );

  const tree = [];
  for (const [path, content] of Object.entries(input.files)) {
    const blob = await gh.request<{ sha: string }>("POST", `/repos/${full}/git/blobs`, {
      content,
      encoding: "utf-8",
    });
    tree.push({ path, mode: "100644", type: "blob", sha: blob.sha });
  }
  // Replace the whole tree (no base_tree): the repo mirrors the app exactly.
  const newTree = await gh.request<{ sha: string }>("POST", `/repos/${full}/git/trees`, { tree });
  const commit = await gh.request<{ sha: string }>("POST", `/repos/${full}/git/commits`, {
    message: input.message,
    tree: newTree.sha,
    parents: [base.object.sha],
  });

  if (input.create) {
    await gh.request("PATCH", `/repos/${full}/git/refs/heads/${repo.default_branch}`, {
      sha: commit.sha,
      force: false,
    });
    return {
      repoUrl: repo.html_url,
      branch: repo.default_branch,
      commitSha: commit.sha,
      pullRequestUrl: null,
    };
  }

  await gh.request("POST", `/repos/${full}/git/refs`, {
    ref: `refs/heads/${input.branch}`,
    sha: commit.sha,
  });
  const pr = await gh.request<{ html_url: string }>("POST", `/repos/${full}/pulls`, {
    title: input.message,
    head: input.branch,
    base: repo.default_branch,
    body: "Changes exported from App Builder. Review and merge when ready.",
  });
  return {
    repoUrl: repo.html_url,
    branch: input.branch,
    commitSha: commit.sha,
    pullRequestUrl: pr.html_url,
  };
}

export async function integrationToken(
  ctx: HandlerContext,
  provider: "github" | "expo",
): Promise<string> {
  const [row] = await ctx.db
    .select()
    .from(schema.integration)
    .where(
      and(eq(schema.integration.userId, ctx.run.userId), eq(schema.integration.provider, provider)),
    );
  if (!row)
    throw new AgentError(
      `Connect your ${provider === "github" ? "GitHub" : "Expo"} account in Settings first.`,
    );
  return decryptSecret(row.encryptedToken);
}

export async function handleGitHubPush(ctx: HandlerContext): Promise<HandlerResult> {
  const input = ctx.run.input as {
    owner?: string;
    repo: string;
    create: boolean;
    private?: boolean;
  };
  const token = await integrationToken(ctx, "github");
  const { versionId, files } = await getCurrentFiles(ctx.db, ctx.run.projectId);
  if (!versionId) throw new AgentError("Build the app before exporting it.");
  const [project] = await ctx.db
    .select()
    .from(schema.project)
    .where(eq(schema.project.id, ctx.run.projectId));
  const number = (await versionNumbers(ctx.db, [versionId])).get(versionId) ?? 0;

  await ctx.emit("step", {
    label: input.create ? `Creating ${input.repo}` : `Pushing to ${input.owner}/${input.repo}`,
  });
  const result = await pushSnapshot(new GitHubClient(token), {
    owner: input.owner ?? "",
    repo: input.repo,
    create: input.create,
    private: input.private ?? true,
    files: exportBundle(project!.name, files),
    message: `${project!.name}: version ${number}`,
    branch: `appbuilder/v${number}-${Date.now().toString(36)}`,
  });
  return { output: { ...result } };
}
