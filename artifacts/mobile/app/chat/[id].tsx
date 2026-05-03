import { useUser } from "@clerk/clerk-expo";
import { useQueryClient } from "@tanstack/react-query";
import { Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useRef } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  StyleSheet,
  View,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ChatInput } from "@/components/ChatInput";
import { EmptyState } from "@/components/EmptyState";
import { MessageBubble } from "@/components/MessageBubble";
import { useColors } from "@/hooks/useColors";
import {
  getGetConversationMessagesQueryKey,
  getGetConversationsQueryKey,
  useGetConversationMessages,
  useGetConversations,
  useMarkConversationRead,
  useSendConversationMessage,
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

  const markRead = useMarkConversationRead();
  const lastReadRef = useRef<number | null>(null);

  useEffect(() => {
    if (!Number.isFinite(id)) return;
    if (lastReadRef.current === id) return;
    lastReadRef.current = id;
    markRead.mutate({ id, data: {} });
  }, [id, markRead]);

  // Reverse for inverted FlatList
  const data = useMemo(() => {
    const list = msgs.data ?? [];
    return [...list].reverse();
  }, [msgs.data]);

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]}>
      <Stack.Screen
        options={{ title: conv?.otherUser.displayName ?? "Chat" }}
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
                />
              );
            }}
          />
        )}
        <View style={{ paddingBottom: insets.bottom }}>
          <ChatInput
            sending={send.isPending}
            onSend={async (data) => {
              if (!Number.isFinite(id)) return;
              await send.mutateAsync({
                id,
                data: {
                  content: data.content,
                  imageUrl: data.imageUrl ?? data.gifUrl ?? null,
                  audioUrl: data.audioUrl ?? null,
                  gifUrl: data.gifUrl ?? null,
                },
              });
            }}
          />
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
});
