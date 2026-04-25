import { useEffect, useMemo, useState } from "react";
import { getYoutubeReels } from "@workspace/api-client-react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { motion, AnimatePresence } from "framer-motion";
import {
  Film,
  Search,
  Youtube,
  Loader2,
  X,
  ChevronUp,
  ChevronDown,
  Heart,
  Share2,
  ExternalLink,
  Bookmark,
  Sparkles,
} from "lucide-react";

const SUGGESTED_QUERIES = [
  "trending shorts",
  "viral shorts",
  "funny shorts",
  "dance shorts",
  "tech shorts",
  "diy shorts",
  "gaming shorts",
  "food shorts",
  "music shorts",
  "sports shorts",
  "travel shorts",
  "anime shorts",
];

type Reel = {
  id: string;
  title: string;
  channel: string;
  thumbnail: string;
  publishedAt: string;
};

const SAVED_KEY = "hashchat:saved-reels";

function loadSaved(): Reel[] {
  try {
    const raw = localStorage.getItem(SAVED_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as Reel[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function persistSaved(items: Reel[]) {
  try {
    localStorage.setItem(SAVED_KEY, JSON.stringify(items));
  } catch {
    /* ignore quota */
  }
}

const PAGE_SIZE = 12;

export default function Reels() {
  const [query, setQuery] = useState("trending shorts");
  const [active, setActive] = useState("trending shorts");
  const [view, setView] = useState<"feed" | "saved">("feed");
  const [playerIndex, setPlayerIndex] = useState<number | null>(null);
  const [saved, setSaved] = useState<Reel[]>(() => loadSaved());

  const {
    data,
    isLoading,
    error,
    isFetching,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ["youtube-reels", active],
    queryFn: ({ pageParam }) =>
      getYoutubeReels({
        q: active,
        max: PAGE_SIZE,
        pageToken: pageParam || undefined,
      }),
    initialPageParam: "",
    getNextPageParam: (lastPage) =>
      (lastPage as { nextPageToken?: string | null }).nextPageToken ?? undefined,
  });

  const feedItems: Reel[] = useMemo(() => {
    const seen = new Set<string>();
    const out: Reel[] = [];
    for (const page of data?.pages ?? []) {
      for (const it of (page as { items: Reel[] }).items) {
        if (seen.has(it.id)) continue;
        seen.add(it.id);
        out.push(it);
      }
    }
    return out;
  }, [data]);

  const items = view === "feed" ? feedItems : saved;
  const playing = playerIndex != null ? items[playerIndex] : null;

  useEffect(() => {
    persistSaved(saved);
  }, [saved]);

  const isSaved = (id: string) => saved.some((s) => s.id === id);
  const toggleSave = (reel: Reel) => {
    setSaved((prev) =>
      prev.some((s) => s.id === reel.id)
        ? prev.filter((s) => s.id !== reel.id)
        : [reel, ...prev].slice(0, 200),
    );
  };

  const runSearch = (q: string) => {
    setActive(q);
    setQuery(q);
    setView("feed");
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-10">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-gradient-to-br from-pink-500 to-violet-500 p-2 text-white shadow-lg shadow-pink-500/30">
            <Film className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground">Reels</h1>
            <p className="text-sm text-muted-foreground">
              Bite-size videos from YouTube Shorts.
            </p>
          </div>
        </div>
        <div className="flex rounded-full border border-border bg-card p-1 text-sm">
          <button
            type="button"
            onClick={() => setView("feed")}
            data-testid="tab-reels-feed"
            className={[
              "rounded-full px-3 py-1.5 font-medium transition-colors",
              view === "feed"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            ].join(" ")}
          >
            <Sparkles className="-mt-0.5 mr-1 inline h-3.5 w-3.5" />
            Feed
          </button>
          <button
            type="button"
            onClick={() => setView("saved")}
            data-testid="tab-reels-saved"
            className={[
              "rounded-full px-3 py-1.5 font-medium transition-colors",
              view === "saved"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            ].join(" ")}
          >
            <Bookmark className="-mt-0.5 mr-1 inline h-3.5 w-3.5" />
            Saved {saved.length > 0 ? `(${saved.length})` : ""}
          </button>
        </div>
      </div>

      {view === "feed" && (
        <>
          <div className="mt-6 flex flex-col gap-3 rounded-xl border border-border bg-card p-4 md:flex-row md:items-center">
            <div className="flex flex-1 items-center gap-2">
              <Search className="h-4 w-4 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") runSearch(query);
                }}
                placeholder="Search YouTube Shorts..."
                data-testid="input-reels-search"
              />
            </div>
            <Button
              onClick={() => runSearch(query)}
              data-testid="button-reels-search"
            >
              Search
            </Button>
          </div>

          <div className="mt-3 flex flex-wrap gap-1.5">
            {SUGGESTED_QUERIES.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => runSearch(q)}
                data-testid={`reels-pill-${q.replace(/\s+/g, "-")}`}
                className={[
                  "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  active === q
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-muted-foreground hover:text-foreground",
                ].join(" ")}
              >
                {q}
              </button>
            ))}
          </div>
        </>
      )}

      <section className="mt-8">
        <div className="mb-3 flex items-center gap-2">
          <Youtube className="h-5 w-5 text-red-500" />
          <h2 className="text-lg font-semibold text-foreground">
            {view === "feed" ? "YouTube Shorts" : "Your Saved Reels"}
          </h2>
          {view === "feed" && isFetching && !isLoading && (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          )}
        </div>

        {view === "feed" && isLoading ? (
          <ReelGridSkeleton />
        ) : view === "feed" && error ? (
          <ConfigCard />
        ) : items.length > 0 ? (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 md:gap-4 lg:grid-cols-5">
              {items.map((item, idx) => (
                <ReelThumb
                  key={item.id}
                  reel={item}
                  index={idx}
                  saved={isSaved(item.id)}
                  onPlay={() => setPlayerIndex(idx)}
                  onToggleSave={() => toggleSave(item)}
                />
              ))}
            </div>

            {view === "feed" && hasNextPage && (
              <div className="mt-6 flex justify-center">
                <Button
                  variant="secondary"
                  onClick={() => fetchNextPage()}
                  disabled={isFetchingNextPage}
                  data-testid="button-reels-load-more"
                >
                  {isFetchingNextPage ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : null}
                  Load more
                </Button>
              </div>
            )}
          </>
        ) : view === "saved" ? (
          <div
            className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground"
            data-testid="reels-saved-empty"
          >
            <Bookmark className="mx-auto h-8 w-8 text-muted-foreground/50" />
            <p className="mt-3 font-medium text-foreground">No saved reels yet</p>
            <p className="mt-1">
              Tap the heart on any short to save it for later.
            </p>
          </div>
        ) : (
          <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            No shorts found. Try another search.
          </p>
        )}
      </section>

      <AnimatePresence>
        {playing && playerIndex != null && (
          <ReelPlayerModal
            reel={playing}
            index={playerIndex}
            total={items.length}
            saved={isSaved(playing.id)}
            onClose={() => setPlayerIndex(null)}
            onPrev={() =>
              setPlayerIndex((i) => (i != null && i > 0 ? i - 1 : i))
            }
            onNext={() =>
              setPlayerIndex((i) =>
                i != null && i < items.length - 1 ? i + 1 : i,
              )
            }
            onToggleSave={() => toggleSave(playing)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function ReelThumb({
  reel,
  index,
  saved,
  onPlay,
  onToggleSave,
}: {
  reel: Reel;
  index: number;
  saved: boolean;
  onPlay: () => void;
  onToggleSave: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index, 12) * 0.025, duration: 0.25 }}
      className="group relative overflow-hidden rounded-xl border border-border bg-card shadow-sm transition-shadow hover:shadow-lg"
    >
      <button
        type="button"
        onClick={onPlay}
        data-testid={`reel-${reel.id}`}
        className="block w-full text-left"
      >
        <div className="relative aspect-[9/16] overflow-hidden bg-muted">
          <img
            src={reel.thumbnail}
            alt={reel.title}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
          />
          <div className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-all group-hover:bg-black/30 group-hover:opacity-100">
            <div className="rounded-full bg-white/95 p-3 shadow-xl">
              <Film className="h-5 w-5 text-pink-500" />
            </div>
          </div>
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent p-2.5">
            <p className="line-clamp-2 text-xs font-semibold text-white">
              {reel.title}
            </p>
            <p className="mt-0.5 truncate text-[11px] text-white/70">
              {reel.channel}
            </p>
          </div>
        </div>
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggleSave();
        }}
        data-testid={`reel-save-${reel.id}`}
        aria-label={saved ? "Remove from saved" : "Save reel"}
        className={[
          "absolute right-2 top-2 rounded-full p-1.5 backdrop-blur transition-colors",
          saved
            ? "bg-pink-500 text-white"
            : "bg-black/50 text-white hover:bg-black/70",
        ].join(" ")}
      >
        <Heart
          className={["h-4 w-4", saved ? "fill-current" : ""].join(" ")}
        />
      </button>
    </motion.div>
  );
}

function ReelPlayerModal({
  reel,
  index,
  total,
  saved,
  onClose,
  onPrev,
  onNext,
  onToggleSave,
}: {
  reel: Reel;
  index: number;
  total: number;
  saved: boolean;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  onToggleSave: () => void;
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowDown" || e.key === "j") onNext();
      else if (e.key === "ArrowUp" || e.key === "k") onPrev();
      else if (e.key === "s") onToggleSave();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, onNext, onPrev, onToggleSave]);

  const share = async () => {
    const url = `https://www.youtube.com/shorts/${reel.id}`;
    const sharePayload = { title: reel.title, url };
    const navWithShare = navigator as Navigator & {
      share?: (data: { title?: string; url?: string }) => Promise<void>;
    };
    if (navWithShare.share) {
      try {
        await navWithShare.share(sharePayload);
        return;
      } catch {
        /* user cancelled */
      }
    }
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      /* ignore */
    }
  };

  const embedSrc = `https://www.youtube.com/embed/${reel.id}?autoplay=1&rel=0&modestbranding=1&playsinline=1`;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm"
      onClick={onClose}
      data-testid="reel-player-modal"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        data-testid="button-reel-close"
        className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
      >
        <X className="h-5 w-5" />
      </button>

      <div className="absolute left-4 top-4 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white">
        {index + 1} / {total}
      </div>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onPrev();
        }}
        disabled={index === 0}
        aria-label="Previous"
        data-testid="button-reel-prev"
        className="absolute left-1/2 top-4 -translate-x-1/2 rounded-full bg-white/10 p-2 text-white transition hover:bg-white/20 disabled:opacity-30 md:left-auto md:right-1/2 md:top-1/2 md:translate-x-0 md:-translate-y-12 md:translate-y-[-4rem]"
      >
        <ChevronUp className="h-5 w-5" />
      </button>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onNext();
        }}
        disabled={index >= total - 1}
        aria-label="Next"
        data-testid="button-reel-next"
        className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-white/10 p-2 text-white transition hover:bg-white/20 disabled:opacity-30 md:bottom-auto md:left-auto md:right-1/2 md:top-1/2 md:translate-x-0 md:translate-y-12"
      >
        <ChevronDown className="h-5 w-5" />
      </button>

      <motion.div
        key={reel.id}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        transition={{ duration: 0.2 }}
        onClick={(e) => e.stopPropagation()}
        className="flex w-full max-w-[420px] flex-col gap-3 px-4"
      >
        <div className="relative aspect-[9/16] w-full overflow-hidden rounded-2xl bg-black shadow-2xl">
          <iframe
            key={reel.id}
            src={embedSrc}
            title={reel.title}
            allow="autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
            className="absolute inset-0 h-full w-full"
          />
        </div>

        <div className="rounded-2xl bg-white/5 p-3 text-white backdrop-blur">
          <p className="line-clamp-2 text-sm font-semibold">{reel.title}</p>
          <p className="mt-0.5 text-xs text-white/60">{reel.channel}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant={saved ? "default" : "secondary"}
              onClick={onToggleSave}
              data-testid="button-reel-modal-save"
            >
              <Heart
                className={[
                  "mr-1.5 h-4 w-4",
                  saved ? "fill-current" : "",
                ].join(" ")}
              />
              {saved ? "Saved" : "Save"}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={share}
              data-testid="button-reel-share"
            >
              <Share2 className="mr-1.5 h-4 w-4" />
              Share
            </Button>
            <a
              href={`https://www.youtube.com/shorts/${reel.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md bg-white/10 px-3 py-1.5 text-xs font-medium hover:bg-white/20"
              data-testid="link-reel-youtube"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              YouTube
            </a>
            <span className="ml-auto hidden text-[11px] text-white/50 md:inline">
              ↑/↓ to navigate · Esc to close
            </span>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

function ReelGridSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 md:gap-4 lg:grid-cols-5">
      {Array.from({ length: 10 }).map((_, i) => (
        <div
          key={i}
          className="aspect-[9/16] animate-pulse rounded-xl bg-card"
        />
      ))}
    </div>
  );
}

function ConfigCard() {
  return (
    <div
      className="rounded-xl border border-dashed border-border bg-card p-8 text-center"
      data-testid="reels-config-error"
    >
      <Youtube className="mx-auto h-10 w-10 text-muted-foreground/40" />
      <p className="mt-3 font-semibold text-foreground">
        YouTube isn't connected yet
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        An admin needs to add a YouTube Data API key to enable this feed.
      </p>
    </div>
  );
}
