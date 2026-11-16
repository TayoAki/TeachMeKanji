// TEMPLATE FILE — owned by the platform, never written by the model.
// Spoken words with the phone's own voice (expo-speech) and a screen that stays on
// (expo-keep-awake): a timer's spoken cues ("Round 2", "Rest", "Jab, cross"), a read-along or
// narration. The browser preview speaks with the browser's voice when it has one.
import { useKeepAwake } from "expo-keep-awake";
import { isSpeakingAsync, speak as say, stop } from "expo-speech";

export interface SpeakOptions {
  /** 0.5 (slow) to 2 (fast); 1 is normal. */
  rate?: number;
  /** 0.5 (low) to 2 (high); 1 is normal. */
  pitch?: number;
  /** Called when the phone has finished saying it (not when stopSpeaking() cuts it off). */
  onDone?: () => void;
}

/** Say something aloud with the phone's voice, cutting off anything still being said. */
export function speak(text: string, options: SpeakOptions = {}): void {
  stop();
  say(text, {
    rate: options.rate ?? 1,
    pitch: options.pitch ?? 1,
    onDone: options.onDone,
  });
}

/** Stop speaking now (a paused timer, leaving the screen). */
export function stopSpeaking(): void {
  stop();
}

/** Whether the phone is speaking right now. */
export function isSpeaking(): Promise<boolean> {
  return isSpeakingAsync();
}

/**
 * Keeps the screen on while it is rendered: show it only while a timer or session runs, e.g.
 * {running ? <KeepAwake /> : null}.
 */
export function KeepAwake(): null {
  useKeepAwake();
  return null;
}
