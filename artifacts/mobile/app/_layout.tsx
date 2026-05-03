import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { ClerkProvider, useAuth } from "@clerk/clerk-expo";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { QueryClient } from "@tanstack/react-query";
import {
  createAsyncStoragePersister,
} from "@tanstack/query-async-storage-persister";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";

import {
  boundQueryData,
  shouldDehydrateQuery,
} from "@/lib/queryPersistConfig";

type PersistedQuery = {
  queryKey: readonly unknown[];
  state: { status: string; data: unknown };
};
type PersistedClientLike = {
  clientState: { queries: PersistedQuery[]; [k: string]: unknown };
  [k: string]: unknown;
};
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
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      // Keep cached data around for 24h so the app shows last-seen feeds and
      // conversations when launched without connectivity.
      gcTime: 1000 * 60 * 60 * 24,
      staleTime: 1000 * 30,
    },
  },
});

const baseQueryPersister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: "hashchat-query-cache-v1",
  throttleTime: 1500,
});

// Wrap the persister so we cap each persisted query's data to a sane number
// of items before writing to AsyncStorage. This keeps the on-disk cache
// bounded (last N feed posts / conversations / messages) so storage doesn't
// grow without limit even after weeks of use.
const queryPersister: typeof baseQueryPersister = {
  ...baseQueryPersister,
  persistClient: async (client) => {
    const c = client as unknown as PersistedClientLike;
    const trimmed = {
      ...c,
      clientState: {
        ...c.clientState,
        queries: c.clientState.queries.map((q) => {
          if (q.state.status !== "success") return q;
          const data = boundQueryData(q.queryKey, q.state.data);
          if (data === q.state.data) return q;
          return { ...q, state: { ...q.state, data } };
        }),
      },
    };
    await baseQueryPersister.persistClient(
      trimmed as unknown as Parameters<typeof baseQueryPersister.persistClient>[0],
    );
  },
};

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
      <Stack.Screen
        name="invite"
        options={{ headerShown: true, title: "Invite friends" }}
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
          <PersistQueryClientProvider
            client={queryClient}
            persistOptions={{
              persister: queryPersister,
              maxAge: 1000 * 60 * 60 * 24,
              buster: "v2",
              dehydrateOptions: { shouldDehydrateQuery },
            }}
          >
            <GestureHandlerRootView style={{ flex: 1 }}>
              <KeyboardProvider>
                <AuthBridge>
                  <RootLayoutNav />
                </AuthBridge>
              </KeyboardProvider>
            </GestureHandlerRootView>
          </PersistQueryClientProvider>
        </ClerkProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
