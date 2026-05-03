import { Feather } from "@expo/vector-icons";
import { useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { useColors } from "@/hooks/useColors";
import {
  removeFromOutbox,
  retryMessage,
  updateMessageContent,
  type QueuedMessage,
} from "@/lib/offlineQueue";

export function FailedMessages({ items }: { items: QueuedMessage[] }) {
  const colors = useColors();
  const [editing, setEditing] = useState<QueuedMessage | null>(null);
  const [draft, setDraft] = useState("");

  if (items.length === 0) return null;

  const openActions = (m: QueuedMessage) => {
    Alert.alert(
      "Message couldn't send",
      m.lastError
        ? `${m.lastError}\n\nWhat would you like to do?`
        : "We tried a few times but couldn't deliver this message.",
      [
        {
          text: "Retry",
          onPress: () => {
            void retryMessage(m.id);
          },
        },
        {
          text: "Edit",
          onPress: () => {
            setDraft(m.data.content ?? "");
            setEditing(m);
          },
        },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            void removeFromOutbox(m.id);
          },
        },
        { text: "Cancel", style: "cancel" },
      ],
    );
  };

  return (
    <View
      style={[
        styles.wrap,
        {
          backgroundColor: colors.muted,
          borderTopColor: colors.border,
        },
      ]}
    >
      <View style={styles.headerRow}>
        <Feather name="alert-triangle" size={12} color={colors.destructive} />
        <Text
          style={{
            color: colors.destructive,
            fontSize: 12,
            fontFamily: "Inter_600SemiBold",
          }}
        >
          {items.length === 1
            ? "1 message didn't send"
            : `${items.length} messages didn't send`}
        </Text>
      </View>
      {items.map((m) => (
        <Pressable
          key={m.id}
          onPress={() => openActions(m)}
          accessibilityRole="button"
          accessibilityLabel="Failed message, tap for retry options"
          style={({ pressed }) => [
            styles.row,
            {
              borderColor: colors.border,
              backgroundColor: pressed ? colors.background : "transparent",
            },
          ]}
        >
          <View style={{ flex: 1 }}>
            <Text
              numberOfLines={2}
              style={{ color: colors.foreground, fontSize: 13 }}
            >
              {m.data.content || (m.data.imageUrl ? "[image]" : "[message]")}
            </Text>
            <Text
              style={{
                color: colors.mutedForeground,
                fontSize: 11,
                marginTop: 2,
              }}
            >
              Tap to retry, edit, or delete
            </Text>
          </View>
          <Feather
            name="rotate-cw"
            size={16}
            color={colors.mutedForeground}
          />
        </Pressable>
      ))}

      <Modal
        transparent
        visible={!!editing}
        animationType="fade"
        onRequestClose={() => setEditing(null)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setEditing(null)}
        >
          <Pressable
            onPress={() => {}}
            style={[
              styles.modalCard,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <Text
              style={{
                color: colors.foreground,
                fontSize: 16,
                fontFamily: "Inter_600SemiBold",
              }}
            >
              Edit message
            </Text>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              multiline
              style={[
                styles.input,
                {
                  borderColor: colors.border,
                  color: colors.foreground,
                  backgroundColor: colors.background,
                },
              ]}
              placeholder="Message"
              placeholderTextColor={colors.mutedForeground}
              autoFocus
            />
            <View style={styles.modalActions}>
              <Pressable
                onPress={() => setEditing(null)}
                style={[styles.modalBtn, { borderColor: colors.border }]}
              >
                <Text style={{ color: colors.foreground }}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  if (!editing) return;
                  const next = draft.trim();
                  if (!next) return;
                  void updateMessageContent(editing.id, { content: next });
                  setEditing(null);
                }}
                style={[
                  styles.modalBtn,
                  { backgroundColor: colors.primary, borderColor: colors.primary },
                ]}
              >
                <Text style={{ color: colors.primaryForeground, fontWeight: "600" }}>
                  Save & retry
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 6,
  },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  modalCard: {
    width: "100%",
    maxWidth: 420,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    gap: 12,
  },
  input: {
    minHeight: 80,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    padding: 10,
    textAlignVertical: "top",
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
  },
  modalBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
