import { Feather } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";
import {
  getListMyReportsQueryKey,
  useAppealReport,
  useListMyReports,
} from "@workspace/api-client-react";

const STATUS_LABEL: Record<string, string> = {
  open: "Under review",
  resolved: "Action taken",
  dismissed: "No action taken",
};

function statusTone(status: string): { bg: string; fg: string } {
  switch (status) {
    case "resolved":
      return { bg: "rgba(16,185,129,0.15)", fg: "#10b981" };
    case "open":
      return { bg: "rgba(14,165,233,0.15)", fg: "#0ea5e9" };
    default:
      return { bg: "rgba(113,113,122,0.18)", fg: "#71717a" };
  }
}

export default function ReportsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();

  const list = useListMyReports({
    query: {
      queryKey: getListMyReportsQueryKey(),
      refetchInterval: 30_000,
    },
  });

  const [appealId, setAppealId] = useState<number | null>(null);
  const [reason, setReason] = useState("");

  const appeal = useAppealReport({
    mutation: {
      onSuccess: () => {
        setAppealId(null);
        setReason("");
        qc.invalidateQueries({ queryKey: getListMyReportsQueryKey() });
        Alert.alert("Appeal submitted");
      },
      onError: () => Alert.alert("Couldn't file appeal"),
    },
  });

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{
        padding: 16,
        paddingBottom: insets.bottom + 32,
        gap: 12,
      }}
    >
      <Stack.Screen options={{ title: "My reports" }} />

      {list.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (list.data?.length ?? 0) === 0 ? (
        <View
          style={[
            styles.empty,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
          testID="my-reports-empty"
        >
          <Feather name="flag" size={20} color={colors.mutedForeground} />
          <Text style={{ color: colors.mutedForeground, fontSize: 14 }}>
            You haven't filed any reports.
          </Text>
        </View>
      ) : (
        <View style={{ gap: 10 }} testID="my-reports-list">
          {list.data!.map((r) => {
            const tone = statusTone(r.status);
            return (
              <View
                key={r.id}
                style={[
                  styles.card,
                  { backgroundColor: colors.card, borderColor: colors.border },
                ]}
                testID={`my-report-${r.id}`}
              >
                <View style={styles.headerRow}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text
                      style={{ color: colors.mutedForeground, fontSize: 11 }}
                    >
                      {new Date(r.createdAt).toLocaleString()} · {r.scopeType} ·{" "}
                      {r.targetType} #{r.targetId}
                    </Text>
                    <Text
                      style={[
                        styles.reasonText,
                        { color: colors.foreground },
                      ]}
                    >
                      {r.reason}
                    </Text>
                    {r.resolution ? (
                      <Text
                        style={{
                          color: colors.mutedForeground,
                          fontSize: 11,
                          marginTop: 4,
                        }}
                      >
                        Moderator note: {r.resolution}
                      </Text>
                    ) : null}
                  </View>
                  <View
                    style={[styles.statusBadge, { backgroundColor: tone.bg }]}
                    testID={`my-report-status-${r.id}`}
                  >
                    <Text
                      style={[styles.statusBadgeText, { color: tone.fg }]}
                    >
                      {STATUS_LABEL[r.status] ?? r.status}
                    </Text>
                  </View>
                </View>

                {r.appeal ? (
                  <View
                    style={[
                      styles.appealBox,
                      {
                        backgroundColor: colors.background,
                        borderColor: colors.border,
                      },
                    ]}
                    testID={`my-report-appeal-${r.id}`}
                  >
                    <Text
                      style={[styles.appealLabel, { color: colors.foreground }]}
                    >
                      Appeal:{" "}
                      <Text style={{ color: colors.mutedForeground }}>
                        {r.appeal.status === "open"
                          ? "Awaiting admin review"
                          : `Decided: ${r.appeal.decision ?? "—"}`}
                      </Text>
                    </Text>
                    <Text
                      style={{ color: colors.mutedForeground, fontSize: 12 }}
                    >
                      {r.appeal.reason}
                    </Text>
                    {r.appeal.decisionNote ? (
                      <Text
                        style={{ color: colors.mutedForeground, fontSize: 12 }}
                      >
                        Admin note: {r.appeal.decisionNote}
                      </Text>
                    ) : null}
                  </View>
                ) : null}

                {r.canAppeal && appealId !== r.id ? (
                  <Pressable
                    onPress={() => {
                      setAppealId(r.id);
                      setReason("");
                    }}
                    style={[styles.btnOutline, { borderColor: colors.border }]}
                    testID={`button-open-appeal-${r.id}`}
                  >
                    <Feather
                      name="message-square"
                      size={14}
                      color={colors.foreground}
                    />
                    <Text
                      style={[styles.btnOutlineText, { color: colors.foreground }]}
                    >
                      Appeal to admin
                    </Text>
                  </Pressable>
                ) : null}

                {appealId === r.id ? (
                  <View style={{ gap: 8 }}>
                    <TextInput
                      value={reason}
                      onChangeText={(v) => setReason(v.slice(0, 500))}
                      placeholder="Tell admins why you think this decision should be reviewed."
                      placeholderTextColor={colors.mutedForeground}
                      multiline
                      numberOfLines={3}
                      style={[
                        styles.textarea,
                        {
                          color: colors.foreground,
                          borderColor: colors.border,
                          backgroundColor: colors.background,
                        },
                      ]}
                      testID={`input-appeal-reason-${r.id}`}
                    />
                    <View style={styles.actionRow}>
                      <Pressable
                        onPress={() =>
                          appeal.mutate({
                            id: r.id,
                            data: { reason: reason.trim() },
                          })
                        }
                        disabled={
                          reason.trim().length === 0 || appeal.isPending
                        }
                        style={[
                          styles.btnPrimary,
                          {
                            backgroundColor: colors.primary,
                            opacity:
                              reason.trim().length === 0 || appeal.isPending
                                ? 0.5
                                : 1,
                          },
                        ]}
                        testID={`button-submit-appeal-${r.id}`}
                      >
                        {appeal.isPending ? (
                          <ActivityIndicator
                            size="small"
                            color={colors.primaryForeground}
                          />
                        ) : null}
                        <Text
                          style={[
                            styles.btnPrimaryText,
                            { color: colors.primaryForeground },
                          ]}
                        >
                          Submit appeal
                        </Text>
                      </Pressable>
                      <Pressable
                        onPress={() => {
                          setAppealId(null);
                          setReason("");
                        }}
                        style={styles.btnGhost}
                      >
                        <Text
                          style={{
                            color: colors.mutedForeground,
                            fontSize: 13,
                          }}
                        >
                          Cancel
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { paddingVertical: 40, alignItems: "center" },
  empty: {
    padding: 20,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "flex-start",
    gap: 8,
  },
  card: {
    padding: 14,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  headerRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  reasonText: {
    marginTop: 4,
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  statusBadgeText: { fontFamily: "Inter_600SemiBold", fontSize: 11 },
  appealBox: {
    padding: 10,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 4,
  },
  appealLabel: { fontFamily: "Inter_600SemiBold", fontSize: 12 },
  btnOutline: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  btnOutlineText: { fontFamily: "Inter_600SemiBold", fontSize: 13 },
  textarea: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    minHeight: 70,
    textAlignVertical: "top",
  },
  actionRow: { flexDirection: "row", gap: 6, alignItems: "center" },
  btnPrimary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 8,
  },
  btnPrimaryText: { fontFamily: "Inter_600SemiBold", fontSize: 13 },
  btnGhost: { paddingHorizontal: 8, paddingVertical: 6 },
});
