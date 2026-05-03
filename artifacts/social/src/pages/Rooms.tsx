import { Link } from "wouter";
import {
  useGetRooms,
  useGetTrendingRooms,
} from "@workspace/api-client-react";
import { motion } from "framer-motion";
import { Hash, MessageCircle, Users, Sparkles, Flame } from "lucide-react";
import { CardSkeleton } from "@/components/Skeleton";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n";

export default function Rooms() {
  const { t } = useTranslation();
  const myRooms = useGetRooms();
  const trending = useGetTrendingRooms({ limit: 10 });

  return (
    <div className="mx-auto max-w-4xl space-y-10 px-4 py-6 md:px-8 md:py-10">
      <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-violet-500/10 via-card to-pink-500/10 p-6 md:p-8">
        <div className="hero-grid absolute inset-0 opacity-40" aria-hidden="true" />
        <div className="relative">
          <h1 className="text-3xl font-bold text-foreground md:text-4xl">
            {t("rooms.title")} <span className="brand-gradient-text">{t("rooms.titleAccent")}</span>
          </h1>
          <p className="mt-2 max-w-xl text-muted-foreground">
            {t("rooms.subtitle")}
          </p>
        </div>
      </div>

      <section>
        <SectionHeader
          icon={<Hash className="h-5 w-5 text-primary" />}
          title={t("rooms.yourRooms")}
          subtitle={t("rooms.yourRoomsSubtitle")}
        />
        {myRooms.isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <CardSkeleton />
            <CardSkeleton />
          </div>
        ) : myRooms.data && myRooms.data.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {myRooms.data.map((r, idx) => (
              <motion.div
                key={r.tag}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.03, duration: 0.22 }}
              >
                <RoomCard r={r} />
              </motion.div>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={Hash}
            title={t("rooms.emptyTitle")}
            description={t("rooms.emptyDescription")}
            action={
              <Button asChild variant="secondary">
                <Link href="/app/settings">{t("rooms.pickHashtags")}</Link>
              </Button>
            }
          />
        )}
      </section>

      <section>
        <SectionHeader
          icon={<Sparkles className="h-5 w-5 text-pink-500" />}
          title={t("rooms.discover")}
          subtitle={t("rooms.discoverSubtitle")}
        />
        {trending.isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <CardSkeleton />
            <CardSkeleton />
          </div>
        ) : trending.data && trending.data.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {trending.data.map((r, idx) => (
              <motion.div
                key={r.tag}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.03, duration: 0.22 }}
              >
                <RoomCard r={r} />
              </motion.div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t("rooms.nothingTrending")}</p>
        )}
      </section>
    </div>
  );
}

function SectionHeader({
  icon,
  title,
  subtitle,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <div>
        <div className="flex items-center gap-2">
          {icon}
          <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        </div>
        {subtitle && (
          <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
        )}
      </div>
    </div>
  );
}

function RoomCard({
  r,
}: {
  r: {
    tag: string;
    memberCount: number;
    messageCount: number;
    recentMessages: number;
    lastMessage?: { content: string; senderName: string } | null;
  };
}) {
  const { t } = useTranslation();
  const hot = r.recentMessages > 0;
  return (
    <Link
      href={`/app/rooms/${encodeURIComponent(r.tag)}`}
      className="lift block rounded-xl border border-border bg-card p-4 shadow-sm"
      data-testid={`room-${r.tag}`}
    >
      <div className="flex items-center gap-3">
        <div className="relative flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-pink-500 text-white shadow-md">
          <Hash className="h-6 w-6" />
          {hot && (
            <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-orange-500 text-white shadow ring-2 ring-card">
              <Flame className="h-3 w-3" />
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-semibold text-foreground">
            #{r.tag}
          </p>
          <p className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Users className="h-3 w-3" /> {r.memberCount}
            </span>
            <span className="inline-flex items-center gap-1">
              <MessageCircle className="h-3 w-3" /> {r.messageCount}
            </span>
            {hot && (
              <span className="rounded-full bg-pink-500/15 px-1.5 py-0.5 font-medium text-pink-500">
                {t("rooms.cardNew", { count: r.recentMessages })}
              </span>
            )}
          </p>
        </div>
      </div>
      {r.lastMessage && (
        <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">
            {r.lastMessage.senderName}:
          </span>{" "}
          {r.lastMessage.content}
        </p>
      )}
    </Link>
  );
}
