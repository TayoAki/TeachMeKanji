"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Bug, ImagePlus, Lightbulb, Loader2, MessageSquare, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { recentClientErrors } from "@/lib/client-errors";
import { cn } from "@/lib/utils";

export type FeedbackKind = "bug" | "request" | "other";

interface Prefill {
  kind?: FeedbackKind;
  title?: string;
  body?: string;
}

const OPEN_EVENT = "appbuilder:feedback";
/** Fired after a report is sent, so lists of reports can refresh. */
export const FEEDBACK_SENT_EVENT = "appbuilder:feedback-sent";

/** Open the feedback dialog from anywhere in the builder, optionally prefilled. */
export function openFeedback(prefill: Prefill = {}): void {
  window.dispatchEvent(new CustomEvent<Prefill>(OPEN_EVENT, { detail: prefill }));
}

const KINDS: Array<{ value: FeedbackKind; label: string; icon: typeof Bug; hint: string }> = [
  {
    value: "bug",
    label: "Bug",
    icon: Bug,
    hint: "What did you do, what did you expect, and what happened instead?",
  },
  {
    value: "request",
    label: "Feature request",
    icon: Lightbulb,
    hint: "What would you like to do, and why does it matter for your app?",
  },
  {
    value: "other",
    label: "Other",
    icon: MessageSquare,
    hint: "Anything else you'd like us to know.",
  },
];

const MAX_IMAGES = 3;

/** Bug reports and feature requests, sent with the context that helps us act on them. */
export function FeedbackDialog() {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<FeedbackKind>("bug");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [images, setImages] = useState<File[]>([]);
  const [details, setDetails] = useState(true);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onOpen = (event: Event) => {
      const prefill = (event as CustomEvent<Prefill>).detail ?? {};
      setKind(prefill.kind ?? "bug");
      setTitle(prefill.title ?? "");
      setBody(prefill.body ?? "");
      setImages([]);
      setDetails(true);
      setOpen(true);
    };
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_EVENT, onOpen);
  }, []);

  const projectId = /^\/projects\/([^/]+)/.exec(pathname ?? "")?.[1] ?? null;
  const addImages = (files: File[]) => {
    const pictures = files.filter((f) => f.type.startsWith("image/"));
    if (pictures.some((f) => f.size > 5 * 1024 * 1024)) {
      toast.error("Each screenshot must be under 5 MB.");
      return;
    }
    setImages((current) => [...current, ...pictures].slice(0, MAX_IMAGES));
  };
  const context = () => ({
    path: pathname,
    viewport: `${window.innerWidth}×${window.innerHeight}`,
    errors: recentClientErrors(),
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const form = new FormData();
      form.set("kind", kind);
      form.set("title", title);
      form.set("body", body);
      if (projectId) form.set("projectId", projectId);
      form.set("context", JSON.stringify(details ? context() : { path: pathname }));
      form.set("details", details ? "1" : "0");
      for (const image of images) form.append("images", image, image.name || "screenshot.png");
      await api("/api/feedback", { method: "POST", body: form });
      setOpen(false);
      window.dispatchEvent(new Event(FEEDBACK_SENT_EVENT));
      toast.success("Thanks, we've got it.", {
        description: "Follow it in Settings → Your reports.",
        action: { label: "View", onClick: () => router.push("/settings#feedback") },
      });
    } catch {
      // api() already showed the error.
    } finally {
      setBusy(false);
    }
  };

  const active = KINDS.find((k) => k.value === kind)!;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        className="max-h-[90vh] overflow-y-auto sm:max-w-[min(56rem,calc(100%-2rem))]"
        data-testid="feedback-dialog"
      >
        <DialogHeader>
          <DialogTitle>Report a bug or request a feature</DialogTitle>
          <DialogDescription>
            Every report is read by the team. You&rsquo;ll see its status and our reply in Settings.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Kind">
            {KINDS.map((k) => (
              <button
                key={k.value}
                type="button"
                role="radio"
                aria-checked={kind === k.value}
                onClick={() => setKind(k.value)}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-lg border p-2 text-xs transition-colors",
                  kind === k.value ? "border-foreground bg-muted" : "hover:bg-muted",
                )}
                data-testid={`feedback-kind-${k.value}`}
              >
                <k.icon className="size-4" />
                {k.label}
              </button>
            ))}
          </div>
          <label className="block space-y-1.5 text-sm font-medium">
            Title
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={120}
              required
              minLength={3}
              placeholder={
                kind === "request" ? "Export to Android tablets" : "The build stops at 80%"
              }
              data-testid="feedback-title"
            />
          </label>
          <label className="block space-y-1.5 text-sm font-medium">
            Details
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onPaste={(e) => {
                const files = Array.from(e.clipboardData.files);
                if (files.length) {
                  e.preventDefault();
                  addImages(files);
                }
              }}
              maxLength={5000}
              required
              minLength={10}
              rows={6}
              placeholder={active.hint}
              data-testid="feedback-body"
            />
          </label>

          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              {images.map((image, i) => (
                <div key={i} className="relative size-16 overflow-hidden rounded-md border">
                  <Thumb file={image} />
                  <button
                    type="button"
                    aria-label="Remove screenshot"
                    onClick={() => setImages((all) => all.filter((_, j) => j !== i))}
                    className="absolute right-0.5 top-0.5 rounded-full bg-background/90 p-0.5"
                  >
                    <X className="size-3" />
                  </button>
                </div>
              ))}
              {images.length < MAX_IMAGES ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInput.current?.click()}
                >
                  <ImagePlus /> Add a screenshot
                </Button>
              ) : null}
              <input
                ref={fileInput}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                multiple
                hidden
                onChange={(e) => {
                  addImages(Array.from(e.target.files ?? []));
                  e.target.value = "";
                }}
                data-testid="feedback-images"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Up to {MAX_IMAGES}, or paste one into the details.
            </p>
          </div>

          <label className="flex items-start gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={details}
              onChange={(e) => setDetails(e.target.checked)}
            />
            <span>
              Include technical details: this page{projectId ? " and project" : ""}, your browser
              and window size, and the builder&rsquo;s last few errors in this tab
              {projectId ? ", plus the project's last failed step" : ""}. Never your app&rsquo;s
              data.
            </span>
          </label>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy} data-testid="feedback-send">
              {busy ? <Loader2 className="animate-spin" /> : null} Send
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Thumb({ file }: { file: File }) {
  const url = useMemo(() => URL.createObjectURL(file), [file]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="" className="size-full object-cover" />;
}
