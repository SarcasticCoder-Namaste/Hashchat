import { Feather } from "@expo/vector-icons";
import type { ComponentProps } from "react";
import { StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/useColors";

interface Props {
  icon?: ComponentProps<typeof Feather>["name"];
  title: string;
  subtitle?: string;
}

export function EmptyState({ icon = "inbox", title, subtitle }: Props) {
  const colors = useColors();
  return (
    <View style={styles.wrap}>
      <Feather name={icon} size={40} color={colors.mutedForeground} />
      <Text style={[styles.title, { color: colors.foreground }]}>{title}</Text>
      {subtitle ? (
        <Text style={[styles.sub, { color: colors.mutedForeground }]}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    gap: 8,
  },
  title: { fontSize: 17, fontFamily: "Inter_600SemiBold", marginTop: 8 },
  sub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
});
