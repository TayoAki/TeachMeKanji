/**
 * expo-speech in the browser: the Web Speech API when the browser has a voice. onDone always
 * fires once, after the words or after the time they would take, so an app waiting for it (a
 * read-along moving to the next sentence) also works where nothing can speak (headless Chrome).
 */
interface Options {
  rate?: number;
  pitch?: number;
  onDone?: () => void;
}

const synth: SpeechSynthesis | undefined =
  typeof window !== "undefined" && "speechSynthesis" in window ? window.speechSynthesis : undefined;
let current: { timer: ReturnType<typeof setTimeout>; cancelled: boolean } | null = null;

/** About how long the words take to say: 2.6 words a second at rate 1, at least half a second. */
export function estimateMs(text: string, rate = 1): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(500, Math.round(((words / 2.6) * 1000) / Math.max(0.1, rate)));
}

export function speak(text: string, options: Options = {}): void {
  stop();
  const state = { timer: undefined as unknown as ReturnType<typeof setTimeout>, cancelled: false };
  let finished = false;
  const finish = () => {
    if (finished || state.cancelled) return;
    finished = true;
    clearTimeout(state.timer);
    if (current === state) current = null;
    options.onDone?.();
  };
  current = state;
  if (synth && typeof SpeechSynthesisUtterance !== "undefined") {
    try {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = options.rate ?? 1;
      utterance.pitch = options.pitch ?? 1;
      utterance.onend = finish;
      synth.speak(utterance);
    } catch {
      // No voice: the timer below stands in.
    }
  }
  state.timer = setTimeout(finish, estimateMs(text, options.rate) + 1500);
}

export function stop(): void {
  if (current) {
    current.cancelled = true;
    clearTimeout(current.timer);
    current = null;
  }
  synth?.cancel();
}

export async function isSpeakingAsync(): Promise<boolean> {
  return current !== null || Boolean(synth?.speaking);
}
