// react-native-web extends host components with `dataSet` (rendered as data-* attributes),
// which the preview uses to tag elements with their source location.
import "react-native";

declare module "react-native" {
  interface ViewProps {
    dataSet?: Record<string, string>;
  }
  interface TextProps {
    dataSet?: Record<string, string>;
  }
}
