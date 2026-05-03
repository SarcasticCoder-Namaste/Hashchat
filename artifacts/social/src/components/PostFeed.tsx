import { useEffect, useRef } from "react";
import { useQueryClient, useInfiniteQuery } from "@tanstack/react-query";
import {
  getMyFeedPosts,
  getHashtagPosts,
  getUserPosts,
  getGetHashtagPostsQueryKey,
  getGetUserPostsQueryKey,
  getGetMyFeedPostsQueryKey,
  type Post,
  type GetUserPostsTab,
} from "@workspace/api-client-react";
import { PostCard } from "./PostCard";
import { Button } from "./ui/button";
import { Loader2, Megaphone } from "lucide-react";
import { useTier } from "@/hooks/useTier";

const PAGE_SIZE = 30;

interface PostFeedProps {
  scope:
    | { kind: "hashtag"; tag: string }
    | { kind: "user"; userId: string; tab?: GetUserPostsTab }
    | { kind: "home" };
  meId: string | null;
  emptyMessage?: string;
  canModerate?: boolean;
}

export function PostFeed({ scope, meId, emptyMessage, canModerate }: PostFeedProps) {
  const qc = useQueryClient();
  const { isPremium } = useTier();
  const userTab: GetUserPostsTab | undefined =
    scope.kind === "user" ? scope.tab : undefined;

  const queryKey =
    scope.kind === "home"
      ? getGetMyFeedPostsQueryKey({ limit: PAGE_SIZE })
      : scope.kind === "hashtag"
        ? getGetHashtagPostsQueryKey(scope.tag, { limit: PAGE_SIZE })
        : getGetUserPostsQueryKey(scope.userId, {
            limit: PAGE_SIZE,
            ...(userTab ? { tab: userTab } : {}),
          });

  const refetchInterval =
    scope.kind === "home" ? 15000 : scope.kind === "hashtag" ? 8000 : false;

  const q = useInfiniteQuery({
    queryKey,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) => {
      const params = {
        limit: PAGE_SIZE,
        ...(pageParam ? { before: pageParam } : {}),
      };
      if (scope.kind === "home") {
        return getMyFeedPosts(params, { signal });
      }
      if (scope.kind === "hashtag") {
        return getHashtagPosts(scope.tag, params, { signal });
      }
      return getUserPosts(
        scope.userId,
        { ...params, ...(userTab ? { tab: userTab } : {}) },
        { signal },
      );
    },
    getNextPageParam: (lastPage: Post[]) => {
      if (!lastPage || lastPage.length < PAGE_SIZE) return undefined;
      return lastPage[lastPage.length - 1].createdAt;
    },
    refetchInterval,
    retry: (failureCount, err) => {
      const status = (err as { status?: number } | null)?.status;
      if (status === 403) return false;
      return failureCount < 3;
    },
  });

  function invalidate() {
    if (scope.kind === "hashtag") {
      qc.invalidateQueries({
        queryKey: getGetHashtagPostsQueryKey(scope.tag),
      });
    } else if (scope.kind === "user") {
      qc.invalidateQueries({
        queryKey: getGetUserPostsQueryKey(scope.userId),
      });
    } else {
      qc.invalidateQueries({ queryKey: getGetMyFeedPostsQueryKey() });
    }
  }

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!q.hasNextPage || q.isFetchingNextPage) return;
    const node = sentinelRef.current;
    if (!node) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          q.fetchNextPage();
        }
      },
      { rootMargin: "300px 0px" },
    );
    obs.observe(node);
    return () => obs.disconnect();
  }, [q.hasNextPage, q.isFetchingNextPage, q]);

  if (q.isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground/70" />
      </div>
    );
  }
  if (q.isError) {
    const status = (q.error as { status?: number } | null)?.status;
    if (status === 403) {
      return (
        <div className="flex justify-center py-8 text-sm text-muted-foreground">
          This user keeps their likes private.
        </div>
      );
    }
    return (
      <div className="flex justify-center py-8 text-sm text-muted-foreground">
        Couldn't load posts.
      </div>
    );
  }
  const posts = q.data?.pages.flat() ?? [];
  if (posts.length === 0) {
    return (
      <div className="flex justify-center py-8 text-sm text-muted-foreground">
        {emptyMessage ?? "No posts yet."}
      </div>
    );
  }
  // Free-tier users in the For You / home feed see a single Sponsored slot.
  // Premium and Pro members are ad-free, so the slot is omitted entirely.
  const showSponsored = scope.kind === "home" && !isPremium && posts.length >= 2;
  return (
    <div className="flex flex-col gap-3" data-testid="post-feed">
      {posts.map((p, idx) => (
        <div key={p.id} className="contents">
          <PostCard
            post={p}
            meId={meId}
            onDeleted={invalidate}
            onChanged={invalidate}
            scope={scope.kind === "hashtag" ? { type: "room", key: scope.tag } : undefined}
            canModerate={canModerate}
          />
          {showSponsored && idx === 1 ? (
            <div
              className="rounded-xl border border-dashed border-border bg-muted/40 p-4 text-sm"
              data-testid="sponsored-card"
            >
              <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <Megaphone className="h-3 w-3" /> Sponsored
              </div>
              <p className="font-medium text-foreground">
                Tired of ads? Go ad-free with HashChat Premium.
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Premium hides this slot and unlocks custom accents, larger
                uploads, and more.
              </p>
            </div>
          ) : null}
        </div>
      ))}
      {q.hasNextPage ? (
        <div
          ref={sentinelRef}
          className="flex justify-center py-4"
          data-testid="feed-load-more"
        >
          {q.isFetchingNextPage ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground/70" />
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => q.fetchNextPage()}
              data-testid="button-load-more"
            >
              Load more
            </Button>
          )}
        </div>
      ) : null}
    </div>
  );
}
