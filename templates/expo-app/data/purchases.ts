// TEMPLATE FILE — owned by the platform, never written by the model.
// Purchases for the paywall and premium features. With RevenueCat connected (data/payments.ts)
// a store or TestFlight build sells through Apple and Google: prices come from the store and
// premium follows the RevenueCat entitlement. In Expo Go, the preview, or without keys,
// purchases are simulated and nothing is charged (`testMode` is true).
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Platform } from "react-native";
import Purchases, { type CustomerInfo, type PurchasesPackage } from "react-native-purchases";
import { trackSystem } from "./analytics";
import { monetization } from "./monetization";
import { payments } from "./payments";

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

/** RevenueCat's key for this platform, when purchases are real here (a store or TestFlight build). */
function storeApiKey(): string | null {
  if (Platform.OS === "web" || Constants.executionEnvironment === "storeClient") return null;
  const key = Platform.OS === "ios" ? payments.iosApiKey : payments.androidApiKey;
  return key || null;
}
const live = storeApiKey() !== null;

interface PurchaseState {
  ready: boolean;
  entitlement: Entitlement | null;
  status: "idle" | "purchasing" | "restoring";
  error: string | null;
  /** The store's packages by offer id (live purchases only). */
  packages: Record<string, PurchasesPackage>;
}

let state: PurchaseState = {
  ready: false,
  entitlement: null,
  status: "idle",
  error: null,
  packages: {},
};
const listeners = new Set<() => void>();

function update(next: Partial<PurchaseState>) {
  state = { ...state, ...next };
  listeners.forEach((listener) => listener());
}

const PACKAGE_TYPES: Record<Offer["period"], string> = {
  week: "WEEKLY",
  month: "MONTHLY",
  year: "ANNUAL",
  lifetime: "LIFETIME",
};

/** The offer a store package sells: same identifier, or the same period. */
function offerFor(pkg: PurchasesPackage): Offer | undefined {
  return (
    monetization.offers.find((o) => o.id === pkg.identifier) ??
    monetization.offers.find((o) => PACKAGE_TYPES[o.period] === pkg.packageType)
  );
}

function entitlementFrom(info: CustomerInfo): Entitlement | null {
  const active = info.entitlements.active[payments.entitlement];
  if (!active) return null;
  const pkg = Object.entries(state.packages).find(
    ([, p]) => p.product.identifier === active.productIdentifier,
  );
  return {
    offerId: pkg?.[0] ?? monetization.defaultOfferId,
    since: active.latestPurchaseDate ?? new Date().toISOString(),
  };
}

let loading: Promise<void> | null = null;
function load(): Promise<void> {
  loading ??= live ? loadStore() : loadSimulated();
  return loading;
}

function loadSimulated(): Promise<void> {
  return AsyncStorage.getItem(ENTITLEMENT_KEY)
    .then((raw) =>
      update({ ready: true, entitlement: raw ? (JSON.parse(raw) as Entitlement) : null }),
    )
    .catch(() => update({ ready: true }));
}

async function loadStore(): Promise<void> {
  try {
    Purchases.configure({ apiKey: storeApiKey()! });
    const offerings = await Purchases.getOfferings();
    const packages: Record<string, PurchasesPackage> = {};
    for (const pkg of offerings.current?.availablePackages ?? []) {
      const offer = offerFor(pkg);
      if (offer && !packages[offer.id]) packages[offer.id] = pkg;
    }
    update({ packages });
    update({ ready: true, entitlement: entitlementFrom(await Purchases.getCustomerInfo()) });
    Purchases.addCustomerInfoUpdateListener((info) =>
      update({ entitlement: entitlementFrom(info) }),
    );
  } catch {
    update({ ready: true, error: "The store isn't available right now. Try again later." });
  }
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Buy an offer. Resolves true when premium is active. */
export async function purchase(offerId: string): Promise<boolean> {
  const offer = monetization.offers.find((o) => o.id === offerId);
  if (!offer) {
    update({ error: "That plan isn't available." });
    return false;
  }
  update({ status: "purchasing", error: null });
  if (live) {
    const pkg = state.packages[offerId];
    if (!pkg) {
      update({ status: "idle", error: "That plan isn't available in the store yet." });
      return false;
    }
    try {
      const { customerInfo } = await Purchases.purchasePackage(pkg);
      const entitlement = entitlementFrom(customerInfo);
      update({ status: "idle", entitlement });
      if (entitlement) trackPurchase(offer, false);
      return entitlement !== null;
    } catch (error) {
      const cancelled = (error as { userCancelled?: boolean }).userCancelled;
      update({
        status: "idle",
        error: cancelled ? null : "The purchase didn't go through. You weren't charged.",
      });
      return false;
    }
  }
  await wait(700);
  const entitlement = { offerId, since: new Date().toISOString() };
  await AsyncStorage.setItem(ENTITLEMENT_KEY, JSON.stringify(entitlement));
  update({ status: "idle", entitlement });
  trackPurchase(offer, true);
  return true;
}

/** Purchases for the owner's analytics; simulated ones are marked as tests. */
function trackPurchase(offer: Offer, simulated: boolean): void {
  trackSystem(
    "purchase",
    { offer: offer.id, period: offer.period, trial: offer.trialDays > 0 },
    simulated,
  );
}

/** Restore earlier purchases. Resolves true when premium is active afterwards. */
export async function restorePurchases(): Promise<boolean> {
  update({ status: "restoring", error: null });
  let entitlement: Entitlement | null = null;
  if (live) {
    try {
      entitlement = entitlementFrom(await Purchases.restorePurchases());
    } catch {
      update({ status: "idle", error: "Couldn't reach the store. Try again." });
      return false;
    }
  } else {
    await wait(500);
    const raw = await AsyncStorage.getItem(ENTITLEMENT_KEY);
    entitlement = raw ? (JSON.parse(raw) as Entitlement) : null;
  }
  update({
    status: "idle",
    entitlement,
    error: entitlement ? null : "No purchases to restore on this account.",
  });
  if (entitlement) trackSystem("restore", {}, !live);
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
  // Live: the plans the store sells, at the store's localized prices.
  const offers: Offer[] = live
    ? monetization.offers
        .filter((o) => state.packages[o.id])
        .map((o) => ({ ...o, price: state.packages[o.id]!.product.priceString }))
    : monetization.offers;
  const offer = state.entitlement
    ? (offers.find((o) => o.id === state.entitlement?.offerId) ?? null)
    : null;
  const { packages: _packages, ...visible } = state;
  return {
    ...visible,
    isPremium: state.entitlement !== null,
    /** The offer the user has, when premium. */
    activeOffer: offer,
    offers,
    defaultOfferId: offers.some((o) => o.id === monetization.defaultOfferId)
      ? monetization.defaultOfferId
      : (offers[0]?.id ?? monetization.defaultOfferId),
    premiumFeatures: monetization.premiumFeatures,
    /** Purchases are simulated (Expo Go, the preview, or RevenueCat not connected). */
    testMode: !live,
    purchase,
    restorePurchases,
    openPaywall,
    dismissPaywall,
  };
}
