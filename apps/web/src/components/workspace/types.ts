import type { AppPlan, DesignView, ProjectFiles } from "@appbuilder/contract/protocol";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  kind: "text" | "plan" | "run" | "error";
  content: {
    text?: string;
    assetIds?: string[];
    planId?: string;
    number?: number;
    plan?: AppPlan;
    selection?: { path: string; snippet: string } | null;
    changed?: string[];
    versionId?: string | null;
    /** For an AI edit: the version before it, which "Undo this edit" restores. */
    undoVersionId?: string | null;
    /** A build's walkthrough: what the AI tried in the preview and how it went. */
    test?: Array<{
      title: string;
      status: "pass" | "fail" | "blocked";
      observed: string;
      fixed?: boolean;
    }>;
  };
  createdAt: string;
}

export interface ProjectState {
  project: {
    id: string;
    name: string;
    prompt: string | null;
    status: "draft" | "planning" | "awaiting_confirmation" | "building" | "ready" | "error";
    visibility: "private" | "public";
    platforms: string;
    activeThemeId: string | null;
    publishedSlug: string | null;
    backend: "local" | "cloud";
    updatedAt: string;
  };
  access: "owner" | "editor" | "viewer" | "public";
  versionId: string | null;
  versionNumber: number | null;
  files: ProjectFiles;
  plan: {
    id: string;
    number: number;
    status: "proposed" | "confirmed" | "superseded";
    data: AppPlan;
  } | null;
  messages: ChatMessage[];
  activeRun: { id: string; kind: string; status: string } | null;
  credits: number | null;
  plan_tier: "free" | "pro" | null;
  /** Mockups for the latest plan (editors only), and whether this deployment can draw them. */
  design: DesignView | null;
  designAvailable: boolean;
}
