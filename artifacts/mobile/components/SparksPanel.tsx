import { Feather } from "@expo/vector-icons";
import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { Avatar } from "@/components/Avatar";
import { useColors } from "@/hooks/useColors";
import {
  getGetHashtagSparksQueryKey,
  getGetMySparksQueryKey,
  getGetUserSparksQueryKey,
  useCreateSpark,
  useDeleteSpark,
  useGetHashtagSparks,
  useGetMySparks,
  useGetUserSparks,
  type Spark,
} from "@workspace/api-client-react";

function timeRemaining(expiresAt: string): string {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return "expired";
  const hours = Math.floor(ms / 3_600_000);
  if (hours >= 1) return `${hours}h left`;
  const minutes = Math.max(1, Math.floor(ms / 60_000));
  return `${minutes}m left`;
}

export function SparkComposer({ defaultTag }: { defaultTag?: string }) {
  const colors = useColors();
  const qc = useQueryClient();
  const [content, setContent] = useState("");
  const create = useCreateSpark({
    mutation: {
      onSuccess: () => {
        setContent("");
        qc.invalidateQueries({ queryKey: getGetMySparksQueryKey() });
        if (defaultTag) {
          qc.invalidateQueries({
            queryKey: getGetHashtagSparksQueryKey(defaultTag),
          });
        }
      },
      onError: () =>
        Alert.alert("Could not post Spark", "Please try again."),
    },
  });

  function submit() {
    const trimmed = content.trim();
    if (!trimmed) return;
    create.mutate({
      data: {
        content: trimmed,
        imageUrl: null,
        hashtags: defaultTag ? [defaultTag] : [],
      },
    });
  }

  const disabled = create.isPending || !content.trim();
  return (
    <View
      style={[
        styles.composer,
        { backgroundColor: colors.card, borderColor: colors.border },
      ]}
    >
      <View style={styles.composerHeader}>
        <LinearGradient
          colors={["#fbbf24", "#f97316"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.composerIcon}
        >
          <Feather name="zap" size={11} color="#fff" />
        </LinearGradient>
        <Text style={[styles.composerTitle, { color: colors.foreground }]}>
          Drop a Spark{defaultTag ? ` in #${defaultTag}` : ""}
        </Text>
        <Text
          style={[styles.composerHint, { color: colors.mutedForeground }]}
        >
          Vanishes in 24h
        </Text>
      </View>
      <TextInput
        value={content}
        onChangeText={(t) => setContent(t.slice(0, 280))}
        placeholder="What's lighting up your day?"
        placeholderTextColor={colors.mutedForeground}
        multiline
        style={[
          styles.input,
          {
            color: colors.foreground,
            backgroundColor: colors.background,
            borderColor: colors.border,
          },
        ]}
      />
      <View style={styles.composerFoot}>
        <Text style={[styles.count, { color: colors.mutedForeground }]}>
          {content.length}/280
        </Text>
        <Pressable
          onPress={submit}
          disabled={disabled}
          style={({ pressed }) => [
            styles.btn,
            {
              backgroundColor: disabled ? colors.muted : colors.primary,
              opacity: pressed ? 0.85 : 1,
            },
          ]}
        >
          {create.isPending ? (
            <ActivityIndicator
              size="small"
              color={colors.primaryForeground}
            />
          ) : (
            <>
              <Feather
                name="zap"
                size={12}
                color={
                  disabled ? colors.mutedForeground : colors.primaryForeground
                }
              />
              <Text
                style={{
                  color: disabled
                    ? colors.mutedForeground
                    : colors.primaryForeground,
                  fontFamily: "Inter_600SemiBold",
                  fontSize: 13,
                }}
              >
                Spark
              </Text>
            </>
          )}
        </Pressable>
      </View>
    </View>
  );
}

function SparkCard({
  spark,
  canDelete,
  onDelete,
}: {
  spark: Spark;
  canDelete?: boolean;
  onDelete?: (id: number) => void;
}) {
  const colors = useColors();
  return (
    <LinearGradient
      colors={["rgba(251, 191, 36, 0.15)", "rgba(249, 115, 22, 0.15)"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[
        styles.card,
        { borderColor: colors.border, backgroundColor: colors.card },
      ]}
    >
      <View style={styles.cardHeader}>
        <Avatar
          url={spark.author?.animatedAvatarUrl ?? spark.author?.avatarUrl}
          name={spark.author?.displayName}
          size={20}
        />
        <Text
          numberOfLines={1}
          style={[styles.cardAuthor, { color: colors.foreground }]}
        >
          {spark.author?.displayName ?? "Unknown"}
        </Text>
        {canDelete && onDelete && (
          <Pressable
            onPress={() => onDelete(spark.id)}
            hitSlop={6}
            style={{ marginLeft: "auto" }}
          >
            <Feather name="x" size={12} color={colors.mutedForeground} />
          </Pressable>
        )}
      </View>
      {spark.imageUrl && (
        <Image
          source={{ uri: spark.imageUrl }}
          style={styles.cardImage}
          contentFit="cover"
        />
      )}
      {spark.content ? (
        <Text
          numberOfLines={4}
          style={[styles.cardBody, { color: colors.foreground }]}
        >
          {spark.content}
        </Text>
      ) : null}
      {spark.hashtags.length > 0 && (
        <View style={styles.tagRow}>
          {spark.hashtags.slice(0, 3).map((t) => (
            <View
              key={t}
              style={[styles.tag, { backgroundColor: colors.muted }]}
            >
              <Text
                style={[styles.tagText, { color: colors.mutedForeground }]}
              >
                #{t}
              </Text>
            </View>
          ))}
        </View>
      )}
      <View style={styles.timeRow}>
        <Feather name="clock" size={9} color={colors.mutedForeground} />
        <Text style={[styles.timeText, { color: colors.mutedForeground }]}>
          {timeRemaining(spark.expiresAt)}
        </Text>
      </View>
    </LinearGradient>
  );
}

export function SparksRow({
  scope,
  canDelete,
}: {
  scope:
    | { kind: "me" }
    | { kind: "user"; username: string }
    | { kind: "hashtag"; tag: string };
  canDelete?: boolean;
}) {
  const colors = useColors();
  const qc = useQueryClient();
  const meSparks = useGetMySparks({
    query: {
      queryKey: getGetMySparksQueryKey() as QueryKey,
      enabled: scope.kind === "me",
    },
  });
  const userSparks = useGetUserSparks(
    scope.kind === "user" ? scope.username : "",
    {
      query: {
        queryKey: getGetUserSparksQueryKey(
          scope.kind === "user" ? scope.username : "",
        ) as QueryKey,
        enabled: scope.kind === "user",
      },
    },
  );
  const tagSparks = useGetHashtagSparks(
    scope.kind === "hashtag" ? scope.tag : "",
    {
      query: {
        queryKey: getGetHashtagSparksQueryKey(
          scope.kind === "hashtag" ? scope.tag : "",
        ) as QueryKey,
        enabled: scope.kind === "hashtag",
      },
    },
  );
  const del = useDeleteSpark({
    mutation: {
      onSuccess: () => {
        if (scope.kind === "me") {
          qc.invalidateQueries({ queryKey: getGetMySparksQueryKey() });
        } else if (scope.kind === "user") {
          qc.invalidateQueries({
            queryKey: getGetUserSparksQueryKey(scope.username),
          });
        } else {
          qc.invalidateQueries({
            queryKey: getGetHashtagSparksQueryKey(scope.tag),
          });
        }
      },
    },
  });

  const sparks =
    scope.kind === "me"
      ? meSparks.data
      : scope.kind === "user"
        ? userSparks.data
        : tagSparks.data;
  if (!sparks || sparks.length === 0) return null;

  return (
    <View style={{ gap: 8 }}>
      <View style={styles.sectionHeader}>
        <Feather name="zap" size={12} color="#f59e0b" />
        <Text
          style={[styles.sectionTitle, { color: colors.mutedForeground }]}
        >
          Sparks · 24h
        </Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8, paddingRight: 16 }}
      >
        {sparks.map((s) => (
          <SparkCard
            key={s.id}
            spark={s}
            canDelete={canDelete}
            onDelete={(id) => del.mutate({ id })}
          />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  composer: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    padding: 12,
    gap: 10,
  },
  composerHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  composerIcon: {
    width: 22,
    height: 22,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  composerTitle: { fontFamily: "Inter_600SemiBold", fontSize: 12, flex: 1 },
  composerHint: { fontFamily: "Inter_400Regular", fontSize: 10 },
  input: {
    minHeight: 56,
    maxHeight: 120,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    textAlignVertical: "top",
  },
  composerFoot: { flexDirection: "row", alignItems: "center", gap: 8 },
  count: { fontFamily: "Inter_400Regular", fontSize: 10 },
  btn: {
    marginLeft: "auto",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    minWidth: 76,
    justifyContent: "center",
  },
  card: {
    width: 176,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 12,
    gap: 6,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
  cardAuthor: {
    flex: 1,
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
  },
  cardImage: {
    width: "100%",
    height: 96,
    borderRadius: 8,
    backgroundColor: "#0001",
  },
  cardBody: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    lineHeight: 16,
  },
  tagRow: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
  tag: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
  },
  tagText: { fontFamily: "Inter_500Medium", fontSize: 9 },
  timeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    marginTop: 2,
  },
  timeText: { fontFamily: "Inter_400Regular", fontSize: 9 },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
  },
  sectionTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
});
