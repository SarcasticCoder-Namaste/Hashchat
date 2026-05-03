import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { ClerkProvider, useAuth } from "@clerk/clerk-expo";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  setAuthTokenGetter,
  setBaseUrl,
} from "@workspace/api-client-react";
import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useRef } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { tokenCache } from "@/lib/clerkTokenCache";
import {
  registerForPushNotifications,
  unregisterPushNotifications,
} from "@/lib/registerPush";

SplashScreen.preventAutoHideAsync();

const PUBLISHABLE_KEY =
  process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "";

const DOMAIN = process.env.EXPO_PUBLIC_DOMAIN;
if (DOMAIN) {
  setBaseUrl(`https://${DOMAIN}`);
}

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

function AuthBridge({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const router = useRouter();
  const segments = useSegments();
  const tokenRegistered = useRef(false);

  useEffect(() => {
    setAuthTokenGetter(async () => {
      try {
        return (await getToken()) ?? null;
      } catch {
        return null;
      }
    });
  }, [getToken]);

  useEffect(() => {
    if (!isLoaded) return;
    const inAuth = segments[0] === "(auth)";
    if (!isSignedIn && !inAuth) {
      router.replace("/(auth)/sign-in");
    } else if (isSignedIn && inAuth) {
      router.replace("/(tabs)");
    }
  }, [isLoaded, isSignedIn, segments, router]);

  useEffect(() => {
    if (!isLoaded) return;
    if (isSignedIn && !tokenRegistered.current) {
      tokenRegistered.current = true;
      void registerForPushNotifications();
    }
    if (!isSignedIn && tokenRegistered.current) {
      tokenRegistered.current = false;
      void unregisterPushNotifications();
    }
  }, [isLoaded, isSignedIn]);

  return <>{children}</>;
}

function RootLayoutNav() {
  return (
    <Stack screenOptions={{ headerBackTitle: "Back" }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      <Stack.Screen
        name="chat/[id]"
        options={{ headerShown: true, title: "" }}
      />
      <Stack.Screen
        name="room/[tag]"
        options={{ headerShown: true, title: "" }}
      />
      <Stack.Screen
        name="compose"
        options={{
          headerShown: false,
          presentation: "modal",
          animation: "slide_from_bottom",
        }}
      />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  if (!PUBLISHABLE_KEY) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <ClerkProvider publishableKey={PUBLISHABLE_KEY} tokenCache={tokenCache}>
          <QueryClientProvider client={queryClient}>
            <GestureHandlerRootView style={{ flex: 1 }}>
              <KeyboardProvider>
                <AuthBridge>
                  <RootLayoutNav />
                </AuthBridge>
              </KeyboardProvider>
            </GestureHandlerRootView>
          </QueryClientProvider>
        </ClerkProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
