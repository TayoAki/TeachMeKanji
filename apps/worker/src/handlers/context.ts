import type { Database } from "@appbuilder/db";
import type { Run } from "@appbuilder/core";
import type { CreateMessage } from "../generation/client";

export interface HandlerContext {
  db: Database;
  run: Run;
  createMessage: CreateMessage;
  model: string;
  /** Model for chat edits (see Provider.editModel). */
  editModel: string;
  offline: boolean;
  emit: (type: string, payload?: Record<string, unknown>) => Promise<void>;
}

export interface HandlerResult {
  output: Record<string, unknown>;
  usage?: { input: number; output: number; cacheRead: number; cacheWrite: number };
}
