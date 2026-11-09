"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUp, ImagePlus, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const SUGGESTIONS = [
  "An expense tracker with budgets and monthly insights",
  "A habit tracker with streaks and reminders",
  "A recipe book with a shopping list",
  "A workout log with progress charts",
];

export interface PromptSubmission {
  prompt: string;
  platforms: "both" | "ios" | "android";
  files: File[];
}

export function PromptBox({
  onSubmit,
  busy,
  initialPrompt = "",
  autoFocus,
}: {
  onSubmit: (submission: PromptSubmission) => void | Promise<void>;
  busy?: boolean;
  initialPrompt?: string;
  autoFocus?: boolean;
}) {
  const [prompt, setPrompt] = useState(initialPrompt);
  const [platforms, setPlatforms] = useState<PromptSubmission["platforms"]>("both");
  const [files, setFiles] = useState<File[]>([]);
  const input = useRef<HTMLInputElement>(null);
  const previews = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);

  const submit = () => {
    if (prompt.trim().length < 3 || busy) return;
    void onSubmit({ prompt: prompt.trim(), platforms, files });
  };

  return (
    <div className="w-full" data-testid="prompt-box">
      <div className="rounded-2xl border bg-background p-3 shadow-sm focus-within:ring-2 focus-within:ring-ring/40">
        {previews.length > 0 ? (
          <div className="mb-2 flex flex-wrap gap-2">
            {previews.map((url, i) => (
              <div key={url} className="relative size-16 overflow-hidden rounded-lg border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt={files[i]?.name ?? ""} className="size-full object-cover" />
                <button
                  type="button"
                  aria-label="Remove image"
                  className="absolute right-0.5 top-0.5 rounded-full bg-black/60 p-0.5 text-white"
                  onClick={() => setFiles((f) => f.filter((_, j) => j !== i))}
                >
                  <X className="size-3" />
                </button>
              </div>
            ))}
          </div>
        ) : null}
        <Textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
          }}
          autoFocus={autoFocus}
          placeholder="Describe the mobile app you want to build…"
          className="min-h-24 resize-none border-0 p-1 text-base shadow-none focus-visible:ring-0"
          aria-label="Describe your app"
        />
        <div className="mt-2 flex items-center gap-2">
          <input
            ref={input}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            multiple
            hidden
            onChange={(e) => {
              const picked = Array.from(e.target.files ?? []);
              setFiles((f) => [...f, ...picked].slice(0, 5));
              e.target.value = "";
            }}
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => input.current?.click()}
            disabled={files.length >= 5}
          >
            <ImagePlus /> Reference images
          </Button>
          <Select
            value={platforms}
            onValueChange={(v) => setPlatforms(v as PromptSubmission["platforms"])}
          >
            <SelectTrigger size="sm" className="w-36" aria-label="Platforms">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="both">iOS & Android</SelectItem>
              <SelectItem value="ios">iOS</SelectItem>
              <SelectItem value="android">Android</SelectItem>
            </SelectContent>
          </Select>
          <Button
            type="button"
            size="icon"
            className="ml-auto rounded-full"
            onClick={submit}
            disabled={prompt.trim().length < 3 || busy}
            aria-label="Create app"
            data-testid="prompt-submit"
          >
            {busy ? <Loader2 className="animate-spin" /> : <ArrowUp />}
          </Button>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setPrompt(s)}
            className="rounded-full border bg-background px-3 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
