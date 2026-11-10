import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { loadFonts } from "./fonts";
import { Workspace } from "./ui/Workspace";
import { wsStateFor } from "./ProductFilm";

loadFonts();

/** The whole workspace at camera scale 1, state at film time = frame / fps (for calibration). */
export const DebugWorkspace: React.FC = () => {
  const t = useCurrentFrame() / useVideoConfig().fps;
  return (
    <AbsoluteFill>
      <Workspace s={{ ...wsStateFor(t), dim: 0 }} />
    </AbsoluteFill>
  );
};

import { StoreListingDialog } from "./ui/StoreListing";
import { ND } from "./ProductFilmVertical";
import { shots } from "./state";

/** The narrow (vertical) dialog at scale 1 with every screenshot made, for calibration. */
export const DebugDialogNarrow: React.FC = () => (
  <AbsoluteFill style={{ background: "#000" }}>
    <div style={{ position: "absolute", left: ND.x, top: ND.y }}>
      <StoreListingDialog width={ND.w} narrow busy={false} shots={shots(40)} t={0} />
    </div>
  </AbsoluteFill>
);
