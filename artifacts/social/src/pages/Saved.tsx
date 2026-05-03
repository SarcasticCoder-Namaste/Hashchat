import { useState } from "react";
import { Link } from "wouter";
import {
  useGetMyBookmarks,
  useDeleteBookmark,
  useUpdateBookmark,
  getGetMyBookmarksQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Bookmark as BookmarkIcon, Trash2, Pencil, Save, X, MessageSquare, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "@/lib/i18n";

const TABS = [
  { id: "all", labelKey: "saved.tabAll", icon: BookmarkIcon },
  { id: "message", labelKey: "saved.tabMessages", icon: MessageSquare },
  { id: "post", labelKey: "saved.tabPosts", icon: FileText },
] as const;

export default function Saved() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("all");
  const qc = useQueryClient();
  const { toast } = useToast();
  const queryKey = getGetMyBookmarksQueryKey(
    tab === "all" ? undefined : { kind: tab },
  );
  const { data, isLoading } = useGetMyBookmarks(
    tab === "all" ? undefined : { kind: tab },
    { query: { queryKey } },
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

      {isLoading ? (
        <div className="rounded-lg border border-border p-6 text-center text-sm text-muted-foreground">
          {t("saved.loading")}
        </div>
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
