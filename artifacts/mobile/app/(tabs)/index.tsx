import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
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
  useGetForYouFeed,
  type ForYouItem,
} from "@workspace/api-client-react";

export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const feed = useGetForYouFeed({ limit: 40 });

  const data = feed.data?.items ?? [];

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.header,
          { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 12) },
        ]}
      >
        <Text style={[styles.title, { color: colors.foreground }]}>For you</Text>
      </View>
      {feed.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : data.length === 0 ? (
        <EmptyState
          icon="compass"
          title="Nothing here yet"
          subtitle="Follow hashtags to fill your feed."
        />
      ) : (
        <FlatList
          data={data}
          keyExtractor={(item) => `${item.kind}-${item.id}`}
          contentContainerStyle={{
            paddingBottom: insets.bottom + 100,
            paddingHorizontal: 16,
            gap: 12,
          }}
          refreshControl={
            <RefreshControl
              refreshing={feed.isFetching && !feed.isLoading}
              onRefresh={() => feed.refetch()}
              tintColor={colors.primary}
            />
          }
          renderItem={({ item }) => (
            <FeedCard
              item={item}
              onOpenRoom={(tag) => router.push(`/room/${tag}`)}
            />
          )}
        />
      )}
      <Pressable
        onPress={() => router.push("/compose")}
        style={({ pressed }) => [
          styles.fab,
          {
            backgroundColor: colors.primary,
            bottom: insets.bottom + 84,
            opacity: pressed ? 0.85 : 1,
          },
        ]}
        accessibilityLabel="New post"
        accessibilityRole="button"
      >
        <Feather name="edit-2" size={22} color={colors.primaryForeground} />
      </Pressable>
    </View>
  );
}

function FeedCard({
  item,
  onOpenRoom,
}: {
  item: ForYouItem;
  onOpenRoom: (tag: string) => void;
}) {
  const colors = useColors();
  if (item.kind === "post" && item.post) {
    const p = item.post;
    return (
      <View
        style={[
          styles.card,
          { backgroundColor: colors.card, borderColor: colors.border },
        ]}
      >
        <View style={styles.cardHeader}>
          <Avatar url={p.author.avatarUrl} name={p.author.displayName} size={36} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.author, { color: colors.foreground }]}>
              {p.author.displayName}
            </Text>
            <Text style={[styles.handle, { color: colors.mutedForeground }]}>
              @{p.author.username}
            </Text>
          </View>
          {p.boostedUntil && new Date(p.boostedUntil).getTime() > Date.now() ? (
            <View style={[styles.boostBadge, { backgroundColor: colors.accent }]}>
              <Feather name="zap" size={11} color={colors.accentForeground} />
              <Text style={[styles.boostText, { color: colors.accentForeground }]}>
                Boosted
              </Text>
            </View>
          ) : null}
        </View>
        <Text style={[styles.body, { color: colors.foreground }]}>
          {p.content}
        </Text>
        {p.imageUrls?.length ? (
          <Image
            source={{ uri: p.imageUrls[0] }}
            style={styles.cardImage}
            contentFit="cover"
          />
        ) : null}
        {p.hashtags?.length ? (
          <View style={styles.tagRow}>
            {p.hashtags.slice(0, 3).map((t) => (
              <Pressable
                key={t}
                onPress={() => onOpenRoom(t)}
                style={[styles.tag, { backgroundColor: colors.accent }]}
              >
                <Text style={[styles.tagText, { color: colors.accentForeground }]}>
                  #{t}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>
    );
  }
  if (item.kind === "room" && item.room) {
    const r = item.room;
    return (
      <Pressable
        onPress={() => onOpenRoom(r.tag)}
        style={[
          styles.card,
          { backgroundColor: colors.card, borderColor: colors.border },
        ]}
      >
        <View style={styles.cardHeader}>
          <View
            style={[styles.hashIcon, { backgroundColor: colors.accent }]}
          >
            <Feather name="hash" size={20} color={colors.accentForeground} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.author, { color: colors.foreground }]}>
              #{r.tag}
            </Text>
            <Text style={[styles.handle, { color: colors.mutedForeground }]}>
              {r.memberCount} members · {r.recentMessages} recent
            </Text>
          </View>
          <Feather name="chevron-right" size={20} color={colors.mutedForeground} />
        </View>
      </Pressable>
    );
  }
  if (item.kind === "person" && item.person) {
    const u = item.person;
    return (
      <View
        style={[
          styles.card,
          { backgroundColor: colors.card, borderColor: colors.border },
        ]}
      >
        <View style={styles.cardHeader}>
          <Avatar url={u.avatarUrl} name={u.displayName} size={44} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.author, { color: colors.foreground }]}>
              {u.displayName}
            </Text>
            <Text style={[styles.handle, { color: colors.mutedForeground }]}>
              @{u.username}
            </Text>
            {u.sharedHashtags?.length ? (
              <Text style={[styles.handle, { color: colors.mutedForeground }]}>
                Shares #{u.sharedHashtags.slice(0, 2).join(" #")}
              </Text>
            ) : null}
          </View>
        </View>
      </View>
    );
  }
  return null;
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  header: { paddingHorizontal: 16, paddingBottom: 12 },
  title: { fontSize: 32, fontFamily: "Inter_700Bold" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  card: {
    padding: 14,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  hashIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  author: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  handle: { fontSize: 13, fontFamily: "Inter_400Regular" },
  body: { fontSize: 15, fontFamily: "Inter_400Regular", lineHeight: 21 },
  cardImage: {
    width: "100%",
    height: 200,
    borderRadius: 12,
    backgroundColor: "#0001",
  },
  tagRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  boostBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  boostText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  tag: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  tagText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  fab: {
    position: "absolute",
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
});
