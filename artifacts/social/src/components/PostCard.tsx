import { useState } from "react";
import { Link } from "wouter";
import {
  useDeletePost,
  useAddPostReaction,
  useRemovePostReaction,
  type Post,
} from "@workspace/api-client-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Trash2, BadgeCheck, Smile } from "lucide-react";
import { BookmarkButton } from "./BookmarkButton";
import { renderRichContent } from "@/lib/mentions";

const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🔥", "🎉", "🙌"];

interface PostCardProps {
  post: Post;
  meId: string | null;
  onDeleted?: () => void;
  onChanged?: () => void;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(iso).toLocaleDateString();
}

export function PostCard({ post, meId, onDeleted, onChanged }: PostCardProps) {
  const isMine = meId === post.author.id;
  const [pickerOpen, setPickerOpen] = useState(false);
  const del = useDeletePost({
    mutation: { onSuccess: () => onDeleted?.() },
  });
  const addReaction = useAddPostReaction({
    mutation: { onSuccess: () => onChanged?.() },
  });
  const removeReaction = useRemovePostReaction({
    mutation: { onSuccess: () => onChanged?.() },
  });

  function toggleEmoji(emoji: string, mine: boolean) {
    if (mine) {
      removeReaction.mutate({ id: post.id, params: { emoji } });
    } else {
      addReaction.mutate({ id: post.id, data: { emoji } });
    }
    setPickerOpen(false);
  }

  return (
    <article
      className="group flex gap-3 rounded-xl border border-border bg-card p-3"
      data-testid={`post-${post.id}`}
    >
      <Avatar className="h-10 w-10 shrink-0">
        {post.author.avatarUrl ? (
          <AvatarImage src={post.author.avatarUrl} alt={post.author.displayName} />
        ) : null}
        <AvatarFallback className="bg-primary/15 text-primary">
          {post.author.displayName
            .split(" ")
            .map((s) => s[0])
            .slice(0, 2)
            .join("")
            .toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <Link
            href={`/app/u/${post.author.username}`}
            className="truncate text-sm font-semibold text-foreground hover:underline"
            data-testid={`link-author-${post.id}`}
          >
            {post.author.displayName}
          </Link>
          {post.author.verified && (
            <span title="Verified" data-testid="badge-verified" className="inline-flex shrink-0 items-center text-sky-500 dark:text-sky-400">
              <BadgeCheck className="h-3.5 w-3.5 fill-sky-500/20" />
            </span>
          )}
          <span className="truncate text-xs text-muted-foreground">
            @{post.author.username}
          </span>
          <span className="text-xs text-muted-foreground/70">·</span>
          <span className="text-xs text-muted-foreground/70">
            {timeAgo(post.createdAt)}
          </span>
          <div className="ml-auto flex items-center gap-0.5">
            <BookmarkButton kind="post" targetId={post.id} />
            {isMine && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                onClick={() => {
                  if (confirm("Delete this post?")) del.mutate({ id: post.id });
                }}
                disabled={del.isPending}
                data-testid={`button-delete-post-${post.id}`}
                aria-label="Delete post"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
        {post.content && (
          <p className="mt-1 whitespace-pre-wrap break-words text-sm text-foreground">
            {renderRichContent(post.content, post.mentions)}
          </p>
        )}
        {post.imageUrls.length > 0 && (
          <div
            className={[
              "mt-2 grid gap-1 overflow-hidden rounded-lg",
              post.imageUrls.length === 1 ? "grid-cols-1" : "grid-cols-2",
            ].join(" ")}
          >
            {post.imageUrls.map((u, i) => (
              <a
                key={i}
                href={u}
                target="_blank"
                rel="noreferrer"
                className="block"
              >
                <img
                  src={u}
                  alt=""
                  className="aspect-square w-full object-cover"
                  loading="lazy"
                />
              </a>
            ))}
          </div>
        )}
        <div className="mt-2 flex items-center gap-1.5">
          {post.reactions.map((r) => (
            <button
              type="button"
              key={r.emoji}
              onClick={() => toggleEmoji(r.emoji, r.reactedByMe)}
              data-testid={`post-reaction-${post.id}-${r.emoji}`}
              className={[
                "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors",
                r.reactedByMe
                  ? "border-primary/60 bg-primary/15 text-foreground"
                  : "border-border bg-card text-muted-foreground hover:bg-accent",
              ].join(" ")}
            >
              <span>{r.emoji}</span>
              <span className="font-medium">{r.count}</span>
            </button>
          ))}
          <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                data-testid={`button-post-react-${post.id}`}
                aria-label="Add reaction"
              >
                <Smile className="h-3.5 w-3.5" />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              align="start"
              side="top"
              className="flex w-auto gap-1 p-1.5"
            >
              {QUICK_REACTIONS.map((e) => (
                <button
                  key={e}
                  type="button"
                  className="rounded-md p-1 text-lg hover:bg-accent"
                  onClick={() => toggleEmoji(e, false)}
                  data-testid={`pick-post-${e}`}
                >
                  {e}
                </button>
              ))}
            </PopoverContent>
          </Popover>
        </div>
      </div>
    </article>
  );
}
