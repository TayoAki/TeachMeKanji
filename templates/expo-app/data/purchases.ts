// TEMPLATE FILE — owned by the platform, never written by the model.
// Purchases for the paywall and premium features. In Expo Go and the preview, purchases are
// simulated and nothing is charged (`testMode` is true): an "active" state here is not proof of
// payment. A store build swaps this file for a real billing provider (RevenueCat, StoreKit /
// Play Billing) with the same API, and checks purchases on a server before granting access.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { monetization } from "./monetization";

/** One way to pay, as shown on the paywall. */
export interface Offer {
  id: string;
  /** "Yearly", "Monthly", "Lifetime"... */
  label: string;
  /** Display price in the store's currency, e.g. "$29.99". */
  price: string;
  period: "week" | "month" | "year" | "lifetime";
  /** Free-trial length in days; 0 for none. */
  trialDays: number;
  /** Short highlight such as "Save 50%", or "". */
  badge: string;
}

export interface Monetization {
  /** What premium unlocks, in the user's words; each should exist in the app. */
  premiumFeatures: string[];
  offers: Offer[];
  /** The offer selected when the paywall opens. */
  defaultOfferId: string;
}

export interface Entitlement {
  offerId: string;
  /** ISO date the (simulated) purchase was made. */
  since: string;
}

const ENTITLEMENT_KEY = "app:entitlement";

interface PurchaseState {
  ready: boolean;
  entitlement: Entitlement | null;
  status: "idle" | "purchasing" | "restoring";
  error: string | null;
}

let state: PurchaseState = { ready: false, entitlement: null, status: "idle", error: null };
const listeners = new Set<() => void>();

function update(next: Partial<PurchaseState>) {
  state = { ...state, ...next };
  listeners.forEach((listener) => listener());
}

let loading: Promise<void> | null = null;
function load(): Promise<void> {
  loading ??= AsyncStorage.getItem(ENTITLEMENT_KEY)
    .then((raw) =>
      update({ ready: true, entitlement: raw ? (JSON.parse(raw) as Entitlement) : null }),
    )
    .catch(() => update({ ready: true }));
  return loading;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Buy an offer. Resolves true when premium is active. (Simulated: no charge.) */
export async function purchase(offerId: string): Promise<boolean> {
  const offer = monetization.offers.find((o) => o.id === offerId);
  if (!offer) {
    update({ error: "That plan isn't available." });
    return false;
  }
  update({ status: "purchasing", error: null });
  await wait(700);
  const entitlement = { offerId, since: new Date().toISOString() };
  await AsyncStorage.setItem(ENTITLEMENT_KEY, JSON.stringify(entitlement));
  update({ status: "idle", entitlement });
  return true;
}

/** Restore earlier purchases. Resolves true when premium is active afterwards. */
export async function restorePurchases(): Promise<boolean> {
  update({ status: "restoring", error: null });
  await wait(500);
  const raw = await AsyncStorage.getItem(ENTITLEMENT_KEY);
  const entitlement = raw ? (JSON.parse(raw) as Entitlement) : null;
  update({
    status: "idle",
    entitlement,
    error: entitlement ? null : "No purchases to restore on this account.",
  });
  return Boolean(entitlement);
}

/** Open the paywall (from a locked premium feature, a banner, or Settings). */
export function openPaywall(): void {
  router.push("/paywall");
}

/** Close the paywall: back to where it was opened from, or the home screen. */
export function dismissPaywall(): void {
  if (router.canGoBack()) router.back();
  else router.replace("/");
}

export function usePurchases() {
  const [, rerender] = useState(0);
  useEffect(() => {
    const listener = () => rerender((n) => n + 1);
    listeners.add(listener);
    void load();
    return () => {
      listeners.delete(listener);
    };
  }, []);
  const offer = state.entitlement
    ? (monetization.offers.find((o) => o.id === state.entitlement?.offerId) ?? null)
    : null;
  return {
    ...state,
    isPremium: state.entitlement !== null,
    /** The offer the user has, when premium. */
    activeOffer: offer,
    offers: monetization.offers,
    defaultOfferId: monetization.defaultOfferId,
    premiumFeatures: monetization.premiumFeatures,
    /** True in Expo Go and the preview: purchases are simulated, nothing is charged. */
    testMode: true,
    purchase,
    restorePurchases,
    openPaywall,
    dismissPaywall,
  };
}
