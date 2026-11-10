"use client";

import { useState } from "react";
import { Loader2, Sparkles, X } from "lucide-react";
import type {
  InlinePatch,
  PreviewTheme,
  SelectedElement,
  StyleValue,
} from "@appbuilder/contract/protocol";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const COLOR_TOKENS = [
  "text",
  "textMuted",
  "primary",
  "onPrimary",
  "accent",
  "surface",
  "surfaceAlt",
  "background",
  "border",
  "success",
  "warning",
  "danger",
];

function Swatches({
  theme,
  value,
  onChange,
  allowNone,
  label,
}: {
  theme: PreviewTheme | undefined;
  value: string | null;
  onChange: (token: string | null) => void;
  allowNone?: boolean;
  label: string;
}) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-xs">{label}</Label>
      <div className="flex flex-wrap gap-1.5">
        {allowNone ? (
          <button
            type="button"
            title="None"
            aria-label={`${label}: none`}
            onClick={() => onChange("transparent")}
            className={cn(
              "size-6 rounded-full border bg-[linear-gradient(45deg,transparent_45%,var(--destructive)_45%,var(--destructive)_55%,transparent_55%)]",
              value === "transparent" && "ring-2 ring-primary ring-offset-1",
            )}
          />
        ) : null}
        {COLOR_TOKENS.map((token) => (
          <button
            key={token}
            type="button"
            title={token}
            aria-label={`${label}: ${token}`}
            onClick={() => onChange(token)}
            className={cn(
              "size-6 rounded-full border",
              value === token && "ring-2 ring-primary ring-offset-1",
            )}
            style={{ backgroundColor: theme?.colors[token] }}
          />
        ))}
      </div>
    </div>
  );
}

export function Inspector({
  element,
  theme,
  canEdit,
  onApply,
  onAskAI,
  onClose,
}: {
  element: SelectedElement;
  theme: PreviewTheme | undefined;
  canEdit: boolean;
  onApply: (patch: InlinePatch) => Promise<void>;
  onAskAI: () => void;
  onClose: () => void;
}) {
  const [text, setText] = useState(element.literalText ?? "");
  const [color, setColor] = useState<string | null>(null);
  const [background, setBackground] = useState<string | null>(null);
  const [fontSize, setFontSize] = useState("");
  const [padding, setPadding] = useState("");
  const [radius, setRadius] = useState("");
  const [busy, setBusy] = useState(false);

  const patch: InlinePatch = {};
  if (element.literalText !== null && text !== element.literalText && text.trim())
    patch.text = text;
  const style: Record<string, StyleValue> = {};
  if (color) style.color = { kind: "token", path: `colors.${color}` };
  if (background) {
    style.backgroundColor =
      background === "transparent"
        ? { kind: "keyword", value: "transparent" }
        : { kind: "token", path: `colors.${background}` };
  }
  if (fontSize) style.fontSize = { kind: "number", value: Number(fontSize) };
  if (padding) style.padding = { kind: "number", value: Number(padding) };
  if (radius) style.borderRadius = { kind: "number", value: Number(radius) };
  if (Object.keys(style).length) patch.style = style;
  const dirty = patch.text !== undefined || patch.style !== undefined;

  const [file, span] = element.fid.split(/:(?=\d+-\d+$)/);
  return (
    <section className="border-b p-4" data-testid="inspector">
      <div className="mb-3 flex items-start gap-2">
        <div className="min-w-0">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Selected element
          </h2>
          <p className="truncate font-mono text-[11px] text-muted-foreground" title={element.fid}>
            {file} · {span}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="ml-auto size-7"
          onClick={onClose}
          aria-label="Close inspector"
        >
          <X />
        </Button>
      </div>
      {canEdit ? (
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label className="text-xs" htmlFor="inspector-text">
              Text
            </Label>
            {element.literalText !== null ? (
              <Input
                id="inspector-text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                data-testid="inspector-text"
                autoFocus
              />
            ) : (
              <p className="rounded-md bg-muted px-2 py-1.5 text-xs text-muted-foreground">
                {element.text
                  ? `“${element.text}” comes from data or code. Use “Edit with AI” to change it.`
                  : "This element has no text of its own."}
              </p>
            )}
          </div>
          <Swatches theme={theme} value={color} onChange={setColor} label="Text color" />
          <Swatches
            theme={theme}
            value={background}
            onChange={setBackground}
            allowNone
            label="Background"
          />
          <div className="grid grid-cols-3 gap-2">
            <div className="grid gap-1">
              <Label className="text-xs" htmlFor="inspector-font">
                Font size
              </Label>
              <Input
                id="inspector-font"
                inputMode="numeric"
                placeholder={element.style.fontSize.replace("px", "")}
                value={fontSize}
                onChange={(e) => setFontSize(e.target.value.replace(/[^\d.]/g, ""))}
              />
            </div>
            <div className="grid gap-1">
              <Label className="text-xs" htmlFor="inspector-padding">
                Padding
              </Label>
              <Input
                id="inspector-padding"
                inputMode="numeric"
                placeholder="–"
                value={padding}
                onChange={(e) => setPadding(e.target.value.replace(/[^\d.]/g, ""))}
              />
            </div>
            <div className="grid gap-1">
              <Label className="text-xs" htmlFor="inspector-radius">
                Corners
              </Label>
              <Input
                id="inspector-radius"
                inputMode="numeric"
                placeholder="–"
                value={radius}
                onChange={(e) => setRadius(e.target.value.replace(/[^\d.]/g, ""))}
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              className="flex-1"
              disabled={!dirty || busy}
              data-testid="inspector-apply"
              onClick={async () => {
                setBusy(true);
                try {
                  await onApply(patch);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? <Loader2 className="animate-spin" /> : null} Apply · free
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="flex-1"
              onClick={onAskAI}
              data-testid="inspector-ask-ai"
            >
              <Sparkles /> Edit with AI
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">“{element.text}”</p>
      )}
    </section>
  );
}

export function ThemeList({
  themes,
  activeId,
  onSelect,
  disabled,
}: {
  themes: PreviewTheme[];
  activeId?: string;
  onSelect: (id: string) => void;
  disabled?: boolean;
}) {
  if (themes.length === 0)
    return <p className="text-xs text-muted-foreground">Themes appear after the first build.</p>;
  return (
    <ul className="space-y-1" data-testid="theme-list">
      {themes.map((t) => (
        <li key={t.id}>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onSelect(t.id)}
            className={cn(
              "flex w-full items-center gap-3 rounded-lg border border-transparent px-2 py-1.5 text-left text-sm hover:bg-accent",
              t.id === activeId && "border-border bg-background shadow-sm",
            )}
            data-testid={`theme-${t.id}`}
          >
            <span className="flex -space-x-1.5">
              {["background", "primary", "accent"].map((k) => (
                <span
                  key={k}
                  className="size-5 rounded-full border-2 border-background"
                  style={{ backgroundColor: t.colors[k] }}
                />
              ))}
            </span>
            <span className="flex-1 truncate">{t.name}</span>
            <span className="text-[10px] text-muted-foreground">{t.dark ? "dark" : "light"}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
