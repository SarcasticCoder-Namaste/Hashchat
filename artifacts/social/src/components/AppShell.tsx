import { type ReactNode, useEffect } from "react";
import { Link, useLocation, Redirect } from "wouter";
import { useUser, useClerk } from "@clerk/react";
import {
  useGetMe,
  getGetMeQueryKey,
  useGetFriendRequests,
  getGetFriendRequestsQueryKey,
} from "@workspace/api-client-react";
import {
  Compass,
  TrendingUp,
  Hash,
  MessageCircle,
  UserPlus,
  Settings as SettingsIcon,
  LogOut,
  Loader2,
  Film,
  ShieldCheck,
  Home as HomeIcon,
  Users,
  Sparkles,
} from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
import { PresenceAvatar, UserNameLine } from "@/components/UserBadge";
import { IncomingCallToast } from "@/components/IncomingCallToast";
import { PageTransition } from "@/components/PageTransition";
import { FriendCodeSearch } from "@/components/FriendCodeSearch";
import { NotificationsBell } from "@/components/NotificationsBell";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

type NavItem = {
  href: string;
  label: string;
  icon: typeof Compass;
};

const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "Explore",
    items: [
      { href: "/app/home", label: "Home", icon: HomeIcon },
      { href: "/app/discover", label: "Discover", icon: Compass },
      { href: "/app/trending", label: "Trending", icon: TrendingUp },
      { href: "/app/reels", label: "Reels", icon: Film },
    ],
  },
  {
    label: "Chat",
    items: [
      { href: "/app/rooms", label: "Rooms", icon: Hash },
      { href: "/app/communities", label: "Communities", icon: Users },
      { href: "/app/messages", label: "Messages", icon: MessageCircle },
    ],
  },
  {
    label: "You",
    items: [
      { href: "/app/friends", label: "Friends", icon: UserPlus },
      { href: "/app/premium", label: "Premium", icon: Sparkles },
      { href: "/app/settings", label: "Settings", icon: SettingsIcon },
    ],
  },
];

const MOBILE_NAV: NavItem[] = [
  { href: "/app/home", label: "Home", icon: HomeIcon },
  { href: "/app/discover", label: "Discover", icon: Compass },
  { href: "/app/reels", label: "Reels", icon: Film },
  { href: "/app/rooms", label: "Rooms", icon: Hash },
  { href: "/app/communities", label: "Communities", icon: Users },
  { href: "/app/messages", label: "Messages", icon: MessageCircle },
  { href: "/app/friends", label: "Friends", icon: UserPlus },
  { href: "/app/settings", label: "Settings", icon: SettingsIcon },
];

function isActive(location: string, href: string): boolean {
  if (location === href) return true;
  if (href === "/app/discover") return false;
  return location.startsWith(href);
}

export default function AppShell({ children }: { children: ReactNode }) {
  const [location, setLocation] = useLocation();
  const { user: clerkUser, isLoaded } = useUser();
  const { signOut } = useClerk();
  const { data: me, isLoading, error } = useGetMe({
    query: { queryKey: getGetMeQueryKey(), enabled: !!clerkUser, refetchInterval: 60000 },
  });
  const { data: friendReqs } = useGetFriendRequests({
    query: {
      queryKey: getGetFriendRequestsQueryKey(),
      enabled: !!clerkUser && !!me && me.hashtags.length > 0,
      refetchInterval: 15000,
    },
  });
  const incomingCount = friendReqs?.incoming.length ?? 0;
  const isStaff = me?.role === "admin" || me?.role === "moderator";

  const groups = isStaff
    ? [
        ...NAV_GROUPS.slice(0, 2),
        {
          label: "Staff",
          items: [{ href: "/app/admin", label: "Admin", icon: ShieldCheck }],
        },
        NAV_GROUPS[2],
      ]
    : NAV_GROUPS;

  const mobileNav = isStaff
    ? [...MOBILE_NAV.slice(0, 7), { href: "/app/admin", label: "Admin", icon: ShieldCheck }, MOBILE_NAV[7]]
    : MOBILE_NAV;

  useEffect(() => {
    if (
      me &&
      me.hashtags.length === 0 &&
      location !== "/onboarding"
    ) {
      setLocation("/onboarding");
    }
  }, [me, location, setLocation]);

  if (!isLoaded || isLoading) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-3 bg-background px-6 text-center">
        <p className="text-foreground">We couldn't load your profile.</p>
        <p className="text-sm text-muted-foreground">{(error as Error).message}</p>
        <Button onClick={() => window.location.reload()}>Try again</Button>
      </div>
    );
  }

  if (location === "/onboarding") {
    return (
      <div className="relative min-h-[100dvh] overflow-hidden bg-background">
        <div className="absolute inset-0 -z-10 bg-gradient-to-br from-violet-500/10 via-background to-pink-500/10" />
        <div className="absolute right-4 top-4 z-10">
          <ThemeToggle />
        </div>
        {children}
      </div>
    );
  }

  if (me && me.hashtags.length === 0) {
    return <Redirect to="/onboarding" />;
  }

  return (
    <div className="min-h-[100dvh] bg-background">
      {/* Ambient backdrop accents */}
      <div
        className="pointer-events-none absolute -left-20 top-0 -z-0 h-72 w-72 rounded-full bg-violet-500/10 blur-3xl"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute right-0 top-1/3 -z-0 h-72 w-72 rounded-full bg-pink-500/10 blur-3xl"
        aria-hidden="true"
      />

      <div className="relative mx-auto flex min-h-[100dvh] max-w-7xl">
        <aside className="hidden w-64 flex-col border-r border-border bg-sidebar/80 p-4 backdrop-blur md:flex">
          <Link
            href="/app/discover"
            className="mb-6 flex items-center gap-2.5 group"
            data-testid="link-home"
          >
            <motion.img
              src={`${basePath}/logo.png`}
              alt="HashChat"
              className="h-9 w-9"
              whileHover={{ rotate: -8, scale: 1.05 }}
              transition={{ type: "spring", stiffness: 400, damping: 14 }}
            />
            <span className="text-xl font-bold tracking-tight brand-gradient-text">
              HashChat
            </span>
          </Link>

          <nav className="flex flex-1 flex-col gap-5">
            {groups.map((group) => (
              <div key={group.label} className="space-y-1">
                <p className="px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                  {group.label}
                </p>
                <div className="space-y-0.5">
                  {group.items.map(({ href, label, icon: Icon }) => {
                    const active = isActive(location, href);
                    const showBadge = href === "/app/friends" && incomingCount > 0;
                    return (
                      <Link
                        key={href}
                        href={href}
                        data-testid={`nav-${label.toLowerCase()}`}
                        className={[
                          "relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                          active
                            ? "text-sidebar-accent-foreground"
                            : "text-muted-foreground hover:text-foreground",
                        ].join(" ")}
                      >
                        {active && (
                          <motion.span
                            layoutId="sidebar-active-pill"
                            className="absolute inset-0 -z-10 rounded-lg bg-gradient-to-r from-violet-500/20 to-pink-500/20 ring-1 ring-violet-500/30"
                            transition={{ type: "spring", stiffness: 500, damping: 36 }}
                          />
                        )}
                        <Icon className={`h-4 w-4 ${active ? "text-primary" : ""}`} />
                        <span className="flex-1">{label}</span>
                        {showBadge && (
                          <motion.span
                            initial={{ scale: 0.6, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            className="rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground shadow-sm"
                          >
                            {incomingCount}
                          </motion.span>
                        )}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>

          <div className="mt-4 flex items-center justify-between rounded-lg border border-border/50 bg-card/40 px-3 py-1.5">
            <span className="text-xs text-muted-foreground">Theme</span>
            <ThemeToggle />
          </div>

          {me && (
            <div className="mt-3 rounded-xl border border-border bg-card/60 p-3 backdrop-blur lift">
              <Link
                href="/app/settings"
                className="flex items-center gap-3"
                data-testid="link-profile-card"
              >
                <PresenceAvatar
                  displayName={me.displayName}
                  avatarUrl={me.avatarUrl}
                  lastSeenAt={me.lastSeenAt}
                />
                <UserNameLine
                  displayName={me.displayName}
                  username={me.username}
                  discriminator={me.discriminator}
                  role={me.role}
                  mvpPlan={me.mvpPlan}
                  verified={me.verified}
                  className="flex-1"
                />
              </Link>
              <Button
                variant="ghost"
                size="sm"
                className="mt-2 w-full justify-start text-muted-foreground hover:text-foreground"
                onClick={() => signOut({ redirectUrl: basePath || "/" })}
                data-testid="button-signout"
              >
                <LogOut className="mr-2 h-4 w-4" /> Sign out
              </Button>
            </div>
          )}
        </aside>

        <div className="flex flex-1 flex-col">
          <header className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-border bg-card/80 px-4 py-3 backdrop-blur md:hidden">
            <Link
              href="/app/discover"
              className="flex items-center gap-2"
            >
              <img
                src={`${basePath}/logo.png`}
                alt="HashChat"
                className="h-7 w-7"
              />
              <span className="font-bold brand-gradient-text">HashChat</span>
            </Link>
            <div className="flex items-center gap-1">
              <FriendCodeSearch />
              <NotificationsBell enabled={!!me} testIdSuffix="mobile" />
              <ThemeToggle />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => signOut({ redirectUrl: basePath || "/" })}
                data-testid="button-signout-mobile"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </header>
          <header className="sticky top-0 z-10 hidden items-center justify-end gap-2 border-b border-border bg-card/60 px-6 py-2.5 backdrop-blur md:flex">
            <FriendCodeSearch />
            <NotificationsBell enabled={!!me} />
          </header>

          <main className="flex-1 overflow-y-auto">
            <PageTransition>{children}</PageTransition>
          </main>

          <nav
            className={[
              "sticky bottom-0 z-10 grid border-t border-border bg-card/90 backdrop-blur md:hidden",
              isStaff ? "grid-cols-9" : "grid-cols-8",
            ].join(" ")}
          >
            {mobileNav.map(({ href, label, icon: Icon }) => {
              const active = isActive(location, href);
              const showBadge = href === "/app/friends" && incomingCount > 0;
              return (
                <Link
                  key={href}
                  href={href}
                  data-testid={`mobnav-${label.toLowerCase()}`}
                  className={[
                    "relative flex flex-col items-center gap-0.5 py-2 text-[10px] transition-colors",
                    active ? "text-primary" : "text-muted-foreground hover:text-foreground",
                  ].join(" ")}
                >
                  {active && (
                    <motion.span
                      layoutId="mobile-nav-bar"
                      className="absolute inset-x-3 top-0 h-0.5 rounded-full bg-gradient-to-r from-violet-500 to-pink-500"
                      transition={{ type: "spring", stiffness: 500, damping: 36 }}
                    />
                  )}
                  <Icon className="h-5 w-5" />
                  <span>{label}</span>
                  {showBadge && (
                    <span className="absolute right-2 top-1 rounded-full bg-primary px-1.5 py-0.5 text-[9px] font-semibold leading-none text-primary-foreground">
                      {incomingCount}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>
      {me && <IncomingCallToast />}
    </div>
  );
}
