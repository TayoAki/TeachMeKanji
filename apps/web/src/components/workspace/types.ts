import type { AppPlan, ProjectFiles } from "@appbuilder/contract/protocol";

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
}
