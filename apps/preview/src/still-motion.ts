/**
 * Still renders (the preview's "screen" mode: canvas frames, screenshots, the match check) must
 * show every screen in its final state, including motion the app writes itself with Animated.
 * While the still flag is set, timings and springs finish at once and loops don't run; in the
 * live app mode everything animates as written. (The motion kit also reads the flag itself.)
 */
import { Animated } from "react-native";

type Composite = Animated.CompositeAnimation;

export function stillRender(): boolean {
  return (globalThis as { __appbuilderStill?: boolean }).__appbuilderStill === true;
}

let installed = false;

/** Patch Animated once; each call checks the flag, so one runtime serves both modes. */
export function installStillMotion(): void {
  if (installed) return;
  installed = true;
  const anim = Animated as unknown as Record<string, unknown>;
  const timing = Animated.timing;
  const spring = Animated.spring;
  const decay = Animated.decay;
  const loop = Animated.loop;
  const delay = Animated.delay;
  const instant = (value: Animated.Value | Animated.ValueXY, toValue: unknown, native?: boolean) =>
    timing(value as Animated.Value, {
      toValue: toValue as number,
      duration: 0,
      delay: 0,
      useNativeDriver: native ?? false,
    });
  anim.timing = (value: Animated.Value, config: Animated.TimingAnimationConfig): Composite =>
    stillRender() ? instant(value, config.toValue, config.useNativeDriver) : timing(value, config);
  anim.spring = (value: Animated.Value, config: Animated.SpringAnimationConfig): Composite =>
    stillRender() ? instant(value, config.toValue, config.useNativeDriver) : spring(value, config);
  anim.decay = (value: Animated.Value, config: Animated.DecayAnimationConfig): Composite =>
    stillRender()
      ? { start: (cb) => cb?.({ finished: true }), stop: () => {}, reset: () => {} }
      : decay(value, config);
  anim.loop = (animation: Composite, config?: Parameters<typeof Animated.loop>[1]): Composite =>
    stillRender()
      ? { start: (cb) => cb?.({ finished: true }), stop: () => {}, reset: () => {} }
      : loop(animation, config);
  anim.delay = (ms: number): Composite => delay(stillRender() ? 0 : ms);
}
