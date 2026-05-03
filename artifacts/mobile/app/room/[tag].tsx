import { Feather } from "@expo/vector-icons";
import { useUser } from "@clerk/clerk-expo";
import { useQueryClient } from "@tanstack/react-query";
import { Stack, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ChatInput } from "@/components/ChatInput";
import { EmptyState } from "@/components/EmptyState";
import { MessageBubble } from "@/components/MessageBubble";
import { SparkComposer, SparksRow } from "@/components/SparksPanel";
import { useColors } from "@/hooks/useColors";
import {
  getGetRoomMessagesQueryKey,
  getGetRoomSummaryQueryKey,
  useGetRoomMessages,
  useGetRoomSummary,
  useSendRoomMessage,
} from "@workspace/api-client-react";

export default function RoomScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ tag: string }>();
  const tag = String(params.tag ?? "");
  const qc = useQueryClient();
  const { user } = useUser();
  const meId = user?.id ?? "";

  const msgs = useGetRoomMessages(tag, {
    query: {
      queryKey: getGetRoomMessagesQueryKey(tag),
      refetchInterval: 3000,
      enabled: !!tag,
    },
  });

  const send = useSendRoomMessage({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetRoomMessagesQueryKey(tag) });
      },
    },
  });

  const data = useMemo(() => {
    const list = msgs.data ?? [];
    return [...list].reverse();
  }, [msgs.data]);

  const [summaryOpen, setSummaryOpen] = useState(false);
  const [summaryHours, setSummaryHours] = useState(6);
  const summary = useGetRoomSummary(
    tag,
    { hours: summaryHours },
    {
      query: {
        queryKey: getGetRoomSummaryQueryKey(tag, { hours: summaryHours }),
        enabled: summaryOpen && !!tag,
        staleTime: 60_000,
      },
    },
  );

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]}>
      <Stack.Screen
        options={{
          title: `#${tag}`,
          headerRight: () => (
            <Pressable
              onPress={() => setSummaryOpen(true)}
              hitSlop={10}
              accessibilityLabel="Catch me up"
              style={{ paddingHorizontal: 8 }}
            >
              <Feather name="zap" size={18} color={colors.primary} />
            </Pressable>
          ),
        }}
      />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior="padding"
        keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
      >
        <View style={styles.sparkBanner}>
          <View style={{ paddingHorizontal: 12 }}>
            <SparkComposer defaultTag={tag} />
          </View>
          <SparksRow scope={{ kind: "hashtag", tag }} canDelete />
        </View>
        {msgs.isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : data.length === 0 ? (
          <EmptyState icon="hash" title={`No messages in #${tag}`} />
        ) : (
          <FlatList
            data={data}
            inverted
            keyExtractor={(m) => String(m.id)}
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingVertical: 8 }}
            renderItem={({ item, index }) => {
              const isMine = item.senderId === meId;
              const next = data[index - 1];
              const showAvatar =
                !isMine && (!next || next.senderId !== item.senderId);
              return (
                <MessageBubble
                  message={item}
                  isMine={isMine}
                  showAvatar={showAvatar}
                  roomTag={tag}
                />
              );
            }}
          />
        )}
        <View style={{ paddingBottom: insets.bottom }}>
          <ChatInput
            placeholder={`Message #${tag}`}
            sending={send.isPending}
            onSend={async (d) => {
              if (!tag) return;
              await send.mutateAsync({
                tag,
                data: {
                  content: d.content,
                  imageUrl: d.imageUrl ?? d.gifUrl ?? null,
                  audioUrl: d.audioUrl ?? null,
                  gifUrl: d.gifUrl ?? null,
                },
              });
            }}
          />
        </View>
      </KeyboardAvoidingView>
      <Modal
        visible={summaryOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setSummaryOpen(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setSummaryOpen(false)}
        >
          <Pressable
            onPress={() => {}}
            style={[
              styles.modalCard,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
                paddingBottom: insets.bottom + 16,
              },
            ]}
          >
            <View style={styles.modalHeader}>
              <Feather name="zap" size={16} color={colors.primary} />
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>
                Catch me up on #{tag}
              </Text>
              <Pressable
                onPress={() => setSummaryOpen(false)}
                style={{ marginLeft: "auto" }}
                hitSlop={10}
              >
                <Feather name="x" size={18} color={colors.mutedForeground} />
              </Pressable>
            </View>
            <View style={styles.hoursRow}>
              {[1, 6, 24, 72].map((h) => {
                const active = h === summaryHours;
                return (
                  <Pressable
                    key={h}
                    onPress={() => setSummaryHours(h)}
                    style={[
                      styles.hourChip,
                      {
                        backgroundColor: active ? colors.primary : "transparent",
                        borderColor: active ? colors.primary : colors.border,
                      },
                    ]}
                  >
                    <Text
                      style={{
                        color: active
                          ? colors.primaryForeground
                          : colors.foreground,
                        fontSize: 12,
                        fontWeight: "600",
                      }}
                    >
                      {h < 24 ? `${h}h` : `${h / 24}d`}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <ScrollView style={{ maxHeight: 280 }}>
              {summary.isLoading || summary.isFetching ? (
                <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text style={{ color: colors.mutedForeground }}>
                    Generating recap…
                  </Text>
                </View>
              ) : summary.data ? (
                <View style={{ gap: 8 }}>
                  <Text style={{ color: colors.foreground, lineHeight: 20 }}>
                    {summary.data.summary}
                  </Text>
                  <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>
                    {summary.data.messageCount} message
                    {summary.data.messageCount === 1 ? "" : "s"} ·{" "}
                    {summary.data.cached ? "cached" : "fresh"}
                  </Text>
                </View>
              ) : (
                <Text style={{ color: colors.mutedForeground }}>
                  No summary available.
                </Text>
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalCard: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    padding: 16,
    gap: 12,
  },
  modalHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  modalTitle: { fontSize: 16, fontWeight: "600" },
  hoursRow: { flexDirection: "row", gap: 6 },
  hourChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  sparkBanner: { gap: 8, paddingTop: 8, paddingBottom: 4 },
});
