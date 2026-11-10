import React from "react";
import { Img, staticFile } from "remotion";
import { Copy, Download, Images, Sparkles, X } from "lucide-react";
import { C, FONT, R } from "../brand";
import { LISTING } from "./data";
import { Button, row } from "./kit";

const text = (size: number, weight = 400, color: string = C.foreground) =>
  ({ font: `${weight} ${size}px/1.45 ${FONT.sans}`, color }) as React.CSSProperties;

function Field({ label, value, max, lines, count }: { label: string; value: string; max?: number; lines?: number; count?: number }) {
  return (
    <div style={{ borderRadius: R.lg, border: `1px solid ${C.border}`, padding: 12, minWidth: 0 }}>
      <div style={{ ...row, gap: 8, marginBottom: 4, ...text(12, 400, C.mutedForeground) }}>
        {label}
        {max ? (
          <span style={{ fontVariantNumeric: "tabular-nums" }}>
            {count ?? value.length}/{max}
          </span>
        ) : null}
        <Copy size={14} style={{ marginLeft: "auto" }} />
      </div>
      <p
        style={{
          margin: 0,
          ...text(14),
                    overflowWrap: "anywhere",
          display: "-webkit-box",
          WebkitLineClamp: lines ?? 3,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}
      >
        {value}
      </p>
    </div>
  );
}

/**
 * The Store listing dialog (apps/web/src/components/workspace/store-listing-dialog.tsx) with the
 * listing production wrote for Kanjiwa. `narrow` follows the real responsive grids: 2-column
 * fields and 5 screenshots per row when wide; 1 and 3 when narrow. The description is clamped so
 * the screenshots sit in view without the dialog's scroll.
 */
export function StoreListingDialog({
  width,
  narrow,
  busy,
  shots,
  t,
}: {
  width: number;
  narrow?: boolean;
  busy: boolean;
  shots: number[];
  t: number;
}) {
  const shotCols = narrow ? 3 : 5;
  return (
    <div
      style={{
        width,
        borderRadius: R.lg,
        border: `1px solid ${C.border}`,
        background: C.background,
        padding: 24,
        boxSizing: "border-box",
        boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
        position: "relative",
      }}
    >
      <X size={16} color={C.mutedForeground} style={{ position: "absolute", right: 16, top: 16 }} />
      <div style={text(18, 600)}>Store listing</div>
      <p style={{ margin: "6px 0 16px", ...text(14, 400, C.mutedForeground) }}>
        The text and screenshots App Store Connect and Google Play Console ask for, written for this app and sized to
        each store&rsquo;s limits.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: narrow ? "1fr" : "1fr 1fr", gap: 12 }}>
        <Field label="Name" value={LISTING.name} max={30} />
        <Field label="Subtitle" value={LISTING.subtitle} max={30} />
        <Field label="Promotional text" value={LISTING.promo} max={170} />
        <Field label="Google Play short description" value={LISTING.short} max={80} />
        <Field label="Keywords" value={LISTING.keywords} max={100} />
        <Field label="Category" value={LISTING.category} />
      </div>
      <div style={{ marginTop: 12 }}>
        <Field label="Description" value={LISTING.description} max={4000} lines={2} count={LISTING.descriptionLength} />
      </div>
      <div style={{ ...row, gap: 8, marginTop: 16, flexWrap: "wrap" }}>
        <Button busy={busy} t={t}>
          {busy ? null : <Images size={15} />} Make screenshots
        </Button>
        <Button variant="outline" style={{ opacity: shots.every((p) => p >= 1) ? 1 : 0.5 }}>
          <Download size={15} /> Download all
        </Button>
        <Button variant="ghost">
          <Sparkles size={15} /> Write it again
        </Button>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${shotCols}, 1fr)`,
          gap: 12,
          marginTop: 16,
          minHeight: shots.some((p) => p > 0) ? undefined : 0,
        }}
      >
        {shots.some((p) => p > 0)
          ? LISTING.shots.map((src, i) => (
              <div
                key={src}
                style={{
                  opacity: shots[i],
                  transform: `translateY(${(1 - shots[i]) * 8}px)`,
                  borderRadius: R.lg,
                  border: `1px solid ${C.border}`,
                  overflow: "hidden",
                  aspectRatio: "1290 / 2796",
                }}
              >
                <Img src={staticFile(src)} style={{ width: "100%", height: "100%", display: "block" }} />
              </div>
            ))
          : null}
      </div>
    </div>
  );
}
