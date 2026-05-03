import { type ReactNode } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { BadgeCheck, Crown, ShieldCheck, Sparkles } from "lucide-react";
import { getPresenceState, type PresenceState } from "@/lib/userPresence";

function initialsFor(name: string) {
  return (name || "?")
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function PresenceAvatar({
  displayName,
  avatarUrl,
  animatedAvatarUrl,
  lastSeenAt,
  presenceState,
  size = "md",
  className,
}: {
  displayName: string;
  avatarUrl?: string | null;
  animatedAvatarUrl?: string | null;
  lastSeenAt?: string | Date | null;
  presenceState?: PresenceState | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const sizeCls =
    size === "sm" ? "h-8 w-8" : size === "lg" ? "h-14 w-14" : "h-11 w-11";
  const dotCls =
    size === "sm" ? "h-2 w-2" : size === "lg" ? "h-3.5 w-3.5" : "h-2.5 w-2.5";
  const state = getPresenceState(lastSeenAt ?? null, presenceState);
  const dotColor =
    state === "online"
      ? "bg-emerald-500 pulse-ring"
      : state === "away"
        ? "bg-amber-400"
        : "bg-muted-foreground/40";
  const title =
    state === "online" ? "Online" : state === "away" ? "Away" : "Offline";
  const displayAvatarUrl = animatedAvatarUrl || avatarUrl;
  return (
    <div className={["relative inline-block", className ?? ""].join(" ")}>
      <Avatar className={sizeCls}>
        {displayAvatarUrl ? <AvatarImage src={displayAvatarUrl} alt={displayName} /> : null}
        <AvatarFallback className="bg-primary/15 text-primary">
          {initialsFor(displayName)}
        </AvatarFallback>
      </Avatar>
      <span
        title={title}
        data-testid={`presence-${state}`}
        className={[
          "absolute -bottom-0.5 -right-0.5 rounded-full ring-2 ring-card",
          dotCls,
          dotColor,
        ].join(" ")}
      />
    </div>
  );
}

export function UserNameLine({
  displayName,
  username,
  discriminator,
  role,
  mvpPlan,
  verified,
  tier,
  featuredHashtag,
  className,
  showHandle = true,
  extra,
}: {
  displayName: string;
  username: string;
  discriminator?: string | null;
  role?: string | null;
  mvpPlan?: boolean | null;
  verified?: boolean | null;
  tier?: string | null;
  featuredHashtag?: string | null;
  className?: string;
  showHandle?: boolean;
  extra?: ReactNode;
}) {
  const isAdmin = role === "admin";
  const isMod = role === "moderator";
  return (
    <div className={["min-w-0", className ?? ""].join(" ")}>
      <div className="flex flex-wrap items-center gap-1.5">
        <p className="truncate text-sm font-semibold text-foreground">
          {displayName}
        </p>
        {verified && (
          <span
            title="Verified"
            data-testid="badge-verified"
            className="inline-flex items-center text-sky-500 dark:text-sky-400"
          >
            <BadgeCheck className="h-3.5 w-3.5 fill-sky-500/20" />
          </span>
        )}
        {isAdmin && (
          <span
            title="Admin"
            data-testid="badge-admin"
            className="inline-flex items-center gap-0.5 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300"
          >
            <Crown className="h-2.5 w-2.5" /> Admin
          </span>
        )}
        {isMod && (
          <span
            title="Moderator"
            data-testid="badge-mod"
            className="inline-flex items-center gap-0.5 rounded-full bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700 dark:text-sky-300"
          >
            <ShieldCheck className="h-2.5 w-2.5" /> Mod
          </span>
        )}
        {mvpPlan && (
          <span
            title="MVP"
            data-testid="badge-mvp"
            className="inline-flex items-center gap-0.5 rounded-full bg-gradient-to-r from-violet-500/30 to-pink-500/30 px-1.5 py-0.5 text-[10px] font-semibold text-foreground"
          >
            <Sparkles className="h-2.5 w-2.5" /> MVP
          </span>
        )}
        {tier === "pro" && (
          <span
            title="HashChat Pro"
            data-testid="badge-pro"
            className="inline-flex items-center gap-0.5 rounded-full bg-gradient-to-r from-violet-500 to-pink-500 px-1.5 py-0.5 text-[10px] font-semibold text-white shadow-sm"
          >
            <Crown className="h-2.5 w-2.5" /> Pro
          </span>
        )}
        {featuredHashtag && (
          <span className="inline-flex items-center gap-0.5 rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-medium text-accent-foreground">
            #{featuredHashtag}
          </span>
        )}
        {extra}
      </div>
      {showHandle && (
        <p className="truncate text-xs text-muted-foreground">
          @{username}
          {discriminator && (
            <span className="ml-1 text-muted-foreground/70">#{discriminator}</span>
          )}
        </p>
      )}
    </div>
  );
}
