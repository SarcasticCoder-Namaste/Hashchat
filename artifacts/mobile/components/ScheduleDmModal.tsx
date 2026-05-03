import { Feather } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";
import {
  getGetMyScheduledMessagesQueryKey,
  useScheduleConversationMessage,
} from "@workspace/api-client-react";

interface Props {
  visible: boolean;
  onClose: () => void;
  conversationId: number;
  initialContent?: string;
}

const PRESETS: { label: string; minutes: number }[] = [
  { label: "+15 min", minutes: 15 },
  { label: "+1 hour", minutes: 60 },
  { label: "+3 hours", minutes: 180 },
  { label: "Tomorrow", minutes: 60 * 24 },
];

function formatLocal(d: Date): string {
  return d.toLocaleString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ScheduleDmModal({
  visible,
  onClose,
  conversationId,
  initialContent = "",
}: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const [content, setContent] = useState(initialContent);
  const [whenMs, setWhenMs] = useState<number>(
    () => Date.now() + 30 * 60 * 1000,
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setContent(initialContent);
      setWhenMs(Date.now() + 30 * 60 * 1000);
      setError(null);
    }
  }, [visible, initialContent]);

  const schedule = useScheduleConversationMessage({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetMyScheduledMessagesQueryKey() });
        onClose();
      },
      onError: (err) => {
        setError(err instanceof Error ? err.message : "Failed to schedule");
      },
    },
  });

  const trimmed = content.trim();
  const whenLabel = useMemo(() => formatLocal(new Date(whenMs)), [whenMs]);

  function submit() {
    setError(null);
    if (!trimmed) {
      setError("Type a message before scheduling.");
      return;
    }
    if (whenMs <= Date.now() + 30_000) {
      setError("Pick a time at least a minute in the future.");
      return;
    }
    schedule.mutate({
      id: conversationId,
      data: {
        content: trimmed,
        scheduledFor: new Date(whenMs).toISOString(),
        replyToId: null,
      },
    });
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="formSheet"
      onRequestClose={onClose}
    >
      <View
        style={[
          styles.wrap,
          { backgroundColor: colors.background, paddingTop: insets.top + 8 },
        ]}
      >
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.foreground }]}>
            Schedule message
          </Text>
          <Pressable onPress={onClose} hitSlop={10} style={styles.iconBtn}>
            <Feather name="x" size={20} color={colors.foreground} />
          </Pressable>
        </View>

        <View style={{ paddingHorizontal: 16, gap: 12 }}>
          <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>
            We'll send this DM at the time you choose, even if you're offline.
          </Text>
          <TextInput
            value={content}
            onChangeText={setContent}
            placeholder="Type your message…"
            placeholderTextColor={colors.mutedForeground}
            multiline
            style={[
              styles.input,
              {
                color: colors.foreground,
                backgroundColor: colors.muted,
                borderColor: colors.border,
              },
            ]}
            testID="input-schedule-content"
          />

          <Text
            style={{
              color: colors.mutedForeground,
              fontSize: 11,
              fontFamily: "Inter_500Medium",
              textTransform: "uppercase",
              letterSpacing: 0.5,
            }}
          >
            Send at
          </Text>
          <View
            style={[
              styles.whenCard,
              { backgroundColor: colors.muted, borderColor: colors.border },
            ]}
          >
            <Feather name="clock" size={14} color={colors.foreground} />
            <Text
              style={{
                color: colors.foreground,
                fontFamily: "Inter_600SemiBold",
                fontSize: 14,
              }}
              testID="text-schedule-when"
            >
              {whenLabel}
            </Text>
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {PRESETS.map((p) => (
              <Pressable
                key={p.label}
                onPress={() =>
                  setWhenMs(Date.now() + p.minutes * 60 * 1000)
                }
                style={[
                  styles.preset,
                  { borderColor: colors.border, backgroundColor: colors.card },
                ]}
              >
                <Text
                  style={{
                    color: colors.foreground,
                    fontSize: 12,
                    fontFamily: "Inter_600SemiBold",
                  }}
                >
                  {p.label}
                </Text>
              </Pressable>
            ))}
          </View>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Pressable
              onPress={() => setWhenMs(whenMs - 15 * 60 * 1000)}
              style={[
                styles.preset,
                { borderColor: colors.border, backgroundColor: colors.card },
              ]}
            >
              <Text style={{ color: colors.foreground, fontSize: 12, fontFamily: "Inter_600SemiBold" }}>−15m</Text>
            </Pressable>
            <Pressable
              onPress={() => setWhenMs(whenMs + 15 * 60 * 1000)}
              style={[
                styles.preset,
                { borderColor: colors.border, backgroundColor: colors.card },
              ]}
            >
              <Text style={{ color: colors.foreground, fontSize: 12, fontFamily: "Inter_600SemiBold" }}>+15m</Text>
            </Pressable>
            <Pressable
              onPress={() => setWhenMs(whenMs + 60 * 60 * 1000)}
              style={[
                styles.preset,
                { borderColor: colors.border, backgroundColor: colors.card },
              ]}
            >
              <Text style={{ color: colors.foreground, fontSize: 12, fontFamily: "Inter_600SemiBold" }}>+1h</Text>
            </Pressable>
            <Pressable
              onPress={() => setWhenMs(whenMs + 24 * 60 * 60 * 1000)}
              style={[
                styles.preset,
                { borderColor: colors.border, backgroundColor: colors.card },
              ]}
            >
              <Text style={{ color: colors.foreground, fontSize: 12, fontFamily: "Inter_600SemiBold" }}>+1d</Text>
            </Pressable>
          </View>

          {error && (
            <Text style={{ color: colors.destructive, fontSize: 12 }}>
              {error}
            </Text>
          )}
        </View>

        <View
          style={[
            styles.footer,
            {
              borderTopColor: colors.border,
              paddingBottom: Platform.OS === "ios" ? insets.bottom + 12 : 16,
            },
          ]}
        >
          <Pressable onPress={onClose} style={styles.ghostBtn}>
            <Text
              style={{
                color: colors.mutedForeground,
                fontFamily: "Inter_600SemiBold",
                fontSize: 14,
              }}
            >
              Cancel
            </Text>
          </Pressable>
          <Pressable
            onPress={submit}
            disabled={schedule.isPending || !trimmed}
            style={[
              styles.primaryBtn,
              {
                backgroundColor:
                  schedule.isPending || !trimmed
                    ? colors.muted
                    : colors.primary,
              },
            ]}
            testID="button-confirm-schedule"
          >
            {schedule.isPending ? (
              <ActivityIndicator color={colors.primaryForeground} size="small" />
            ) : (
              <>
                <Feather name="clock" size={16} color={colors.primaryForeground} />
                <Text
                  style={{
                    color: colors.primaryForeground,
                    fontFamily: "Inter_600SemiBold",
                    fontSize: 14,
                  }}
                >
                  Schedule
                </Text>
              </>
            )}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  title: { flex: 1, fontSize: 18, fontFamily: "Inter_700Bold" },
  iconBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  input: {
    minHeight: 100,
    maxHeight: 200,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    textAlignVertical: "top",
  },
  whenCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  preset: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  footer: {
    marginTop: "auto",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  ghostBtn: { paddingHorizontal: 16, paddingVertical: 12 },
  primaryBtn: {
    marginLeft: "auto",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 999,
    minWidth: 130,
    justifyContent: "center",
  },
});
