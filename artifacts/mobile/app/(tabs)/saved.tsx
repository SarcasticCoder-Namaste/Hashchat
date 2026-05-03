import { Feather } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Linking,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { EmptyState } from "@/components/EmptyState";
import { useColors } from "@/hooks/useColors";
import {
  getGetMyBookmarksQueryKey,
  useDeleteBookmark,
  useGetMyBookmarks,
  type Bookmark,
  type GetMyBookmarksKind,
} from "@workspace/api-client-react";

const REELS_KEY = "hashchat:saved-reels";

type SavedReel = {
  id: string;
  title: string;
  channel: string;
  thumbnail: string;
  kind?: "short" | "long";
};

type TabId = "all" | "message" | "post" | "reels";
const TABS: { id: TabId; label: string; icon: React.ComponentProps<typeof Feather>["name"] }[] = [
  { id: "all", label: "All", icon: "bookmark" },
  { id: "message", label: "Messages", icon: "message-square" },
  { id: "post", label: "Posts", icon: "file-text" },
  { id: "reels", label: "Reels", icon: "film" },
];

function watchUrl(r: SavedReel): string {
  return r.kind === "long"
    ? `https://www.youtube.com/watch?v=${r.id}`
    : `https://www.youtube.com/shorts/${r.id}`;
}

async function loadSavedReels(): Promise<SavedReel[]> {
  try {
    const raw = await AsyncStorage.getItem(REELS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as SavedReel[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

async function persistSavedReels(items: SavedReel[]): Promise<void> {
  try {
    await AsyncStorage.setItem(REELS_KEY, JSON.stringify(items));
  } catch {
    /* ignore quota */
  }
}

export default function SavedScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const [tab, setTab] = useState<TabId>("all");

  const bookmarksKind: GetMyBookmarksKind | undefined =
    tab === "message" ? "message" : tab === "post" ? "post" : undefined;
  const queryParams = bookmarksKind ? { kind: bookmarksKind } : undefined;
  const queryKey = getGetMyBookmarksQueryKey(queryParams);
  const bookmarks = useGetMyBookmarks(queryParams, {
    query: { queryKey, enabled: tab !== "reels" },
  });

  const removeBookmark = useDeleteBookmark({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey });
      },
    },
  });

  const [reels, setReels] = useState<SavedReel[]>([]);
  const [reelsLoading, setReelsLoading] = useState(true);

  const refreshReels = useCallback(async () => {
    setReelsLoading(true);
    const next = await loadSavedReels();
    setReels(next);
    setReelsLoading(false);
  }, []);

  useEffect(() => {
    void refreshReels();
  }, [refreshReels]);

  useFocusEffect(
    useCallback(() => {
      void refreshReels();
    }, [refreshReels]),
  );

  const removeReel = useCallback(async (id: string) => {
    setReels((prev) => {
      const next = prev.filter((r) => r.id !== id);
      void persistSavedReels(next);
      return next;
    });
  }, []);

  const data = bookmarks.data ?? [];

  const reelColumns = 2;

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.header,
          { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 12) },
        ]}
      >
        <Text style={[styles.title, { color: colors.foreground }]}>Saved</Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          Your bookmarked posts, messages, and reels
        </Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabs}
        >
          {TABS.map(({ id, label, icon }) => {
            const active = tab === id;
            return (
              <Pressable
                key={id}
                onPress={() => setTab(id)}
                testID={`tab-saved-${id}`}
                style={[
                  styles.tab,
                  {
                    backgroundColor: active ? colors.primary : colors.muted,
                    borderColor: colors.border,
                  },
                ]}
              >
                <Feather
                  name={icon}
                  size={14}
                  color={active ? colors.primaryForeground : colors.mutedForeground}
                />
                <Text
                  style={[
                    styles.tabLabel,
                    {
                      color: active
                        ? colors.primaryForeground
                        : colors.mutedForeground,
                    },
                  ]}
                >
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {tab === "reels" ? (
        reelsLoading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : reelData.length === 0 ? (
          <EmptyState
            icon="film"
            title="No saved reels yet"
            subtitle="Bookmark a reel from the Reels page on the web to watch it later here."
          />
        ) : (
          <FlatList
            data={reels}
            key={`reels-${reelColumns}`}
            keyExtractor={(r) => r.id}
            numColumns={reelColumns}
            columnWrapperStyle={{ gap: 10, paddingHorizontal: 16 }}
            contentContainerStyle={{
              paddingBottom: insets.bottom + 100,
              gap: 10,
            }}
            refreshControl={
              <RefreshControl
                refreshing={reelsLoading}
                onRefresh={() => void refreshReels()}
                tintColor={colors.primary}
              />
            }
            renderItem={({ item }) => (
              <Pressable
                testID={`saved-reel-${item.id}`}
                onPress={() => {
                  Linking.openURL(watchUrl(item)).catch(() => {
                    Alert.alert(
                      "Could not open YouTube",
                      "Please try again.",
                    );
                  });
                }}
                style={[
                  styles.reelCard,
                  { backgroundColor: colors.card, borderColor: colors.border },
                ]}
              >
                <Image
                  source={{ uri: item.thumbnail }}
                  style={styles.reelThumb}
                />
                <View style={styles.reelMeta}>
                  <Text
                    numberOfLines={2}
                    style={[styles.reelTitle, { color: colors.foreground }]}
                  >
                    {item.title}
                  </Text>
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.reelChannel,
                      { color: colors.mutedForeground },
                    ]}
                  >
                    {item.channel}
                  </Text>
                  <Pressable
                    testID={`button-remove-reel-${item.id}`}
                    onPress={() => {
                      Alert.alert(
                        "Remove from watch later?",
                        item.title,
                        [
                          { text: "Cancel", style: "cancel" },
                          {
                            text: "Remove",
                            style: "destructive",
                            onPress: () => void removeReel(item.id),
                          },
                        ],
                      );
                    }}
                    style={styles.reelRemove}
                  >
                    <Feather
                      name="trash-2"
                      size={14}
                      color={colors.destructive}
                    />
                    <Text
                      style={[
                        styles.reelRemoveLabel,
                        { color: colors.destructive },
                      ]}
                    >
                      Remove
                    </Text>
                  </Pressable>
                </View>
              </Pressable>
            )}
          />
        )
      ) : bookmarks.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : data.length === 0 ? (
        <EmptyState
          icon="bookmark"
          title="Nothing saved yet"
          subtitle="Bookmark posts and messages to find them here later."
        />
      ) : (
        <FlatList
          data={data}
          keyExtractor={(b) => String(b.id)}
          contentContainerStyle={{
            paddingBottom: insets.bottom + 100,
            paddingHorizontal: 16,
            gap: 10,
          }}
          refreshControl={
            <RefreshControl
              refreshing={bookmarks.isFetching && !bookmarks.isLoading}
              onRefresh={() => bookmarks.refetch()}
              tintColor={colors.primary}
            />
          }
          renderItem={({ item }) => (
            <BookmarkRow
              item={item}
              onRemove={() =>
                removeBookmark.mutate({ id: item.id })
              }
            />
          )}
        />
      )}
    </View>
  );
}

function BookmarkRow({
  item,
  onRemove,
}: {
  item: Bookmark;
  onRemove: () => void;
}) {
  const colors = useColors();
  const isMessage = item.kind === "message";
  const target = item.target;

  return (
    <View
      testID={`saved-${item.id}`}
      style={[
        styles.bookmarkCard,
        { backgroundColor: colors.card, borderColor: colors.border },
      ]}
    >
      <View style={styles.bookmarkHeader}>
        <View style={styles.bookmarkKind}>
          <Feather
            name={isMessage ? "message-square" : "file-text"}
            size={13}
            color={colors.mutedForeground}
          />
          <Text style={[styles.bookmarkKindText, { color: colors.mutedForeground }]}>
            {isMessage ? "Message" : "Post"}
            {target?.author?.username ? ` · @${target.author.username}` : ""}
            {target?.roomTag ? ` · #${target.roomTag}` : ""}
          </Text>
        </View>
        <Pressable
          testID={`button-remove-saved-${item.id}`}
          onPress={() =>
            Alert.alert("Remove bookmark?", undefined, [
              { text: "Cancel", style: "cancel" },
              { text: "Remove", style: "destructive", onPress: onRemove },
            ])
          }
          hitSlop={8}
        >
          <Feather name="trash-2" size={16} color={colors.destructive} />
        </Pressable>
      </View>
      {target?.snippet ? (
        <Text
          style={[
            styles.bookmarkSnippet,
            {
              color: target.deleted ? colors.mutedForeground : colors.foreground,
              fontStyle: target.deleted ? "italic" : "normal",
            },
          ]}
        >
          {target.snippet}
        </Text>
      ) : null}
      {item.note ? (
        <View
          style={[
            styles.noteBox,
            { backgroundColor: colors.muted, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.noteText, { color: colors.mutedForeground }]}>
            Note: {item.note}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  header: { paddingHorizontal: 16, paddingBottom: 8 },
  title: { fontSize: 32, fontFamily: "Inter_700Bold" },
  subtitle: { fontSize: 14, fontFamily: "Inter_400Regular", marginTop: 2 },
  tabs: { flexDirection: "row", gap: 8, paddingTop: 12, paddingRight: 16 },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  tabLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  reelCard: {
    flex: 1,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  reelThumb: { width: "100%", aspectRatio: 16 / 9, backgroundColor: "#000" },
  reelMeta: { padding: 10, gap: 4 },
  reelTitle: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  reelChannel: { fontSize: 11, fontFamily: "Inter_400Regular" },
  reelRemove: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 4,
  },
  reelRemoveLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  bookmarkCard: {
    padding: 12,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  bookmarkHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  bookmarkKind: { flexDirection: "row", alignItems: "center", gap: 6, flex: 1 },
  bookmarkKindText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  bookmarkSnippet: { fontSize: 14, fontFamily: "Inter_400Regular" },
  noteBox: {
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 8,
  },
  noteText: { fontSize: 12, fontFamily: "Inter_400Regular", fontStyle: "italic" },
});
