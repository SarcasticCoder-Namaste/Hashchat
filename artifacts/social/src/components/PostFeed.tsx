import { useEffect, useRef } from "react";
import { useQueryClient, useInfiniteQuery } from "@tanstack/react-query";
import {
  useGetHashtagPosts,
  useGetUserPosts,
  getMyFeedPosts,
  getGetHashtagPostsQueryKey,
  getGetUserPostsQueryKey,
  getGetMyFeedPostsQueryKey,
  type Post,
} from "@workspace/api-client-react";
import { PostCard } from "./PostCard";
import { Button } from "./ui/button";
import { Loader2 } from "lucide-react";

const HOME_PAGE_SIZE = 30;

interface PostFeedProps {
  scope:
    | { kind: "hashtag"; tag: string }
    | { kind: "user"; userId: string }
    | { kind: "home" };
  meId: string | null;
  emptyMessage?: string;
}

export function PostFeed({ scope, meId, emptyMessage }: PostFeedProps) {
  const qc = useQueryClient();

  const hashtagTag = scope.kind === "hashtag" ? scope.tag : "";
  const userId = scope.kind === "user" ? scope.userId : "";
  const hashtagQ = useGetHashtagPosts(hashtagTag, {
    query: {
      queryKey: getGetHashtagPostsQueryKey(hashtagTag),
      enabled: scope.kind === "hashtag",
      refetchInterval: 8000,
    },
  });
  const userQ = useGetUserPosts(userId, {
    query: {
      queryKey: getGetUserPostsQueryKey(userId),
      enabled: scope.kind === "user",
    },
  });
  const homeQ = useInfiniteQuery({
    queryKey: getGetMyFeedPostsQueryKey({ limit: HOME_PAGE_SIZE }),
    enabled: scope.kind === "home",
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      getMyFeedPosts(
        { limit: HOME_PAGE_SIZE, ...(pageParam ? { before: pageParam } : {}) },
        { signal },
      ),
    getNextPageParam: (lastPage: Post[]) => {
      if (!lastPage || lastPage.length < HOME_PAGE_SIZE) return undefined;
      return lastPage[lastPage.length - 1].createdAt;
    },
    refetchInterval: 15000,
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
    if (scope.kind !== "home") return;
    if (!homeQ.hasNextPage || homeQ.isFetchingNextPage) return;
    const node = sentinelRef.current;
    if (!node) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          homeQ.fetchNextPage();
        }
      },
      { rootMargin: "300px 0px" },
    );
    obs.observe(node);
    return () => obs.disconnect();
  }, [scope.kind, homeQ.hasNextPage, homeQ.isFetchingNextPage, homeQ]);

  if (scope.kind === "home") {
    if (homeQ.isLoading) {
      return (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground/70" />
        </div>
      );
    }
    const posts = homeQ.data?.pages.flat() ?? [];
    if (posts.length === 0) {
      return (
        <div className="flex justify-center py-8 text-sm text-muted-foreground">
          {emptyMessage ?? "No posts yet."}
        </div>
      );
    }
    return (
      <div className="flex flex-col gap-3" data-testid="post-feed">
        {posts.map((p) => (
          <PostCard key={p.id} post={p} meId={meId} onDeleted={invalidate} />
        ))}
        {homeQ.hasNextPage ? (
          <div
            ref={sentinelRef}
            className="flex justify-center py-4"
            data-testid="feed-load-more"
          >
            {homeQ.isFetchingNextPage ? (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground/70" />
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => homeQ.fetchNextPage()}
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

  const q = scope.kind === "hashtag" ? hashtagQ : userQ;

  if (q.isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground/70" />
      </div>
    );
  }
  if (!q.data || q.data.length === 0) {
    return (
      <div className="flex justify-center py-8 text-sm text-muted-foreground">
        {emptyMessage ?? "No posts yet."}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3" data-testid="post-feed">
      {q.data.map((p) => (
        <PostCard key={p.id} post={p} meId={meId} onDeleted={invalidate} />
      ))}
    </div>
  );
}
