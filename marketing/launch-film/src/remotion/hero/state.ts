import { EDIT_NEW, T, typed } from "./script";
import { inn, ramp } from "./motion";
import type { WorkspaceState } from "./ui/Workspace";

const N = 7;

/** Everything the product shows at film time t, derived only from t (no hidden inputs). */
export function workspaceState(t: number): Omit<WorkspaceState, "dialog" | "dim" | "focus"> {
  const b = T.build;
  const e = T.edit;
  const l = T.listing;
  const building = t >= T.plan.confirmClick + 0.08 && t < b.readyAt;
  const builtCount = Array.from({ length: N }, (_, i) => (t >= b.phonesStart + i * b.phoneGap ? 1 : 0)).reduce(
    (a: number, c: number) => a + c,
    0,
  );
  const phase =
    t < e.dbl2 + 0.04 ? "none" : t < e.typeStart ? "selected" : t < e.clickAway ? "typing" : "done";
  const typingEnds = e.typeStart + EDIT_NEW.length / e.cps;
  const blink = Math.floor((t - typingEnds) / 0.5) % 2 === 0;
  return {
    t,
    userMessage: t >= T.plan.start,
    planIn: ramp(t, T.plan.cardIn, 0.3),
    confirmBusy: t >= T.plan.confirmClick && t < b.readyAt,
    composerPlaceholder: t >= b.readyAt ? "Describe a change…" : "Ask for changes to the plan…",
    building,
    step: builtCount === 0 ? "Designing the theme, data and shared components" : `Built ${builtCount} of ${N} screens`,
    phones: Array.from({ length: N }, (_, i) => ramp(t, b.phonesStart + i * b.phoneGap, 0.23)),
    readyIn: ramp(t, b.readyAt, 0.3),
    version: t >= b.readyAt ? (t >= e.clickAway + 0.1 ? 2 : 1) : null,
    edit: {
      phase,
      text: typed(t, EDIT_NEW, e.typeStart, e.cps),
      caretOn: t < typingEnds || blink,
    },
    menuIn: t < l.itemClick + 0.05 ? ramp(t, l.menuClick + 0.03, 0.12) : 1 - ramp(t, l.itemClick + 0.05, 0.1, inn),
    menuHover: t >= l.itemClick - 0.15,
    toastIn: ramp(t, e.clickAway + 0.12, 0.25) * (1 - ramp(t, e.clickAway + 4.1, 0.2, inn)),
  };
}

/** The finished app before the edit: what the hook shows. */
export const HOOK_STATE_T = 20.0;

export const dialogIn = (t: number) => ramp(t, T.listing.itemClick + 0.1, 0.2);
export const shotsBusy = (t: number) =>
  t >= T.listing.shotsClick && t < T.listing.shotsStart + 4 * T.listing.shotGap + 0.25;
export const shots = (t: number) =>
  Array.from({ length: 5 }, (_, i) => ramp(t, T.listing.shotsStart + i * T.listing.shotGap, 0.22));
