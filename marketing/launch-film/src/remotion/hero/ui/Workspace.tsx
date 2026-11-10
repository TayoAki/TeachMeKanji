import React from "react";
import {
  ArrowUp,
  Bell,
  Bot,
  Check,
  ChevronLeft,
  CircleCheck,
  Cloud,
  CreditCard,
  Download,
  Hand,
  Home,
  LayoutGrid,
  Maximize,
  Minus,
  MousePointer2,
  MousePointerClick,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Share2,
  Smartphone,
  Sparkles,
  Sun,
  Upload,
} from "lucide-react";
import { C, FONT, R } from "../brand";
import { APP_NAME, EDIT, PLAN, READY, SCREENS, USER_INITIAL } from "./data";
import { Button, Badge, Spin, SectionTitle, row } from "./kit";
import { HeadlineEdit, Phone } from "./Phone";
import { PROMPT } from "../script";

/** Layout of the wide world (1920×1080 UI px), from apps/web/src/components/shell/app-shell.tsx. */
export const L = {
  W: 1920,
  H: 1080,
  rail: 56,
  sidebar: 288,
  header: 44,
  footer: 28,
  right: 360,
  get centerX() {
    return this.rail + this.sidebar;
  },
  get rightX() {
    return this.W - this.right;
  },
  get centerW() {
    return this.rightX - this.centerX;
  },
};

/** Canvas frames at 36% zoom: 140 UI px wide, 28 px apart, so all seven sit in one row. */
export const CANVAS = { phoneW: 140, gap: 28, padX: 34, padY: 52, labelH: 28 };
export const phoneX = (i: number) => L.centerX + CANVAS.padX + i * (CANVAS.phoneW + CANVAS.gap);
export const phoneY = L.header + CANVAS.padY + CANVAS.labelH;
export const PHONE_H = CANVAS.phoneW * (2406 / 1113);

export interface EditState {
  phase: "none" | "selected" | "typing" | "done";
  text: string;
  caretOn: boolean;
}

export interface WorkspaceState {
  t: number;
  userMessage: boolean;
  planIn: number;
  confirmBusy: boolean;
  composerPlaceholder: string;
  building: boolean;
  step: string | null;
  phones: number[];
  readyIn: number;
  version: number | null;
  edit: EditState;
  menuIn: number;
  menuHover: boolean;
  dialog: React.ReactNode;
  toastIn: number;
  dim: number;
  focus: { x: number; y: number; w: number; h: number } | null;
}

const text = (size: number, weight = 400, color: string = C.foreground, extra?: React.CSSProperties) =>
  ({ font: `${weight} ${size}px/1.45 ${FONT.sans}`, color, ...extra }) as React.CSSProperties;

function Rail() {
  const btn = (icon: React.ReactNode, active = false) => (
    <div
      style={{
        width: 40,
        height: 40,
        borderRadius: R.md,
        ...row,
        justifyContent: "center",
        color: active ? C.foreground : C.mutedForeground,
        background: active ? C.accent : "transparent",
      }}
    >
      {icon}
    </div>
  );
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: L.rail,
        height: L.H - L.footer,
        background: C.rail,
        borderRight: `1px solid ${C.border}`,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 4,
        paddingTop: 8,
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: R.lg,
          background: C.primary,
          color: C.primaryForeground,
          ...row,
          justifyContent: "center",
          font: `700 14px/1 ${FONT.sans}`,
          marginBottom: 8,
        }}
      >
        AB
      </div>
      {btn(<Home size={20} />)}
      {btn(<Search size={20} />)}
      {btn(<Bell size={20} />)}
      {btn(<LayoutGrid size={20} />)}
      {btn(<Settings size={20} />)}
      <div style={{ marginTop: "auto", marginBottom: 12, display: "flex", flexDirection: "column", gap: 10, alignItems: "center" }}>
        {btn(<Sun size={18} />)}
        <div
          style={{
            width: 34,
            height: 34,
            borderRadius: 999,
            background: C.secondary,
            ...row,
            justifyContent: "center",
            ...text(13, 500, C.mutedForeground),
          }}
        >
          {USER_INITIAL}
        </div>
      </div>
    </div>
  );
}

function PlanCard({ s }: { s: WorkspaceState }) {
  return (
    <div
      style={{
        borderRadius: R.xl,
        border: `1px solid ${C.border}`,
        background: C.background,
        padding: 12,
        boxShadow: "0 1px 2px rgba(0,0,0,0.3)",
        ...text(14),
      }}
    >
      <div style={{ ...row, gap: 8 }}>
        <span style={{ fontWeight: 600 }}>{APP_NAME}</span>
        <Badge>Plan {PLAN.number}</Badge>
      </div>
      <p style={{ margin: "4px 0 0", color: C.mutedForeground }}>{PLAN.summary}</p>
      <p style={{ margin: "8px 0 0", ...text(12, 400, C.mutedForeground) }}>
        <span style={{ fontWeight: 500, color: C.foreground }}>For: </span>
        {PLAN.audience}
      </p>
      <ol style={{ listStyle: "none", padding: 0, margin: "12px 0 0", display: "flex", flexDirection: "column", gap: 8 }}>
        {PLAN.screens.map((sc, i) => (
          <li key={sc.title} style={{ display: "flex", gap: 8 }}>
            <span
              style={{
                width: 20,
                height: 20,
                flexShrink: 0,
                borderRadius: 999,
                background: C.muted,
                ...row,
                justifyContent: "center",
                font: `600 10px/1 ${FONT.sans}`,
              }}
            >
              {i + 1}
            </span>
            <span style={{ minWidth: 0 }}>
              <span style={{ fontWeight: 500 }}>{sc.title}</span>{" "}
              <span style={text(12, 400, C.mutedForeground)}>{sc.part}</span>
              <span style={{ display: "block", ...text(12, 400, C.mutedForeground) }}>{sc.purpose}</span>
              {"offers" in sc && sc.offers ? (
                <span style={{ display: "block", ...text(12, 500, C.foreground) }}>{sc.offers}</span>
              ) : null}
            </span>
          </li>
        ))}
      </ol>
      <div style={{ ...row, gap: 6, marginTop: 12 }}>
        {PLAN.themes.map((c) => (
          <span key={c} style={{ width: 16, height: 16, borderRadius: 999, background: c, border: `1px solid ${C.border}` }} />
        ))}
        <span style={{ marginLeft: 4, ...text(12, 400, C.mutedForeground) }}>5 themes</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 12 }}>
        <Button busy={s.confirmBusy} t={s.t} style={{ width: "100%" }}>
          {s.confirmBusy ? null : <Check size={15} />} Confirm & build
        </Button>
        <span style={{ textAlign: "center", ...text(11, 400, C.mutedForeground) }}>Or reply below to change the plan.</span>
      </div>
    </div>
  );
}

function Bubble({ children, user }: { children: React.ReactNode; user?: boolean }) {
  return (
    <div style={{ display: "flex", gap: 8, flexDirection: user ? "row-reverse" : "row" }}>
      <span
        style={{
          width: 28,
          height: 28,
          flexShrink: 0,
          borderRadius: 999,
          ...row,
          justifyContent: "center",
          background: user ? C.primary : C.muted,
          color: user ? C.primaryForeground : C.foreground,
          font: `600 12px/1 ${FONT.sans}`,
        }}
      >
        {user ? USER_INITIAL : <Bot size={16} />}
      </span>
      <div style={{ maxWidth: "85%", minWidth: 0, textAlign: user ? "right" : "left" }}>{children}</div>
    </div>
  );
}

export function ChatPanel({ s, width, height }: { s: WorkspaceState; width: number; height: number }) {
  return (
    <div style={{ position: "absolute", left: 0, top: 0, width, height, display: "flex", flexDirection: "column", background: "oklch(0.269 0 0 / 30%)" }}>
      <div style={{ height: L.header, flexShrink: 0, ...row, gap: 8, padding: "0 12px", borderBottom: `1px solid ${C.border}`, boxSizing: "border-box" }}>
        <ChevronLeft size={16} color={C.foreground} />
        <span style={{ flex: 1, ...text(14, 600) }}>{APP_NAME}</span>
        <div style={{ width: 28, height: 28, borderRadius: R.md, ...row, justifyContent: "center", background: s.menuIn > 0 ? C.accent : "transparent" }}>
          <MoreHorizontal size={16} color={C.foreground} />
        </div>
      </div>
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflow: "hidden",
          padding: 12,
          display: "flex",
          flexDirection: "column",
          // The real panel scrolls to the newest message (scrollIntoView block "end").
          justifyContent: s.planIn > 0 ? "flex-end" : "flex-start",
          gap: 16,
          boxSizing: "border-box",
        }}
      >
        {s.userMessage ? (
          <Bubble user>
            <div style={{ display: "inline-block", textAlign: "left", borderRadius: 18, padding: "8px 12px", background: C.primary, color: C.primaryForeground, ...text(14, 400, C.primaryForeground) }}>
              {PROMPT}
            </div>
          </Bubble>
        ) : null}
        {s.planIn > 0 ? (
          <div style={{ opacity: s.planIn, transform: `translateY(${(1 - s.planIn) * 14}px)` }}>
            <Bubble>
              <PlanCard s={s} />
            </Bubble>
          </div>
        ) : null}
        {s.readyIn > 0 ? (
          <div style={{ opacity: s.readyIn, transform: `translateY(${(1 - s.readyIn) * 14}px)` }}>
            <Bubble>
              <div style={{ display: "inline-block", borderRadius: 18, padding: "8px 12px", background: C.muted, ...text(14) }}>{READY}</div>
            </Bubble>
          </div>
        ) : null}
      </div>
      <div style={{ borderTop: `1px solid ${C.border}`, padding: 12 }}>
        <div style={{ borderRadius: R.xl, border: `1px solid ${C.border}`, background: C.background, padding: 8 }}>
          <div style={{ minHeight: 56, padding: 4, ...text(14, 400, C.mutedForeground) }}>{s.composerPlaceholder}</div>
          <div style={{ ...row, justifyContent: "space-between" }}>
            <span style={text(11, 400, C.mutedForeground)}>Enter to send</span>
            <div style={{ width: 32, height: 32, borderRadius: 999, background: C.primary, opacity: 0.5, ...row, justifyContent: "center" }}>
              <ArrowUp size={16} color={C.primaryForeground} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Tabs() {
  const tab = (label: string, active = false) => (
    <div
      style={{
        height: 28,
        padding: "0 10px",
        borderRadius: R.md,
        ...row,
        ...text(14, 500, active ? C.foreground : C.mutedForeground),
        background: active ? C.input : "transparent",
      }}
    >
      {label}
    </div>
  );
  return (
    <div style={{ height: L.header, ...row, gap: 8, padding: "0 8px", borderBottom: `1px solid ${C.border}`, boxSizing: "border-box" }}>
      <div style={{ ...row, gap: 2, padding: 3, borderRadius: R.lg, background: C.muted }}>
        {tab("Canvas", true)}
        {tab("Data")}
        {tab("Code")}
        {tab("History")}
      </div>
      <div style={{ marginLeft: "auto", ...row, gap: 6 }}>
        <Button variant="ghost"><Share2 size={15} /> Share</Button>
        <Button variant="ghost"><Download size={15} /> Export</Button>
        <Button><Upload size={15} /> Publish</Button>
      </div>
    </div>
  );
}

export function CanvasFrames({
  s,
  x0,
  y0,
  layout,
  srcFor,
}: {
  s: WorkspaceState;
  x0: number;
  y0: number;
  layout: { cols: number; phoneW: number; gapX: number; gapY: number; labelScale?: number };
  /** Another capture of the same screen (e.g. scrolled), by frame index. */
  srcFor?: (i: number) => string | undefined;
}) {
  const phoneH = layout.phoneW * (2406 / 1113);
  const ls = layout.labelScale ?? 1;
  const labelH = CANVAS.labelH * ls;
  const items: React.ReactNode[] = [];
  const firstPending = s.phones.findIndex((p) => p <= 0);
  SCREENS.forEach((sc, i) => {
    const col = i % layout.cols;
    const r = Math.floor(i / layout.cols);
    const x = x0 + col * (layout.phoneW + layout.gapX);
    const y = y0 + r * (phoneH + labelH + layout.gapY);
    const p = s.phones[i] ?? 0;
    if (p <= 0) {
      if (s.building && i === firstPending && firstPending > 0) {
        items.push(
          <div
            key={`b${i}`}
            style={{
              position: "absolute",
              left: x,
              top: y + labelH,
              width: layout.phoneW,
              height: phoneH,
              borderRadius: 26 * (layout.phoneW / 140),
              border: `2px dashed ${C.input}`,
              ...row,
              justifyContent: "center",
              gap: 6,
              ...text(12 * ls, 400, C.mutedForeground),
              boxSizing: "border-box",
            }}
          >
            <Spin size={13 * ls} t={s.t} /> Building…
          </div>,
        );
      }
      return;
    }
    const isTarget = i === EDIT.index;
    items.push(
      <div
        key={sc.src}
        style={{
          position: "absolute",
          left: x,
          top: y,
          opacity: p,
          transform: `translateY(${(1 - p) * 10}px) scale(${0.97 + 0.03 * p})`,
          transformOrigin: "50% 0",
        }}
      >
        <div style={{ height: labelH, ...row, gap: 6 * ls, whiteSpace: "nowrap" }}>
          <span
            style={{
              borderRadius: 4 * ls,
              background: C.muted,
              padding: `${2 * ls}px ${4 * ls}px`,
              font: `500 ${10 * ls}px/1 ${FONT.sans}`,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              color: C.mutedForeground,
            }}
          >
            {sc.part}
          </span>
          <span style={text(13 * ls, 500, C.mutedForeground)}>{sc.title}</span>
        </div>
        <Phone
          src={
            srcFor?.(i) ??
            (isTarget && (s.edit.phase === "typing" || s.edit.phase === "done") ? EDIT.editedSrc : sc.src)
          }
          width={layout.phoneW}
          overlay={
            isTarget && (s.edit.phase === "selected" || s.edit.phase === "typing") ? (
              <HeadlineEdit phase={s.edit.phase} text={s.edit.text} caretOn={s.edit.caretOn} />
            ) : undefined
          }
        />
      </div>,
    );
  });
  return <>{items}</>;
}

export function CanvasHint({ x, y }: { x: number; y: number }) {
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        transform: "translateX(-50%)",
        borderRadius: 999,
        border: `1px solid ${C.border}`,
        background: "oklch(0.145 0 0 / 90%)",
        padding: "4px 12px",
        whiteSpace: "nowrap",
        ...text(11, 400, C.mutedForeground),
      }}
    >
      Click a screen to change it in the chat · Double-click text to edit it yourself (free)
    </div>
  );
}

export const dots: React.CSSProperties = {
  backgroundImage: `radial-gradient(circle, ${C.border} 1px, transparent 1px)`,
  backgroundSize: "20px 20px",
};

function Canvas({ s }: { s: WorkspaceState }) {
  const anyPhone = s.phones.some((p) => p > 0);
  const w = L.centerW;
  const h = L.H - L.footer - L.header;
  return (
    <div style={{ position: "absolute", left: 0, top: L.header, width: w, height: h, overflow: "hidden", ...dots }}>
      {!anyPhone ? (
        <div style={{ position: "absolute", inset: 0, ...row, justifyContent: "center", flexDirection: "column", textAlign: "center" }}>
          {s.building ? (
            <>
              <Spin size={24} t={s.t} />
              <p style={{ margin: "12px 0 0", ...text(16, 500) }}>{s.step}</p>
              <p style={{ margin: "4px 0 0", ...text(14, 400, C.mutedForeground) }}>Screens appear here as soon as they are built.</p>
            </>
          ) : (
            <>
              <Sparkles size={24} color={C.primary} />
              <p style={{ margin: "12px 0 0", ...text(16, 500) }}>Review the plan in the chat</p>
              <p style={{ margin: "4px 0 0", ...text(14, 400, C.mutedForeground) }}>Confirm it to build 7 screens, or ask for changes first.</p>
            </>
          )}
        </div>
      ) : (
        <>
          <div style={{ position: "absolute", left: -L.centerX, top: -L.header }}>
            <CanvasFrames s={s} x0={phoneX(0)} y0={L.header + CANVAS.padY} layout={{ cols: 7, phoneW: CANVAS.phoneW, gapX: CANVAS.gap, gapY: 0 }} />
          </div>
          <CanvasHint x={w / 2} y={8} />
          <div
            style={{
              position: "absolute",
              left: w / 2,
              bottom: 12,
              transform: "translateX(-50%)",
              ...row,
              gap: 4,
              padding: 4,
              borderRadius: R.lg,
              border: `1px solid ${C.border}`,
              background: C.background,
              color: C.foreground,
            }}
          >
            <div style={{ width: 32, height: 32, borderRadius: R.md, background: C.secondary, ...row, justifyContent: "center" }}><MousePointer2 size={15} /></div>
            <div style={{ width: 32, height: 32, ...row, justifyContent: "center" }}><Hand size={15} /></div>
            <span style={{ width: 1, height: 20, background: C.border, margin: "0 4px" }} />
            <div style={{ width: 32, height: 32, ...row, justifyContent: "center" }}><Minus size={15} /></div>
            <span style={{ width: 40, textAlign: "center", ...text(12) }}>36%</span>
            <div style={{ width: 32, height: 32, ...row, justifyContent: "center" }}><Plus size={15} /></div>
            <div style={{ width: 32, height: 32, ...row, justifyContent: "center" }}><Maximize size={15} /></div>
          </div>
        </>
      )}
    </div>
  );
}

function RightPanel({ s }: { s: WorkspaceState }) {
  const built = s.phones[2] > 0;
  return (
    <div style={{ position: "absolute", left: 0, top: 0, width: L.right, height: L.H - L.footer, background: "oklch(0.269 0 0 / 20%)", borderLeft: `1px solid ${C.border}`, overflow: "hidden" }}>
      <div style={{ padding: 16, borderBottom: `1px solid ${C.border}` }}>
        <SectionTitle
          right={
            <span style={{ ...row, gap: 12, color: C.mutedForeground }}>
              <MousePointerClick size={15} />
              <RefreshCw size={15} />
            </span>
          }
        >
          Preview <span style={{ textTransform: "none", fontWeight: 400 }}>/</span>
        </SectionTitle>
        <div style={{ ...row, justifyContent: "center" }}>
          {built ? (
            <Phone src="app/screen-2.png" width={286} style={{ opacity: s.phones[2] }} />
          ) : (
            <div style={{ width: 286, height: 286 * (2406 / 1113), borderRadius: 40, border: `6px solid ${C.muted}`, boxSizing: "border-box", ...row, justifyContent: "center", ...text(12, 400, C.mutedForeground) }}>
              The interactive preview appears after the build.
            </div>
          )}
        </div>
        <Button variant="outline" style={{ marginTop: 12 }}>
          <Smartphone size={15} /> Open on your phone
        </Button>
      </div>
      <div style={{ padding: 16, borderBottom: `1px solid ${C.border}` }}>
        <SectionTitle right={<Badge>On device</Badge>}>
          <span style={{ ...row, gap: 6 }}><Cloud size={14} /> App Cloud</span>
        </SectionTitle>
        <p style={{ margin: 0, ...text(13, 400, C.mutedForeground) }}>
          Data is stored on each device. Connect App Cloud to sync data per user and add accounts, with no setup.
        </p>
      </div>
      <div style={{ padding: 16 }}>
        <SectionTitle right={<Badge>Test mode</Badge>}>
          <span style={{ ...row, gap: 6 }}><CreditCard size={14} /> Payments</span>
        </SectionTitle>
        <p style={{ margin: 0, ...text(13, 400, C.mutedForeground) }}>
          Purchases are simulated: nothing is charged. Connect RevenueCat to sell in store builds.
        </p>
      </div>
    </div>
  );
}

function Footer({ s }: { s: WorkspaceState }) {
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        top: L.H - L.footer,
        width: L.W,
        height: L.footer,
        borderTop: `1px solid ${C.border}`,
        background: C.rail,
        ...row,
        justifyContent: "space-between",
        padding: "0 12px",
        boxSizing: "border-box",
        ...text(11, 400, C.mutedForeground),
      }}
    >
      <span style={{ ...row, gap: 8 }}>
        {s.building ? (
          <>
            <Spin size={12} t={s.t} /> {s.step}
          </>
        ) : (
          <>
            {s.version ? "Ready" : s.planIn > 0 ? "Plan ready" : "Planning"}
            {s.version ? <span>· Version {s.version}</span> : null}
          </>
        )}
      </span>
      <span>Expo SDK 58</span>
    </div>
  );
}

export function Menu({ s, x, y }: { s: WorkspaceState; x: number; y: number }) {
  if (s.menuIn <= 0) return null;
  const item = (icon: React.ReactNode, label: string, hover = false, danger = false) => (
    <div style={{ ...row, gap: 8, height: 32, padding: "0 8px", borderRadius: R.sm, background: hover ? C.accent : "transparent", ...text(14, 400, danger ? C.destructive : C.foreground) }}>
      {icon}
      {label}
    </div>
  );
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: 176,
        padding: 4,
        borderRadius: R.md,
        border: `1px solid ${C.border}`,
        background: C.popover,
        boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
        opacity: s.menuIn,
        transform: `scale(${0.95 + 0.05 * s.menuIn})`,
        transformOrigin: "100% 0",
      }}
    >
      {item(<PencilIcon />, "Rename")}
      {item(<CopyIcon />, "Duplicate")}
      {item(<StoreIcon />, "Store listing", s.menuHover)}
      <div style={{ height: 1, background: C.border, margin: "4px -4px" }} />
      {item(<TrashIcon />, "Delete", false, true)}
    </div>
  );
}

import { Copy, Pencil, Store, Trash2 } from "lucide-react";
const PencilIcon = () => <Pencil size={15} color={C.mutedForeground} />;
const CopyIcon = () => <Copy size={15} color={C.mutedForeground} />;
const StoreIcon = () => <Store size={15} color={C.mutedForeground} />;
const TrashIcon = () => <Trash2 size={15} color={C.destructive} />;

export function Toast({ s, x, y }: { s: WorkspaceState; x: number; y: number }) {
  if (s.toastIn <= 0) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: 300,
        height: 52,
        borderRadius: R.md,
        border: `1px solid ${C.toastBorder}`,
        background: C.toastBg,
        color: C.toastText,
        ...row,
        gap: 8,
        padding: "0 16px",
        boxSizing: "border-box",
        font: `500 13px/1 ${FONT.sans}`,
        opacity: s.toastIn,
        transform: `translateY(${(1 - s.toastIn) * 16}px)`,
        boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
      }}
    >
      <CircleCheck size={18} /> Saved
    </div>
  );
}

/** The whole workspace, 1920×1080 UI px. */
export function Workspace({ s }: { s: WorkspaceState }) {
  return (
    <div style={{ position: "relative", width: L.W, height: L.H, background: C.background, overflow: "hidden", fontFamily: FONT.sans }}>
      <Rail />
      <div style={{ position: "absolute", left: L.rail, top: 0, width: L.sidebar, height: L.H - L.footer, borderRight: `1px solid ${C.border}` }}>
        <ChatPanel s={s} width={L.sidebar} height={L.H - L.footer} />
      </div>
      <div style={{ position: "absolute", left: L.centerX, top: 0, width: L.centerW, height: L.H - L.footer }}>
        <Tabs />
        <Canvas s={s} />
      </div>
      <div style={{ position: "absolute", left: L.rightX, top: 0 }}>
        <RightPanel s={s} />
      </div>
      <Footer s={s} />
      {s.dim > 0 && s.focus ? <Dim focus={s.focus} amount={s.dim} /> : null}
      <Menu s={s} x={L.rail + L.sidebar - 12 - 176} y={40} />
      {s.dialog}
      <Toast s={s} x={L.W - 300 - 24} y={L.H - 52 - 40} />
    </div>
  );
}

/** Dims everything outside the subject while the camera holds on it. */
export function Dim({ focus, amount, W = L.W, H = L.H }: { focus: { x: number; y: number; w: number; h: number }; amount: number; W?: number; H?: number }) {
  const c = `rgba(0,0,0,${0.5 * amount})`;
  const { x, y, w, h } = focus;
  return (
    <>
      <div style={{ position: "absolute", left: 0, top: 0, width: W, height: y, background: c }} />
      <div style={{ position: "absolute", left: 0, top: y + h, width: W, height: H - y - h, background: c }} />
      <div style={{ position: "absolute", left: 0, top: y, width: x, height: h, background: c }} />
      <div style={{ position: "absolute", left: x + w, top: y, width: W - x - w, height: h, background: c }} />
    </>
  );
}
