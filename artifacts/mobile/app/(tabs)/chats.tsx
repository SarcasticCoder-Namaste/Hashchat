import { useRouter } from "expo-router";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Avatar } from "@/components/Avatar";
import { EmptyState } from "@/components/EmptyState";
import { useColors } from "@/hooks/useColors";
import {
  getGetConversationsQueryKey,
  useGetConversations,
} from "@workspace/api-client-react";

export default function ChatsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const convs = useGetConversations({
    query: {
      queryKey: getGetConversationsQueryKey(),
      refetchInterval: 5000,
    },
  });

  const data = convs.data ?? [];

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.header,
          { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 12) },
        ]}
      >
        <Text style={[styles.title, { color: colors.foreground }]}>Chats</Text>
      </View>
      {convs.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : data.length === 0 ? (
        <EmptyState
          icon="message-circle"
          title="No conversations"
          subtitle="Match with someone in a hashtag room to start chatting."
        />
      ) : (
        <FlatList
          data={data}
          keyExtractor={(c) => String(c.id)}
          contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
          refreshControl={
            <RefreshControl
              refreshing={convs.isFetching && !convs.isLoading}
              onRefresh={() => convs.refetch()}
              tintColor={colors.primary}
            />
          }
          renderItem={({ item }) => {
            const last = item.lastMessage;
            const lastText = last
              ? last.imageUrl
                ? "📷 Photo"
                : last.audioUrl
                  ? "🎤 Voice"
                  : last.content
              : "Say hi";
            return (
              <Pressable
                onPress={() => router.push(`/chat/${item.id}`)}
                style={({ pressed }) => [
                  styles.row,
                  {
                    backgroundColor: pressed ? colors.muted : colors.background,
                    borderBottomColor: colors.border,
                  },
                ]}
              >
                <Avatar
                  url={item.otherUser.avatarUrl}
                  name={item.otherUser.displayName}
                  size={48}
                />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.name, { color: colors.foreground }]}>
                    {item.otherUser.displayName}
                  </Text>
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.snippet,
                      { color: colors.mutedForeground },
                    ]}
                  >
                    {lastText}
                  </Text>
                </View>
                {item.unreadCount > 0 ? (
                  <View
                    style={[
                      styles.badge,
                      { backgroundColor: colors.primary },
                    ]}
                  >
                    <Text
                      style={{
                        color: colors.primaryForeground,
                        fontSize: 12,
                        fontFamily: "Inter_700Bold",
                      }}
                    >
                      {item.unreadCount}
                    </Text>
                  </View>
                ) : null}
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  header: { paddingHorizontal: 16, paddingBottom: 12 },
  title: { fontSize: 32, fontFamily: "Inter_700Bold" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  name: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  snippet: { fontSize: 14, fontFamily: "Inter_400Regular", marginTop: 2 },
  badge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    alignItems: "center",
    justifyContent: "center",
  },
});
