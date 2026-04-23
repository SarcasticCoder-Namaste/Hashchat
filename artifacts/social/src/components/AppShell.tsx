import { type ReactNode, useEffect } from "react";
import { Link, useLocation, Redirect } from "wouter";
import { useUser, useClerk } from "@clerk/react";
import { useGetMe, getGetMeQueryKey } from "@workspace/api-client-react";
import {
  Compass,
  TrendingUp,
  Hash,
  MessageCircle,
  User as UserIcon,
  LogOut,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

const NAV = [
  { href: "/app/discover", label: "Discover", icon: Compass },
  { href: "/app/trending", label: "Trending", icon: TrendingUp },
  { href: "/app/rooms", label: "Rooms", icon: Hash },
  { href: "/app/messages", label: "Messages", icon: MessageCircle },
  { href: "/app/profile", label: "Profile", icon: UserIcon },
];

export default function AppShell({ children }: { children: ReactNode }) {
  const [location, setLocation] = useLocation();
  const { user: clerkUser, isLoaded } = useUser();
  const { signOut } = useClerk();
  const { data: me, isLoading, error } = useGetMe({
    query: { queryKey: getGetMeQueryKey(), enabled: !!clerkUser },
  });

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
      <div className="flex min-h-[100dvh] items-center justify-center bg-slate-50">
        <Loader2 className="h-6 w-6 animate-spin text-violet-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-3 bg-slate-50 px-6 text-center">
        <p className="text-slate-700">We couldn't load your profile.</p>
        <p className="text-sm text-slate-500">{(error as Error).message}</p>
        <Button onClick={() => window.location.reload()}>Try again</Button>
      </div>
    );
  }

  if (location === "/onboarding") {
    return (
      <div className="min-h-[100dvh] bg-gradient-to-br from-violet-50 via-white to-pink-50">
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
    <div className="min-h-[100dvh] bg-slate-50">
      <div className="mx-auto flex min-h-[100dvh] max-w-7xl">
        <aside className="hidden w-64 flex-col border-r border-slate-200 bg-white p-4 md:flex">
          <Link href="/app/discover" className="mb-6 flex items-center gap-2" data-testid="link-home">
              <img src={`${basePath}/logo.svg`} alt="HashChat" className="h-9 w-9" />
              <span className="text-xl font-bold tracking-tight text-slate-900">
                HashChat
              </span>
            </Link>
          <nav className="flex flex-1 flex-col gap-1">
            {NAV.map(({ href, label, icon: Icon }) => {
              const active =
                location === href ||
                (href !== "/app/discover" && location.startsWith(href));
              return (
                <Link key={href} href={href} data-testid={`nav-${label.toLowerCase()}`} className={[ "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors", active ? "bg-violet-100 text-violet-700" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900", ].join(" ")}>
                    <Icon className="h-4 w-4" />
                    {label}
                  </Link>
              );
            })}
          </nav>
          {me && (
            <div className="mt-4 rounded-lg border border-slate-200 p-3">
              <Link href="/app/profile" className="flex items-center gap-3" data-testid="link-profile-card">
                  <Avatar className="h-10 w-10">
                    {me.avatarUrl ? (
                      <AvatarImage src={me.avatarUrl} alt={me.displayName} />
                    ) : null}
                    <AvatarFallback className="bg-violet-200 text-violet-700">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900">
                      {me.displayName}
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      @{me.username}
                    </p>
                  </div>
                </Link>
              <Button
                variant="ghost"
                size="sm"
                className="mt-2 w-full justify-start text-slate-500 hover:text-slate-900"
                onClick={() => signOut({ redirectUrl: basePath || "/" })}
                data-testid="button-signout"
              >
                <LogOut className="mr-2 h-4 w-4" /> Sign out
              </Button>
            </div>
          )}
        </aside>

        <div className="flex flex-1 flex-col">
          <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white/80 px-4 py-3 backdrop-blur md:hidden">
            <Link href="/app/discover" className="flex items-center gap-2">
                <img src={`${basePath}/logo.svg`} alt="HashChat" className="h-7 w-7" />
                <span className="font-bold text-slate-900">HashChat</span>
              </Link>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => signOut({ redirectUrl: basePath || "/" })}
              data-testid="button-signout-mobile"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </header>

          <main className="flex-1 overflow-y-auto">{children}</main>

          <nav className="sticky bottom-0 grid grid-cols-5 border-t border-slate-200 bg-white md:hidden">
            {NAV.map(({ href, label, icon: Icon }) => {
              const active =
                location === href ||
                (href !== "/app/discover" && location.startsWith(href));
              return (
                <Link key={href} href={href} data-testid={`mobnav-${label.toLowerCase()}`} className={[ "flex flex-col items-center gap-0.5 py-2 text-xs", active ? "text-violet-700" : "text-slate-500", ].join(" ")}>
                    <Icon className="h-5 w-5" />
                    <span>{label}</span>
                  </Link>
              );
            })}
          </nav>
        </div>
      </div>
    </div>
  );
}
