import { Composition } from "remotion";
import { normalizePromoColors, PROMO_FORMATS, promoTimeline } from "@appbuilder/contract/protocol";
import { AppPromo, type AppPromoProps } from "./AppPromo";

const SAMPLE: AppPromoProps = {
  format: "vertical",
  storyboard: {
    hook: "Learn 10 kanji a day",
    beats: [
      { screen: "app/(tabs)/index.tsx", caption: "A short lesson every morning", focus: "top" },
      {
        screen: "app/(tabs)/review.tsx",
        caption: "Reviews that come back on time",
        focus: "middle",
      },
      { screen: "app/(tabs)/progress.tsx", caption: "Watch your streak grow", focus: "top" },
    ],
    tagline: "Kanji, one calm minute at a time",
    cta: "Coming soon to iPhone",
  },
  shots: [],
  colors: normalizePromoColors({}),
  appName: "Kanji Dojo",
  music: null,
};

/** One composition; its size, frame rate and length come from the props (the format and story). */
export function Root() {
  return (
    <Composition
      id="AppPromo"
      component={AppPromo}
      defaultProps={SAMPLE}
      width={1080}
      height={1920}
      fps={30}
      durationInFrames={600}
      calculateMetadata={({ props }) => {
        const format = PROMO_FORMATS[props.format];
        return {
          width: format.width,
          height: format.height,
          fps: format.fps,
          durationInFrames: Math.ceil(promoTimeline(props.storyboard).duration * format.fps),
        };
      }}
    />
  );
}
