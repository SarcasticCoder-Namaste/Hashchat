import { Feather } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import { LinearGradient } from "expo-linear-gradient";
import { Stack } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";
import {
  getGetMyInviteQueryKey,
  useGetMyInvite,
  useRegenerateMyInvite,
} from "@workspace/api-client-react";

function buildLink(token: string): string {
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  const origin =
    typeof window !== "undefined" && window.location?.origin
      ? window.location.origin
      : domain
        ? `https://${domain}`
        : "https://hashchat.app";
  return `${origin}/invite/${token}`;
}

export default function InviteScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const { data, isLoading } = useGetMyInvite();
  const [copied, setCopied] = useState(false);
  const regen = useRegenerateMyInvite({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetMyInviteQueryKey() });
        Alert.alert("Done", "New invite link generated.");
      },
      onError: () =>
        Alert.alert("Error", "Could not generate a new link."),
    },
  });

  if (isLoading || !data) {
    return (
      <View
        style={[
          styles.center,
          { backgroundColor: colors.background },
        ]}
      >
        <Stack.Screen options={{ title: "Invite friends" }} />
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const link = buildLink(data.token);
  const towardNext = data.progressTowardNext;
  const pct = Math.round((towardNext / data.threshold) * 100);
  const grants = Math.floor(data.totalRedemptions / data.threshold);
  const grantedDays = grants * data.rewardDays;

  async function copy() {
    try {
      await Clipboard.setStringAsync(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      Alert.alert("Could not copy", "Please try sharing instead.");
    }
  }

  async function share() {
    try {
      await Share.share({
        title: "Join me on HashChat",
        message: `Come hang out in hashtag rooms with me! ${link}`,
        url: link,
      });
    } catch {
      // user cancelled
    }
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{
        padding: 16,
        paddingBottom: insets.bottom + 32,
        gap: 16,
      }}
    >
      <Stack.Screen options={{ title: "Invite friends" }} />
      <LinearGradient
        colors={["rgba(124, 58, 237, 0.18)", "rgba(219, 39, 119, 0.18)"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[
          styles.card,
          { borderColor: colors.border, backgroundColor: colors.card },
        ]}
      >
        <View style={styles.cardHeader}>
          <LinearGradient
            colors={["#7c3aed", "#db2777"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.gift}
          >
            <Feather name="gift" size={20} color="#fff" />
          </LinearGradient>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: colors.foreground }]}>
              Invite friends, earn MVP
            </Text>
            <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
              Get {data.rewardDays} days of MVP free for every {data.threshold}{" "}
              friends who sign up.
            </Text>
          </View>
        </View>

        <View style={{ gap: 8 }}>
          <Text style={[styles.label, { color: colors.mutedForeground }]}>
            Your invite link
          </Text>
          <View
            style={[
              styles.linkBox,
              {
                backgroundColor: colors.background,
                borderColor: colors.border,
              },
            ]}
          >
            <Text
              numberOfLines={1}
              style={[styles.linkText, { color: colors.foreground }]}
            >
              {link}
            </Text>
          </View>
          <View style={styles.actions}>
            <Pressable
              onPress={copy}
              style={({ pressed }) => [
                styles.btnOutline,
                {
                  borderColor: colors.border,
                  backgroundColor: colors.background,
                  opacity: pressed ? 0.85 : 1,
                },
              ]}
            >
              <Feather name="copy" size={14} color={colors.foreground} />
              <Text
                style={[styles.btnOutlineText, { color: colors.foreground }]}
              >
                {copied ? "Copied!" : "Copy"}
              </Text>
            </Pressable>
            <Pressable
              onPress={share}
              style={({ pressed }) => [
                styles.btnPrimary,
                {
                  backgroundColor: colors.primary,
                  opacity: pressed ? 0.85 : 1,
                },
              ]}
            >
              <Feather
                name="share-2"
                size={14}
                color={colors.primaryForeground}
              />
              <Text
                style={[
                  styles.btnPrimaryText,
                  { color: colors.primaryForeground },
                ]}
              >
                Share
              </Text>
            </Pressable>
          </View>
        </View>

        <View style={{ gap: 6 }}>
          <View style={styles.progressTop}>
            <Text style={[styles.progressLabel, { color: colors.foreground }]}>
              Next reward in {data.threshold - towardNext}{" "}
              {data.threshold - towardNext === 1 ? "invite" : "invites"}
            </Text>
            <Text
              style={[styles.progressCount, { color: colors.mutedForeground }]}
            >
              {towardNext}/{data.threshold}
            </Text>
          </View>
          <View style={[styles.barTrack, { backgroundColor: colors.muted }]}>
            <LinearGradient
              colors={["#7c3aed", "#db2777"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[styles.barFill, { width: `${pct}%` }]}
            />
          </View>
        </View>

        <View style={styles.statsRow}>
          <Stat
            label="friends joined"
            value={String(data.totalRedemptions)}
            colors={colors}
          />
          <Stat label="rewards earned" value={String(grants)} colors={colors} />
          <Stat
            label="MVP days earned"
            value={String(grantedDays)}
            colors={colors}
          />
        </View>

        <Pressable
          onPress={() => regen.mutate()}
          disabled={regen.isPending}
          style={({ pressed }) => [
            styles.regen,
            {
              borderColor: colors.border,
              opacity: pressed || regen.isPending ? 0.7 : 1,
            },
          ]}
        >
          <Feather
            name="refresh-cw"
            size={14}
            color={colors.mutedForeground}
          />
          <Text
            style={[styles.regenText, { color: colors.mutedForeground }]}
          >
            Generate a new link
          </Text>
        </Pressable>
      </LinearGradient>
    </ScrollView>
  );
}

function Stat({
  label,
  value,
  colors,
}: {
  label: string;
  value: string;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View
      style={[
        styles.stat,
        {
          backgroundColor: colors.background,
          borderColor: colors.border,
        },
      ]}
    >
      <Text style={[styles.statValue, { color: colors.foreground }]}>
        {value}
      </Text>
      <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  card: {
    padding: 18,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 16,
  },
  cardHeader: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  gift: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontFamily: "Inter_700Bold", fontSize: 16 },
  subtitle: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    marginTop: 2,
    lineHeight: 16,
  },
  label: { fontFamily: "Inter_500Medium", fontSize: 11 },
  linkBox: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  linkText: { fontFamily: "Inter_400Regular", fontSize: 12 },
  actions: { flexDirection: "row", gap: 8 },
  btnOutline: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  btnOutlineText: { fontFamily: "Inter_600SemiBold", fontSize: 13 },
  btnPrimary: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
  },
  btnPrimaryText: { fontFamily: "Inter_600SemiBold", fontSize: 13 },
  progressTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  progressLabel: { fontFamily: "Inter_600SemiBold", fontSize: 12 },
  progressCount: { fontFamily: "Inter_400Regular", fontSize: 11 },
  barTrack: { height: 6, borderRadius: 999, overflow: "hidden" },
  barFill: { height: "100%", borderRadius: 999 },
  statsRow: { flexDirection: "row", gap: 8 },
  stat: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 2,
  },
  statValue: { fontFamily: "Inter_700Bold", fontSize: 18 },
  statLabel: { fontFamily: "Inter_400Regular", fontSize: 10 },
  regen: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  regenText: { fontFamily: "Inter_500Medium", fontSize: 12 },
});
