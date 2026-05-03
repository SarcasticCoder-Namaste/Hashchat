import { Feather } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  ActivityIndicator,
  Modal,
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
  getGetConversationPollsQueryKey,
  getGetRoomPollsQueryKey,
  useCreateConversationPoll,
  useCreateRoomPoll,
  type CreatePollBodyMode,
} from "@workspace/api-client-react";

export type PollScope =
  | { kind: "room"; tag: string }
  | { kind: "conversation"; conversationId: number };

interface Props {
  visible: boolean;
  onClose: () => void;
  scope: PollScope;
}

const EXPIRY_OPTIONS = [
  { value: 0, label: "No exp." },
  { value: 1, label: "1h" },
  { value: 6, label: "6h" },
  { value: 24, label: "1d" },
  { value: 72, label: "3d" },
  { value: 168, label: "1w" },
];

const MODE_OPTIONS: { value: CreatePollBodyMode; label: string }[] = [
  { value: "single", label: "Single" },
  { value: "multi", label: "Multi" },
  { value: "ranked", label: "Ranked" },
];

export function PollCreatorModal({ visible, onClose, scope }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState<string[]>(["", ""]);
  const [expiresHours, setExpiresHours] = useState(0);
  const [mode, setMode] = useState<CreatePollBodyMode>("single");
  const [maxSelections, setMaxSelections] = useState(2);

  function reset() {
    setQuestion("");
    setOptions(["", ""]);
    setExpiresHours(0);
    setMode("single");
    setMaxSelections(2);
  }

  const onSuccess = () => {
    if (scope.kind === "room") {
      qc.invalidateQueries({ queryKey: getGetRoomPollsQueryKey(scope.tag) });
    } else {
      qc.invalidateQueries({
        queryKey: getGetConversationPollsQueryKey(scope.conversationId),
      });
    }
    reset();
    onClose();
  };

  const createRoom = useCreateRoomPoll({ mutation: { onSuccess } });
  const createConv = useCreateConversationPoll({ mutation: { onSuccess } });
  const isPending = createRoom.isPending || createConv.isPending;

  function submit() {
    const cleaned = options.map((o) => o.trim()).filter((o) => o.length > 0);
    if (!question.trim() || cleaned.length < 2) return;
    const expiresAt =
      expiresHours > 0
        ? new Date(Date.now() + expiresHours * 3600 * 1000).toISOString()
        : undefined;
    const data = {
      question: question.trim(),
      options: cleaned,
      mode,
      ...(mode === "multi"
        ? { maxSelections: Math.min(maxSelections, cleaned.length) }
        : {}),
      ...(expiresAt ? { expiresAt } : {}),
    };
    if (scope.kind === "room") {
      createRoom.mutate({ tag: scope.tag, data });
    } else {
      createConv.mutate({ id: scope.conversationId, data });
    }
  }

  const cleanedCount = options.filter((o) => o.trim()).length;
  const canSubmit = question.trim().length > 0 && cleanedCount >= 2 && !isPending;

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
            New poll
          </Text>
          <Pressable onPress={onClose} hitSlop={10} style={styles.iconBtn}>
            <Feather name="x" size={20} color={colors.foreground} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
          <Text style={[styles.label, { color: colors.mutedForeground }]}>
            Question
          </Text>
          <TextInput
            value={question}
            onChangeText={(t) => setQuestion(t.slice(0, 200))}
            placeholder={
              scope.kind === "room" ? "Ask the room…" : "Ask the chat…"
            }
            placeholderTextColor={colors.mutedForeground}
            style={[
              styles.input,
              {
                color: colors.foreground,
                backgroundColor: colors.muted,
                borderColor: colors.border,
              },
            ]}
            testID="input-poll-question"
          />

          <Text style={[styles.label, { color: colors.mutedForeground }]}>
            Options (2–6)
          </Text>
          {options.map((opt, i) => (
            <View
              key={i}
              style={{ flexDirection: "row", gap: 6, alignItems: "center" }}
            >
              <TextInput
                value={opt}
                onChangeText={(t) => {
                  const next = [...options];
                  next[i] = t.slice(0, 80);
                  setOptions(next);
                }}
                placeholder={`Option ${i + 1}`}
                placeholderTextColor={colors.mutedForeground}
                style={[
                  styles.input,
                  {
                    flex: 1,
                    color: colors.foreground,
                    backgroundColor: colors.muted,
                    borderColor: colors.border,
                  },
                ]}
                testID={`input-poll-option-${i}`}
              />
              {options.length > 2 && (
                <Pressable
                  onPress={() =>
                    setOptions(options.filter((_, idx) => idx !== i))
                  }
                  style={styles.iconBtn}
                  hitSlop={6}
                >
                  <Feather
                    name="trash-2"
                    size={16}
                    color={colors.mutedForeground}
                  />
                </Pressable>
              )}
            </View>
          ))}
          {options.length < 6 && (
            <Pressable
              onPress={() => setOptions([...options, ""])}
              style={[
                styles.ghostRow,
                { borderColor: colors.border },
              ]}
              testID="button-add-poll-option"
            >
              <Feather name="plus" size={14} color={colors.mutedForeground} />
              <Text
                style={{
                  color: colors.mutedForeground,
                  fontFamily: "Inter_500Medium",
                  fontSize: 13,
                }}
              >
                Add option
              </Text>
            </Pressable>
          )}

          <Text style={[styles.label, { color: colors.mutedForeground }]}>
            Voting mode
          </Text>
          <View style={{ flexDirection: "row", gap: 6 }}>
            {MODE_OPTIONS.map((o) => {
              const active = mode === o.value;
              return (
                <Pressable
                  key={o.value}
                  onPress={() => setMode(o.value)}
                  style={[
                    styles.chip,
                    {
                      borderColor: active ? colors.primary : colors.border,
                      backgroundColor: active ? colors.accent : colors.card,
                    },
                  ]}
                >
                  <Text
                    style={{
                      color: active ? colors.primary : colors.foreground,
                      fontFamily: "Inter_600SemiBold",
                      fontSize: 12,
                    }}
                  >
                    {o.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {mode === "multi" && (
            <>
              <Text style={[styles.label, { color: colors.mutedForeground }]}>
                Max selectable
              </Text>
              <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
                {Array.from(
                  { length: Math.max(1, Math.min(5, cleanedCount - 1)) },
                  (_, i) => i + 2,
                ).map((n) => {
                  const active = maxSelections === n;
                  return (
                    <Pressable
                      key={n}
                      onPress={() => setMaxSelections(n)}
                      style={[
                        styles.chip,
                        {
                          borderColor: active ? colors.primary : colors.border,
                          backgroundColor: active ? colors.accent : colors.card,
                        },
                      ]}
                    >
                      <Text
                        style={{
                          color: active ? colors.primary : colors.foreground,
                          fontFamily: "Inter_600SemiBold",
                          fontSize: 12,
                        }}
                      >
                        Up to {n}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </>
          )}

          <Text style={[styles.label, { color: colors.mutedForeground }]}>
            Expires
          </Text>
          <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
            {EXPIRY_OPTIONS.map((o) => {
              const active = expiresHours === o.value;
              return (
                <Pressable
                  key={o.value}
                  onPress={() => setExpiresHours(o.value)}
                  style={[
                    styles.chip,
                    {
                      borderColor: active ? colors.primary : colors.border,
                      backgroundColor: active ? colors.accent : colors.card,
                    },
                  ]}
                >
                  <Text
                    style={{
                      color: active ? colors.primary : colors.foreground,
                      fontFamily: "Inter_600SemiBold",
                      fontSize: 12,
                    }}
                  >
                    {o.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>

        <View
          style={[
            styles.footer,
            {
              borderTopColor: colors.border,
              paddingBottom: insets.bottom + 12,
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
            disabled={!canSubmit}
            style={[
              styles.primaryBtn,
              { backgroundColor: canSubmit ? colors.primary : colors.muted },
            ]}
            testID="button-submit-poll"
          >
            {isPending ? (
              <ActivityIndicator color={colors.primaryForeground} />
            ) : (
              <Text
                style={{
                  color: canSubmit
                    ? colors.primaryForeground
                    : colors.mutedForeground,
                  fontFamily: "Inter_600SemiBold",
                  fontSize: 14,
                }}
              >
                Create poll
              </Text>
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
  label: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  input: {
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: "Inter_400Regular",
    fontSize: 14,
  },
  ghostRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderStyle: "dashed",
    alignSelf: "flex-start",
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  footer: {
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
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 999,
    minWidth: 130,
    alignItems: "center",
    justifyContent: "center",
  },
});
