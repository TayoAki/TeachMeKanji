// TEMPLATE FILE — owned by the platform, never written by the model.
// First-launch state: whether onboarding is done and the answers it collected. Screens use
// useAppState(); the root layout shows onboarding until completeOnboarding() is called.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { appStructure } from "./app-structure";

const ONBOARDED_KEY = "app:onboarded";
const ANSWERS_KEY = "app:answers";

interface AppState {
  /** False until the saved state has loaded; render nothing that depends on it before. */
  ready: boolean;
  onboarded: boolean;
  /** Answers from onboarding questions, by key (e.g. { goal: "Pass JLPT N4" }). */
  answers: Record<string, string>;
}

let state: AppState = { ready: false, onboarded: false, answers: {} };
const listeners = new Set<() => void>();

function update(next: Partial<AppState>) {
  state = { ...state, ...next };
  listeners.forEach((listener) => listener());
}

function parseAnswers(raw: string | null): Record<string, string> {
  try {
    const value = raw ? (JSON.parse(raw) as unknown) : {};
    return value && typeof value === "object" ? (value as Record<string, string>) : {};
  } catch {
    return {};
  }
}

let loading: Promise<void> | null = null;
function load(): Promise<void> {
  loading ??= Promise.all([AsyncStorage.getItem(ONBOARDED_KEY), AsyncStorage.getItem(ANSWERS_KEY)])
    .then(([onboarded, answers]) =>
      update({ ready: true, onboarded: onboarded === "1", answers: parseAnswers(answers) }),
    )
    .catch(() => update({ ready: true }));
  return loading;
}

/** Save one onboarding answer; the main app can read it to personalize what it shows. */
export async function setAnswer(key: string, value: string): Promise<void> {
  const answers = { ...state.answers, [key]: value };
  update({ answers });
  await AsyncStorage.setItem(ANSWERS_KEY, JSON.stringify(answers));
}

/**
 * Finish onboarding: the app opens on its home screen, with the paywall on top when the app
 * has one (closing it reveals the home screen).
 */
export async function completeOnboarding(): Promise<void> {
  await AsyncStorage.setItem(ONBOARDED_KEY, "1");
  update({ onboarded: true });
  router.replace("/");
  if (appStructure.paywall) setTimeout(() => router.push("/paywall"), 350);
}

/** Show onboarding again (from Settings). Answers are kept until they are answered again. */
export async function resetOnboarding(): Promise<void> {
  await AsyncStorage.removeItem(ONBOARDED_KEY);
  update({ onboarded: false });
  if (appStructure.onboarding) router.replace("/onboarding");
}

export function useAppState() {
  const [, rerender] = useState(0);
  useEffect(() => {
    const listener = () => rerender((n) => n + 1);
    listeners.add(listener);
    void load();
    return () => {
      listeners.delete(listener);
    };
  }, []);
  return { ...state, setAnswer, completeOnboarding, resetOnboarding };
}
