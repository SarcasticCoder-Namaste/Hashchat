import { Feather } from "@expo/vector-icons";
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

import { EmptyState } from "@/components/EmptyState";
import { useColors } from "@/hooks/useColors";
import { useGetTrendingRooms } from "@workspace/api-client-react";

export default function DiscoverScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const rooms = useGetTrendingRooms({ limit: 30 });

  const data = rooms.data ?? [];

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.header,
          { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 12) },
        ]}
      >
        <Text style={[styles.title, { color: colors.foreground }]}>Discover</Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          Trending hashtag rooms
        </Text>
      </View>
      {rooms.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : data.length === 0 ? (
        <EmptyState icon="hash" title="No trending rooms" />
      ) : (
        <FlatList
          data={data}
          keyExtractor={(r) => r.tag}
          contentContainerStyle={{
            paddingBottom: insets.bottom + 100,
            paddingHorizontal: 16,
            gap: 10,
          }}
          refreshControl={
            <RefreshControl
              refreshing={rooms.isFetching && !rooms.isLoading}
              onRefresh={() => rooms.refetch()}
              tintColor={colors.primary}
            />
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push(`/room/${item.tag}`)}
              style={[
                styles.row,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <View
                style={[
                  styles.icon,
                  { backgroundColor: colors.accent },
                ]}
              >
                <Feather name="hash" size={22} color={colors.accentForeground} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.tag, { color: colors.foreground }]}>
                  #{item.tag}
                </Text>
                <Text style={[styles.meta, { color: colors.mutedForeground }]}>
                  {item.memberCount} members · {item.recentMessages} recent
                </Text>
                {item.lastMessage ? (
                  <Text
                    numberOfLines={1}
                    style={[styles.last, { color: colors.mutedForeground }]}
                  >
                    {item.lastMessage.senderName}: {item.lastMessage.content}
                  </Text>
                ) : null}
              </View>
              <Feather
                name="chevron-right"
                size={20}
                color={colors.mutedForeground}
              />
            </Pressable>
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
  subtitle: { fontSize: 15, fontFamily: "Inter_400Regular", marginTop: 2 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
  },
  icon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  tag: { fontSize: 16, fontFamily: "Inter_700Bold" },
  meta: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  last: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
});
