import { Link } from "wouter";
import {
  useDeletePost,
  type Post,
} from "@workspace/api-client-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Trash2, BadgeCheck } from "lucide-react";

interface PostCardProps {
  post: Post;
  meId: string | null;
  onDeleted?: () => void;
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

function renderContent(content: string) {
  const parts = content.split(/(#[A-Za-z0-9_]+)/g);
  return parts.map((p, i) => {
    if (p.startsWith("#")) {
      const tag = p.slice(1).toLowerCase();
      return (
        <Link
          key={i}
          href={`/app/r/${tag}`}
          className="text-primary hover:underline"
          data-testid={`link-tag-${tag}`}
        >
          {p}
        </Link>
      );
    }
    return <span key={i}>{p}</span>;
  });
}

export function PostCard({ post, meId, onDeleted }: PostCardProps) {
  const isMine = meId === post.author.id;
  const del = useDeletePost({
    mutation: { onSuccess: () => onDeleted?.() },
  });

  return (
    <article
      className="flex gap-3 rounded-xl border border-border bg-card p-3"
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
          {isMine && (
            <Button
              variant="ghost"
              size="icon"
              className="ml-auto h-7 w-7 text-muted-foreground hover:text-destructive"
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
        {post.content && (
          <p className="mt-1 whitespace-pre-wrap break-words text-sm text-foreground">
            {renderContent(post.content)}
          </p>
        )}
        {post.imageUrls.length > 0 && (
          <div
            className={[
              "mt-2 grid gap-1 overflow-hidden rounded-lg",
              post.imageUrls.length === 1
                ? "grid-cols-1"
                : post.imageUrls.length === 2
                  ? "grid-cols-2"
                  : "grid-cols-2",
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
      </div>
    </article>
  );
}
