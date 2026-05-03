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
} from "@workspace/api-client-react";
import { PostCard } from "./PostCard";
import { Button } from "./ui/button";
import { Loader2 } from "lucide-react";

const PAGE_SIZE = 30;

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

  const queryKey =
    scope.kind === "home"
      ? getGetMyFeedPostsQueryKey({ limit: PAGE_SIZE })
      : scope.kind === "hashtag"
        ? getGetHashtagPostsQueryKey(scope.tag, { limit: PAGE_SIZE })
        : getGetUserPostsQueryKey(scope.userId, { limit: PAGE_SIZE });

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
      return getUserPosts(scope.userId, params, { signal });
    },
    getNextPageParam: (lastPage: Post[]) => {
      if (!lastPage || lastPage.length < PAGE_SIZE) return undefined;
      return lastPage[lastPage.length - 1].createdAt;
    },
    refetchInterval,
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
  const posts = q.data?.pages.flat() ?? [];
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
        <PostCard
          key={p.id}
          post={p}
          meId={meId}
          onDeleted={invalidate}
          onChanged={invalidate}
        />
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
