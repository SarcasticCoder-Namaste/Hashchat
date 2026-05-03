import { Feather } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Avatar } from "@/components/Avatar";
import { EmptyState } from "@/components/EmptyState";
import { OfflineBanner } from "@/components/OfflineBanner";
import { useColors } from "@/hooks/useColors";
import {
  getGetNotificationsQueryKey,
  getGetUnreadNotificationCountQueryKey,
  useGetNotifications,
  type Notification,
} from "@workspace/api-client-react";

const KIND_LABEL: Record<Notification["kind"], string> = {
  mention: "mentioned you",
  reply: "replied to you",
  reaction: "reacted to your message",
  follow: "started following you",
  dm: "messaged you",
  event_starting: "starts soon",
  scheduled_post_published: "published your scheduled post",
  scheduled_dm_delivered: "your scheduled DM was delivered",
  scheduled_dm_failed: "your scheduled DM could not be delivered",
  post_milestone: "your post hit a milestone",
  report_resolved: "your report was resolved",
  moderation_action: "moderation action taken",
  mod_promoted: "you were promoted to moderator",
  post_pinned: "pinned your post",
};

export default function NotificationsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const notif = useGetNotifications(undefined, {
    query: {
      queryKey: getGetNotificationsQueryKey(),
      refetchInterval: 10000,
    },
  });

  useFocusEffect(
    useCallback(() => {
      qc.invalidateQueries({
        queryKey: getGetUnreadNotificationCountQueryKey(),
      });
    }, [qc]),
  );

  const data = notif.data?.items ?? [];

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.header,
          { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 12) },
        ]}
      >
        <Text style={[styles.title, { color: colors.foreground }]}>
          Activity
        </Text>
      </View>
      <OfflineBanner message="Offline · showing saved activity" />
      {notif.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : data.length === 0 ? (
        <EmptyState
          icon="bell"
          title="All caught up"
          subtitle="Mentions, replies and follows show up here."
        />
      ) : (
        <FlatList
          data={data}
          keyExtractor={(n) => String(n.id)}
          contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
          refreshControl={
            <RefreshControl
              refreshing={notif.isFetching && !notif.isLoading}
              onRefresh={() => notif.refetch()}
              tintColor={colors.primary}
            />
          }
          renderItem={({ item }) => (
            <View
              style={[
                styles.row,
                {
                  backgroundColor: item.readAt ? colors.background : colors.accent,
                  borderBottomColor: colors.border,
                },
              ]}
            >
              {item.actor ? (
                <Avatar
                  url={item.actor.avatarUrl}
                  name={item.actor.displayName}
                  size={40}
                />
              ) : (
                <View
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 20,
                    backgroundColor: colors.muted,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Feather name="bell" size={18} color={colors.mutedForeground} />
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={[styles.text, { color: colors.foreground }]}>
                  <Text style={{ fontFamily: "Inter_600SemiBold" }}>
                    {item.actor?.displayName ?? "Someone"}
                  </Text>{" "}
                  {KIND_LABEL[item.kind]}
                </Text>
                {item.snippet ? (
                  <Text
                    numberOfLines={2}
                    style={[styles.snippet, { color: colors.mutedForeground }]}
                  >
                    {item.snippet}
                  </Text>
                ) : null}
              </View>
            </View>
          )}
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
  text: { fontSize: 14, fontFamily: "Inter_400Regular" },
  snippet: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
});
