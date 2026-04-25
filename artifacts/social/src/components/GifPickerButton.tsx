import { useEffect, useRef, useState } from "react";
import {
  useSearchGifs,
  getSearchGifsQueryKey,
  type Gif,
} from "@workspace/api-client-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Search, Sparkles } from "lucide-react";

const GIF_ICON_PATH =
  "M11 9h1.5v6H11zM5.5 13.5H7v.5c0 .28.22.5.5.5s.5-.22.5-.5V13H7v-1h2v2.5c0 .83-.67 1.5-1.5 1.5S6 15.33 6 14.5V13c0-.28-.22-.5-.5-.5z";

function GifIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      aria-hidden="true"
    >
      <rect x="3" y="6" width="18" height="12" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <text
        x="12"
        y="15.5"
        textAnchor="middle"
        fontSize="6.5"
        fontWeight="700"
        fontFamily="system-ui, sans-serif"
        fill="currentColor"
      >
        GIF
      </text>
      <path d={GIF_ICON_PATH} fill="none" />
    </svg>
  );
}

export function GifPickerButton({
  onPick,
  testId = "button-pick-gif",
}: {
  onPick: (gif: Gif) => void;
  testId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const handle = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(handle);
  }, [query]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setDebounced("");
    }
  }, [open]);

  const params = { q: debounced || undefined, limit: 24 };
  const gifsQ = useSearchGifs(params, {
    query: {
      enabled: open,
      queryKey: getSearchGifsQueryKey(params),
    },
  });

  function handlePick(gif: Gif) {
    onPick(gif);
    setOpen(false);
  }

  const items = gifsQ.data?.items ?? [];
  const errorPayload = gifsQ.error as
    | { status?: number; data?: { error?: string; message?: string } }
    | undefined;
  const notConfigured = errorPayload?.status === 503;
  const otherError = !!errorPayload && !notConfigured;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          data-testid={testId}
          aria-label="Send a GIF"
        >
          <GifIcon className="h-5 w-5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="top"
        sideOffset={8}
        className="w-[min(360px,calc(100vw-2rem))] p-0"
        data-testid="gif-picker"
      >
        <div className="flex items-center gap-2 border-b border-border px-3 py-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search GIFs"
            className="h-8 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
            data-testid="input-gif-search"
            autoFocus
          />
        </div>
        <div
          className="max-h-[320px] overflow-y-auto p-2"
          data-testid="gif-results"
        >
          {notConfigured ? (
            <div
              className="flex flex-col items-center gap-1 px-3 py-8 text-center text-xs text-muted-foreground"
              data-testid="gif-not-configured"
            >
              <Sparkles className="h-5 w-5 text-muted-foreground/70" />
              <p className="font-medium text-foreground">GIFs aren't set up</p>
              <p>
                {errorPayload?.data?.message ??
                  "Ask the project owner to add a GIPHY_API_KEY secret."}
              </p>
            </div>
          ) : otherError ? (
            <div className="px-3 py-8 text-center text-xs text-destructive">
              Couldn't load GIFs. Try again.
            </div>
          ) : gifsQ.isLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground/70" />
            </div>
          ) : items.length === 0 ? (
            <div className="px-3 py-8 text-center text-xs text-muted-foreground">
              {debounced ? `No GIFs for "${debounced}"` : "No GIFs to show."}
            </div>
          ) : (
            <GifMasonry items={items} onPick={handlePick} />
          )}
        </div>
        <div className="border-t border-border px-3 py-1.5 text-[10px] text-muted-foreground">
          Powered by {gifsQ.data?.provider ?? "GIPHY"}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function GifMasonry({
  items,
  onPick,
}: {
  items: Gif[];
  onPick: (g: Gif) => void;
}) {
  // Two-column masonry: distribute GIFs to whichever column is shorter so
  // tall GIFs don't leave huge gaps, like the native picker UX.
  const columns: { items: Gif[]; height: number }[] = [
    { items: [], height: 0 },
    { items: [], height: 0 },
  ];
  for (const g of items) {
    const ratio = g.height && g.width ? g.height / g.width : 1;
    const col = columns[0].height <= columns[1].height ? 0 : 1;
    columns[col].items.push(g);
    columns[col].height += ratio;
  }

  return (
    <div className="grid grid-cols-2 gap-1.5">
      {columns.map((col, idx) => (
        <div key={idx} className="flex flex-col gap-1.5">
          {col.items.map((g) => (
            <GifTile key={g.id} gif={g} onPick={onPick} />
          ))}
        </div>
      ))}
    </div>
  );
}

function GifTile({
  gif,
  onPick,
}: {
  gif: Gif;
  onPick: (g: Gif) => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const ratio = gif.height && gif.width ? gif.height / gif.width : 1;
  return (
    <button
      ref={ref}
      type="button"
      onClick={() => onPick(gif)}
      className="group relative w-full overflow-hidden rounded-md bg-muted/50 transition-shadow hover:ring-2 hover:ring-primary"
      style={{ aspectRatio: `${gif.width || 1} / ${gif.height || 1}` }}
      data-testid={`gif-tile-${gif.id}`}
      aria-label={gif.title || "Send GIF"}
    >
      <img
        src={gif.previewUrl}
        alt={gif.title || ""}
        loading="lazy"
        className="absolute inset-0 h-full w-full object-cover"
        style={{ aspectRatio: `${gif.width || 1} / ${gif.height || ratio}` }}
      />
    </button>
  );
}
