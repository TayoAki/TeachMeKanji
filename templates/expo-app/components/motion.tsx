// TEMPLATE FILE — owned by the platform, never written by the model.
// Motion: small, tuned pieces so every screen moves the same way. Content rises in (<Appear>,
// <Stagger>), presses give feedback (<PressScale>), numbers count up (<CountUp>), bars grow
// (<GrowBar>) and one hero picture may float (<Float>). They respect the phone's Reduce Motion
// setting, and show their final state at once in still renders (the builder's canvas and
// screenshots), so a captured screen is never caught half-faded.
import { Children, useEffect, useRef, useState, type ReactNode } from "react";
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Pressable,
  View,
  type PressableProps,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { useTheme } from "../theme/ThemeProvider";

const EASE_OUT = Easing.out(Easing.cubic);

/** True in the builder's still renders (canvas frames, screenshots). */
function stillRender(): boolean {
  return (globalThis as { __appbuilderStill?: boolean }).__appbuilderStill === true;
}

/** True when motion should be skipped: Reduce Motion is on, or this is a still render. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(stillRender);
  useEffect(() => {
    if (stillRender()) return;
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled?.()
      .then((value) => alive && setReduced(Boolean(value)))
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener?.("reduceMotionChanged", (value: boolean) =>
      setReduced(value),
    );
    return () => {
      alive = false;
      sub?.remove?.();
    };
  }, []);
  return reduced;
}

/** Fades content in and lifts it into place when it first appears. */
export function Appear({
  children,
  delay = 0,
  distance = 14,
  duration = 420,
  style,
}: {
  children: ReactNode;
  /** Wait this long (ms) before starting. */
  delay?: number;
  /** How far below its place it starts (pt). */
  distance?: number;
  duration?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const reduced = useReducedMotion();
  const progress = useRef(new Animated.Value(reduced ? 1 : 0)).current;
  useEffect(() => {
    if (reduced) {
      progress.setValue(1);
      return;
    }
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration,
      delay,
      easing: EASE_OUT,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [reduced, delay, duration, progress]);
  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [distance, 0] });
  return (
    <Animated.View style={[style, { opacity: progress, transform: [{ translateY }] }]}>
      {children}
    </Animated.View>
  );
}

/** Each child appears a moment after the one before it (a list, a column of cards). */
export function Stagger({
  children,
  step = 60,
  delay = 0,
  style,
}: {
  children: ReactNode;
  /** Time between children (ms); the first ten are staggered, the rest arrive with the tenth. */
  step?: number;
  delay?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const items = Children.toArray(children);
  return (
    <View style={style}>
      {items.map((child, index) => (
        <Appear key={index} delay={delay + Math.min(index, 9) * step}>
          {child}
        </Appear>
      ))}
    </View>
  );
}

/** A Pressable that springs down a little while pressed: for cards, rows and buttons. */
export function PressScale({
  children,
  style,
  scaleTo = 0.97,
  onPressIn,
  onPressOut,
  ...props
}: Omit<PressableProps, "style" | "children"> & {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** The size while pressed (0.97 for cards, 0.94 for small buttons). */
  scaleTo?: number;
}) {
  const reduced = useReducedMotion();
  const scale = useRef(new Animated.Value(1)).current;
  const springTo = (value: number) =>
    Animated.spring(scale, {
      toValue: value,
      useNativeDriver: true,
      speed: 40,
      bounciness: 6,
    }).start();
  return (
    <Pressable
      {...props}
      onPressIn={(event) => {
        if (!reduced) springTo(scaleTo);
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        if (!reduced) springTo(1);
        onPressOut?.(event);
      }}
    >
      <Animated.View style={[style, { transform: [{ scale }] }]}>{children}</Animated.View>
    </Pressable>
  );
}

/** A number that counts up to its value (and eases to new values when it changes). */
export function CountUp({
  value,
  duration = 900,
  delay = 0,
  format = (n: number) => String(Math.round(n)),
  style,
}: {
  value: number;
  duration?: number;
  delay?: number;
  format?: (n: number) => string;
  style?: StyleProp<TextStyle>;
}) {
  const reduced = useReducedMotion();
  const animated = useRef(new Animated.Value(reduced ? value : 0)).current;
  const [shown, setShown] = useState(reduced ? value : 0);
  useEffect(() => {
    if (reduced) {
      animated.setValue(value);
      setShown(value);
      return;
    }
    const id = animated.addListener(({ value: v }) => setShown(v));
    const animation = Animated.timing(animated, {
      toValue: value,
      duration,
      delay,
      easing: EASE_OUT,
      useNativeDriver: false,
    });
    animation.start();
    return () => {
      animation.stop();
      animated.removeListener(id);
    };
  }, [value, reduced, duration, delay, animated]);
  return (
    <Animated.Text style={[{ fontVariant: ["tabular-nums"] }, style]}>
      {format(shown)}
    </Animated.Text>
  );
}

/** A progress bar whose fill grows to `progress` (0 to 1). */
export function GrowBar({
  progress,
  height = 8,
  color,
  trackColor,
  delay = 0,
  duration = 700,
  style,
}: {
  progress: number;
  height?: number;
  /** Defaults to the theme's primary color; pass another theme color to change it. */
  color?: string;
  trackColor?: string;
  delay?: number;
  duration?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  const reduced = useReducedMotion();
  const target = Math.max(0, Math.min(1, progress));
  const fill = useRef(new Animated.Value(reduced ? target : 0)).current;
  useEffect(() => {
    if (reduced) {
      fill.setValue(target);
      return;
    }
    const animation = Animated.timing(fill, {
      toValue: target,
      duration,
      delay,
      easing: EASE_OUT,
      useNativeDriver: false,
    });
    animation.start();
    return () => animation.stop();
  }, [target, reduced, delay, duration, fill]);
  const width = fill.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] });
  return (
    <View
      style={[
        {
          height,
          borderRadius: height / 2,
          backgroundColor: trackColor ?? theme.colors.surfaceAlt,
          overflow: "hidden",
        },
        style,
      ]}
    >
      <Animated.View
        style={{
          width,
          height: "100%",
          borderRadius: height / 2,
          backgroundColor: color ?? theme.colors.primary,
        }}
      />
    </View>
  );
}

/** A slow, gentle bob for one hero picture or mascot. Use at most one per screen. */
export function Float({
  children,
  amplitude = 5,
  duration = 2800,
  style,
}: {
  children: ReactNode;
  /** How far it drifts up and down (pt). */
  amplitude?: number;
  /** One full up-and-down cycle (ms). */
  duration?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const reduced = useReducedMotion();
  const phase = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduced) {
      phase.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(phase, {
          toValue: 1,
          duration: duration / 2,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(phase, {
          toValue: 0,
          duration: duration / 2,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [reduced, duration, phase]);
  const translateY = phase.interpolate({ inputRange: [0, 1], outputRange: [0, -amplitude] });
  return <Animated.View style={[style, { transform: [{ translateY }] }]}>{children}</Animated.View>;
}
