import { Link } from "wouter";
import {
  useDiscoverPeople,
  useGetTrendingHashtags,
  useGetMe,
  useOpenConversation,
  type MatchUser,
} from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Hash, Sparkles, MessageCircle, TrendingUp, Loader2 } from "lucide-react";

export default function Discover() {
  const { data: me } = useGetMe();
  const { data: matches, isLoading } = useDiscoverPeople({ limit: 12 });
  const { data: trending } = useGetTrendingHashtags({ limit: 10 });

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-6 md:px-8 md:py-10">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">
          Welcome back{me ? `, ${me.displayName.split(" ")[0]}` : ""} 👋
        </h1>
        <p className="mt-1 text-slate-600">
          Fresh matches and trending hashtags based on what you love.
        </p>
      </div>

      <section>
        <div className="mb-3 flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-violet-600" />
          <h2 className="text-lg font-semibold text-slate-900">Smart matches</h2>
        </div>
        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-44 animate-pulse rounded-xl bg-white" />
            ))}
          </div>
        ) : matches && matches.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {matches.map((m) => (
              <MatchCard key={m.id} m={m} />
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-500">
            No matches yet. Add more hashtags from your profile to find people.
          </div>
        )}
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-pink-600" />
            <h2 className="text-lg font-semibold text-slate-900">Trending now</h2>
          </div>
          <Link href="/app/trending" className="text-sm font-medium text-violet-700 hover:underline" data-testid="link-all-trending">
              See all
            </Link>
        </div>
        <div className="flex flex-wrap gap-2">
          {trending?.map((t) => (
            <Link key={t.tag} href={`/app/rooms/${encodeURIComponent(t.tag)}`} data-testid={`discover-trend-${t.tag}`} className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-violet-50 hover:text-violet-700">
                <Hash className="h-3.5 w-3.5" />
                {t.tag}
                <span className="ml-1 text-xs text-slate-400">
                  {t.recentMessages}↑
                </span>
              </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

function MatchCard({ m }: { m: MatchUser }) {
  const [, setLocation] = useLocation();
  const open = useOpenConversation({
    mutation: {
      onSuccess: (conv) => setLocation(`/app/messages/${conv.id}`),
    },
  });
  const initials = m.displayName
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div
      className="flex flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
      data-testid={`match-${m.username}`}
    >
      <div className="flex items-center gap-3">
        <Avatar className="h-12 w-12">
          {m.avatarUrl ? <AvatarImage src={m.avatarUrl} alt={m.displayName} /> : null}
          <AvatarFallback className="bg-violet-200 text-violet-700">
            {initials}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-slate-900">{m.displayName}</p>
          <p className="truncate text-sm text-slate-500">@{m.username}</p>
        </div>
        <span
          className="rounded-full bg-gradient-to-r from-violet-100 to-pink-100 px-2 py-0.5 text-xs font-semibold text-violet-700"
          data-testid={`match-score-${m.username}`}
        >
          {m.matchScore}↑
        </span>
      </div>
      {m.bio && (
        <p className="mt-3 line-clamp-2 text-sm text-slate-600">{m.bio}</p>
      )}
      <div className="mt-3 flex flex-wrap gap-1">
        {m.sharedHashtags.slice(0, 4).map((t) => (
          <span
            key={t}
            className="inline-flex items-center gap-0.5 rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-700"
          >
            <Hash className="h-3 w-3" />
            {t}
          </span>
        ))}
      </div>
      <Button
        size="sm"
        className="mt-4 bg-violet-600 hover:bg-violet-700"
        onClick={() => open.mutate({ data: { userId: m.id } })}
        disabled={open.isPending}
        data-testid={`button-message-${m.username}`}
      >
        {open.isPending ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <MessageCircle className="mr-2 h-4 w-4" />
        )}
        Say hi
      </Button>
    </div>
  );
}
