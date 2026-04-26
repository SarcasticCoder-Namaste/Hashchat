import { useEffect, useState } from "react";
import {
  useCheckBookmark,
  useCreateBookmark,
  useDeleteBookmark,
  useUpdateBookmark,
  getCheckBookmarkQueryKey,
  getGetMyBookmarksQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Bookmark, BookmarkCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

interface Props {
  kind: "message" | "post";
  targetId: number;
  variant?: "ghost" | "subtle";
  size?: "sm" | "icon";
  testIdSuffix?: string;
}

export function BookmarkButton({
  kind,
  targetId,
  variant = "ghost",
  size = "icon",
  testIdSuffix,
}: Props) {
  const qc = useQueryClient();
  const checkKey = getCheckBookmarkQueryKey({ kind, targetId });
  const { data, isLoading } = useCheckBookmark(
    { kind, targetId },
    { query: { queryKey: checkKey } },
  );
  const create = useCreateBookmark({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: checkKey });
        qc.invalidateQueries({ queryKey: getGetMyBookmarksQueryKey() });
      },
    },
  });
  const update = useUpdateBookmark({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: checkKey });
        qc.invalidateQueries({ queryKey: getGetMyBookmarksQueryKey() });
      },
    },
  });
  const remove = useDeleteBookmark({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: checkKey });
        qc.invalidateQueries({ queryKey: getGetMyBookmarksQueryKey() });
      },
    },
  });

  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");

  useEffect(() => {
    if (open) setNote(data?.note ?? "");
  }, [open, data?.note]);

  const bookmarked = !!data?.bookmarked;
  const Icon = bookmarked ? BookmarkCheck : Bookmark;
  const tid = `${kind}-${targetId}${testIdSuffix ? `-${testIdSuffix}` : ""}`;

  function quickToggle(e: React.MouseEvent) {
    if (e.shiftKey || e.altKey) return;
    if (bookmarked && data?.bookmarkId) {
      remove.mutate({ id: data.bookmarkId });
      toast({ title: "Removed from saved" });
      return;
    }
    if (!bookmarked) {
      create.mutate({ data: { kind, targetId, note: null } });
      toast({ title: "Saved", description: "Find it in Saved." });
    }
  }

  function saveNote() {
    if (bookmarked && data?.bookmarkId) {
      update.mutate({ id: data.bookmarkId, data: { note: note || null } });
    } else {
      create.mutate({ data: { kind, targetId, note: note || null } });
    }
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant={variant === "subtle" ? "ghost" : "ghost"}
          size={size}
          disabled={isLoading}
          className={
            size === "icon"
              ? "h-7 w-7"
              : ""
          }
          data-testid={`button-bookmark-${tid}`}
          aria-label={bookmarked ? "Edit saved note" : "Save"}
          onClick={(e) => {
            // Quick toggle on plain click; popover opens via long-press / shift / contextmenu? Simpler: always open.
            // Default UX: clicking opens the popover; "Save" or "Save with note" lives there.
            // Keep quickToggle for power-users via altKey.
            if (e.altKey) {
              e.preventDefault();
              quickToggle(e);
            }
          }}
        >
          <Icon className={`h-3.5 w-3.5 ${bookmarked ? "text-primary" : ""}`} />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        side="top"
        className="w-72 space-y-2 p-3"
        data-testid={`popover-bookmark-${tid}`}
      >
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">
            {bookmarked ? "Saved" : "Save this"}
          </p>
          {bookmarked && data?.bookmarkId && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 text-xs text-destructive"
              onClick={() => {
                remove.mutate({ id: data.bookmarkId! });
                setOpen(false);
                toast({ title: "Removed from saved" });
              }}
              data-testid={`button-bookmark-remove-${tid}`}
            >
              Remove
            </Button>
          )}
        </div>
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value.slice(0, 1000))}
          placeholder="Add a private note (only you can see this)…"
          rows={3}
          className="text-sm"
          data-testid={`textarea-bookmark-${tid}`}
        />
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setOpen(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={saveNote}
            disabled={create.isPending || update.isPending}
            data-testid={`button-bookmark-save-${tid}`}
          >
            {bookmarked ? "Update" : "Save"}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
