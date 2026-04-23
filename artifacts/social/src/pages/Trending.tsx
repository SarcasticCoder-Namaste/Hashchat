import { Link } from "wouter";
import { useState } from "react";
import {
  useGetTrendingHashtags,
  useSearchHashtags,
  useGetMyFollowedHashtags,
  useFollowHashtag,
  useUnfollowHashtag,
  getGetMyFollowedHashtagsQueryKey,
  getGetTrendingHashtagsQueryKey,
  getSearchHashtagsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Hash, Search, TrendingUp, Star, Loader2 } from "lucide-react";

export default function Trending() {
  const [query, setQuery] = useState("");
  const trimmed = query.trim();
  const trending = useGetTrendingHashtags({ limit: 20 });
  const search = useSearchHashtags(
    { q: trimmed },
    {
      query: {
        queryKey: getSearchHashtagsQueryKey({ q: trimmed }),
        enabled: trimmed.length > 0,
      },
    },
  );
  const followed = useGetMyFollowedHashtags();
  const followedSet = new Set(followed.data?.map((f) => f.tag));
  const qc = useQueryClient();

  const follow = useFollowHashtag({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetMyFollowedHashtagsQueryKey() });
        qc.invalidateQueries({ queryKey: getGetTrendingHashtagsQueryKey() });
      },
    },
  });
  const unfollow = useUnfollowHashtag({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetMyFollowedHashtagsQueryKey() });
        qc.invalidateQueries({ queryKey: getGetTrendingHashtagsQueryKey() });
      },
    },
  });

  const list = trimmed ? search.data : trending.data;
  const loading = trimmed ? search.isLoading : trending.isLoading;

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 md:px-8 md:py-10">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Trending hashtags</h1>
        <p className="mt-1 text-slate-600">
          Follow tags to keep up with the action and get smart matches.
        </p>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          className="pl-9"
          placeholder="Search hashtags…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          data-testid="input-search-tags"
        />
      </div>

      {followed.data && followed.data.length > 0 && !trimmed && (
        <section>
          <p className="mb-2 text-sm font-medium text-slate-700">
            You're following
          </p>
          <div className="flex flex-wrap gap-2">
            {followed.data.map((f) => (
              <Link key={f.tag} href={`/app/rooms/${encodeURIComponent(f.tag)}`} className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-3 py-1.5 text-sm font-medium text-violet-700 hover:bg-violet-200" data-testid={`followed-${f.tag}`}>
                  <Hash className="h-3.5 w-3.5" /> {f.tag}
                </Link>
            ))}
          </div>
        </section>
      )}

      <section className="rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center gap-2 border-b border-slate-100 p-4">
          <TrendingUp className="h-4 w-4 text-pink-600" />
          <p className="text-sm font-semibold text-slate-700">
            {trimmed ? `Results for "${trimmed}"` : "Hot right now"}
          </p>
        </div>
        {loading ? (
          <div className="p-8 text-center text-slate-500">
            <Loader2 className="mx-auto h-5 w-5 animate-spin" />
          </div>
        ) : list && list.length > 0 ? (
          <ul className="divide-y divide-slate-100">
            {list.map((t) => {
              const isFollowed = followedSet.has(t.tag);
              const recent =
                "recentMessages" in t && typeof (t as { recentMessages?: number }).recentMessages === "number"
                  ? (t as { recentMessages: number }).recentMessages
                  : 0;
              return (
                <li
                  key={t.tag}
                  className="flex items-center gap-3 p-4"
                  data-testid={`trend-row-${t.tag}`}
                >
                  <Link href={`/app/rooms/${encodeURIComponent(t.tag)}`} className="flex flex-1 items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-pink-500 text-white">
                        <Hash className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-slate-900">
                          #{t.tag}
                        </p>
                        <p className="text-xs text-slate-500">
                          {t.memberCount} members · {t.messageCount} messages
                          {recent > 0 ? ` · ${recent} new` : ""}
                        </p>
                      </div>
                    </Link>
                  <Button
                    size="sm"
                    variant={isFollowed ? "secondary" : "outline"}
                    onClick={() =>
                      isFollowed
                        ? unfollow.mutate({ tag: t.tag })
                        : follow.mutate({ tag: t.tag })
                    }
                    disabled={follow.isPending || unfollow.isPending}
                    data-testid={`button-follow-${t.tag}`}
                  >
                    <Star
                      className={[
                        "mr-1 h-3.5 w-3.5",
                        isFollowed ? "fill-yellow-400 text-yellow-500" : "",
                      ].join(" ")}
                    />
                    {isFollowed ? "Following" : "Follow"}
                  </Button>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="p-8 text-center text-slate-500">
            {trimmed ? "No matches." : "Nothing trending yet."}
          </div>
        )}
        {trimmed && list && (
          <div className="border-t border-slate-100 p-3">
            <Link href={`/app/rooms/${encodeURIComponent(trimmed.toLowerCase().replace(/^#/, ""))}`} className="text-sm font-medium text-violet-700 hover:underline" data-testid="link-jump-tag">
                Jump to #{trimmed.toLowerCase().replace(/^#/, "")} →
              </Link>
          </div>
        )}
      </section>
    </div>
  );
}
