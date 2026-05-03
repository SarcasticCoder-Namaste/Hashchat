import { useState } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetCommunity,
  useJoinCommunity,
  useLeaveCommunity,
  getGetCommunityQueryKey,
  getListCommunitiesQueryKey,
  getGetMyFollowedHashtagsQueryKey,
  getGetRoomsQueryKey,
} from "@workspace/api-client-react";
import {
  ArrowLeft,
  Users,
  Hash,
  MessageCircle,
  Loader2,
  LogOut,
  UserPlus,
  Radio,
  Settings as SettingsIcon,
  Timer,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PresenceAvatar, UserNameLine } from "@/components/UserBadge";
import { useToast } from "@/hooks/use-toast";
import { CommunitySettingsDialog } from "@/components/CommunitySettingsDialog";

export default function CommunityDetail({ slug }: { slug: string }) {
  const community = useGetCommunity(slug);
  const qc = useQueryClient();
  const { toast } = useToast();
  const [settingsOpen, setSettingsOpen] = useState(false);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: getGetCommunityQueryKey(slug) });
    qc.invalidateQueries({ queryKey: getListCommunitiesQueryKey({ mine: false }) });
    qc.invalidateQueries({ queryKey: getListCommunitiesQueryKey({ mine: true }) });
    qc.invalidateQueries({ queryKey: getGetMyFollowedHashtagsQueryKey() });
    qc.invalidateQueries({ queryKey: getGetRoomsQueryKey() });
  };

  const join = useJoinCommunity({
    mutation: {
      onSuccess: () => {
        toast({ title: "Joined!", description: "All hashtags are now followed." });
        invalidate();
      },
      onError: () => toast({ title: "Could not join community", variant: "destructive" }),
    },
  });
  const leave = useLeaveCommunity({
    mutation: {
      onSuccess: () => {
        toast({ title: "Left community" });
        invalidate();
      },
      onError: () => toast({ title: "Could not leave community", variant: "destructive" }),
    },
  });

  if (community.isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (community.isError || !community.data) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <Button asChild variant="ghost" size="sm" className="mb-4">
          <Link href="/app/communities">
            <ArrowLeft className="mr-1 h-4 w-4" /> Back
          </Link>
        </Button>
        <div className="rounded-lg border border-border bg-card p-6 text-center text-muted-foreground">
          Community not found.
        </div>
      </div>
    );
  }

  const c = community.data;

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 md:px-8 md:py-10">
      <Button asChild variant="ghost" size="sm">
        <Link href="/app/communities">
          <ArrowLeft className="mr-1 h-4 w-4" /> Back
        </Link>
      </Button>

      <div className="overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-violet-500/10 via-card to-pink-500/10 p-6">
        <div className="flex flex-wrap items-start gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-pink-500 text-white shadow-lg">
            <Users className="h-8 w-8" />
          </div>
          <div className="min-w-0 flex-1">
            <h1
              className="text-2xl font-bold text-foreground md:text-3xl"
              data-testid="community-name"
            >
              {c.name}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {c.memberCount} member{c.memberCount === 1 ? "" : "s"} ·{" "}
              {c.hashtags.length} hashtag{c.hashtags.length === 1 ? "" : "s"}
            </p>
            {c.description && (
              <p className="mt-2 text-sm text-foreground">{c.description}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {c.slowModeSeconds > 0 && (
              <span
                className="inline-flex items-center gap-0.5 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs text-amber-600 dark:text-amber-400"
                data-testid="community-slow-mode-badge"
                title={`Slow mode: ${c.slowModeSeconds}s`}
              >
                <Timer className="h-3 w-3" /> {c.slowModeSeconds}s
              </span>
            )}
            {c.canModerate && (
              <Button
                size="icon"
                variant="ghost"
                onClick={() => setSettingsOpen(true)}
                data-testid="button-community-settings"
                aria-label="Community settings"
              >
                <SettingsIcon className="h-4 w-4" />
              </Button>
            )}
            {c.isMember ? (
              <Button
                variant="secondary"
                onClick={() => leave.mutate({ slug })}
                disabled={leave.isPending}
                data-testid="button-leave-community"
              >
                {leave.isPending ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <LogOut className="mr-1.5 h-4 w-4" />
                )}
                Leave
              </Button>
            ) : (
              <Button
                onClick={() => join.mutate({ slug })}
                disabled={join.isPending}
                className="brand-gradient-bg text-white"
                data-testid="button-join-community"
              >
                {join.isPending ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <UserPlus className="mr-1.5 h-4 w-4" />
                )}
                Join
              </Button>
            )}
          </div>
        </div>
      </div>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-foreground">Hashtags</h2>
        <div className="flex flex-wrap gap-2">
          {c.hashtags.map((t) => (
            <Link
              key={t}
              href={`/app/rooms/${encodeURIComponent(t)}`}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-3 py-1 text-sm font-medium text-foreground hover:bg-muted"
              data-testid={`tag-${t}`}
            >
              <Hash className="h-3 w-3 text-violet-500" />
              {t}
            </Link>
          ))}
        </div>
      </section>

      {c.rooms.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-foreground">Rooms</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {c.rooms.map((r) => (
              <Link
                key={r.tag}
                href={`/app/rooms/${encodeURIComponent(r.tag)}`}
                className="lift block rounded-lg border border-border bg-card p-3"
                data-testid={`community-room-${r.tag}`}
              >
                <p className="truncate text-sm font-semibold text-foreground">
                  #{r.tag}
                </p>
                <p className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Users className="h-3 w-3" /> {r.memberCount}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <MessageCircle className="h-3 w-3" /> {r.messageCount}
                  </span>
                </p>
              </Link>
            ))}
          </div>
        </section>
      )}

      <CommunitySettingsDialog
        community={c}
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
      />

      {c.members.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-foreground">Members</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {c.members.map((m) => (
              <Link
                key={m.id}
                href={`/app/u/${m.username}`}
                className="lift flex items-center gap-3 rounded-lg border border-border bg-card p-3"
              >
                <PresenceAvatar
                  displayName={m.displayName}
                  avatarUrl={m.avatarUrl}
                  animatedAvatarUrl={m.animatedAvatarUrl}
                  lastSeenAt={m.lastSeenAt}
                  presenceState={m.presenceState}
                />
                <div className="min-w-0 flex-1">
                  <UserNameLine
                    displayName={m.displayName}
                    username={m.username}
                    discriminator={m.discriminator}
                    role={m.role}
                    mvpPlan={m.mvpPlan}
                    verified={m.verified}
                  />
                  {m.currentRoomTag && (
                    <p className="truncate text-[11px] font-medium text-primary">
                      <Radio className="mr-1 inline h-3 w-3" />
                      Active in #{m.currentRoomTag}
                    </p>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
