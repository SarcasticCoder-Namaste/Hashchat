import { BlurView } from "expo-blur";
import { isLiquidGlassAvailable } from "expo-glass-effect";
import { Tabs } from "expo-router";
import {
  Badge,
  Icon,
  Label,
  NativeTabs,
} from "expo-router/unstable-native-tabs";
import { Feather } from "@expo/vector-icons";
import React from "react";
import { Platform, StyleSheet, View, useColorScheme } from "react-native";

import { ScheduledDmBanner } from "@/components/ScheduledDmBanner";
import { useColors } from "@/hooks/useColors";
import {
  getGetUnreadNotificationCountQueryKey,
  useGetUnreadNotificationCount,
} from "@workspace/api-client-react";

function useUnreadCounts() {
  const { data } = useGetUnreadNotificationCount({
    query: {
      queryKey: getGetUnreadNotificationCountQueryKey(),
      refetchInterval: 10000,
      refetchOnWindowFocus: true,
    },
  });
  return {
    dms: data?.dms ?? 0,
    notifications: data?.notifications ?? 0,
  };
}

function formatBadge(count: number): string | undefined {
  if (count <= 0) return undefined;
  return count > 99 ? "99+" : String(count);
}

function NativeTabLayout() {
  const { dms, notifications } = useUnreadCounts();
  const dmsBadge = formatBadge(dms);
  const notifBadge = formatBadge(notifications);
  return (
    <NativeTabs>
      <NativeTabs.Trigger name="index">
        <Icon sf={{ default: "house", selected: "house.fill" }} />
        <Label>Home</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="discover">
        <Icon sf={{ default: "number", selected: "number.square.fill" }} />
        <Label>Discover</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="chats">
        <Icon
          sf={{ default: "bubble.left", selected: "bubble.left.fill" }}
        />
        <Label>Chats</Label>
        {dmsBadge ? <Badge>{dmsBadge}</Badge> : <Badge hidden />}
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="notifications">
        <Icon sf={{ default: "bell", selected: "bell.fill" }} />
        <Label>Activity</Label>
        {notifBadge ? <Badge>{notifBadge}</Badge> : <Badge hidden />}
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="saved">
        <Icon sf={{ default: "bookmark", selected: "bookmark.fill" }} />
        <Label>Saved</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="profile">
        <Icon sf={{ default: "person", selected: "person.fill" }} />
        <Label>Profile</Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

function ClassicTabLayout() {
  const colors = useColors();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const isIOS = Platform.OS === "ios";
  const isWeb = Platform.OS === "web";
  const { dms, notifications } = useUnreadCounts();
  const dmsBadge = formatBadge(dms);
  const notifBadge = formatBadge(notifications);

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        headerShown: false,
        tabBarShowLabel: false,
        tabBarStyle: {
          position: "absolute",
          backgroundColor: isIOS ? "transparent" : colors.background,
          borderTopWidth: isWeb ? 1 : StyleSheet.hairlineWidth,
          borderTopColor: colors.border,
          elevation: 0,
          ...(isWeb ? { height: 84 } : {}),
        },
        tabBarBackground: () =>
          isIOS ? (
            <BlurView
              intensity={100}
              tint={isDark ? "dark" : "light"}
              style={StyleSheet.absoluteFill}
            />
          ) : isWeb ? (
            <View
              style={[
                StyleSheet.absoluteFill,
                { backgroundColor: colors.background },
              ]}
            />
          ) : null,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          tabBarIcon: ({ color }) => (
            <Feather name="home" size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="discover"
        options={{
          tabBarIcon: ({ color }) => (
            <Feather name="hash" size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="chats"
        options={{
          tabBarIcon: ({ color }) => (
            <Feather name="message-circle" size={22} color={color} />
          ),
          tabBarBadge: dmsBadge,
          tabBarBadgeStyle: {
            backgroundColor: colors.primary,
            color: colors.primaryForeground,
            fontSize: 10,
            minWidth: 16,
            height: 16,
            lineHeight: 16,
          },
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          tabBarIcon: ({ color }) => (
            <Feather name="bell" size={22} color={color} />
          ),
          tabBarBadge: notifBadge,
          tabBarBadgeStyle: {
            backgroundColor: colors.primary,
            color: colors.primaryForeground,
            fontSize: 10,
            minWidth: 16,
            height: 16,
            lineHeight: 16,
          },
        }}
      />
      <Tabs.Screen
        name="saved"
        options={{
          tabBarIcon: ({ color }) => (
            <Feather name="bookmark" size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          tabBarIcon: ({ color }) => (
            <Feather name="user" size={22} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}

export default function TabLayout() {
  return (
    <>
      {isLiquidGlassAvailable() ? <NativeTabLayout /> : <ClassicTabLayout />}
      <ScheduledDmBanner />
    </>
  );
}
