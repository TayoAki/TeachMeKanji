/**
 * lottie-react-native on web: lottie-web draws the same animation JSON as SVG, so the platform's
 * themed animations (template components/lottie.tsx) play in the preview as on a phone. Still
 * renders and `progress` show one frame (the finished animation at progress 1).
 */
import { createElement, useEffect, useRef } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";

interface LottieProps {
  source: object | { uri: string };
  autoPlay?: boolean;
  loop?: boolean;
  /** 0 to 1: show this point of the animation instead of playing it. */
  progress?: number;
  speed?: number;
  style?: StyleProp<ViewStyle>;
  onAnimationFinish?: (isCancelled: boolean) => void;
}

interface Player {
  totalFrames: number;
  play(): void;
  goToAndStop(frame: number, isFrame: boolean): void;
  setSpeed(speed: number): void;
  addEventListener(name: string, handler: () => void): void;
  destroy(): void;
}

export default function LottieView({
  source,
  autoPlay = false,
  loop = false,
  progress,
  speed = 1,
  style,
  onAnimationFinish,
}: LottieProps) {
  const host = useRef<HTMLDivElement | null>(null);
  const finish = useRef(onAnimationFinish);
  useEffect(() => {
    finish.current = onAnimationFinish;
  });

  useEffect(() => {
    const container = host.current;
    if (!container) return;
    let player: Player | null = null;
    let gone = false;
    void import("lottie-web/build/player/lottie_light").then((module) => {
      if (gone) return;
      const lottie = (module.default ?? module) as unknown as {
        loadAnimation(options: Record<string, unknown>): Player;
      };
      const still = (globalThis as { __appbuilderStill?: boolean }).__appbuilderStill === true;
      const uri = (source as { uri?: unknown }).uri;
      player = lottie.loadAnimation({
        container,
        renderer: "svg",
        loop: loop && !still,
        autoplay: false,
        // lottie-web changes the data it's given: hand it a copy.
        ...(typeof uri === "string"
          ? { path: uri }
          : { animationData: JSON.parse(JSON.stringify(source)) }),
      });
      player.setSpeed(speed);
      player.addEventListener("DOMLoaded", () => {
        if (!player) return;
        if (still || progress !== undefined) {
          const at = progress ?? 1;
          player.goToAndStop(Math.round(at * Math.max(0, player.totalFrames - 1)), true);
        } else if (autoPlay) player.play();
      });
      player.addEventListener("complete", () => finish.current?.(false));
    });
    return () => {
      gone = true;
      player?.destroy();
    };
  }, [source, autoPlay, loop, progress, speed]);

  return (
    <View style={style}>
      {createElement("div", { ref: host, style: { width: "100%", height: "100%" } })}
    </View>
  );
}
