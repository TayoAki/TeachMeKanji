/**
 * react-native-svg on web: the same component names drawn as DOM <svg> elements, so generated
 * apps can draw rings, ribbons, curves and charts in the preview exactly as on a phone. Props
 * keep their react-native-svg names (React DOM accepts camelCase SVG attributes); the few that
 * differ (G's x/y, rotation/origin, dash arrays, onPress) are translated here.
 */
import { createElement, forwardRef, type ReactNode, type Ref } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";

type Props = Record<string, unknown> & { children?: ReactNode };

const SKIP = new Set([
  "children",
  "style",
  "testID",
  "dataSet",
  "onPress",
  "rotation",
  "origin",
  "originX",
  "originY",
  "scale",
]);

function domProps(props: Props): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(props)) {
    if (SKIP.has(key) || value === undefined) continue;
    out[key] = Array.isArray(value) && key === "strokeDasharray" ? value.join(" ") : value;
  }
  // react-native-svg's rotation/origin/scale shorthands become an SVG transform.
  const parts: string[] = [];
  const origin =
    typeof props.origin === "string"
      ? props.origin.split(/[\s,]+/).map(Number)
      : [Number(props.originX ?? 0), Number(props.originY ?? 0)];
  if (typeof props.rotation === "number")
    parts.push(`rotate(${props.rotation} ${origin[0] ?? 0} ${origin[1] ?? 0})`);
  if (typeof props.scale === "number") parts.push(`scale(${props.scale})`);
  if (parts.length)
    out.transform = [typeof out.transform === "string" ? out.transform : "", ...parts]
      .filter(Boolean)
      .join(" ");
  if (typeof props.onPress === "function") {
    out.onClick = props.onPress;
    out.style = { cursor: "pointer" };
  }
  return out;
}

function shape(tag: string) {
  const Component = forwardRef(function SvgShape(props: Props, ref: Ref<Element>) {
    return createElement(tag, { ...domProps(props), ref }, props.children as ReactNode);
  });
  Component.displayName = tag;
  return Component;
}

export const Circle = shape("circle");
export const Ellipse = shape("ellipse");
export const Line = shape("line");
export const Path = shape("path");
export const Polygon = shape("polygon");
export const Polyline = shape("polyline");
export const Rect = shape("rect");
export const Defs = shape("defs");
export const LinearGradient = shape("linearGradient");
export const RadialGradient = shape("radialGradient");
export const Stop = shape("stop");
export const ClipPath = shape("clipPath");
export const Text = shape("text");
export const TSpan = shape("tspan");

/** A group; react-native-svg's x/y on G move it. */
export const G = forwardRef(function SvgGroup(props: Props, ref: Ref<Element>) {
  const { x, y, ...rest } = props;
  const translate =
    x !== undefined || y !== undefined ? `translate(${Number(x ?? 0)} ${Number(y ?? 0)})` : "";
  const base = domProps(rest);
  if (translate) base.transform = [translate, base.transform].filter(Boolean).join(" ");
  return createElement("g", { ...base, ref }, props.children as ReactNode);
});

/** The canvas: a View that takes the RN style, with the <svg> filling it. */
export const Svg = forwardRef(function SvgRoot(
  props: Props & {
    width?: number | string;
    height?: number | string;
    style?: StyleProp<ViewStyle>;
  },
  ref: Ref<Element>,
) {
  const { width, height, style, ...rest } = props;
  const size: { width?: ViewStyle["width"]; height?: ViewStyle["height"] } = {};
  if (width !== undefined) size.width = width as ViewStyle["width"];
  if (height !== undefined) size.height = height as ViewStyle["height"];
  return (
    <View style={[size, style]}>
      {createElement(
        "svg",
        {
          ...domProps(rest),
          ref,
          width: "100%",
          height: "100%",
          style: { display: "block", overflow: "visible" },
        },
        props.children as ReactNode,
      )}
    </View>
  );
});
