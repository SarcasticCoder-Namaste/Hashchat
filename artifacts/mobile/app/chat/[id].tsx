import { Feather } from "@expo/vector-icons";
import { useUser } from "@clerk/clerk-expo";
import { useQueryClient } from "@tanstack/react-query";
import { Stack, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ChatInput } from "@/components/ChatInput";
import { EmptyState } from "@/components/EmptyState";
import { FailedMessages } from "@/components/FailedMessages";
import { MessageActionsModal } from "@/components/MessageActionsModal";
import { MessageBubble } from "@/components/MessageBubble";
import { PollsModal } from "@/components/PollsModal";
import { ScheduleDmModal } from "@/components/ScheduleDmModal";
import { ScheduledDmsModal } from "@/components/ScheduledDmsModal";
import { useColors } from "@/hooks/useColors";
import { useConversationOutbox } from "@/hooks/useOutboxFlusher";
import {
  enqueueMessage,
  type QueuedMessage,
} from "@/lib/offlineQueue";
import {
  getGetConversationMessagesQueryKey,
  getGetConversationsQueryKey,
  useGetConversationMessages,
  useGetConversations,
  useMarkConversationRead,
  useSendConversationMessage,
  type Message,
} from "@workspace/api-client-react";

export default function ConversationChatScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id: string }>();
  const id = parseInt(String(params.id), 10);
  const qc = useQueryClient();
  const { user } = useUser();
  const meId = user?.id ?? "";

  const convs = useGetConversations();
  const conv = convs.data?.find((c) => c.id === id);

  const msgs = useGetConversationMessages(id, {
    query: {
      queryKey: getGetConversationMessagesQueryKey(id),
      refetchInterval: 2500,
      enabled: Number.isFinite(id),
    },
  });

  const send = useSendConversationMessage({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({
          queryKey: getGetConversationMessagesQueryKey(id),
        });
        qc.invalidateQueries({ queryKey: getGetConversationsQueryKey() });
      },
    },
  });

  const flushSend = useCallback(
    async (m: QueuedMessage) => {
      const targetId =
        m.target.kind === "conversation" ? m.target.conversationId : id;
      await send.mutateAsync({
        id: targetId,
        data: {
          content: m.data.content,
          imageUrl: m.data.imageUrl ?? null,
          audioUrl: m.data.audioUrl ?? null,
          gifUrl: m.data.gifUrl ?? null,
        },
      });
    },
    [send, id],
  );

  const { pending, online } = useConversationOutbox(id, flushSend);
  const failed = useMemo(
    () => pending.filter((m) => m.status === "failed"),
    [pending],
  );
  const sending = useMemo(
    () => pending.filter((m) => m.status !== "failed"),
    [pending],
  );

  const markRead = useMarkConversationRead();
  const lastReadRef = useRef<number | null>(null);

  useEffect(() => {
    if (!Number.isFinite(id)) return;
    if (lastReadRef.current === id) return;
    lastReadRef.current = id;
    markRead.mutate({ id, data: {} });
  }, [id, markRead]);

  const data = useMemo(() => {
    const list = msgs.data ?? [];
    return [...list].reverse();
  }, [msgs.data]);

  const [actionsFor, setActionsFor] = useState<Message | null>(null);
  const [translations, setTranslations] = useState<
    Record<number, { language: string; text: string }>
  >({});
  const [pollsOpen, setPollsOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduledListOpen, setScheduledListOpen] = useState(false);

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]}>
      <Stack.Screen
        options={{
          title: conv?.otherUser?.displayName ?? conv?.title ?? "Chat",
          headerRight: () => (
            <View style={{ flexDirection: "row", gap: 4 }}>
              <Pressable
                onPress={() => setPollsOpen(true)}
                hitSlop={10}
                accessibilityLabel="Polls"
                style={{ paddingHorizontal: 6 }}
                testID="button-open-polls"
              >
                <Feather name="bar-chart-2" size={18} color={colors.primary} />
              </Pressable>
              <Pressable
                onPress={() => setScheduledListOpen(true)}
                hitSlop={10}
                accessibilityLabel="Scheduled messages"
                style={{ paddingHorizontal: 6 }}
                testID="button-open-scheduled"
              >
                <Feather name="clock" size={18} color={colors.primary} />
              </Pressable>
            </View>
          ),
        }}
      />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior="padding"
        keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
      >
        {msgs.isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : data.length === 0 ? (
          <EmptyState icon="message-square" title="Say hi" />
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
                  onLongPress={(m) => setActionsFor(m)}
                  translation={translations[item.id] ?? null}
                  onClearTranslation={(mid) =>
                    setTranslations((t) => {
                      const next = { ...t };
                      delete next[mid];
                      return next;
                    })
                  }
                />
              );
            }}
          />
        )}
        {(!online || sending.length > 0) && (
          <View
            style={{
              paddingHorizontal: 12,
              paddingVertical: 6,
              backgroundColor: colors.muted,
              borderTopWidth: StyleSheet.hairlineWidth,
              borderTopColor: colors.border,
            }}
          >
            <Text
              style={{
                color: colors.mutedForeground,
                fontFamily: "Inter_500Medium",
                fontSize: 12,
              }}
            >
              {!online
                ? `Offline · ${sending.length} message${sending.length === 1 ? "" : "s"} pending`
                : `Sending ${sending.length} pending message${sending.length === 1 ? "" : "s"}…`}
            </Text>
          </View>
        )}
        <FailedMessages items={failed} />
        <View
          style={{
            flexDirection: "row",
            alignItems: "flex-end",
            paddingBottom: insets.bottom,
            gap: 0,
          }}
        >
          <View style={{ flex: 1 }}>
            <ChatInput
              sending={send.isPending}
              onSend={async (data) => {
                if (!Number.isFinite(id)) return;
                const payload = {
                  content: data.content,
                  imageUrl: data.imageUrl ?? data.gifUrl ?? null,
                  audioUrl: data.audioUrl ?? null,
                  gifUrl: data.gifUrl ?? null,
                };
                if (!online) {
                  await enqueueMessage(id, payload);
                  return;
                }
                try {
                  await send.mutateAsync({ id, data: payload });
                } catch {
                  await enqueueMessage(id, payload);
                }
              }}
            />
          </View>
          <Pressable
            onPress={() => setScheduleOpen(true)}
            hitSlop={6}
            style={{
              padding: 12,
              marginRight: 6,
              marginBottom: 6,
              borderRadius: 999,
              backgroundColor: colors.muted,
            }}
            accessibilityLabel="Schedule message"
            testID="button-schedule-message"
          >
            <Feather name="clock" size={18} color={colors.foreground} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      <MessageActionsModal
        visible={actionsFor != null}
        messageId={actionsFor?.id ?? null}
        onClose={() => setActionsFor(null)}
        onTranslated={(mid, lang, text) =>
          setTranslations((t) => ({
            ...t,
            [mid]: { language: lang, text },
          }))
        }
      />
      {Number.isFinite(id) && (
        <>
          <PollsModal
            visible={pollsOpen}
            onClose={() => setPollsOpen(false)}
            scope={{ kind: "conversation", conversationId: id }}
          />
          <ScheduleDmModal
            visible={scheduleOpen}
            onClose={() => setScheduleOpen(false)}
            conversationId={id}
          />
          <ScheduledDmsModal
            visible={scheduledListOpen}
            onClose={() => setScheduledListOpen(false)}
            conversationId={id}
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
});
