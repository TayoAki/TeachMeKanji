/**
 * React Native's accessibilityState on the web. react-native-web reads only aria-* props
 * (accessibilityState was dropped in 0.19), so a generated app's radio, checkbox, tab or chip
 * lost its checked or selected state in the preview: screen readers and the AI tester couldn't
 * tell which option was chosen, though phones announce it. Every element generated code renders
 * goes through this JSX runtime, which adds the matching aria-* props. accessibilityState itself
 * stays, so an app's own components still receive it.
 */
import * as JSXRuntime from "react/jsx-runtime";

const ARIA = {
  checked: "aria-checked",
  selected: "aria-selected",
  disabled: "aria-disabled",
  expanded: "aria-expanded",
  busy: "aria-busy",
} as const;

/** The props with aria-* added from accessibilityState (aria-* given directly win). */
export function withAriaState<P>(props: P): P {
  const given = props as Record<string, unknown> | null | undefined;
  const state = given?.accessibilityState as Record<string, unknown> | undefined;
  if (!given || !state || typeof state !== "object") return props;
  let next: Record<string, unknown> | null = null;
  for (const [key, attr] of Object.entries(ARIA)) {
    const value = state[key];
    if (value === undefined || value === null || given[attr] !== undefined) continue;
    next ??= { ...given };
    next[attr] = value;
  }
  return (next ?? props) as P;
}

type Jsx = typeof JSXRuntime.jsx;

export const jsxRuntime = {
  ...JSXRuntime,
  jsx: ((type, props, key) => JSXRuntime.jsx(type, withAriaState(props), key)) as Jsx,
  jsxs: ((type, props, key) => JSXRuntime.jsxs(type, withAriaState(props), key)) as Jsx,
};
