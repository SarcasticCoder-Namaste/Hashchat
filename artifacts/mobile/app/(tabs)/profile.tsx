import { useAuth, useUser } from "@clerk/clerk-expo";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
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
import { useColors } from "@/hooks/useColors";
import { unregisterPushNotifications } from "@/lib/registerPush";
import { useGetMe } from "@workspace/api-client-react";

export default function ProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { signOut } = useAuth();
  const { user } = useUser();
  const me = useGetMe();

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
        <Text style={styles.name}>{name}</Text>
        {handle ? <Text style={styles.handle}>{handle}</Text> : null}
        {profile?.bio ? <Text style={styles.bio}>{profile.bio}</Text> : null}
      </LinearGradient>

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
  name: { color: "#fff", fontSize: 22, fontFamily: "Inter_700Bold", marginTop: 12 },
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
