import { index, jsonb, numeric, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { plan, project } from "./app";

export type DesignStatus = "generating" | "ready" | "failed";
export type DesignItemStatus = "pending" | "approved" | "changes";

/** One screen's approved-or-not mockup (the image lives in storage). */
export interface DesignScreenRecord {
  path: string;
  title: string;
  /** What the mockup shows, top to bottom, with its real copy. */
  brief: string;
  /** Storage key of the current mockup, or null while it's being drawn. */
  image: string | null;
  status: DesignItemStatus;
  /** The user's last change request. */
  note: string;
  /** How many times it has been drawn (1 for the first). */
  version: number;
}

/** The app's character, drawn in a few poses (transparent PNGs in storage). */
export interface DesignMascotRecord {
  name: string;
  look: string;
  personality: string;
  poses: Array<{ name: string; description: string; image: string | null }>;
  status: DesignItemStatus;
  note: string;
}

/**
 * The design of an app before it's built: the visual direction and a mockup of every screen,
 * which the user approves (or asks to change) before the build follows them.
 */
export const projectDesign = pgTable(
  "project_design",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    planId: text("plan_id")
      .notNull()
      .references(() => plan.id, { onDelete: "cascade" }),
    status: text("status").$type<DesignStatus>().notNull().default("generating"),
    /** Style, palette, type, shape, illustration and motion plan (contract DesignDirection). */
    direction: jsonb("direction").$type<Record<string, unknown>>(),
    screens: jsonb("screens").$type<DesignScreenRecord[]>().notNull().default([]),
    mascot: jsonb("mascot").$type<DesignMascotRecord | null>(),
    /** What generating it has cost so far (model and image spend, USD). */
    costUsd: numeric("cost_usd", { precision: 10, scale: 4 }).notNull().default("0"),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("project_design_project_idx").on(t.projectId, t.createdAt)],
);
