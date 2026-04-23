import { useRef } from "react";
import { useUpload } from "@workspace/object-storage-web";
import { Button } from "@/components/ui/button";
import { ImageIcon, Loader2 } from "lucide-react";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

export function ImageUploadButton({
  onUploaded,
  testId = "button-upload-image",
}: {
  onUploaded: (objectPath: string) => void;
  testId?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { uploadFile, isUploading } = useUpload({
    basePath: `${basePath}/api/storage`,
    onSuccess: (r) => onUploaded(`${basePath}${r.objectPath}`),
  });

  return (
    <>
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
        data-testid={`${testId}-input`}
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        disabled={isUploading}
        onClick={() => inputRef.current?.click()}
        data-testid={testId}
        aria-label="Upload image"
      >
        {isUploading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <ImageIcon className="h-4 w-4" />
        )}
      </Button>
    </>
  );
}
