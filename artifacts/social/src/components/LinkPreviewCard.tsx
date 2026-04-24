interface LinkPreviewCardProps {
  url: string;
  title?: string | null;
  description?: string | null;
  thumbnailUrl?: string | null;
  variant?: "compact" | "full";
}

export function LinkPreviewCard({
  url,
  title,
  description,
  thumbnailUrl,
  variant = "full",
}: LinkPreviewCardProps) {
  let host = "";
  try {
    host = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    host = url;
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer noopener"
      className="mt-1 flex max-w-sm overflow-hidden rounded-lg border border-border bg-card text-foreground hover-elevate"
      data-testid="link-preview"
    >
      {thumbnailUrl && variant === "full" && (
        <img
          src={thumbnailUrl}
          alt=""
          className="h-20 w-20 shrink-0 object-cover"
          loading="lazy"
        />
      )}
      <div className="min-w-0 flex-1 px-3 py-2">
        <p className="truncate text-[10px] uppercase tracking-wide text-muted-foreground">
          {host}
        </p>
        {title && (
          <p className="line-clamp-2 text-sm font-medium leading-snug">
            {title}
          </p>
        )}
        {description && (
          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
            {description}
          </p>
        )}
      </div>
    </a>
  );
}
