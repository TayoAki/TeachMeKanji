import { Image as RNImage, type ImageProps as RNImageProps } from "react-native";

type Source = string | number | { uri: string } | Array<{ uri: string }>;

const FIT: Record<string, RNImageProps["resizeMode"]> = {
  cover: "cover",
  contain: "contain",
  fill: "stretch",
  none: "center",
  "scale-down": "contain",
};

export function Image({
  source,
  contentFit = "cover",
  ...rest
}: Omit<RNImageProps, "source"> & { source?: Source; contentFit?: string; transition?: number }) {
  const normalized =
    typeof source === "string" ? { uri: source } : Array.isArray(source) ? source[0] : source;
  delete (rest as Record<string, unknown>).transition;
  return (
    <RNImage
      {...rest}
      source={normalized as RNImageProps["source"]}
      resizeMode={FIT[contentFit] ?? "cover"}
    />
  );
}
