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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ThemeToggle } from "@/components/ThemeToggle";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

const NAV = [
  { href: "/app/discover", label: "Discover", icon: Compass },
  { href: "/app/trending", label: "Trending", icon: TrendingUp },
  { href: "/app/rooms", label: "Rooms", icon: Hash },
  { href: "/app/messages", label: "Messages", icon: MessageCircle },
  { href: "/app/friends", label: "Friends", icon: UserPlus },
  { href: "/app/settings", label: "Settings", icon: SettingsIcon },
];

export default function AppShell({ children }: { children: ReactNode }) {
  const [location, setLocation] = useLocation();
  const { user: clerkUser, isLoaded } = useUser();
  const { signOut } = useClerk();
  const { data: me, isLoading, error } = useGetMe({
    query: { queryKey: getGetMeQueryKey(), enabled: !!clerkUser },
  });
  const { data: friendReqs } = useGetFriendRequests({
    query: {
      queryKey: getGetFriendRequestsQueryKey(),
      enabled: !!clerkUser && !!me && me.hashtags.length > 0,
      refetchInterval: 15000,
    },
  });
  const incomingCount = friendReqs?.incoming.length ?? 0;

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

  const initials = (me?.displayName || me?.username || "?")
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="min-h-[100dvh] bg-background">
      <div className="mx-auto flex min-h-[100dvh] max-w-7xl">
        <aside className="hidden w-64 flex-col border-r border-border bg-sidebar p-4 md:flex">
          <Link
            href="/app/discover"
            className="mb-6 flex items-center gap-2"
            data-testid="link-home"
          >
            <img
              src={`${basePath}/logo.svg`}
              alt="HashChat"
              className="h-9 w-9"
            />
            <span className="text-xl font-bold tracking-tight text-foreground">
              HashChat
            </span>
          </Link>
          <nav className="flex flex-1 flex-col gap-1">
            {NAV.map(({ href, label, icon: Icon }) => {
              const active =
                location === href ||
                (href !== "/app/discover" && location.startsWith(href));
              const showBadge = href === "/app/friends" && incomingCount > 0;
              return (
                <Link
                  key={href}
                  href={href}
                  data-testid={`nav-${label.toLowerCase()}`}
                  className={[
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    active
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                  ].join(" ")}
                >
                  <Icon className="h-4 w-4" />
                  <span className="flex-1">{label}</span>
                  {showBadge && (
                    <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">
                      {incomingCount}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
          <div className="mt-4 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Theme</span>
            <ThemeToggle />
          </div>
          {me && (
            <div className="mt-3 rounded-lg border border-border p-3">
              <Link
                href="/app/settings"
                className="flex items-center gap-3"
                data-testid="link-profile-card"
              >
                <Avatar className="h-10 w-10">
                  {me.avatarUrl ? (
                    <AvatarImage src={me.avatarUrl} alt={me.displayName} />
                  ) : null}
                  <AvatarFallback className="bg-primary/15 text-primary">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {me.displayName}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    @{me.username}
                  </p>
                </div>
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
          <header className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card/80 px-4 py-3 backdrop-blur md:hidden">
            <Link
              href="/app/discover"
              className="flex items-center gap-2"
            >
              <img
                src={`${basePath}/logo.svg`}
                alt="HashChat"
                className="h-7 w-7"
              />
              <span className="font-bold text-foreground">HashChat</span>
            </Link>
            <div className="flex items-center gap-1">
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

          <main className="flex-1 overflow-y-auto">{children}</main>

          <nav className="sticky bottom-0 grid grid-cols-6 border-t border-border bg-card md:hidden">
            {NAV.map(({ href, label, icon: Icon }) => {
              const active =
                location === href ||
                (href !== "/app/discover" && location.startsWith(href));
              const showBadge = href === "/app/friends" && incomingCount > 0;
              return (
                <Link
                  key={href}
                  href={href}
                  data-testid={`mobnav-${label.toLowerCase()}`}
                  className={[
                    "relative flex flex-col items-center gap-0.5 py-2 text-[10px]",
                    active ? "text-primary" : "text-muted-foreground",
                  ].join(" ")}
                >
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
    </div>
  );
}
