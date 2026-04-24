import { useQueryClient } from "@tanstack/react-query";
import {
  useGetHashtagPosts,
  useGetUserPosts,
  useGetMyFeedPosts,
  getGetHashtagPostsQueryKey,
  getGetUserPostsQueryKey,
  getGetMyFeedPostsQueryKey,
} from "@workspace/api-client-react";
import { PostCard } from "./PostCard";
import { Loader2 } from "lucide-react";

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
  const homeQ = useGetMyFeedPosts({
    query: {
      queryKey: getGetMyFeedPostsQueryKey(),
      enabled: scope.kind === "home",
      refetchInterval: 15000,
    },
  });

  const q =
    scope.kind === "hashtag"
      ? hashtagQ
      : scope.kind === "user"
        ? userQ
        : homeQ;

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
