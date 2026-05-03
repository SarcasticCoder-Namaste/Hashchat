import { Feather } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { EmptyState } from "@/components/EmptyState";
import { useColors } from "@/hooks/useColors";
import {
  getGetMyScheduledMessagesQueryKey,
  useCancelScheduledMessage,
  useGetMyScheduledMessages,
} from "@workspace/api-client-react";

interface Props {
  visible: boolean;
  onClose: () => void;
  conversationId?: number;
}

export function ScheduledDmsModal({ visible, onClose, conversationId }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();

  const q = useGetMyScheduledMessages({
    query: {
      queryKey: getGetMyScheduledMessagesQueryKey(),
      enabled: visible,
      refetchInterval: visible ? 15_000 : false,
    },
  });

  const cancel = useCancelScheduledMessage({
    mutation: {
      onSuccess: () =>
        qc.invalidateQueries({ queryKey: getGetMyScheduledMessagesQueryKey() }),
    },
  });

  const items =
    q.data?.filter((m) =>
      conversationId == null ? true : m.conversationId === conversationId,
    ) ?? [];

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
          <Feather name="clock" size={18} color={colors.foreground} />
          <Text style={[styles.title, { color: colors.foreground }]}>
            Scheduled messages
          </Text>
          <Pressable onPress={onClose} hitSlop={10} style={styles.iconBtn}>
            <Feather name="x" size={20} color={colors.foreground} />
          </Pressable>
        </View>

        {q.isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : items.length === 0 ? (
          <EmptyState icon="clock" title="No scheduled DMs" />
        ) : (
          <FlatList
            data={items}
            keyExtractor={(m) => String(m.id)}
            contentContainerStyle={{
              padding: 16,
              gap: 8,
              paddingBottom: insets.bottom + 24,
            }}
            renderItem={({ item }) => (
              <View
                style={[
                  styles.row,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.border,
                  },
                ]}
              >
                <View style={{ flex: 1, gap: 4 }}>
                  <Text
                    style={{
                      color: colors.mutedForeground,
                      fontSize: 11,
                      fontFamily: "Inter_500Medium",
                    }}
                  >
                    {new Date(item.scheduledFor).toLocaleString([], {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                    {item.status !== "scheduled"
                      ? ` · ${item.status}`
                      : ""}
                  </Text>
                  <Text
                    numberOfLines={3}
                    style={{
                      color: colors.foreground,
                      fontSize: 14,
                      fontFamily: "Inter_400Regular",
                      lineHeight: 19,
                    }}
                    testID={`scheduled-${item.id}`}
                  >
                    {item.content}
                  </Text>
                </View>
                {item.status === "scheduled" && (
                  <Pressable
                    onPress={() => cancel.mutate({ id: item.id })}
                    hitSlop={6}
                    style={styles.iconBtn}
                    testID={`button-cancel-scheduled-${item.id}`}
                  >
                    <Feather
                      name="trash-2"
                      size={16}
                      color={colors.mutedForeground}
                    />
                  </Pressable>
                )}
              </View>
            )}
          />
        )}
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
    gap: 8,
  },
  title: { flex: 1, fontSize: 18, fontFamily: "Inter_700Bold" },
  iconBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: 12,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
