import { useRef } from "react";
import { useUpload } from "@workspace/object-storage-web";
import { Button } from "@/components/ui/button";
import { ImageIcon, Loader2 } from "lucide-react";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function suggestAltFromFilename(name: string): string {
  const base = name.replace(/\.[^.]+$/, "");
  return base.replace(/[_\-]+/g, " ").replace(/\s+/g, " ").trim();
}

export function ImageUploadButton({
  onUploaded,
  testId = "button-upload-image",
}: {
  onUploaded: (objectPath: string, suggestedAlt?: string) => void;
  testId?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const lastFilename = useRef<string>("");
  const { uploadFile, isUploading } = useUpload({
    basePath: `${basePath}/api/storage`,
    onSuccess: (r) =>
      onUploaded(
        `${basePath}/api/storage${r.objectPath}`,
        suggestAltFromFilename(lastFilename.current),
      ),
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
          if (f) {
            lastFilename.current = f.name;
            void uploadFile(f);
          }
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
