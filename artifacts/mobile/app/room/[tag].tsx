import { useUser } from "@clerk/clerk-expo";
import { useQueryClient } from "@tanstack/react-query";
import { Stack, useLocalSearchParams } from "expo-router";
import { useMemo } from "react";
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
  getGetRoomMessagesQueryKey,
  useGetRoomMessages,
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

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ title: `#${tag}` }} />
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
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
});
