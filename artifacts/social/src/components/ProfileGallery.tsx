import {
  useGetMyPhotos,
  useAddMyPhoto,
  useDeleteMyPhoto,
  getGetMyPhotosQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useUpload } from "@workspace/object-storage-web";
import { Button } from "@/components/ui/button";
import { Loader2, Plus, X } from "lucide-react";
import { useRef } from "react";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

export function ProfileGallery() {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const photos = useGetMyPhotos();
  const add = useAddMyPhoto({
    mutation: {
      onSuccess: () => qc.invalidateQueries({ queryKey: getGetMyPhotosQueryKey() }),
    },
  });
  const del = useDeleteMyPhoto({
    mutation: {
      onSuccess: () => qc.invalidateQueries({ queryKey: getGetMyPhotosQueryKey() }),
    },
  });

  const { uploadFile, isUploading } = useUpload({
    basePath: `${basePath}/api/storage`,
    onSuccess: (r) => add.mutate({ data: { imageUrl: `${basePath}/api/storage${r.objectPath}` } }),
  });

  return (
    <div className="space-y-4 rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">Photo gallery</h2>
        <Button
          size="sm"
          disabled={isUploading || add.isPending}
          onClick={() => inputRef.current?.click()}
          data-testid="button-add-photo"
        >
          {isUploading || add.isPending ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Plus className="mr-1.5 h-3.5 w-3.5" />
          )}
          Add photo
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void uploadFile(f);
            if (inputRef.current) inputRef.current.value = "";
          }}
          data-testid="input-add-photo"
        />
      </div>
      <p className="text-sm text-muted-foreground">
        Show off what you&apos;re into. Photos appear on your profile.
      </p>
      {photos.isLoading ? (
        <div className="flex h-32 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground/70" />
        </div>
      ) : photos.data && photos.data.length > 0 ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {photos.data.map((p) => (
            <div
              key={p.id}
              className="group relative aspect-square overflow-hidden rounded-lg bg-muted"
              data-testid={`photo-${p.id}`}
            >
              <img
                src={p.imageUrl}
                alt=""
                className="h-full w-full object-cover transition-transform group-hover:scale-105"
              />
              <button
                type="button"
                onClick={() => del.mutate({ id: p.id })}
                className="absolute right-1.5 top-1.5 rounded-full bg-black/60 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100"
                data-testid={`button-delete-photo-${p.id}`}
                aria-label="Delete photo"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
          No photos yet. Add one to get started.
        </div>
      )}
    </div>
  );
}
