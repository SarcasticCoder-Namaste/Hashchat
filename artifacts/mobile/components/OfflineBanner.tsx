import { Feather } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/useColors";
import { useOnline } from "@/hooks/useOnline";

export function OfflineBanner({ message }: { message?: string }) {
  const colors = useColors();
  const online = useOnline();
  if (online) return null;
  return (
    <View
      style={[
        styles.wrap,
        { backgroundColor: colors.muted, borderBottomColor: colors.border },
      ]}
      accessibilityRole="alert"
    >
      <Feather name="wifi-off" size={12} color={colors.mutedForeground} />
      <Text style={[styles.text, { color: colors.mutedForeground }]}>
        {message ?? "Offline · showing saved content"}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  text: { fontSize: 12, fontFamily: "Inter_500Medium" },
});
