import React from "react";
import { Composition } from "remotion";
import { ProductFilm } from "./hero/ProductFilm";
import { ProductFilmVertical } from "./hero/ProductFilmVertical";
import { ProductFilmVerticalV2 } from "./hero/ProductFilmVerticalV2";
import { MasterSoundtrack, ProductFilmVerticalFit } from "./hero/ProductFilmVerticalFit";
import { VDURATION } from "./hero/vo";
import { DURATION } from "./hero/script";
import { DebugDialogNarrow, DebugWorkspace } from "./hero/Debug";

export const Root: React.FC = () => (
  <>
    <Composition id="ProductFilm" component={ProductFilm} width={1920} height={1080} fps={60} durationInFrames={Math.round(DURATION * 60)} />
    <Composition id="ProductFilmAnimatic" component={ProductFilm} width={1920} height={1080} fps={30} durationInFrames={Math.round(DURATION * 30)} />
    <Composition id="ProductFilmVerticalV1" component={ProductFilmVertical} width={1080} height={1920} fps={30} durationInFrames={Math.round(DURATION * 30)} />
    <Composition id="ProductFilmVertical" component={ProductFilmVerticalV2} width={1080} height={1920} fps={30} durationInFrames={Math.round(VDURATION * 30)} />
    <Composition id="ProductFilmVerticalFit" component={ProductFilmVerticalFit} width={1080} height={1920} fps={30} durationInFrames={Math.round(DURATION * 30)} />
    <Composition id="ProductFilmVerticalFitLaunchpad" component={ProductFilmVerticalFit} defaultProps={{ music: "launchpad" as const }} width={1080} height={1920} fps={30} durationInFrames={Math.round(DURATION * 30)} />
    <Composition id="MasterSoundtrack" component={MasterSoundtrack} width={1920} height={1080} fps={60} durationInFrames={Math.round(DURATION * 60)} />
    <Composition id="DebugWorkspace" component={DebugWorkspace} width={1920} height={1080} fps={30} durationInFrames={Math.round(DURATION * 30)} />
    <Composition id="DebugDialogNarrow" component={DebugDialogNarrow} width={1080} height={2200} fps={30} durationInFrames={30} />
  </>
);
