// TEMPLATE FILE — owned by the platform, never written by the model.
// AI inside the app: ask a question (optionally about a photo) and get a short answer. Runs
// through App Cloud, which the platform turns on for apps that use it; no API keys in the app.
import { useState } from "react";
import { backend } from "./backend";
import { api } from "./remote";

export interface AskOptions {
  /** What the person asked, or what the app needs (with the relevant data in it). */
  prompt: string;
  /** How the AI should behave in this app, e.g. "You are a patient kanji tutor." */
  instructions?: string;
  /** A photo from pickPhoto() or <CameraCapture>; its base64 is sent. */
  photo?: { base64: string | null } | null;
  /** Ask for JSON only (parse it with JSON.parse in a try/catch). */
  json?: boolean;
}

/** The AI's answer. Throws an Error whose message can be shown to the person. */
export async function askAI(options: AskOptions): Promise<string> {
  if (!backend.apiUrl) throw new Error("AI isn't connected yet. Try again in a moment.");
  const { text } = await api<{ text: string }>("/ai", {
    method: "POST",
    body: JSON.stringify({
      prompt: options.prompt,
      instructions: options.instructions,
      image: options.photo?.base64 ?? undefined,
      json: options.json,
    }),
  });
  return text;
}

/** askAI() with loading and error state for a screen. */
export function useAI() {
  const [answer, setAnswer] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ask(options: AskOptions): Promise<string | null> {
    setLoading(true);
    setError(null);
    try {
      const text = await askAI(options);
      setAnswer(text);
      return text;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Try again.");
      return null;
    } finally {
      setLoading(false);
    }
  }

  return { ask, answer, loading, error, reset: () => (setAnswer(null), setError(null)) };
}
