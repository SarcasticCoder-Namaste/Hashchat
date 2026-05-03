import { Feather } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/useColors";
import { useGetMyStreak } from "@workspace/api-client-react";

export function StreakBadge() {
  const colors = useColors();
  const { data } = useGetMyStreak();
  if (!data) return null;
  const count = data.currentStreak;
  const hot = count >= 7;
  const bg = count <= 0
    ? colors.muted
    : hot
      ? "rgba(249, 115, 22, 0.18)"
      : "rgba(245, 158, 11, 0.18)";
  const fg = count <= 0
    ? colors.mutedForeground
    : hot
      ? "#f97316"
      : "#d97706";
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      <Feather name="zap" size={11} color={fg} />
      <Text style={[styles.txt, { color: fg }]}>{count}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  txt: { fontFamily: "Inter_600SemiBold", fontSize: 12 },
});
