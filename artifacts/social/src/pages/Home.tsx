import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetMe,
  useGetMyFollowedHashtags,
  getGetMyFeedPostsQueryKey,
} from "@workspace/api-client-react";
import { PostFeed } from "@/components/PostFeed";
import { PostComposer } from "@/components/PostComposer";
import { Button } from "@/components/ui/button";
import { Hash, Home as HomeIcon, Loader2 } from "lucide-react";

export default function Home() {
  const meQ = useGetMe();
  const meId = meQ.data?.id ?? null;
  const followedQ = useGetMyFollowedHashtags();
  const qc = useQueryClient();

  const followed = followedQ.data ?? [];

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 md:px-8 md:py-10">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500/20 to-pink-500/20 ring-1 ring-violet-500/30">
          <HomeIcon className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-foreground">Home</h1>
          <p className="text-sm text-muted-foreground">
            The latest posts from rooms you follow.
          </p>
        </div>
      </div>

      {followedQ.isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground/70" />
        </div>
      ) : followed.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card/40 p-8 text-center">
          <Hash className="h-8 w-8 text-muted-foreground/70" />
          <p className="text-sm text-muted-foreground">
            Follow some hashtag rooms to start filling up your home feed.
          </p>
          <Link href="/app/trending">
            <Button data-testid="link-find-rooms">Find rooms</Button>
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <PostComposer
            placeholder="Share something with the rooms you follow…"
            onPosted={() =>
              qc.invalidateQueries({
                queryKey: getGetMyFeedPostsQueryKey(),
              })
            }
          />
          <PostFeed
            scope={{ kind: "home" }}
            meId={meId}
            emptyMessage="No posts yet from the rooms you follow — check back soon!"
          />
        </div>
      )}
    </div>
  );
}
