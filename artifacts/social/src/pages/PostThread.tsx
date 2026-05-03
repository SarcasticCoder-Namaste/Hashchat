import { Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetMe,
  useGetPost,
  useGetPostReplies,
  getGetPostQueryKey,
  getGetPostRepliesQueryKey,
} from "@workspace/api-client-react";
import { PostCard } from "@/components/PostCard";
import { PostComposer } from "@/components/PostComposer";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2 } from "lucide-react";

interface Props {
  id: number;
}

export default function PostThread({ id }: Props) {
  const meQ = useGetMe();
  const meId = meQ.data?.id ?? null;
  const qc = useQueryClient();
  const [, setLocation] = useLocation();

  const postQ = useGetPost(id, {
    query: { queryKey: getGetPostQueryKey(id) },
  });
  const repliesQ = useGetPostReplies(id, {}, {
    query: { queryKey: getGetPostRepliesQueryKey(id, {}) },
  });

  function invalidate() {
    qc.invalidateQueries({ queryKey: getGetPostQueryKey(id) });
    qc.invalidateQueries({ queryKey: getGetPostRepliesQueryKey(id, {}) });
  }

  const post = postQ.data;
  const replies = repliesQ.data ?? [];
  const isLoading = postQ.isLoading || repliesQ.isLoading;
  const status = (postQ.error as { status?: number } | null)?.status;

  return (
    <div
      className="mx-auto max-w-3xl space-y-4 px-4 py-6 md:px-8 md:py-8"
      data-testid="post-thread-page"
    >
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            if (window.history.length > 1) window.history.back();
            else setLocation("/app/home");
          }}
          data-testid="button-thread-back"
        >
          <ArrowLeft className="mr-1 h-4 w-4" /> Back
        </Button>
        <h1 className="text-xl font-bold text-foreground">Thread</h1>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground/70" />
        </div>
      ) : !post ? (
        <div className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
          {status === 404
            ? "This post is unavailable."
            : "Couldn't load this post."}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {post.replyToId != null && post.replyToAuthorUsername && (
            <div className="text-xs text-muted-foreground">
              In reply to{" "}
              <Link
                href={`/app/post/${post.replyToId}`}
                className="font-medium text-primary hover:underline"
                data-testid="link-thread-parent"
              >
                @{post.replyToAuthorUsername}
              </Link>
            </div>
          )}
          <PostCard
            post={post}
            meId={meId}
            onChanged={invalidate}
            onDeleted={() => setLocation("/app/home")}
          />

          <div
            className="rounded-xl border border-border bg-card p-3"
            data-testid="thread-reply-composer"
          >
            <p className="mb-2 text-xs font-medium text-muted-foreground">
              Reply to @{post.author.username}
            </p>
            <PostComposer
              placeholder={`Reply to @${post.author.username}…`}
              replyToId={post.id}
              onPosted={invalidate}
              hideHistorySheets
            />
          </div>

          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            {replies.length} {replies.length === 1 ? "reply" : "replies"}
            <span className="h-px flex-1 bg-border" />
          </div>

          {replies.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-card/50 p-6 text-center text-sm text-muted-foreground">
              No replies yet. Be the first to chime in.
            </div>
          ) : (
            <div className="flex flex-col gap-3" data-testid="thread-replies">
              {replies.map((r) => (
                <PostCard
                  key={r.id}
                  post={r}
                  meId={meId}
                  onChanged={invalidate}
                  onDeleted={invalidate}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
