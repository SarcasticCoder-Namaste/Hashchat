import { useRef, useState } from "react";
import { useUpload } from "@workspace/object-storage-web";
import {
  useCreatePost,
  type CreatePostBody,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { MentionTextarea } from "./MentionTextarea";
import { ImageIcon, Loader2, Send, X } from "lucide-react";
import { useTranslation } from "@/lib/i18n";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
const MAX_LEN = 500;
const MAX_IMAGES = 4;

interface PostComposerProps {
  defaultHashtag?: string;
  onPosted?: () => void;
  placeholder?: string;
}

interface AttachedImage {
  url: string;
  alt: string;
}

function altFromFilename(name: string): string {
  const base = name.replace(/\.[^.]+$/, "");
  return base.replace(/[_\-]+/g, " ").replace(/\s+/g, " ").trim();
}

export function PostComposer({
  defaultHashtag,
  onPosted,
  placeholder,
}: PostComposerProps) {
  const { t } = useTranslation();
  const [content, setContent] = useState("");
  const [images, setImages] = useState<AttachedImage[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const lastFilename = useRef<string>("");

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
        onPosted?.();
      },
    },
  });

  function submit(e?: React.FormEvent) {
    e?.preventDefault();
    const trimmed = content.trim();
    if (!trimmed && images.length === 0) return;
    if (content.length > MAX_LEN || create.isPending) return;
    const body: CreatePostBody = {
      content: trimmed,
      imageUrls: images.map((i) => i.url),
      hashtags: defaultHashtag ? [defaultHashtag] : [],
    };
    create.mutate({ data: body });
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLFormElement>) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      submit();
    }
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
                maxLength={140}
                onChange={(e) =>
                  setImages((prev) =>
                    prev.map((it, idx) =>
                      idx === i ? { ...it, alt: e.target.value } : it,
                    ),
                  )
                }
                placeholder={t("compose.altPlaceholder")}
                className="rounded border border-input bg-background px-2 py-1 text-xs text-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
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
      <div className="flex items-center justify-between">
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
    </form>
  );
}
