import React from "react";
import { Audio, Sequence, staticFile, useVideoConfig } from "remotion";
import { FIT_CLIPS, FIT_MUSIC_OFFSET, FIT_SPEECH } from "./fit";
import { MUSIC_OFFSET, musicDb } from "./vo";

/** Narration at unity (pre-normalized) and the music bed, ducked under it. */
export function Soundtrack() {
  const { fps } = useVideoConfig();
  return (
    <>
      <Audio src={staticFile("audio/vo_master.wav")} volume={1} />
      <Audio
        src={staticFile("audio/music.mp3")}
        trimBefore={Math.round(MUSIC_OFFSET * fps)}
        volume={(f) => Math.pow(10, musicDb(f / fps) / 20)}
      />
    </>
  );
}


/**
 * The fit cut (and the 16:9 master with sound): narration phrases re-placed on the master's beats,
 * music ducked under them. "lift": the Final Lift cue edited on its own grid (scripts/lift_cue.py)
 * plus the synthesized SFX stem; "launchpad": the first version (Launchpad, offset 84.73 s).
 */
export function FitSoundtrack({ music = "lift" }: { music?: "lift" | "launchpad" }) {
  const { fps } = useVideoConfig();
  const duck = (f: number) => Math.pow(10, musicDb(f / fps, FIT_SPEECH) / 20);
  return (
    <>
      {FIT_CLIPS.map((c, i) => {
        const from = Math.round(c.start * fps);
        const a = Math.round(c.src[0] * fps);
        const b = Math.round(c.src[1] * fps);
        return (
          <Sequence key={i} from={from} durationInFrames={b - a} layout="none">
            <Audio src={staticFile("audio/vo_master.wav")} trimBefore={a} trimAfter={b} volume={1} />
          </Sequence>
        );
      })}
      {music === "launchpad" ? (
        <Audio src={staticFile("audio/music.mp3")} trimBefore={Math.round(FIT_MUSIC_OFFSET * fps)} volume={duck} />
      ) : (
        <>
          <Audio src={staticFile("audio/lift-cue.wav")} volume={duck} />
          <Audio src={staticFile("audio/fit-sfx.wav")} volume={1} />
        </>
      )}
    </>
  );
}
