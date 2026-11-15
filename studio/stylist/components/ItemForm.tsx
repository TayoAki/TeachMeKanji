// The fields of a closet piece, for adding one and for editing it.
import { Text, TextInput, View } from "react-native";
import {
  CATEGORIES,
  COLORS,
  FORMALITY_LABELS,
  WARMTH_LABELS,
  type Category,
  type Formality,
  type Warmth,
} from "../data/schema";
import { useTheme } from "../theme/ThemeProvider";
import { swatches } from "../theme/tokens";
import { Chip, Eyebrow } from "./ui";

export interface ItemFields {
  name: string;
  category: Category;
  colors: string[];
  warmth: Warmth;
  formality: Formality;
}

export function ItemForm({
  value,
  onChange,
}: {
  value: ItemFields;
  onChange: (next: ItemFields) => void;
}) {
  const theme = useTheme();
  const set = (patch: Partial<ItemFields>) => onChange({ ...value, ...patch });
  const toggleColor = (id: string) => {
    if (value.colors.includes(id)) set({ colors: value.colors.filter((c) => c !== id) });
    else set({ colors: [...value.colors, id].slice(-2) });
  };
  return (
    <View style={{ gap: theme.spacing.lg }}>
      <View style={{ gap: theme.spacing.sm }}>
        <Eyebrow>Name</Eyebrow>
        <TextInput
          value={value.name}
          onChangeText={(name) => set({ name })}
          placeholder="e.g. Navy merino crewneck"
          placeholderTextColor={theme.colors.textMuted}
          accessibilityLabel="Name"
          maxLength={40}
          style={{
            minHeight: 50,
            borderRadius: theme.radius.md,
            borderWidth: 1,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.surface,
            paddingHorizontal: theme.spacing.md,
            fontSize: theme.font.size.body,
            color: theme.colors.text,
          }}
        />
      </View>
      <View style={{ gap: theme.spacing.sm }}>
        <Eyebrow>Type</Eyebrow>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm }}>
          {CATEGORIES.map((c) => (
            <Chip
              key={c.id}
              role="radio"
              label={c.label}
              selected={value.category === c.id}
              onPress={() => set({ category: c.id })}
            />
          ))}
        </View>
      </View>
      <View style={{ gap: theme.spacing.sm }}>
        <Eyebrow>Colors (up to two)</Eyebrow>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm }}>
          {COLORS.map((c) => (
            <Chip
              key={c.id}
              label={c.label}
              swatch={swatches[c.id]}
              selected={value.colors.includes(c.id)}
              onPress={() => toggleColor(c.id)}
            />
          ))}
        </View>
      </View>
      <View style={{ gap: theme.spacing.sm }}>
        <Eyebrow>Weight</Eyebrow>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm }}>
          {([1, 2, 3] as Warmth[]).map((w) => (
            <Chip
              key={w}
              role="radio"
              label={WARMTH_LABELS[w]}
              selected={value.warmth === w}
              onPress={() => set({ warmth: w })}
            />
          ))}
        </View>
      </View>
      <View style={{ gap: theme.spacing.sm }}>
        <Eyebrow>Dress code</Eyebrow>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm }}>
          {([1, 2, 3] as Formality[]).map((f) => (
            <Chip
              key={f}
              role="radio"
              label={FORMALITY_LABELS[f]}
              selected={value.formality === f}
              onPress={() => set({ formality: f })}
            />
          ))}
        </View>
      </View>
      {!value.colors.length ? (
        <Text style={{ fontSize: theme.font.size.caption + 1, color: theme.colors.textMuted }}>
          Pick at least one color so outfits can match it.
        </Text>
      ) : null}
    </View>
  );
}
