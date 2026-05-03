import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useDeletePost,
  useAddPostReaction,
  useRemovePostReaction,
  useUpdatePost,
  useGetPostEdits,
  getGetPostEditsQueryKey,
  useGetPostQuotes,
  getGetPostQuotesQueryKey,
  usePinMyPost,
  useUnpinMyPost,
  getGetUserPinnedPostsQueryKey,
  getGetUserPostsQueryKey,
  type Post,
  type QuotedPost,
} from "@workspace/api-client-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  BarChart3,
  Trash2,
  BadgeCheck,
  Smile,
  MoreHorizontal,
  Pencil,
  Quote,
  Loader2,
  Lock,
  Pin,
  PinOff,
  CornerUpLeft,
} from "lucide-react";
import { BookmarkButton } from "./BookmarkButton";
import { GifMedia, isGifUrl } from "./GifMedia";
import { PostStatsSheet } from "./PostStatsSheet";
import { renderRichContent } from "@/lib/mentions";
import { QuotedPostPreview } from "./QuotedPostPreview";
import { PostComposer } from "./PostComposer";
import { usePostImpression, recordPostClick } from "@/hooks/usePostImpression";
import { useToast } from "@/hooks/use-toast";
import { ModerationMenu, type ModerationScope } from "./ModerationMenu";

const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🔥", "🎉", "🙌"];

interface PostCardProps {
  post: Post;
  meId: string | null;
  onDeleted?: () => void;
  onChanged?: () => void;
  scope?: ModerationScope;
  canModerate?: boolean;
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

export function PostCard({ post, meId, onDeleted, onChanged, scope, canModerate }: PostCardProps) {
  const isMine = meId === post.author.id;
  const qc = useQueryClient();
  const { toast } = useToast();
  const isRemoved = !!post.removedAt;
  const isLocked = !!post.lockedAt;
  const isPinnedHere =
    !!scope &&
    (post.pinnedInScopes ?? []).some(
      (s) => s.scopeType === scope.type && s.scopeKey === scope.key,
    );


  const [pickerOpen, setPickerOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(post.content);
  const [quoteOpen, setQuoteOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  const articleRef = useRef<HTMLElement | null>(null);
  usePostImpression(articleRef, post.id, !!meId && !isMine);
  const [quotesListOpen, setQuotesListOpen] = useState(false);

  useEffect(() => {
    setEditText(post.content);
  }, [post.content]);

  function invalidatePinQueries() {
    qc.invalidateQueries({
      queryKey: getGetUserPinnedPostsQueryKey(post.author.id),
    });
    qc.invalidateQueries({
      queryKey: getGetUserPostsQueryKey(post.author.id),
    });
  }

  const del = useDeletePost({
    mutation: {
      onSuccess: () => {
        invalidatePinQueries();
        onDeleted?.();
      },
    },
  });
  const update = useUpdatePost({
    mutation: {
      onSuccess: () => {
        setEditing(false);
        onChanged?.();
      },
    },
  });
  const addReaction = useAddPostReaction({
    mutation: { onSuccess: () => onChanged?.() },
  });
  const removeReaction = useRemovePostReaction({
    mutation: { onSuccess: () => onChanged?.() },
  });
  const pin = usePinMyPost({
    mutation: {
      onSuccess: () => {
        invalidatePinQueries();
        onChanged?.();
        toast({ title: "Pinned to your profile" });
      },
      onError: (e: unknown) => {
        const status = (e as { status?: number } | null)?.status;
        toast({
          title: "Couldn't pin",
          description:
            status === 400
              ? "You can pin up to 3 posts. Unpin one first."
              : "Please try again.",
          variant: "destructive",
        });
      },
    },
  });
  const unpin = useUnpinMyPost({
    mutation: {
      onSuccess: () => {
        invalidatePinQueries();
        onChanged?.();
        toast({ title: "Unpinned" });
      },
    },
  });

  function toggleEmoji(emoji: string, mine: boolean) {
    if (isLocked) return;
    if (mine) {
      removeReaction.mutate({ id: post.id, params: { emoji } });
    } else {
      addReaction.mutate({ id: post.id, data: { emoji } });
    }
    setPickerOpen(false);
  }

  const editableUntilTs = post.editableUntil
    ? new Date(post.editableUntil).getTime()
    : 0;
  const canEdit = isMine && editableUntilTs > Date.now();

  const quotedPreview: QuotedPost = {
    id: post.id,
    author: post.author,
    content: post.content,
    imageUrls: post.imageUrls,
    createdAt: post.createdAt,
    unavailable: false,
  };

  if (isRemoved && !canModerate) {
    return (
      <article
        className="rounded-xl border border-dashed border-border bg-muted/30 p-3 text-xs italic text-muted-foreground"
        data-testid={`post-removed-${post.id}`}
      >
        [Removed by moderator]
      </article>
    );
  }

  return (
    <article
      ref={articleRef}
      className={[
        "group flex gap-3 rounded-xl border bg-card p-3",
        isPinnedHere ? "border-violet-500/60" : "border-border",
        isRemoved ? "opacity-60" : "",
      ].join(" ")}
      data-testid={`post-${post.id}`}
      aria-label={`Post by ${post.author.displayName}`}
      data-pinned={isPinnedHere ? "true" : undefined}
      data-locked={isLocked ? "true" : undefined}
      data-removed={isRemoved ? "true" : undefined}
    >
      <Avatar className="h-10 w-10 shrink-0">
        {post.author.animatedAvatarUrl || post.author.avatarUrl ? (
          <AvatarImage
            src={post.author.animatedAvatarUrl || post.author.avatarUrl || ""}
            alt={post.author.displayName}
          />
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
        {post.isPinned && (
          <div
            className="mb-1 inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground"
            data-testid={`post-pinned-badge-${post.id}`}
          >
            <Pin className="h-3 w-3" /> Pinned
          </div>
        )}
        <div className="flex items-baseline gap-2">
          <Link
            href={`/app/u/${post.author.username}`}
            className="truncate text-sm font-semibold text-foreground hover:underline"
            data-testid={`link-author-${post.id}`}
            onClick={() => {
              if (!isMine && meId) recordPostClick(post.id, "profile_click");
            }}
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
          {post.editedAt && (
            <Popover open={historyOpen} onOpenChange={setHistoryOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground hover:bg-muted/70"
                  data-testid={`badge-edited-${post.id}`}
                  aria-label="Show edit history"
                >
                  edited
                </button>
              </PopoverTrigger>
              <PopoverContent
                align="start"
                side="bottom"
                className="w-72 p-3"
                data-testid={`history-${post.id}`}
              >
                <PostEditHistory postId={post.id} open={historyOpen} />
              </PopoverContent>
            </Popover>
          )}
          {isPinnedHere && (
            <span title="Pinned" className="text-violet-500" data-testid={`post-pin-badge-${post.id}`}>
              <Pin className="h-3 w-3" />
            </span>
          )}
          {isLocked && (
            <span title="Locked" className="text-amber-500" data-testid={`post-lock-badge-${post.id}`}>
              <Lock className="h-3 w-3" />
            </span>
          )}
          <div className="ml-auto flex items-center gap-0.5">
            <BookmarkButton kind="post" targetId={post.id} />
            {isMine && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                onClick={() => setStatsOpen(true)}
                data-testid={`button-post-stats-${post.id}`}
                aria-label="View post stats"
                title="View stats"
              >
                <BarChart3 className="h-3.5 w-3.5" />
              </Button>
            )}
            <ModerationMenu
              kind="post"
              targetId={post.id}
              scope={scope}
              canModerate={canModerate}
              isPinned={isPinnedHere}
              isLocked={isLocked}
              isRemoved={isRemoved}
              onChanged={onChanged}
            />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground"
                  data-testid={`button-post-menu-${post.id}`}
                  aria-label="Post actions"
                >
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onSelect={() => setQuoteOpen(true)}
                  data-testid={`button-quote-post-${post.id}`}
                >
                  <Quote className="mr-2 h-4 w-4" />
                  Quote
                </DropdownMenuItem>
                {canEdit && (
                  <DropdownMenuItem
                    onSelect={() => setEditing(true)}
                    data-testid={`button-edit-post-${post.id}`}
                  >
                    <Pencil className="mr-2 h-4 w-4" />
                    Edit
                  </DropdownMenuItem>
                )}
                {isMine && (
                  <>
                    {post.isPinned ? (
                      <DropdownMenuItem
                        onSelect={() => unpin.mutate({ id: post.id })}
                        disabled={unpin.isPending}
                        data-testid={`menu-unpin-post-${post.id}`}
                      >
                        <PinOff className="mr-2 h-4 w-4" /> Unpin from profile
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem
                        onSelect={() => pin.mutate({ id: post.id })}
                        disabled={pin.isPending}
                        data-testid={`menu-pin-post-${post.id}`}
                      >
                        <Pin className="mr-2 h-4 w-4" /> Pin to profile
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onSelect={() => {
                        if (confirm("Delete this post?"))
                          del.mutate({ id: post.id });
                      }}
                      disabled={del.isPending}
                      data-testid={`button-delete-post-${post.id}`}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        {post.replyToId != null && post.replyToAuthorUsername && (
          <div
            className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground"
            data-testid={`post-reply-line-${post.id}`}
          >
            <CornerUpLeft className="h-3 w-3" />
            <span>Replying to</span>
            <Link
              href={`/app/u/${post.replyToAuthorUsername}`}
              className="font-medium hover:underline"
            >
              @{post.replyToAuthorUsername}
            </Link>
          </div>
        )}
        {editing ? (
          <div className="mt-2 flex flex-col gap-2">
            <textarea
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              rows={3}
              maxLength={500}
              className="w-full resize-none rounded-md border border-border bg-background p-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              data-testid={`input-edit-post-${post.id}`}
            />
            <div className="flex items-center justify-end gap-2">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  setEditing(false);
                  setEditText(post.content);
                }}
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={
                  update.isPending ||
                  !editText.trim() ||
                  editText === post.content
                }
                onClick={() =>
                  update.mutate({
                    id: post.id,
                    data: { content: editText.trim() },
                  })
                }
                data-testid={`button-save-edit-${post.id}`}
              >
                {update.isPending ? (
                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                ) : null}
                Save
              </Button>
            </div>
          </div>
        ) : (
          post.content && (
            <p className="mt-1 whitespace-pre-wrap break-words text-sm text-foreground">
              {renderRichContent(post.content, post.mentions)}
            </p>
          )
        )}
        {post.quotedPost && <QuotedPostPreview quoted={post.quotedPost} />}
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
                onClick={() => {
                  if (!isMine && meId) recordPostClick(post.id, "link_click");
                }}
              >
                {isGifUrl(u) ? (
                  <GifMedia
                    src={u}
                    alt={
                      post.imageAlts?.[i]?.trim() ||
                      `Image attached by ${post.author.displayName}`
                    }
                    className="aspect-square w-full object-cover"
                  />
                ) : (
                  <img
                    src={u}
                    alt={
                      post.imageAlts?.[i]?.trim() ||
                      `Image attached by ${post.author.displayName}`
                    }
                    className="aspect-square w-full object-cover"
                    loading="lazy"
                  />
                )}
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
          <button
            type="button"
            onClick={() => setQuotesListOpen(true)}
            disabled={post.quoteCount === 0}
            className={[
              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors",
              post.quoteCount > 0
                ? "border-border bg-card text-muted-foreground hover:bg-accent"
                : "border-border/60 bg-card text-muted-foreground/60 cursor-default",
            ].join(" ")}
            data-testid={`button-post-quote-count-${post.id}`}
            aria-label={`${post.quoteCount} quote${post.quoteCount === 1 ? "" : "s"}`}
          >
            <Quote className="h-3 w-3" />
            <span className="font-medium">{post.quoteCount}</span>
          </button>
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

      <Dialog open={quotesListOpen} onOpenChange={setQuotesListOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Quotes</DialogTitle>
          </DialogHeader>
          <PostQuotesList
            postId={post.id}
            meId={meId}
            open={quotesListOpen}
            onChanged={onChanged}
          />
          <DialogFooter />
        </DialogContent>
      </Dialog>

      <Dialog open={quoteOpen} onOpenChange={setQuoteOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Quote post</DialogTitle>
          </DialogHeader>
          <PostComposer
            placeholder="Add a comment…"
            initialQuote={quotedPreview}
            onPosted={() => {
              setQuoteOpen(false);
              onChanged?.();
            }}
            onCancelQuote={() => setQuoteOpen(false)}
            hideHistorySheets
          />
          <DialogFooter />
        </DialogContent>
      </Dialog>
      {isMine && (
        <PostStatsSheet
          postId={post.id}
          open={statsOpen}
          onOpenChange={setStatsOpen}
        />
      )}
    </article>
  );
}

function PostQuotesList({
  postId,
  meId,
  open,
  onChanged,
}: {
  postId: number;
  meId: string | null;
  open: boolean;
  onChanged?: () => void;
}) {
  const q = useGetPostQuotes(
    postId,
    {},
    {
      query: {
        queryKey: getGetPostQuotesQueryKey(postId, {}),
        enabled: open,
      },
    },
  );
  const quotes = q.data ?? [];
  return (
    <div
      className="max-h-[60vh] space-y-2 overflow-y-auto"
      data-testid={`quotes-list-${postId}`}
    >
      {q.isLoading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground/70" />
        </div>
      ) : quotes.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          No quotes yet.
        </p>
      ) : (
        quotes.map((p) => (
          <PostCard
            key={p.id}
            post={p}
            meId={meId}
            onChanged={onChanged}
          />
        ))
      )}
    </div>
  );
}

function PostEditHistory({ postId, open }: { postId: number; open: boolean }) {
  const q = useGetPostEdits(postId, {
    query: {
      queryKey: getGetPostEditsQueryKey(postId),
      enabled: open,
    },
  });
  const edits = q.data ?? [];
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-foreground">Edit history</p>
      {q.isLoading ? (
        <div className="flex justify-center py-2">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground/70" />
        </div>
      ) : edits.length === 0 ? (
        <p className="text-xs text-muted-foreground">No previous versions.</p>
      ) : (
        <ul className="space-y-2">
          {edits.map((e, i) => (
            <li
              key={i}
              className="rounded-md border border-border bg-muted/30 p-2"
            >
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                {new Date(e.editedAt).toLocaleString()}
              </div>
              <p className="mt-1 whitespace-pre-wrap break-words text-xs text-foreground/90">
                {e.previousContent}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
