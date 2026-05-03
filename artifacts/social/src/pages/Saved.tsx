import { useEffect, useState } from "react";
import { Link } from "wouter";
import {
  useGetMyBookmarks,
  useDeleteBookmark,
  useUpdateBookmark,
  getGetMyBookmarksQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Bookmark as BookmarkIcon,
  Trash2,
  Pencil,
  Save,
  X,
  MessageSquare,
  FileText,
  Film,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "@/lib/i18n";
import { ListSkeleton } from "@/components/Skeleton";

const TABS = [
  { id: "all", labelKey: "saved.tabAll", icon: BookmarkIcon },
  { id: "message", labelKey: "saved.tabMessages", icon: MessageSquare },
  { id: "post", labelKey: "saved.tabPosts", icon: FileText },
  { id: "reels", labelKey: "saved.tabReels", icon: Film },
] as const;

const REELS_KEY = "hashchat:saved-reels";
type SavedReel = {
  id: string;
  title: string;
  channel: string;
  thumbnail: string;
  kind?: "short" | "long";
};

function loadSavedReels(): SavedReel[] {
  try {
    const raw = localStorage.getItem(REELS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as SavedReel[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function persistSavedReels(items: SavedReel[]) {
  try {
    localStorage.setItem(REELS_KEY, JSON.stringify(items));
  } catch {
    /* ignore quota */
  }
}

function watchUrl(r: SavedReel): string {
  return r.kind === "long"
    ? `https://www.youtube.com/watch?v=${r.id}`
    : `https://www.youtube.com/shorts/${r.id}`;
}

export default function Saved() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("all");
  const qc = useQueryClient();
  const { toast } = useToast();
  const [reels, setReels] = useState<SavedReel[]>(() => loadSavedReels());
  useEffect(() => {
    function handleStorage(e: StorageEvent) {
      if (e.key === REELS_KEY) setReels(loadSavedReels());
    }
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);
  useEffect(() => {
    if (tab === "reels") setReels(loadSavedReels());
  }, [tab]);
  const removeReel = (id: string) => {
    setReels((prev) => {
      const next = prev.filter((r) => r.id !== id);
      persistSavedReels(next);
      return next;
    });
  };
  const bookmarksKind = tab === "all" || tab === "reels" ? undefined : tab;
  const queryKey = getGetMyBookmarksQueryKey(
    bookmarksKind ? { kind: bookmarksKind } : undefined,
  );
  const { data, isLoading } = useGetMyBookmarks(
    bookmarksKind ? { kind: bookmarksKind } : undefined,
    { query: { queryKey, enabled: tab !== "reels" } },
  );
  const remove = useDeleteBookmark({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey });
      },
    },
  });
  const update = useUpdateBookmark({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey });
      },
    },
  });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editNote, setEditNote] = useState("");

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 md:p-6">
      <header className="flex items-center gap-2">
        <BookmarkIcon className="h-5 w-5 text-primary" />
        <h1 className="text-xl font-semibold">{t("saved.title")}</h1>
      </header>
      <p className="text-sm text-muted-foreground">
        {t("saved.subtitle")}
      </p>

      <div className="flex flex-wrap gap-1">
        {TABS.map(({ id, labelKey, icon: Icon }) => (
          <Button
            key={id}
            variant={tab === id ? "default" : "ghost"}
            size="sm"
            onClick={() => setTab(id)}
            data-testid={`tab-saved-${id}`}
          >
            <Icon className="mr-1 h-3.5 w-3.5" />
            {t(labelKey)}
          </Button>
        ))}
      </div>

      {tab === "reels" ? (
        reels.length === 0 ? (
          <div
            className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground"
            data-testid="saved-reels-empty"
          >
            No saved reels yet. Bookmark a reel from the Reels page to watch later.
          </div>
        ) : (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2" data-testid="saved-reels-list">
            {reels.map((r) => (
              <li
                key={r.id}
                className="overflow-hidden rounded-lg border border-border bg-card"
                data-testid={`saved-reel-${r.id}`}
              >
                <a
                  href={watchUrl(r)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block"
                >
                  <img
                    src={r.thumbnail}
                    alt={r.title}
                    className="aspect-video w-full object-cover"
                  />
                </a>
                <div className="flex items-start gap-2 p-2">
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-sm font-medium" title={r.title}>
                      {r.title}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{r.channel}</p>
                  </div>
                  <a
                    href={watchUrl(r)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-md p-1 text-muted-foreground hover:text-foreground"
                    aria-label="Open on YouTube"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                  <button
                    type="button"
                    onClick={() => removeReel(r.id)}
                    className="rounded-md p-1 text-destructive hover:bg-destructive/10"
                    aria-label="Remove from watch later"
                    data-testid={`button-remove-reel-${r.id}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )
      ) : isLoading ? (
        <ListSkeleton count={4} />
      ) : !data || data.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          {t("saved.empty")}
        </div>
      ) : (
        <ul className="space-y-3">
          {data.map((b) => {
            const target = b.target;
            const editing = editingId === b.id;
            return (
              <li
                key={b.id}
                className="rounded-lg border border-border bg-card p-3"
                data-testid={`saved-${b.id}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    {b.kind === "message" ? (
                      <MessageSquare className="h-3.5 w-3.5" />
                    ) : (
                      <FileText className="h-3.5 w-3.5" />
                    )}
                    {b.kind === "message" ? t("saved.message") : t("saved.post")}
                    {target?.author && (
                      <>
                        <span>·</span>
                        <Link
                          href={`/app/u/${target.author.username}`}
                          className="hover:underline"
                        >
                          @{target.author.username}
                        </Link>
                      </>
                    )}
                    {target?.roomTag && (
                      <>
                        <span>·</span>
                        <Link href={`/app/rooms/${target.roomTag}`} className="hover:underline">
                          #{target.roomTag}
                        </Link>
                      </>
                    )}
                  </div>
                  <div className="flex gap-1">
                    {!editing && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => {
                          setEditingId(b.id);
                          setEditNote(b.note ?? "");
                        }}
                        aria-label={t("saved.editNote")}
                        data-testid={`button-edit-note-${b.id}`}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive"
                      onClick={() => {
                        remove.mutate({ id: b.id });
                        toast({ title: t("saved.removed") });
                      }}
                      aria-label={t("saved.remove")}
                      data-testid={`button-remove-saved-${b.id}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                {target?.snippet && (
                  <p
                    className={`mt-2 whitespace-pre-wrap text-sm ${
                      target.deleted ? "italic text-muted-foreground" : "text-foreground"
                    }`}
                  >
                    {target.snippet}
                  </p>
                )}

                {target?.href && !target.deleted && (
                  <Link
                    href={target.href}
                    className="mt-1 inline-block text-xs text-primary hover:underline"
                    data-testid={`link-open-saved-${b.id}`}
                  >
                    {t("common.open")}
                  </Link>
                )}

                {editing ? (
                  <div className="mt-2 space-y-2">
                    <Textarea
                      value={editNote}
                      onChange={(e) => setEditNote(e.target.value.slice(0, 1000))}
                      placeholder={t("saved.notePlaceholder")}
                      rows={2}
                      data-testid={`textarea-saved-${b.id}`}
                    />
                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditingId(null)}
                      >
                        <X className="mr-1 h-3.5 w-3.5" /> {t("common.cancel")}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => {
                          update.mutate(
                            { id: b.id, data: { note: editNote || null } },
                            { onSuccess: () => setEditingId(null) },
                          );
                        }}
                        data-testid={`button-save-note-${b.id}`}
                      >
                        <Save className="mr-1 h-3.5 w-3.5" /> {t("common.save")}
                      </Button>
                    </div>
                  </div>
                ) : b.note ? (
                  <div className="mt-2 rounded-md border border-dashed border-border bg-muted/40 p-2 text-xs italic text-muted-foreground">
                    {t("saved.notePrefix", { note: b.note })}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
