import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
            items={items}
            startIndex={playerIndex}
            isSaved={isSaved}
            onClose={() => setPlayerIndex(null)}
            onToggleSave={toggleSave}
            fetchMore={() => fetchNextPage()}
            hasMore={view === "feed" && !!hasNextPage}
            isFetchingMore={isFetchingNextPage}
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
  items,
  startIndex,
  isSaved,
  onClose,
  onToggleSave,
  fetchMore,
  hasMore,
  isFetchingMore,
}: {
  items: Reel[];
  startIndex: number;
  isSaved: (id: string) => boolean;
  onClose: () => void;
  onToggleSave: (reel: Reel) => void;
  fetchMore: () => void;
  hasMore: boolean;
  isFetchingMore: boolean;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<(HTMLElement | null)[]>([]);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);
  const ratiosRef = useRef<Map<number, number>>(new Map());
  const debounceTimer = useRef<number | null>(null);
  const lastFetchedAtLength = useRef<number>(0);
  const [activeIndex, setActiveIndex] = useState(startIndex);
  const [muted, setMuted] = useState(true);

  useEffect(() => {
    const c = containerRef.current;
    const target = itemRefs.current[startIndex];
    if (c && target) {
      c.scrollTo({ top: target.offsetTop, behavior: "auto" });
    }
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    previousActiveElement.current =
      (document.activeElement as HTMLElement | null) ?? null;
    closeBtnRef.current?.focus();
    return () => {
      document.body.style.overflow = prevOverflow;
      previousActiveElement.current?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const c = containerRef.current;
    if (!c) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const idx = Number((e.target as HTMLElement).dataset.index);
          ratiosRef.current.set(idx, e.intersectionRatio);
        }
        if (debounceTimer.current != null) {
          window.clearTimeout(debounceTimer.current);
        }
        debounceTimer.current = window.setTimeout(() => {
          let bestIdx = -1;
          let bestRatio = 0;
          for (const [idx, ratio] of ratiosRef.current.entries()) {
            if (ratio > bestRatio) {
              bestRatio = ratio;
              bestIdx = idx;
            }
          }
          if (bestIdx >= 0 && bestRatio >= 0.6) {
            setActiveIndex((prev) => (prev === bestIdx ? prev : bestIdx));
          }
        }, 90);
      },
      { root: c, threshold: [0.4, 0.6, 0.85] },
    );
    itemRefs.current.forEach((el) => el && observer.observe(el));
    return () => {
      observer.disconnect();
      if (debounceTimer.current != null) {
        window.clearTimeout(debounceTimer.current);
        debounceTimer.current = null;
      }
    };
  }, [items.length]);

  useEffect(() => {
    if (
      activeIndex >= items.length - 3 &&
      hasMore &&
      !isFetchingMore &&
      items.length > lastFetchedAtLength.current
    ) {
      lastFetchedAtLength.current = items.length;
      fetchMore();
    }
  }, [activeIndex, items.length, hasMore, isFetchingMore, fetchMore]);

  const scrollToIndex = (i: number, behavior: ScrollBehavior = "smooth") => {
    const c = containerRef.current;
    const target = itemRefs.current[i];
    if (c && target) c.scrollTo({ top: target.offsetTop, behavior });
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowDown" || e.key === "j") {
        e.preventDefault();
        scrollToIndex(Math.min(activeIndex + 1, items.length - 1));
      } else if (e.key === "ArrowUp" || e.key === "k") {
        e.preventDefault();
        scrollToIndex(Math.max(activeIndex - 1, 0));
      } else if (e.key === "s") {
        const r = items[activeIndex];
        if (r) onToggleSave(r);
      } else if (e.key === "m") {
        setMuted((m) => !m);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [activeIndex, items, onClose, onToggleSave]);

  const share = async (reel: Reel) => {
    const url = `https://www.youtube.com/shorts/${reel.id}`;
    const navWithShare = navigator as Navigator & {
      share?: (data: { title?: string; url?: string }) => Promise<void>;
    };
    if (navWithShare.share) {
      try {
        await navWithShare.share({ title: reel.title, url });
        return;
      } catch {
        /* cancelled */
      }
    }
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      /* ignore */
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black"
      data-testid="reel-player-modal"
      role="dialog"
      aria-modal="true"
      aria-label="Shorts player"
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-center justify-between p-4">
        <div
          className="pointer-events-auto rounded-full bg-black/55 px-3 py-1 text-xs font-medium text-white backdrop-blur"
          data-testid="reel-counter"
        >
          {Math.min(activeIndex + 1, items.length)} / {items.length}
        </div>
        <button
          ref={closeBtnRef}
          type="button"
          onClick={onClose}
          aria-label="Close"
          data-testid="button-reel-close"
          className="pointer-events-auto rounded-full bg-black/55 p-2 text-white backdrop-blur transition hover:bg-black/75 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div
        ref={containerRef}
        className="h-[100dvh] w-full snap-y snap-mandatory overflow-y-scroll overscroll-y-contain scroll-smooth"
        data-testid="reel-scroller"
      >
        {items.map((reel, i) => {
          const isActive = i === activeIndex;
          const isNear = Math.abs(i - activeIndex) <= 1;
          const saved = isSaved(reel.id);
          return (
            <section
              key={reel.id}
              ref={(el) => {
                itemRefs.current[i] = el;
              }}
              data-index={i}
              data-testid={`reel-page-${reel.id}`}
              className="relative flex h-[100dvh] w-full snap-start snap-always items-center justify-center overflow-hidden"
            >
              <div className="pointer-events-none absolute inset-0 -z-10">
                <img
                  src={reel.thumbnail}
                  alt=""
                  aria-hidden
                  className="h-full w-full scale-125 object-cover opacity-50 blur-2xl"
                />
              </div>

              <div className="relative h-full w-full max-w-[min(100vw,calc(100dvh*9/16))] overflow-hidden bg-black">
                {isActive ? (
                  <iframe
                    key={`iframe-${reel.id}-${muted ? "m" : "u"}`}
                    src={`https://www.youtube.com/embed/${reel.id}?autoplay=1&mute=${muted ? 1 : 0}&rel=0&modestbranding=1&playsinline=1&controls=1&loop=1&playlist=${reel.id}`}
                    title={reel.title}
                    allow="autoplay; encrypted-media; picture-in-picture"
                    allowFullScreen
                    className="absolute inset-0 h-full w-full"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => scrollToIndex(i)}
                    className="absolute inset-0 h-full w-full"
                    aria-label={`Play ${reel.title}`}
                  >
                    <img
                      src={reel.thumbnail}
                      alt={reel.title}
                      className="h-full w-full object-cover"
                      loading={isNear ? "eager" : "lazy"}
                    />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                      <div className="rounded-full bg-white/95 p-4 shadow-xl">
                        <Film className="h-7 w-7 text-pink-500" />
                      </div>
                    </div>
                  </button>
                )}
              </div>

              <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/85 via-black/40 to-transparent px-4 pb-6 pt-20">
                <div className="mx-auto max-w-[min(100vw,calc(100dvh*9/16))] pr-20">
                  <p className="line-clamp-2 text-sm font-semibold text-white drop-shadow-md md:text-base">
                    {reel.title}
                  </p>
                  <p className="mt-1 truncate text-xs text-white/85 drop-shadow-md">
                    @{reel.channel}
                  </p>
                </div>
              </div>

              <div className="absolute bottom-24 right-3 z-20 flex flex-col items-center gap-4 md:right-6">
                <ActionButton
                  label={saved ? "Saved" : "Save"}
                  onClick={() => onToggleSave(reel)}
                  testId="button-reel-modal-save"
                  active={saved}
                >
                  <Heart
                    className={[
                      "h-6 w-6",
                      saved ? "fill-current" : "",
                    ].join(" ")}
                  />
                </ActionButton>
                <ActionButton
                  label="Share"
                  onClick={() => share(reel)}
                  testId="button-reel-share"
                >
                  <Share2 className="h-6 w-6" />
                </ActionButton>
                <a
                  href={`https://www.youtube.com/shorts/${reel.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid="link-reel-youtube"
                  className="flex flex-col items-center gap-1 text-white/90 hover:text-white"
                >
                  <span className="rounded-full bg-black/60 p-3 backdrop-blur transition hover:bg-black/80">
                    <ExternalLink className="h-6 w-6" />
                  </span>
                  <span className="text-[11px] font-medium drop-shadow">
                    YouTube
                  </span>
                </a>
              </div>
            </section>
          );
        })}

        {hasMore && (
          <div className="flex h-20 items-center justify-center text-white/70">
            {isFetchingMore ? (
              <span className="flex items-center gap-2 text-xs">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading more shorts…
              </span>
            ) : (
              <span className="text-xs">Keep scrolling for more</span>
            )}
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={() => setMuted((m) => !m)}
        data-testid="button-reel-mute"
        aria-label={muted ? "Unmute" : "Mute"}
        className="absolute right-4 top-16 z-30 rounded-full bg-black/55 px-3 py-1 text-xs font-medium text-white backdrop-blur transition hover:bg-black/75"
      >
        {muted ? "🔇 Tap to unmute" : "🔊 Sound on"}
      </button>

      <div className="pointer-events-none absolute bottom-3 left-1/2 z-20 -translate-x-1/2 rounded-full bg-black/55 px-3 py-1 text-[11px] text-white/80 backdrop-blur md:hidden">
        Swipe up for next
      </div>
      <div className="pointer-events-none absolute bottom-3 left-1/2 z-20 -translate-x-1/2 rounded-full bg-black/55 px-3 py-1 text-[11px] text-white/80 backdrop-blur hidden md:block">
        ↑/↓ to scroll · S save · M mute · Esc close
      </div>
    </motion.div>
  );
}

function ActionButton({
  children,
  label,
  onClick,
  testId,
  active,
}: {
  children: ReactNode;
  label: string;
  onClick: () => void;
  testId?: string;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className="flex flex-col items-center gap-1 text-white/90 hover:text-white"
    >
      <span
        className={[
          "rounded-full p-3 backdrop-blur transition-colors",
          active
            ? "bg-pink-500 text-white"
            : "bg-black/60 hover:bg-black/80",
        ].join(" ")}
      >
        {children}
      </span>
      <span className="text-[11px] font-medium drop-shadow">{label}</span>
    </button>
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
