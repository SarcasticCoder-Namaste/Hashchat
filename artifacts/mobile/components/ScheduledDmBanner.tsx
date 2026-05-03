import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";
import {
  getGetNotificationsQueryKey,
  NotificationKind,
  useGetNotifications,
} from "@workspace/api-client-react";

const SCHEDULED_DM_KINDS: ReadonlySet<string> = new Set<string>([
  NotificationKind.scheduled_dm_delivered,
  NotificationKind.scheduled_dm_failed,
]);

const VISIBLE_MS = 5000;

type Banner = {
  id: number;
  isFail: boolean;
  title: string;
  snippet: string | null;
  href: string | null;
};

function hrefToRoute(href: string | null): string | null {
  if (!href) return null;
  // Server-built hrefs look like "/app/messages/<id>" for DM conversations.
  // Map those to the mobile chat route.
  const m = href.match(/^\/app\/messages\/([^/?#]+)/);
  if (m) return `/chat/${m[1]}`;
  return null;
}

export function ScheduledDmBanner() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const notif = useGetNotifications(undefined, {
    query: {
      queryKey: getGetNotificationsQueryKey(),
      refetchInterval: 10000,
    },
  });

  const seenIdsRef = useRef<Set<number> | null>(null);
  const [banner, setBanner] = useState<Banner | null>(null);
  const translateY = useRef(new Animated.Value(-120)).current;
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const items = notif.data?.items;
    if (!items) return;
    if (seenIdsRef.current === null) {
      seenIdsRef.current = new Set(items.map((n) => n.id));
      return;
    }
    const seen = seenIdsRef.current;
    let next: Banner | null = null;
    for (const n of items) {
      if (seen.has(n.id)) continue;
      seen.add(n.id);
      if (!SCHEDULED_DM_KINDS.has(n.kind)) continue;
      const isFail = n.kind === NotificationKind.scheduled_dm_failed;
      next = {
        id: n.id,
        isFail,
        title: isFail
          ? "Scheduled DM couldn't be delivered"
          : "Scheduled DM delivered",
        snippet: n.snippet ?? null,
        href: n.href ?? null,
      };
    }
    if (next) setBanner(next);
  }, [notif.data]);

  useEffect(() => {
    if (!banner) return;
    Animated.spring(translateY, {
      toValue: 0,
      useNativeDriver: true,
      damping: 18,
      stiffness: 180,
    }).start();
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
    dismissTimer.current = setTimeout(() => {
      Animated.timing(translateY, {
        toValue: -120,
        duration: 200,
        useNativeDriver: true,
      }).start(() => setBanner(null));
    }, VISIBLE_MS);
    return () => {
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
    };
  }, [banner, translateY]);

  if (!banner) return null;

  const isFail = banner.isFail;
  const route = hrefToRoute(banner.href);

  const onPress = () => {
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
    Animated.timing(translateY, {
      toValue: -120,
      duration: 150,
      useNativeDriver: true,
    }).start(() => setBanner(null));
    if (route) router.push(route as never);
  };

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        styles.wrap,
        {
          paddingTop: insets.top + (Platform.OS === "web" ? 12 : 8),
          transform: [{ translateY }],
        },
      ]}
    >
      <Pressable
        onPress={onPress}
        accessibilityRole="alert"
        testID="banner-scheduled-dm"
        style={({ pressed }) => [
          styles.card,
          {
            backgroundColor: isFail ? colors.destructive : colors.card,
            borderColor: isFail ? colors.destructive : colors.border,
            opacity: pressed ? 0.9 : 1,
          },
        ]}
      >
        <Feather
          name={isFail ? "alert-triangle" : "send"}
          size={18}
          color={isFail ? colors.destructiveForeground : colors.primary}
        />
        <View style={{ flex: 1 }}>
          <Text
            numberOfLines={1}
            style={[
              styles.title,
              {
                color: isFail
                  ? colors.destructiveForeground
                  : colors.foreground,
              },
            ]}
          >
            {banner.title}
          </Text>
          {banner.snippet ? (
            <Text
              numberOfLines={1}
              style={[
                styles.snippet,
                {
                  color: isFail
                    ? colors.destructiveForeground
                    : colors.mutedForeground,
                },
              ]}
            >
              {banner.snippet}
            </Text>
          ) : null}
        </View>
        {route ? (
          <Text
            style={[
              styles.cta,
              {
                color: isFail
                  ? colors.destructiveForeground
                  : colors.primary,
              },
            ]}
          >
            View
          </Text>
        ) : null}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 12,
    zIndex: 1000,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  title: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  snippet: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
  cta: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
});
