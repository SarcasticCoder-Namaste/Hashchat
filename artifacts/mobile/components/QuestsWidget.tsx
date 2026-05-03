import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/useColors";
import { useGetMyQuests } from "@workspace/api-client-react";

export function QuestsWidget() {
  const colors = useColors();
  const { data, isLoading } = useGetMyQuests();
  if (isLoading || !data) return null;
  const completed = data.quests.filter((q) => q.completed).length;
  return (
    <LinearGradient
      colors={["rgba(124, 58, 237, 0.12)", "rgba(219, 39, 119, 0.12)"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[
        styles.wrap,
        { borderColor: colors.border, backgroundColor: colors.card },
      ]}
    >
      <View style={styles.header}>
        <LinearGradient
          colors={["#7c3aed", "#db2777"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.iconBadge}
        >
          <Feather name="award" size={14} color="#fff" />
        </LinearGradient>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.foreground }]}>
            Daily quests
          </Text>
          <Text style={[styles.sub, { color: colors.mutedForeground }]}>
            {completed} of {data.quests.length} done today
          </Text>
        </View>
      </View>
      <View style={{ gap: 8 }}>
        {data.quests.map((q) => {
          const pct = Math.min(100, Math.round((q.progress / q.target) * 100));
          return (
            <View
              key={q.code}
              style={[
                styles.quest,
                {
                  borderColor: colors.border,
                  backgroundColor: colors.background,
                  opacity: q.completed ? 0.85 : 1,
                },
              ]}
            >
              <View style={styles.row}>
                <View
                  style={[
                    styles.bullet,
                    {
                      backgroundColor: q.completed ? "#10b981" : colors.muted,
                    },
                  ]}
                >
                  {q.completed ? (
                    <Feather name="check" size={11} color="#fff" />
                  ) : (
                    <Text style={styles.bulletNum}>{q.progress}</Text>
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={[
                      styles.qTitle,
                      {
                        color: q.completed
                          ? colors.mutedForeground
                          : colors.foreground,
                        textDecorationLine: q.completed
                          ? "line-through"
                          : "none",
                      },
                    ]}
                  >
                    {q.title}
                  </Text>
                  <Text
                    style={[styles.qDesc, { color: colors.mutedForeground }]}
                  >
                    {q.description}
                  </Text>
                </View>
                <Text
                  style={[styles.qCount, { color: colors.mutedForeground }]}
                >
                  {q.progress}/{q.target}
                </Text>
              </View>
              <View
                style={[styles.barTrack, { backgroundColor: colors.muted }]}
              >
                <LinearGradient
                  colors={
                    q.completed
                      ? ["#10b981", "#10b981"]
                      : ["#7c3aed", "#db2777"]
                  }
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={[styles.barFill, { width: `${pct}%` }]}
                />
              </View>
            </View>
          );
        })}
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    gap: 12,
  },
  header: { flexDirection: "row", alignItems: "center", gap: 10 },
  iconBadge: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontFamily: "Inter_600SemiBold", fontSize: 14 },
  sub: { fontFamily: "Inter_400Regular", fontSize: 11, marginTop: 1 },
  quest: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 10,
    gap: 6,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  bullet: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  bulletNum: { color: "#fff", fontSize: 10, fontFamily: "Inter_700Bold" },
  qTitle: { fontFamily: "Inter_600SemiBold", fontSize: 12 },
  qDesc: { fontFamily: "Inter_400Regular", fontSize: 10, marginTop: 1 },
  qCount: { fontFamily: "Inter_500Medium", fontSize: 10 },
  barTrack: { height: 4, borderRadius: 999, overflow: "hidden" },
  barFill: { height: "100%", borderRadius: 999 },
});
