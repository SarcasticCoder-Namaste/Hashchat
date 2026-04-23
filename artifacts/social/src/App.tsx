import { useEffect, useRef } from "react";
import { applyRootPreferences } from "@/lib/preferences";

applyRootPreferences();
import {
  ClerkProvider,
  SignIn,
  SignUp,
  Show,
  useClerk,
} from "@clerk/react";
import { dark } from "@clerk/themes";
import {
  Switch,
  Route,
  Redirect,
  useLocation,
  Router as WouterRouter,
} from "wouter";
import { QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { useTheme } from "@/components/ThemeProvider";
import { queryClient } from "@/lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/ThemeProvider";
import { ThemeToggle } from "@/components/ThemeToggle";
import Landing from "@/pages/Landing";
import Onboarding from "@/pages/Onboarding";
import Discover from "@/pages/Discover";
import Trending from "@/pages/Trending";
import Rooms from "@/pages/Rooms";
import RoomChat from "@/pages/RoomChat";
import Conversations from "@/pages/Conversations";
import ConversationChat from "@/pages/ConversationChat";
import Profile from "@/pages/Profile";
import Friends from "@/pages/Friends";
import Reels from "@/pages/Reels";
import AdminPanel from "@/pages/AdminPanel";
import NotFound from "@/pages/not-found";
import AppShell from "@/components/AppShell";

const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as
  | string
  | undefined;
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL as
  | string
  | undefined;

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

if (!clerkPubKey) {
  throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY");
}

const baseClerkAppearance = {
  variables: {
    colorPrimary: "#7C3AED",
    fontFamily:
      'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    borderRadius: "0.75rem",
  },
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${typeof window !== "undefined" ? window.location.origin : ""}${basePath}/logo.png`,
  },
};

function ClerkAuthCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden bg-background px-4 py-10">
      <div className="absolute inset-0 -z-10 bg-gradient-to-br from-violet-500/15 via-background to-pink-500/15" />
      <div
        className="absolute -top-32 -left-32 -z-10 h-96 w-96 rounded-full bg-violet-500/20 blur-3xl"
        aria-hidden="true"
      />
      <div
        className="absolute -bottom-32 -right-32 -z-10 h-96 w-96 rounded-full bg-pink-500/20 blur-3xl"
        aria-hidden="true"
      />
      <div className="absolute right-4 top-4 z-10">
        <ThemeToggle />
      </div>
      {children}
    </div>
  );
}

function SignInPage() {
  return (
    <ClerkAuthCard>
      <SignIn
        routing="path"
        path={`${basePath}/sign-in`}
        signUpUrl={`${basePath}/sign-up`}
      />
    </ClerkAuthCard>
  );
}

function SignUpPage() {
  return (
    <ClerkAuthCard>
      <SignUp
        routing="path"
        path={`${basePath}/sign-up`}
        signInUrl={`${basePath}/sign-in`}
      />
    </ClerkAuthCard>
  );
}

function HomeRoute() {
  return (
    <>
      <Show when="signed-in">
        <Redirect to="/app/discover" />
      </Show>
      <Show when="signed-out">
        <Landing />
      </Show>
    </>
  );
}

function ProtectedShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Show when="signed-in">
        <AppShell>{children}</AppShell>
      </Show>
      <Show when="signed-out">
        <Redirect to="/" />
      </Show>
    </>
  );
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const qc = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (
        prevUserIdRef.current !== undefined &&
        prevUserIdRef.current !== userId
      ) {
        qc.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, qc]);

  return null;
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();
  const { resolvedTheme } = useTheme();

  const appearance = {
    ...baseClerkAppearance,
    baseTheme: resolvedTheme === "dark" ? dark : undefined,
  };

  return (
    <ClerkProvider
      publishableKey={clerkPubKey!}
      proxyUrl={clerkProxyUrl}
      appearance={appearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      localization={{
        signIn: {
          start: {
            title: "Welcome back to HashChat",
            subtitle: "Sign in to keep the conversations flowing",
          },
        },
        signUp: {
          start: {
            title: "Join HashChat",
            subtitle: "Find your tribe through the hashtags you love",
          },
        },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <ClerkQueryClientCacheInvalidator />
          <Switch>
            <Route path="/" component={HomeRoute} />
            <Route path="/sign-in/*?" component={SignInPage} />
            <Route path="/sign-up/*?" component={SignUpPage} />
            <Route path="/onboarding">
              <ProtectedShell>
                <Onboarding />
              </ProtectedShell>
            </Route>
            <Route path="/app/discover">
              <ProtectedShell>
                <Discover />
              </ProtectedShell>
            </Route>
            <Route path="/app/trending">
              <ProtectedShell>
                <Trending />
              </ProtectedShell>
            </Route>
            <Route path="/app/rooms">
              <ProtectedShell>
                <Rooms />
              </ProtectedShell>
            </Route>
            <Route path="/app/rooms/:tag">
              {(params) => (
                <ProtectedShell>
                  <RoomChat tag={params.tag} />
                </ProtectedShell>
              )}
            </Route>
            <Route path="/app/messages">
              <ProtectedShell>
                <Conversations />
              </ProtectedShell>
            </Route>
            <Route path="/app/messages/:id">
              {(params) => (
                <ProtectedShell>
                  <ConversationChat id={Number(params.id)} />
                </ProtectedShell>
              )}
            </Route>
            <Route path="/app/friends">
              <ProtectedShell>
                <Friends />
              </ProtectedShell>
            </Route>
            <Route path="/app/reels">
              <ProtectedShell>
                <Reels />
              </ProtectedShell>
            </Route>
            <Route path="/app/admin">
              <ProtectedShell>
                <AdminPanel />
              </ProtectedShell>
            </Route>
            <Route path="/app/settings">
              <ProtectedShell>
                <Profile />
              </ProtectedShell>
            </Route>
            <Route path="/app/profile">
              <Redirect to="/app/settings" />
            </Route>
            <Route component={NotFound} />
          </Switch>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  return (
    <ThemeProvider>
      <WouterRouter base={basePath}>
        <ClerkProviderWithRoutes />
      </WouterRouter>
    </ThemeProvider>
  );
}

export default App;
