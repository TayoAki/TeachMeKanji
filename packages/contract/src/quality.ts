/**
 * Deterministic quality checks over an app's files, keyed to the rubric (rubric.ts). Each failed
 * check caps its criterion's score (0–3): a model judge can't award a 3 for a paywall that has no
 * close button. They're cheap, so they also run on every build as evidence for the judge.
 */
import { STRUCTURE_SCREENS, isStructureScreen } from "./app-structure";
import { isScreenFile, type ProjectFiles } from "./layout";

export interface QualityFinding {
  /** Rubric criterion id (e.g. "P3"). */
  criterion: string;
  ok: boolean;
  message: string;
  /** The highest score (0–3) the criterion can get while this check fails. */
  cap: number;
  files?: string[];
}

const EMOJI = /[\u{1F300}-\u{1FAFF}]/u;

/** Text of the JSX (string literals and children), roughly: enough for copy checks. */
function hasText(source: string, pattern: RegExp): boolean {
  return pattern.test(source.replace(/placeholder(TextColor)?=\{?["'`][^"'`]*["'`]\}?/g, ""));
}

export function qualityChecks(files: ProjectFiles): QualityFinding[] {
  const out: QualityFinding[] = [];
  const check = (criterion: string, ok: boolean, message: string, cap: number, paths?: string[]) =>
    out.push({ criterion, ok, message, cap, ...(paths?.length ? { files: paths } : {}) });

  const onboarding = files[STRUCTURE_SCREENS.onboarding];
  const paywall = files[STRUCTURE_SCREENS.paywall];
  const settings = files[STRUCTURE_SCREENS.settings];
  const screens = Object.keys(files).filter(isScreenFile);
  const mainScreens = screens.filter((p) => !isStructureScreen(p));
  const mainSource = mainScreens.map((p) => files[p]).join("\n");
  const ownCode = Object.entries(files).filter(
    ([p]) =>
      p.startsWith("app/") || (p.startsWith("components/") && p !== "components/AiImage.tsx"),
  );
  const filesWith = (pattern: RegExp) =>
    ownCode.filter(([, source]) => pattern.test(source)).map(([p]) => p);

  // Onboarding
  if (onboarding === undefined) {
    for (const id of ["O1", "O2", "O3"]) check(id, false, "The app has no onboarding.", 0);
  } else {
    check(
      "O1",
      /\bcompleteOnboarding\b/.test(onboarding),
      "Onboarding finishes with completeOnboarding().",
      1,
    );
    check("O1", /\bskip\b/i.test(onboarding), "Onboarding can be skipped.", 2);
    const asks = /\bsetAnswer\b/.test(onboarding);
    check("O2", asks, "Onboarding asks a question that personalizes the app.", 2);
    if (asks)
      check(
        "O2",
        /\banswers\b/.test(mainSource),
        "The main screens use the onboarding answers.",
        1,
      );
    check(
      "O3",
      !/welcome to\b/i.test(onboarding),
      'Onboarding avoids a generic "Welcome to <App>" heading.',
      1,
    );
  }

  // Paywall
  if (paywall === undefined) {
    for (const id of ["P1", "P2", "P3", "P4", "P5"]) check(id, false, "The app has no paywall.", 0);
  } else {
    check("P3", /\bdismissPaywall\b/.test(paywall), "The paywall has a close button.", 0);
    check("P3", /\brestorePurchases\b/.test(paywall), "The paywall offers Restore Purchases.", 1);
    check("P3", /renew/i.test(paywall), "The paywall states the auto-renewal terms.", 1);
    check(
      "P3",
      /\b(termsUrl|privacyUrl)\b/.test(paywall),
      "The paywall links Terms and Privacy.",
      2,
    );
    check("P2", /\bperiod\b/.test(paywall), "Offers show their billing period.", 1);
    check("P2", /\btrialDays\b/.test(paywall), "Offers show free-trial terms.", 2);
    check("P4", /\btestMode\b/.test(paywall), "Simulated purchases are labeled as test mode.", 2);
    check(
      "P4",
      !/count ?down|expires in|limited time|only \d+ left/i.test(paywall),
      "No fake urgency or scarcity on the paywall.",
      1,
    );
    check(
      "P5",
      /\bisPremium\b/.test(mainSource),
      "A main screen checks isPremium for its premium features.",
      1,
    );
    check(
      "P5",
      /\bopenPaywall\b/.test(mainSource),
      "Locked features in the main app open the paywall.",
      1,
    );
    check(
      "P5",
      /\bstatus\b/.test(paywall),
      "The purchase button shows progress while purchasing.",
      2,
    );
  }

  // Main app
  const placeholder = filesWith(/lorem ipsum|\bTODO\b|coming soon/i).filter((p) =>
    hasText(files[p]!, /lorem ipsum|\bTODO\b|coming soon/i),
  );
  check(
    "M2",
    placeholder.length === 0,
    "No placeholder copy (lorem ipsum, TODO, coming soon).",
    1,
    placeholder,
  );
  const noLoading = mainScreens.filter(
    (p) => /\buseCollection\b/.test(files[p]!) && !/\bloading\b/.test(files[p]!),
  );
  check("M2", noLoading.length === 0, "Screens that load data show a loading state.", 2, noLoading);
  const alerts = filesWith(/\bAlert\.alert\b/);
  check("M3", alerts.length === 0, "No Alert pop-ups standing in for features.", 2, alerts);
  const dead = filesWith(/onPress=\{\(\) => (\{\s*\}|null|undefined)\}/);
  check("M3", dead.length === 0, "No empty onPress handlers.", 1, dead);
  const home = files["app/(tabs)/index.tsx"] ?? "";
  if (settings !== undefined)
    check(
      "M5",
      /["'`]\/settings["'`]/.test(home),
      "Settings is reachable from the home screen.",
      2,
    );

  // Settings
  if (settings === undefined) {
    for (const id of ["S1", "S2", "S3"]) check(id, false, "The app has no settings screen.", 0);
  } else {
    check("S1", /\brestorePurchases\b/.test(settings), "Settings offers Restore Purchases.", 1);
    check(
      "S1",
      /account\/subscriptions|manage subscription/i.test(settings),
      "Settings links to managing the subscription in the store.",
      2,
    );
    check("S2", /\b(privacyUrl|termsUrl)\b/.test(settings), "Settings links privacy and terms.", 1);
    check("S2", /\bversion\b/.test(settings), "Settings shows the app version.", 2);
    check("S2", /\bsupportEmail\b/.test(settings), "Settings offers a way to contact support.", 2);
    const accounts = /apiUrl: "[^"]+"/.test(files["data/backend.ts"] ?? "");
    if (accounts) {
      check("S2", /\bsignOut\b/.test(settings), "Settings can sign out.", 1);
      check(
        "S2",
        /delete (my )?account/i.test(settings),
        "Settings offers account deletion (App Store 5.1.1(v)).",
        1,
      );
    }
    check("S3", /\bresetOnboarding\b/.test(settings), "Settings can replay onboarding.", 2);
  }

  // Craft
  const unlabeled = ownCode
    .filter(([, s]) => /<Pressable\b/.test(s) && !/accessibility(Label|Role)\b/.test(s))
    .map(([p]) => p);
  check(
    "C4",
    unlabeled.length === 0,
    "Pressable controls carry accessibility roles or labels.",
    2,
    unlabeled,
  );
  const noScaling = filesWith(/allowFontScaling=\{false\}/);
  check("C4", noScaling.length === 0, "Font scaling is never disabled.", 1, noScaling);

  const tells: Array<[string, string[]]> = [
    ["TouchableOpacity", filesWith(/\bTouchableOpacity\b/)],
    ["a custom <Modal>", filesWith(/<Modal\b/)],
    ["Alert confirmations", alerts],
    ["emoji as icons", ownCode.filter(([, s]) => EMOJI.test(s)).map(([p]) => p)],
    [
      "gradient banners on several screens",
      (() => {
        const g = filesWith(/<LinearGradient\b/);
        return g.length >= 3 ? g : [];
      })(),
    ],
  ];
  const found = tells.filter(([, paths]) => paths.length > 0);
  check(
    "C5",
    found.length === 0,
    found.length
      ? `Slop tells: ${found.map(([name]) => name).join(", ")}.`
      : "No slop tells found.",
    found.length >= 3 ? 0 : found.length === 2 ? 1 : 2,
    found.flatMap(([, paths]) => paths),
  );
  return out;
}

/** The lowest cap among a criterion's failed checks (3 when none failed). */
export function qualityCaps(findings: readonly QualityFinding[]): Record<string, number> {
  const caps: Record<string, number> = {};
  for (const f of findings) {
    if (f.ok) continue;
    caps[f.criterion] = Math.min(caps[f.criterion] ?? 3, f.cap);
  }
  return caps;
}
