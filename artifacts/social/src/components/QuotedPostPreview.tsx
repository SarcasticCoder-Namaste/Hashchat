import type { QuotedPost } from "@workspace/api-client-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Quote } from "lucide-react";

interface QuotedPostPreviewProps {
  quoted: QuotedPost;
  compact?: boolean;
}

export function QuotedPostPreview({ quoted, compact }: QuotedPostPreviewProps) {
  if (quoted.unavailable || !quoted.author) {
    return (
      <div
        className="mt-2 flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground"
        data-testid="quoted-unavailable"
      >
        <Quote className="h-3.5 w-3.5" />
        This post is unavailable.
      </div>
    );
  }

  return (
    <div
      className="mt-2 rounded-lg border border-border bg-muted/30 p-2.5"
      data-testid={`quoted-post-${quoted.id}`}
    >
      <div className="flex items-center gap-2">
        <Avatar className="h-5 w-5 shrink-0">
          {quoted.author.avatarUrl ? (
            <AvatarImage
              src={quoted.author.avatarUrl}
              alt={quoted.author.displayName}
            />
          ) : null}
          <AvatarFallback className="bg-primary/15 text-[10px] text-primary">
            {quoted.author.displayName.slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <span className="truncate text-xs font-semibold text-foreground">
          {quoted.author.displayName}
        </span>
        <span className="truncate text-xs text-muted-foreground">
          @{quoted.author.username}
        </span>
      </div>
      {quoted.content && (
        <p
          className={[
            "mt-1 whitespace-pre-wrap break-words text-sm text-foreground/90",
            compact ? "line-clamp-3" : "",
          ].join(" ")}
        >
          {quoted.content}
        </p>
      )}
      {!compact && quoted.imageUrls.length > 0 && (
        <div className="mt-2 flex gap-1">
          {quoted.imageUrls.slice(0, 3).map((u, i) => (
            <img
              key={i}
              src={u}
              alt=""
              className="h-14 w-14 rounded object-cover"
            />
          ))}
        </div>
      )}
    </div>
  );
}
