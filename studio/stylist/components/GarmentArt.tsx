// A flat-lay drawing of a piece of clothing in its own colors, for pieces without a photo.
import { useId } from "react";
import Svg, { ClipPath, Defs, G, Path, Rect } from "react-native-svg";
import type { Category } from "../data/schema";
import { fabricLine, swatches } from "../theme/tokens";

const SHAPES: Record<Category, { body: string; lines: string[] }> = {
  top: {
    body: "M31 16 L43 11 Q50 17 57 11 L69 16 L87 31 L78 42 L70 35 L70 89 L30 89 L30 35 L22 42 L13 31 Z",
    lines: ["M43 11 Q50 21 57 11", "M30 35 L30 44", "M70 35 L70 44"],
  },
  bottom: {
    body: "M29 9 L71 9 L76 91 L56 91 L50 36 L44 91 L24 91 Z",
    lines: ["M29 16 L71 16", "M50 16 L50 36", "M36 16 Q38 24 33 28"],
  },
  dress: {
    body: "M39 9 L46 9 Q50 15 54 9 L61 9 L63 30 L57 38 L79 91 L21 91 L43 38 L37 30 Z",
    lines: ["M46 9 Q50 18 54 9", "M43 38 L57 38"],
  },
  outerwear: {
    body: "M33 11 L44 8 L50 26 L56 8 L67 11 L86 25 L85 80 L75 80 L73 42 L73 92 L27 92 L27 42 L25 80 L15 80 L14 25 Z",
    lines: ["M44 8 L50 40 L56 8", "M50 40 L50 92", "M27 42 L27 52", "M73 42 L73 52"],
  },
  shoes: {
    body: "M9 63 Q11 49 25 47 L43 45 Q51 35 62 39 L75 53 Q90 56 92 67 L92 75 L9 75 Z",
    lines: ["M9 69 L92 69", "M45 47 L52 55", "M52 44 L59 52"],
  },
  accessory: {
    body: "M23 41 L77 41 L83 89 L17 89 Z",
    lines: ["M36 41 Q36 19 50 19 Q64 19 64 41", "M23 52 L77 52"],
  },
};

function lightness(hex: string): number {
  const n = parseInt(hex.replace("#", ""), 16);
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
}

/** Shapes for kinds of accessory and shoe that don't read as the default bag and sneaker. */
const VARIANTS: [Category, RegExp, { body: string; lines: string[] }][] = [
  [
    "accessory",
    /scarf|shawl|stole/i,
    {
      body: "M30 14 L70 14 L70 30 Q70 38 62 40 L62 90 L48 90 L48 46 L40 46 L40 72 L28 72 L28 40 Q30 38 30 30 Z",
      lines: ["M30 30 L70 30", "M48 84 L62 84", "M28 66 L40 66"],
    },
  ],
  [
    "accessory",
    /cap|hat|beanie|beret/i,
    {
      body: "M18 62 Q18 30 50 28 Q82 30 82 62 L92 70 L18 70 Z",
      lines: ["M50 28 L50 62", "M18 62 L82 62"],
    },
  ],
  [
    "accessory",
    /belt/i,
    {
      body: "M8 44 L92 44 L92 56 L8 56 Z",
      lines: ["M60 40 L74 40 L74 60 L60 60 Z", "M67 44 L67 56"],
    },
  ],
  [
    "shoes",
    /boot/i,
    {
      body: "M28 20 L52 20 L54 52 Q72 54 84 62 Q90 66 90 74 L90 80 L22 80 L24 52 Z",
      lines: ["M22 74 L90 74", "M28 30 L52 30"],
    },
  ],
  [
    "shoes",
    /heel|pump|stiletto/i,
    {
      body: "M14 70 Q20 44 40 46 Q58 50 80 64 L90 66 L90 72 L58 72 Q50 72 44 66 L30 74 L30 84 L24 84 L24 72 Z",
      lines: ["M40 46 Q46 56 58 60"],
    },
  ],
];

export function GarmentArt({
  category,
  colors,
  name = "",
  size = 72,
}: {
  category: Category;
  colors: string[];
  /** The piece's name, to draw a scarf, cap, belt, boot or heel in their own shapes. */
  name?: string;
  size?: number;
}) {
  const clipId = `g${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const shape =
    VARIANTS.find(([c, pattern]) => c === category && pattern.test(name))?.[2] ?? SHAPES[category];
  const main = swatches[colors[0] ?? "print"] ?? swatches.print!;
  const second = colors[1] ? swatches[colors[1]] : undefined;
  const line = lightness(main) > 0.55 ? fabricLine.onLight : fabricLine.onDark;
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Defs>
        <ClipPath id={clipId}>
          <Path d={shape.body} />
        </ClipPath>
      </Defs>
      <Path d={shape.body} fill={main} />
      {second ? (
        // A second color reads as stripes across the piece.
        <G clipPath={`url(#${clipId})`}>
          {[20, 34, 48, 62, 76].map((y) => (
            <Rect key={y} x={0} y={y} width={100} height={6} fill={second} />
          ))}
        </G>
      ) : null}
      <Path d={shape.body} fill="none" stroke={line} strokeWidth={1.6} strokeLinejoin="round" />
      {shape.lines.map((d) => (
        <Path
          key={d}
          d={d}
          fill="none"
          stroke={line}
          strokeWidth={1.6}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </Svg>
  );
}
