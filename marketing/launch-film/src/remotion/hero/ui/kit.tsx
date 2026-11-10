import React from "react";
import { Loader2 } from "lucide-react";
import { C, FONT, R } from "../brand";

export const row: React.CSSProperties = { display: "flex", alignItems: "center" };

export function Button({
  children,
  variant = "default",
  size = "sm",
  style,
  busy,
  t = 0,
}: {
  t?: number;
  children: React.ReactNode;
  variant?: "default" | "outline" | "ghost" | "secondary";
  size?: "sm" | "md" | "icon";
  style?: React.CSSProperties;
  busy?: boolean;
}) {
  const v: Record<string, React.CSSProperties> = {
    default: { background: C.primary, color: C.primaryForeground },
    outline: { background: "oklch(1 0 0 / 4.5%)", border: `1px solid ${C.input}`, color: C.foreground },
    ghost: { background: "transparent", color: C.foreground },
    secondary: { background: C.secondary, color: C.foreground },
  };
  const h = size === "sm" ? 32 : size === "md" ? 36 : 32;
  return (
    <div
      style={{
        ...row,
        justifyContent: "center",
        gap: 6,
        height: h,
        padding: size === "icon" ? 0 : "0 12px",
        width: size === "icon" ? h : undefined,
        borderRadius: R.md,
        font: `500 14px/1 ${FONT.sans}`,
        boxSizing: "border-box",
        whiteSpace: "nowrap",
        opacity: busy ? 0.6 : 1,
        ...v[variant],
        ...style,
      }}
    >
      {busy ? <Spin size={15} t={t} /> : null}
      {children}
    </div>
  );
}

/** A spinner whose angle comes from the film time (deterministic). */
export function Spin({ size = 14, t = 0 }: { size?: number; t?: number }) {
  return <Loader2 size={size} style={{ transform: `rotate(${(t * 360 * 1.2) % 360}deg)` }} />;
}

export function Badge({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        height: 20,
        padding: "0 8px",
        borderRadius: 999,
        border: `1px solid ${C.border}`,
        font: `500 12px/1 ${FONT.sans}`,
        color: C.foreground,
        ...style,
      }}
    >
      {children}
    </span>
  );
}

export function SectionTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div style={{ ...row, justifyContent: "space-between", marginBottom: 12 }}>
      <span
        style={{
          font: `600 12px/1 ${FONT.sans}`,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          color: C.mutedForeground,
        }}
      >
        {children}
      </span>
      {right}
    </div>
  );
}
