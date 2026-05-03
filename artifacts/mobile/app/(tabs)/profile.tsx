import { useAuth, useUser } from "@clerk/clerk-expo";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Avatar } from "@/components/Avatar";
import { SparkComposer, SparksRow } from "@/components/SparksPanel";
import { StreakBadge } from "@/components/StreakBadge";
import { useColors } from "@/hooks/useColors";
import { unregisterPushNotifications } from "@/lib/registerPush";
import { useGetMe } from "@workspace/api-client-react";

export default function ProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { signOut } = useAuth();
  const { user } = useUser();
  const me = useGetMe();
  const router = useRouter();

  async function handleSignOut() {
    try {
      await unregisterPushNotifications();
    } catch {
      // ignore
    }
    await signOut();
  }

  if (me.isLoading) {
    return (
      <View
        style={[
          styles.center,
          { backgroundColor: colors.background },
        ]}
      >
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const profile = me.data;
  const name =
    profile?.displayName ??
    user?.fullName ??
    user?.emailAddresses?.[0]?.emailAddress ??
    "You";
  const handle = profile?.username ? `@${profile.username}` : null;
  const avatar = profile?.avatarUrl ?? user?.imageUrl ?? null;

  return (
    <ScrollView
      style={[styles.wrap, { backgroundColor: colors.background }]}
      contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}
    >
      <LinearGradient
        colors={["#7c3aed", "#db2777"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.banner, { paddingTop: insets.top + 24 }]}
      >
        <Avatar url={avatar} name={name} size={88} />
        <View style={styles.nameRow}>
          <Text style={styles.name}>{name}</Text>
          <StreakBadge />
        </View>
        {handle ? <Text style={styles.handle}>{handle}</Text> : null}
        {profile?.bio ? <Text style={styles.bio}>{profile.bio}</Text> : null}
      </LinearGradient>

      <View style={styles.section}>
        <SparkComposer />
      </View>

      <View style={{ paddingVertical: 4 }}>
        <SparksRow scope={{ kind: "me" }} canDelete />
      </View>

      {profile?.hashtags?.length ? (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>
            Your hashtags
          </Text>
          <View style={styles.tagWrap}>
            {profile.hashtags.map((t) => (
              <View
                key={t}
                style={[styles.tag, { backgroundColor: colors.accent }]}
              >
                <Text
                  style={{
                    color: colors.accentForeground,
                    fontFamily: "Inter_600SemiBold",
                    fontSize: 13,
                  }}
                >
                  #{t}
                </Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      <View style={styles.section}>
        <Pressable
          onPress={() => router.push("/invite" as never)}
          style={[
            styles.inviteRow,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
            },
          ]}
        >
          <LinearGradient
            colors={["#7c3aed", "#db2777"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.inviteIcon}
          >
            <Feather name="gift" size={16} color="#fff" />
          </LinearGradient>
          <View style={{ flex: 1 }}>
            <Text style={[styles.inviteTitle, { color: colors.foreground }]}>
              Invite friends
            </Text>
            <Text
              style={[styles.inviteSub, { color: colors.mutedForeground }]}
            >
              Earn free MVP days for every friend who joins
            </Text>
          </View>
          <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
        </Pressable>
      </View>

      <View style={styles.section}>
        <Pressable
          onPress={() => router.push("/security" as never)}
          style={[
            styles.linkRow,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
          testID="link-security"
        >
          <View
            style={[
              styles.linkIcon,
              { backgroundColor: "rgba(16,185,129,0.15)" },
            ]}
          >
            <Feather name="shield" size={16} color="#10b981" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.inviteTitle, { color: colors.foreground }]}>
              Security
            </Text>
            <Text
              style={[styles.inviteSub, { color: colors.mutedForeground }]}
            >
              Two-factor authentication & active sessions
            </Text>
          </View>
          <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
        </Pressable>

        <Pressable
          onPress={() => router.push("/reports" as never)}
          style={[
            styles.linkRow,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
          testID="link-my-reports"
        >
          <View
            style={[
              styles.linkIcon,
              { backgroundColor: "rgba(14,165,233,0.15)" },
            ]}
          >
            <Feather name="flag" size={16} color="#0ea5e9" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.inviteTitle, { color: colors.foreground }]}>
              My reports
            </Text>
            <Text
              style={[styles.inviteSub, { color: colors.mutedForeground }]}
            >
              Track report status and appeal decisions
            </Text>
          </View>
          <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
        </Pressable>
      </View>

      <View style={styles.section}>
        <Pressable
          onPress={handleSignOut}
          style={[
            styles.signOut,
            {
              backgroundColor: colors.muted,
              borderColor: colors.border,
            },
          ]}
        >
          <Feather name="log-out" size={18} color={colors.destructive} />
          <Text
            style={{
              color: colors.destructive,
              fontFamily: "Inter_600SemiBold",
              fontSize: 15,
            }}
          >
            Sign out
          </Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  banner: {
    alignItems: "center",
    paddingHorizontal: 24,
    paddingBottom: 32,
    gap: 8,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 12,
  },
  name: { color: "#fff", fontSize: 22, fontFamily: "Inter_700Bold" },
  inviteRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  inviteIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  linkIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  inviteTitle: { fontFamily: "Inter_600SemiBold", fontSize: 14 },
  inviteSub: { fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 2 },
  handle: { color: "rgba(255,255,255,0.85)", fontSize: 15, fontFamily: "Inter_500Medium" },
  bio: {
    color: "rgba(255,255,255,0.95)",
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    marginTop: 8,
  },
  section: { padding: 20, gap: 12 },
  sectionTitle: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  tagWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tag: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  signOut: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 14,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
