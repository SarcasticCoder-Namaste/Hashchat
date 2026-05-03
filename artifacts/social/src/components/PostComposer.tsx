import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useUpload } from "@workspace/object-storage-web";
import {
  useCreatePost,
  useGetMyDrafts,
  useCreateDraft,
  useUpdateDraft,
  useDeleteDraft,
  useGetMyScheduledPosts,
  useSuggestHashtags,
  getGetMyDraftsQueryKey,
  getGetMyScheduledPostsQueryKey,
  type CreatePostBody,
  type PostDraft,
  type Post,
  type QuotedPost,
} from "@workspace/api-client-react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { MentionTextarea } from "./MentionTextarea";
import { QuotedPostPreview } from "./QuotedPostPreview";
import { PrePostSafetyWarning } from "./PrePostSafetyWarning";
import {
  CalendarClock,
  Clock,
  FileText,
  ImageIcon,
  Loader2,
  Send,
  Trash2,
  X,
} from "lucide-react";
import { useTranslation } from "@/lib/i18n";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
const MAX_LEN = 500;
const MAX_IMAGES = 4;
const AUTOSAVE_DELAY_MS = 3000;

interface PostComposerProps {
  defaultHashtag?: string;
  onPosted?: () => void;
  placeholder?: string;
  initialQuote?: QuotedPost | null;
  onCancelQuote?: () => void;
  initialDraft?: PostDraft | null;
  onDismissDraft?: () => void;
  hideHistorySheets?: boolean;
  replyToId?: number | null;
  autoFocus?: boolean;
}

interface AttachedImage {
  url: string;
  alt: string;
}

function altFromFilename(name: string): string {
  const base = name.replace(/\.[^.]+$/, "");
  return base.replace(/[_\-]+/g, " ").replace(/\s+/g, " ").trim();
}

function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function imagesFromDraft(
  urls: string[],
  alts: string[] | undefined,
): AttachedImage[] {
  return urls.map((u, i) => ({ url: u, alt: alts?.[i] ?? "" }));
}

export function PostComposer({
  defaultHashtag,
  onPosted,
  placeholder,
  initialQuote = null,
  onCancelQuote,
  initialDraft = null,
  onDismissDraft,
  hideHistorySheets = false,
  replyToId = null,
  autoFocus = false,
}: PostComposerProps) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [content, setContent] = useState(initialDraft?.content ?? "");
  const [images, setImages] = useState<AttachedImage[]>(
    initialDraft ? imagesFromDraft(initialDraft.imageUrls, initialDraft.imageAlts) : [],
  );
  const [draftId, setDraftId] = useState<number | null>(
    initialDraft?.id ?? null,
  );
  const [quoted, setQuoted] = useState<QuotedPost | null>(
    initialDraft?.quotedPost ?? initialQuote,
  );
  const [draftsOpen, setDraftsOpen] = useState(false);
  const [scheduledOpen, setScheduledOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleAt, setScheduleAt] = useState<string>(() => {
    const d = new Date(Date.now() + 60 * 60 * 1000);
    return toLocalInputValue(d);
  });
  const [savingDraft, setSavingDraft] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const lastFilename = useRef<string>("");

  // sync when external initial values change
  useEffect(() => {
    setQuoted(initialQuote ?? null);
  }, [initialQuote]);

  const { uploadFile, isUploading } = useUpload({
    basePath: `${basePath}/api/storage`,
    onSuccess: (r) => {
      setImages((prev) =>
        prev.length >= MAX_IMAGES
          ? prev
          : [
              ...prev,
              {
                url: `${basePath}/api/storage${r.objectPath}`,
                alt: altFromFilename(lastFilename.current),
              },
            ],
      );
    },
  });

  const create = useCreatePost({
    mutation: {
      onSuccess: () => {
        setContent("");
        setImages([]);
        setQuoted(null);
        onCancelQuote?.();
        setDraftId(null);
        qc.invalidateQueries({ queryKey: getGetMyDraftsQueryKey() });
        qc.invalidateQueries({ queryKey: getGetMyScheduledPostsQueryKey() });
        onPosted?.();
      },
    },
  });

  const createDraftMut = useCreateDraft();
  const updateDraftMut = useUpdateDraft();

  const [extraHashtags, setExtraHashtags] = useState<string[]>([]);
  const hashtagsForBody = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    if (defaultHashtag) {
      const norm = defaultHashtag.toLowerCase();
      seen.add(norm);
      out.push(norm);
    }
    for (const tag of extraHashtags) {
      const norm = tag.toLowerCase().replace(/^#+/, "");
      if (!norm || seen.has(norm)) continue;
      seen.add(norm);
      out.push(norm);
    }
    return out;
  }, [defaultHashtag, extraHashtags]);

  // ----- AI hashtag suggestions (debounced) -----
  const [suggested, setSuggested] = useState<string[]>([]);
  const [suggestText, setSuggestText] = useState("");
  const suggestMut = useSuggestHashtags();
  useEffect(() => {
    const trimmed = content.trim();
    if (trimmed.length < 12) {
      setSuggested([]);
      setSuggestText("");
      return;
    }
    if (trimmed === suggestText) return;
    const handle = setTimeout(() => {
      suggestMut.mutate(
        { data: { text: trimmed, max: 5 } },
        {
          onSuccess: (resp) => {
            setSuggestText(trimmed);
            const taken = new Set(hashtagsForBody);
            setSuggested(resp.tags.filter((t) => !taken.has(t)));
          },
        },
      );
    }, 800);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content]);

  function addSuggestedTag(tag: string) {
    setExtraHashtags((prev) =>
      prev.includes(tag) ? prev : [...prev, tag].slice(0, 8),
    );
    setSuggested((prev) => prev.filter((t) => t !== tag));
  }
  function removeExtraTag(tag: string) {
    setExtraHashtags((prev) => prev.filter((t) => t !== tag));
  }

  // Auto-save drafts when content/images/quote change (debounced)
  const lastSavedRef = useRef<string>("");
  useEffect(() => {
    const trimmed = content.trim();
    if (!trimmed && images.length === 0 && !quoted) return;
    if (replyToId != null) return;
    const imageUrls = images.map((i) => i.url);
    const imageAlts = images.map((i) => i.alt);
    const snapshot = JSON.stringify({
      content: trimmed,
      imageUrls,
      imageAlts,
      quoted: quoted?.id ?? null,
      defaultHashtag,
    });
    if (snapshot === lastSavedRef.current) return;
    const handle = setTimeout(async () => {
      setSavingDraft(true);
      try {
        const body = {
          content: trimmed || " ",
          hashtags: hashtagsForBody,
          imageUrls,
          imageAlts,
          quotedPostId: quoted?.id ?? null,
        };
        if (draftId == null) {
          const created = await createDraftMut.mutateAsync({ data: body });
          setDraftId(created.id);
        } else {
          await updateDraftMut.mutateAsync({ id: draftId, data: body });
        }
        lastSavedRef.current = snapshot;
        qc.invalidateQueries({ queryKey: getGetMyDraftsQueryKey() });
      } catch {
        // swallow autosave failures silently
      } finally {
        setSavingDraft(false);
      }
    }, AUTOSAVE_DELAY_MS);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, images, quoted, defaultHashtag]);

  function submit(e?: React.FormEvent) {
    e?.preventDefault();
    const trimmed = content.trim();
    if (!trimmed && images.length === 0) return;
    if (content.length > MAX_LEN || create.isPending) return;
    const body: CreatePostBody = {
      content: trimmed,
      imageUrls: images.map((i) => i.url),
      imageAlts: images.map((i) => i.alt),
      hashtags: hashtagsForBody,
      quotedPostId: quoted?.id ?? null,
      fromDraftId: draftId,
      replyToId: replyToId ?? null,
    };
    create.mutate({ data: body });
  }

  function submitScheduled() {
    const trimmed = content.trim();
    if (!trimmed && images.length === 0) return;
    const dt = new Date(scheduleAt);
    if (Number.isNaN(dt.getTime()) || dt.getTime() < Date.now() + 60_000) {
      return;
    }
    const body: CreatePostBody = {
      content: trimmed,
      imageUrls: images.map((i) => i.url),
      imageAlts: images.map((i) => i.alt),
      hashtags: hashtagsForBody,
      quotedPostId: quoted?.id ?? null,
      fromDraftId: draftId,
      scheduledFor: dt.toISOString(),
    };
    create.mutate({ data: body });
    setScheduleOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLFormElement>) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      submit();
    }
  }

  function loadDraft(d: PostDraft) {
    setContent(d.content);
    setImages(imagesFromDraft(d.imageUrls, d.imageAlts));
    setQuoted(d.quotedPost ?? null);
    setDraftId(d.id);
    lastSavedRef.current = "";
    setDraftsOpen(false);
    onDismissDraft?.();
  }

  const remaining = MAX_LEN - content.length;
  const tooLong = content.length > MAX_LEN;

  return (
    <form
      onSubmit={submit}
      onKeyDown={onKeyDown}
      className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3"
      data-testid="post-composer"
      aria-label="New post"
    >
      <MentionTextarea
        value={content}
        onChange={setContent}
        variant="textarea"
        rows={3}
        className="resize-none border-0 bg-transparent p-0 text-sm shadow-none focus-visible:ring-0 focus-visible:border-transparent placeholder:text-muted-foreground min-h-[72px] w-full outline-none"
        placeholder={
          placeholder ??
          (defaultHashtag
            ? t("compose.placeholderTag", { tag: defaultHashtag })
            : t("compose.placeholder"))
        }
        testId="input-post-content"
      />
      {(extraHashtags.length > 0 || suggested.length > 0) && (
        <div
          className="flex flex-wrap items-center gap-1.5"
          data-testid="hashtag-suggestions"
        >
          {extraHashtags.map((tag) => (
            <button
              key={`added-${tag}`}
              type="button"
              onClick={() => removeExtraTag(tag)}
              className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary hover:bg-primary/20"
              data-testid={`chip-added-tag-${tag}`}
              aria-label={`Remove hashtag ${tag}`}
            >
              #{tag}
              <X className="h-3 w-3" />
            </button>
          ))}
          {suggested.length > 0 && (
            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
              <Sparkles className="h-3 w-3" />
              Suggested:
            </span>
          )}
          {suggested.map((tag) => (
            <button
              key={`sug-${tag}`}
              type="button"
              onClick={() => addSuggestedTag(tag)}
              className="rounded-full border border-dashed border-border bg-background px-2 py-0.5 text-xs text-muted-foreground hover:border-primary hover:text-primary"
              data-testid={`chip-suggest-tag-${tag}`}
            >
              + #{tag}
            </button>
          ))}
        </div>
      )}
      <PrePostSafetyWarning text={content} />
      {quoted && (
        <div className="relative">
          <QuotedPostPreview quoted={quoted} compact />
          <button
            type="button"
            onClick={() => {
              setQuoted(null);
              onCancelQuote?.();
            }}
            className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white"
            aria-label="Remove quote"
            data-testid="button-remove-quote"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}
      {images.length > 0 && (
        <ul className="grid grid-cols-2 gap-2" aria-label="Attached images">
          {images.map((img, i) => (
            <li
              key={img.url}
              className="relative flex flex-col gap-1 overflow-hidden rounded-lg border border-border p-1"
            >
              <div className="relative">
                <img
                  src={img.url}
                  alt={img.alt || t("post.imageFallbackAlt", { name: "you" })}
                  className="aspect-square w-full rounded-md object-cover"
                />
                <button
                  type="button"
                  onClick={() =>
                    setImages((prev) => prev.filter((_, idx) => idx !== i))
                  }
                  className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                  aria-label={t("compose.removeImage")}
                  data-testid={`button-remove-image-${i}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
              <label className="sr-only" htmlFor={`alt-input-${i}`}>
                {t("compose.altLabel")}
              </label>
              <input
                id={`alt-input-${i}`}
                type="text"
                value={img.alt}
                onChange={(e) =>
                  setImages((prev) =>
                    prev.map((p, idx) =>
                      idx === i ? { ...p, alt: e.target.value } : p,
                    ),
                  )
                }
                placeholder={t("compose.altPlaceholder")}
                className="rounded-md border border-border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                data-testid={`input-image-alt-${i}`}
                aria-label={t("compose.altLabel")}
              />
            </li>
          ))}
        </ul>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) {
            lastFilename.current = f.name;
            void uploadFile(f);
          }
          if (fileRef.current) fileRef.current.value = "";
        }}
        data-testid="input-post-image"
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={isUploading || images.length >= MAX_IMAGES}
            onClick={() => fileRef.current?.click()}
            data-testid="button-add-post-image"
          >
            {isUploading ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <ImageIcon className="mr-1 h-4 w-4" />
            )}
            {t("compose.photo")}
          </Button>
          {!hideHistorySheets && (
            <>
              <Sheet open={draftsOpen} onOpenChange={setDraftsOpen}>
                <SheetTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    data-testid="button-open-drafts"
                  >
                    <FileText className="mr-1 h-4 w-4" />
                    Drafts
                  </Button>
                </SheetTrigger>
                <DraftsSheetContent onPick={loadDraft} currentDraftId={draftId} />
              </Sheet>
              <Sheet open={scheduledOpen} onOpenChange={setScheduledOpen}>
                <SheetTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    data-testid="button-open-scheduled"
                  >
                    <CalendarClock className="mr-1 h-4 w-4" />
                    Scheduled
                  </Button>
                </SheetTrigger>
                <ScheduledSheetContent />
              </Sheet>
            </>
          )}
          {savingDraft && (
            <span className="text-xs text-muted-foreground">Saving…</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span
            className="hidden text-[10px] text-muted-foreground sm:inline"
            aria-hidden="true"
          >
            {t("compose.submitHint")}
          </span>
          <span
            className={[
              "text-xs",
              tooLong
                ? "text-destructive"
                : remaining < 50
                  ? "text-amber-500"
                  : "text-muted-foreground",
            ].join(" ")}
            aria-live="polite"
            aria-label={`${remaining} characters remaining`}
          >
            {remaining}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={
              create.isPending ||
              tooLong ||
              (!content.trim() && images.length === 0)
            }
            onClick={() => setScheduleOpen(true)}
            data-testid="button-schedule-post"
            aria-label="Schedule post"
          >
            <Clock className="h-4 w-4" />
          </Button>
          <Button
            type="submit"
            size="sm"
            disabled={
              create.isPending ||
              tooLong ||
              (!content.trim() && images.length === 0)
            }
            data-testid="button-submit-post"
          >
            {create.isPending ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Send className="mr-1 h-4 w-4" />
            )}
            {t("compose.post")}
          </Button>
        </div>
      </div>

      <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Schedule post</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-sm text-muted-foreground" htmlFor="schedule-at">
              Pick a date and time
            </label>
            <Input
              id="schedule-at"
              type="datetime-local"
              value={scheduleAt}
              onChange={(e) => setScheduleAt(e.target.value)}
              data-testid="input-schedule-at"
            />
            <p className="text-xs text-muted-foreground">
              Your post will publish automatically at the chosen time.
            </p>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setScheduleOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={submitScheduled}
              disabled={create.isPending}
              data-testid="button-confirm-schedule"
            >
              {create.isPending ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <CalendarClock className="mr-1 h-4 w-4" />
              )}
              Schedule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </form>
  );
}

function DraftsSheetContent({
  onPick,
  currentDraftId,
}: {
  onPick: (d: PostDraft) => void;
  currentDraftId: number | null;
}) {
  const qc = useQueryClient();
  const q = useGetMyDrafts({
    query: {
      queryKey: getGetMyDraftsQueryKey(),
      refetchOnMount: "always",
    },
  });
  const drafts = q.data ?? [];
  const del = useDeleteDraft({
    mutation: {
      onSuccess: () =>
        qc.invalidateQueries({ queryKey: getGetMyDraftsQueryKey() }),
    },
  });
  return (
    <SheetContent side="right" className="w-full sm:max-w-md">
      <SheetHeader>
        <SheetTitle>Drafts</SheetTitle>
      </SheetHeader>
      <div className="mt-4 flex flex-col gap-2 overflow-y-auto pr-1">
        {q.isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground/70" />
          </div>
        ) : drafts.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No drafts yet — your unsent posts will appear here.
          </p>
        ) : (
          drafts.map((d) => (
            <div
              key={d.id}
              className={[
                "flex flex-col gap-1 rounded-lg border p-2.5",
                d.id === currentDraftId
                  ? "border-primary/60 bg-primary/5"
                  : "border-border bg-card",
              ].join(" ")}
              data-testid={`draft-${d.id}`}
            >
              <p className="line-clamp-3 whitespace-pre-wrap text-sm text-foreground">
                {d.content.trim() || (
                  <span className="italic text-muted-foreground">
                    (no text)
                  </span>
                )}
              </p>
              {d.hashtags.length > 0 && (
                <div className="flex flex-wrap gap-1 text-xs text-muted-foreground">
                  {d.hashtags.map((t) => (
                    <span key={t}>#{t}</span>
                  ))}
                </div>
              )}
              {d.imageUrls.length > 0 && (
                <div className="flex gap-1">
                  {d.imageUrls.slice(0, 4).map((u, i) => (
                    <img
                      key={i}
                      src={u}
                      alt=""
                      className="h-12 w-12 rounded object-cover"
                    />
                  ))}
                </div>
              )}
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Saved {new Date(d.updatedAt).toLocaleString()}</span>
                <div className="flex gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => onPick(d)}
                    data-testid={`button-resume-draft-${d.id}`}
                  >
                    Resume
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => del.mutate({ id: d.id })}
                    aria-label="Delete draft"
                    data-testid={`button-delete-draft-${d.id}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </SheetContent>
  );
}

function ScheduledSheetContent() {
  const q = useGetMyScheduledPosts({
    query: {
      queryKey: getGetMyScheduledPostsQueryKey(),
      refetchOnMount: "always",
    },
  });
  const items: Post[] = q.data ?? [];
  return (
    <SheetContent side="right" className="w-full sm:max-w-md">
      <SheetHeader>
        <SheetTitle>Scheduled posts</SheetTitle>
      </SheetHeader>
      <div className="mt-4 flex flex-col gap-2 overflow-y-auto pr-1">
        {q.isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground/70" />
          </div>
        ) : items.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No scheduled posts. Use the clock icon to schedule one.
          </p>
        ) : (
          items.map((p) => (
            <div
              key={p.id}
              className="flex flex-col gap-1 rounded-lg border border-border bg-card p-2.5"
              data-testid={`scheduled-${p.id}`}
            >
              <div className="flex items-center gap-2 text-xs font-medium text-amber-600 dark:text-amber-400">
                <CalendarClock className="h-3.5 w-3.5" />
                {p.scheduledFor
                  ? new Date(p.scheduledFor).toLocaleString()
                  : "Pending"}
              </div>
              <p className="line-clamp-3 whitespace-pre-wrap text-sm text-foreground">
                {p.content}
              </p>
              {p.imageUrls.length > 0 && (
                <div className="flex gap-1">
                  {p.imageUrls.slice(0, 4).map((u, i) => (
                    <img
                      key={i}
                      src={u}
                      alt=""
                      className="h-12 w-12 rounded object-cover"
                    />
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </SheetContent>
  );
}
