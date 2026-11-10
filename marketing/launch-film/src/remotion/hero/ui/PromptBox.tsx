import React from "react";
import { ArrowUp, ChevronDown, ImagePlus } from "lucide-react";
import { C, FONT, R } from "../brand";
import { Spin, row } from "./kit";

const SUGGESTIONS = [
  "An expense tracker with budgets and monthly insights",
  "A habit tracker with streaks and reminders",
  "A recipe book with a shopping list",
  "A workout log with progress charts",
];

/** The prompt box from apps/web/src/components/prompt-box.tsx, with the landing page's copy. */
export function PromptBox({
  width,
  value,
  focused,
  caretOn,
  busy,
  t,
  chips = true,
}: {
  width: number;
  value: string;
  focused: boolean;
  caretOn: boolean;
  busy: boolean;
  t: number;
  chips?: boolean;
}) {
  const canSend = value.trim().length >= 3;
  return (
    <div style={{ width, fontFamily: FONT.sans }}>
      <div
        style={{
          borderRadius: R["2xl"],
          border: `1px solid ${C.input}`,
          background: C.background,
          padding: 12,
          boxShadow: focused ? `0 0 0 3px oklch(0.556 0 0 / 40%)` : "0 1px 2px rgba(0,0,0,0.3)",
        }}
      >
        <div style={{ minHeight: 96, padding: 4, font: `400 16px/1.5 ${FONT.sans}`, color: value ? C.foreground : C.mutedForeground }}>
          {value || (focused ? "" : "Describe the mobile app you want to build…")}
          {focused ? (
            <span style={{ display: "inline-block", width: 2, height: 19, marginLeft: 1, verticalAlign: -3, background: caretOn ? C.foreground : "transparent" }} />
          ) : null}
        </div>
        <div style={{ ...row, gap: 8, marginTop: 8 }}>
          <div style={{ ...row, gap: 6, height: 32, padding: "0 10px", borderRadius: R.md, font: `500 14px/1 ${FONT.sans}`, color: C.foreground }}>
            <ImagePlus size={15} /> Reference images
          </div>
          <div
            style={{
              ...row,
              justifyContent: "space-between",
              width: 144,
              height: 32,
              padding: "0 10px",
              borderRadius: R.md,
              border: `1px solid ${C.input}`,
              background: "oklch(1 0 0 / 4.5%)",
              boxSizing: "border-box",
              font: `400 14px/1 ${FONT.sans}`,
              color: C.foreground,
            }}
          >
            iOS & Android <ChevronDown size={15} color={C.mutedForeground} />
          </div>
          <div
            style={{
              marginLeft: "auto",
              width: 36,
              height: 36,
              borderRadius: 999,
              background: C.primary,
              opacity: canSend ? 1 : 0.5,
              ...row,
              justifyContent: "center",
              color: C.primaryForeground,
            }}
          >
            {busy ? <Spin size={16} t={t} /> : <ArrowUp size={16} />}
          </div>
        </div>
      </div>
      {chips ? (
        <div style={{ ...row, flexWrap: "wrap", gap: 8, marginTop: 12 }}>
          {SUGGESTIONS.map((s) => (
            <span
              key={s}
              style={{
                borderRadius: 999,
                border: `1px solid ${C.border}`,
                background: C.background,
                padding: "4px 12px",
                font: `400 12px/1.4 ${FONT.sans}`,
                color: C.mutedForeground,
              }}
            >
              {s}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
