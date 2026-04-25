import { useRef, useState } from "react";
import { useUpload } from "@workspace/object-storage-web";
import {
  useCreatePost,
  type CreatePostBody,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { MentionTextarea } from "./MentionTextarea";
import { ImageIcon, Loader2, Send, X } from "lucide-react";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
const MAX_LEN = 500;
const MAX_IMAGES = 4;

interface PostComposerProps {
  defaultHashtag?: string;
  onPosted?: () => void;
  placeholder?: string;
}

export function PostComposer({
  defaultHashtag,
  onPosted,
  placeholder,
}: PostComposerProps) {
  const [content, setContent] = useState("");
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const { uploadFile, isUploading } = useUpload({
    basePath: `${basePath}/api/storage`,
    onSuccess: (r) => {
      setImageUrls((prev) =>
        prev.length >= MAX_IMAGES
          ? prev
          : [...prev, `${basePath}/api/storage${r.objectPath}`],
      );
    },
  });

  const create = useCreatePost({
    mutation: {
      onSuccess: () => {
        setContent("");
        setImageUrls([]);
        onPosted?.();
      },
    },
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = content.trim();
    if (!trimmed && imageUrls.length === 0) return;
    const body: CreatePostBody = {
      content: trimmed,
      imageUrls,
      hashtags: defaultHashtag ? [defaultHashtag] : [],
    };
    create.mutate({ data: body });
  }

  const remaining = MAX_LEN - content.length;
  const tooLong = content.length > MAX_LEN;

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3"
      data-testid="post-composer"
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
            ? `Share something with #${defaultHashtag}…`
            : "What's happening?")
        }
        testId="input-post-content"
      />
      {imageUrls.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {imageUrls.map((url, i) => (
            <div
              key={url}
              className="relative overflow-hidden rounded-lg border border-border"
            >
              <img
                src={url}
                alt=""
                className="aspect-square w-full object-cover"
              />
              <button
                type="button"
                onClick={() =>
                  setImageUrls((prev) => prev.filter((_, idx) => idx !== i))
                }
                className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white"
                aria-label="Remove image"
                data-testid={`button-remove-image-${i}`}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void uploadFile(f);
          if (fileRef.current) fileRef.current.value = "";
        }}
        data-testid="input-post-image"
      />
      <div className="flex items-center justify-between">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={isUploading || imageUrls.length >= MAX_IMAGES}
          onClick={() => fileRef.current?.click()}
          data-testid="button-add-post-image"
        >
          {isUploading ? (
            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
          ) : (
            <ImageIcon className="mr-1 h-4 w-4" />
          )}
          Photo
        </Button>
        <div className="flex items-center gap-3">
          <span
            className={[
              "text-xs",
              tooLong
                ? "text-destructive"
                : remaining < 50
                  ? "text-amber-500"
                  : "text-muted-foreground",
            ].join(" ")}
          >
            {remaining}
          </span>
          <Button
            type="submit"
            size="sm"
            disabled={
              create.isPending ||
              tooLong ||
              (!content.trim() && imageUrls.length === 0)
            }
            data-testid="button-submit-post"
          >
            {create.isPending ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Send className="mr-1 h-4 w-4" />
            )}
            Post
          </Button>
        </div>
      </div>
    </form>
  );
}
