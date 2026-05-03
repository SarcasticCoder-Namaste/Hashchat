import { useEffect, useRef } from "react";
import { applyRootPreferences } from "@/lib/preferences";
import { applyStoredAccent } from "@/lib/serverPreferences";

applyRootPreferences();
applyStoredAccent();
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
  Link,
  Router as WouterRouter,
} from "wouter";
import { motion } from "framer-motion";
import {
  Hash as HashIcon,
  MessageSquare as MessageSquareIcon,
  Sparkles as SparklesIcon,
} from "lucide-react";
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
import Home from "@/pages/Home";
import Trending from "@/pages/Trending";
import Rooms from "@/pages/Rooms";
import RoomChat from "@/pages/RoomChat";
import HashtagAnalytics from "@/pages/HashtagAnalytics";
import Conversations from "@/pages/Conversations";
import ConversationChat from "@/pages/ConversationChat";
import PublicProfile from "@/pages/PublicProfile";
import Profile from "@/pages/Profile";
import Friends from "@/pages/Friends";
import Reels from "@/pages/Reels";
import Communities from "@/pages/Communities";
import CommunityDetail from "@/pages/CommunityDetail";
import Premium from "@/pages/Premium";
import InviteRedeem from "@/pages/InviteRedeem";
import AdminPanel from "@/pages/AdminPanel";
import SearchResults from "@/pages/SearchResults";
import Saved from "@/pages/Saved";
import NotFound from "@/pages/not-found";
import AppShell from "@/components/AppShell";
import { SolanaProvider } from "@/components/SolanaProvider";

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
    colorTextOnPrimaryBackground: "#ffffff",
    colorBackground: "transparent",
    colorInputBackground: "hsl(var(--card))",
    colorInputText: "hsl(var(--foreground))",
    colorText: "hsl(var(--foreground))",
    colorTextSecondary: "hsl(var(--muted-foreground))",
    colorDanger: "#ef4444",
    fontFamily:
      'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    fontSize: "0.95rem",
    borderRadius: "0.875rem",
    spacingUnit: "1rem",
  },
  elements: {
    rootBox: "w-full",
    card: "w-full max-w-none",
    headerTitle:
      "text-2xl font-bold tracking-tight",
    headerSubtitle: "text-sm",
    socialButtonsBlockButton:
      "border transition-colors",
    socialButtonsBlockButtonText: "font-medium",
    dividerText: "text-xs uppercase tracking-wider",
    formFieldLabel: "text-sm font-medium",
    formFieldInput:
      "border focus:ring-2 focus:ring-violet-500/30 transition-all",
    formButtonPrimary:
      "bg-gradient-to-r from-violet-600 to-pink-600 hover:from-violet-700 hover:to-pink-700 text-white font-semibold shadow-lg shadow-violet-500/25 transition-all hover:shadow-xl hover:shadow-violet-500/30 normal-case",
    footerActionText: "text-sm",
    footerActionLink:
      "text-sm font-semibold text-violet-600 hover:text-pink-600 transition-colors",
  },
  options: {
    logoPlacement: "none" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${typeof window !== "undefined" ? window.location.origin : ""}${basePath}/logo.png`,
  },
};

function ClerkAuthCard({
  children,
  mode,
}: {
  children: React.ReactNode;
  mode: "sign-in" | "sign-up";
}) {
  const isSignIn = mode === "sign-in";
  const heading = isSignIn ? "Welcome back" : "Join the conversation";
  const tagline = isSignIn
    ? "Pick up where you left off — your hashtags missed you."
    : "Find your tribe through the hashtags you live and breathe.";

  const highlights = isSignIn
    ? [
        { icon: HashIcon, text: "Hashtag rooms tuned to your interests" },
        { icon: MessageSquareIcon, text: "Real-time DMs with reactions" },
        { icon: SparklesIcon, text: "Smart matches, not random noise" },
      ]
    : [
        { icon: SparklesIcon, text: "Get matched with people who share your tags" },
        { icon: HashIcon, text: "Drop into rooms around any topic" },
        { icon: MessageSquareIcon, text: "DMs, reels, and presence baked in" },
      ];

  return (
    <div className="relative min-h-[100dvh] overflow-hidden bg-background">
      <div className="absolute inset-0 -z-10 bg-gradient-to-br from-violet-500/15 via-background to-pink-500/15" />
      <div
        className="absolute -top-40 -left-40 -z-10 h-[28rem] w-[28rem] rounded-full bg-violet-500/25 blur-3xl"
        aria-hidden="true"
      />
      <div
        className="absolute -bottom-40 -right-40 -z-10 h-[28rem] w-[28rem] rounded-full bg-pink-500/25 blur-3xl"
        aria-hidden="true"
      />
      <div
        className="absolute top-1/3 left-1/2 -z-10 h-72 w-72 -translate-x-1/2 rounded-full bg-fuchsia-500/10 blur-3xl"
        aria-hidden="true"
      />

      <header className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-5 py-4 md:px-8 md:py-6">
        <Link
          href="/"
          className="flex items-center gap-2 transition-opacity hover:opacity-80"
          data-testid="link-auth-logo"
        >
          <img
            src={`${basePath}/logo.png`}
            alt="HashChat"
            className="h-9 w-9"
          />
          <span className="text-lg font-bold tracking-tight text-foreground">
            HashChat
          </span>
        </Link>
        <ThemeToggle />
      </header>

      <div className="mx-auto grid min-h-[100dvh] max-w-6xl items-center gap-8 px-5 pt-24 pb-10 md:grid-cols-2 md:gap-12 md:px-10 md:pt-28">
        {/* Brand panel */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
          className="hidden flex-col md:flex"
        >
          <div className="inline-flex w-fit items-center gap-2 rounded-full border border-primary/30 bg-card/70 px-3 py-1 text-xs font-medium text-primary shadow-sm backdrop-blur">
            <SparklesIcon className="h-3.5 w-3.5" />
            Hashtag-driven social chat
          </div>
          <h1 className="mt-5 text-4xl font-bold leading-tight tracking-tight text-foreground md:text-5xl">
            {heading.split(" ").slice(0, -1).join(" ")}{" "}
            <span className="bg-gradient-to-r from-violet-600 to-pink-600 bg-clip-text text-transparent">
              {heading.split(" ").slice(-1)}
            </span>
          </h1>
          <p className="mt-4 max-w-md text-lg text-muted-foreground">
            {tagline}
          </p>

          <ul className="mt-8 space-y-3">
            {highlights.map((h, i) => (
              <motion.li
                key={i}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.15 + i * 0.08 }}
                className="flex items-center gap-3 rounded-xl border border-border/60 bg-card/70 px-4 py-3 backdrop-blur"
              >
                <span className="flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-gradient-to-br from-violet-500/20 to-pink-500/20 text-primary">
                  <h.icon className="h-4 w-4" />
                </span>
                <span className="text-sm font-medium text-foreground">
                  {h.text}
                </span>
              </motion.li>
            ))}
          </ul>

          <p className="mt-8 text-xs text-muted-foreground">
            By continuing you agree to our community guidelines. Be kind, the
            mods are watching.
          </p>
        </motion.div>

        {/* Auth form panel */}
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.45, delay: 0.05 }}
          className="mx-auto w-full max-w-md"
        >
          <div className="md:hidden mb-6 text-center">
            <h1 className="text-3xl font-bold tracking-tight text-foreground">
              {heading.split(" ").slice(0, -1).join(" ")}{" "}
              <span className="bg-gradient-to-r from-violet-600 to-pink-600 bg-clip-text text-transparent">
                {heading.split(" ").slice(-1)}
              </span>
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">{tagline}</p>
          </div>

          <div className="auth-clerk-wrap">{children}</div>

          <p className="mt-6 text-center text-xs text-muted-foreground">
            <Link
              href="/"
              className="hover:text-foreground transition-colors"
              data-testid="link-back-home"
            >
              ← Back to homepage
            </Link>
          </p>
        </motion.div>
      </div>
    </div>
  );
}

function SignInPage() {
  return (
    <ClerkAuthCard mode="sign-in">
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
    <ClerkAuthCard mode="sign-up">
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
          <SolanaProvider>
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
            <Route path="/app/home">
              <ProtectedShell>
                <Home />
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
            <Route path="/app/tag/:tag">
              {(params) => (
                <ProtectedShell>
                  <HashtagAnalytics tag={params.tag} />
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
            <Route path="/app/communities">
              <ProtectedShell>
                <Communities />
              </ProtectedShell>
            </Route>
            <Route path="/app/communities/:slug">
              {(params) => (
                <ProtectedShell>
                  <CommunityDetail slug={params.slug} />
                </ProtectedShell>
              )}
            </Route>
            <Route path="/app/premium">
              <ProtectedShell>
                <Premium />
              </ProtectedShell>
            </Route>
            <Route path="/app/r/invite/:code">
              {(params) => (
                <ProtectedShell>
                  <InviteRedeem code={params.code} />
                </ProtectedShell>
              )}
            </Route>
            <Route path="/app/admin">
              <ProtectedShell>
                <AdminPanel />
              </ProtectedShell>
            </Route>
            <Route path="/app/search">
              <ProtectedShell>
                <SearchResults />
              </ProtectedShell>
            </Route>
            <Route path="/app/saved">
              <ProtectedShell>
                <Saved />
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
            <Route path="/app/u/:username">
              {(params) => (
                <ProtectedShell>
                  <PublicProfile username={params.username} />
                </ProtectedShell>
              )}
            </Route>
            <Route component={NotFound} />
          </Switch>
          </SolanaProvider>
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
