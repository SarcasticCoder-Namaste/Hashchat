import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
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
  Eye,
  ThumbsUp,
  MessageCircle,
  Play,
  LogIn,
} from "lucide-react";
import { useTranslation } from "@/lib/i18n";

type TranslateFn = (key: string, vars?: Record<string, string | number>) => string;
type Kind = "short" | "long";

const SHORTS_QUERIES = [
  "trending",
  "viral",
  "funny",
  "dance",
  "tech",
  "diy",
  "gaming",
  "food",
  "music",
  "sports",
  "travel",
  "anime",
];

const VIDEOS_QUERIES = [
  "trending",
  "music videos",
  "documentaries",
  "tech reviews",
  "news",
  "podcasts",
  "tutorials",
  "comedy",
  "movie trailers",
  "live performances",
  "gaming",
  "vlogs",
];

const YT_SIGNIN_KEY = "hashchat:yt-signed-in";
const YT_SIGNIN_URL =
  "https://accounts.google.com/ServiceLogin?service=youtube&continue=https%3A%2F%2Fwww.youtube.com%2F";

type Reel = {
  id: string;
  title: string;
  channel: string;
  channelId?: string;
  channelAvatar?: string | null;
  thumbnail: string;
  publishedAt: string;
  description?: string;
  viewCount?: number | null;
  likeCount?: number | null;
  commentCount?: number | null;
  /** "short" or "long" — stamped on save so Saved entries remember their format. */
  kind?: Kind;
};

function ytWatchUrl(reel: Reel, fallbackKind: Kind): string {
  const k = reel.kind ?? fallbackKind;
  return k === "short"
    ? `https://www.youtube.com/shorts/${reel.id}`
    : `https://www.youtube.com/watch?v=${reel.id}`;
}

function formatCount(n: number | null | undefined): string {
  if (n == null) return "";
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}K`.replace(".0", "");
  if (n < 1_000_000_000)
    return `${(n / 1_000_000).toFixed(n < 10_000_000 ? 1 : 0)}M`.replace(".0", "");
  return `${(n / 1_000_000_000).toFixed(1)}B`.replace(".0", "");
}

function formatRelative(iso: string, t: TranslateFn): string {
  const at = new Date(iso).getTime();
  if (Number.isNaN(at)) return "";
  const diff = Math.max(0, Date.now() - at) / 1000;
  if (diff < 60) return t("reels.timeJustNow");
  if (diff < 3600) return t("reels.timeMinutesAgo", { count: Math.floor(diff / 60) });
  if (diff < 86400) return t("reels.timeHoursAgo", { count: Math.floor(diff / 3600) });
  if (diff < 86400 * 7) return t("reels.timeDaysAgo", { count: Math.floor(diff / 86400) });
  if (diff < 86400 * 30) return t("reels.timeWeeksAgo", { count: Math.floor(diff / (86400 * 7)) });
  if (diff < 86400 * 365) return t("reels.timeMonthsAgo", { count: Math.floor(diff / (86400 * 30)) });
  return t("reels.timeYearsAgo", { count: Math.floor(diff / (86400 * 365)) });
}

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
  const { t } = useTranslation();
  const [kind, setKind] = useState<Kind>("short");
  const [query, setQuery] = useState("trending");
  const [active, setActive] = useState("trending");
  const [view, setView] = useState<"feed" | "saved">("feed");
  const [playerIndex, setPlayerIndex] = useState<number | null>(null);
  const [saved, setSaved] = useState<Reel[]>(() => loadSaved());
  const [ytSignedIn, setYtSignedIn] = useState<boolean>(() => {
    try {
      return localStorage.getItem(YT_SIGNIN_KEY) === "1";
    } catch {
      return false;
    }
  });

  const suggestions = kind === "short" ? SHORTS_QUERIES : VIDEOS_QUERIES;

  const {
    data,
    isLoading,
    error,
    isFetching,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ["youtube-reels", kind, active],
    queryFn: ({ pageParam }) =>
      getYoutubeReels({
        q: active,
        max: PAGE_SIZE,
        kind,
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
        : [{ ...reel, kind: reel.kind ?? kind }, ...prev].slice(0, 200),
    );
  };

  const runSearch = (q: string) => {
    setActive(q);
    setQuery(q);
    setView("feed");
  };

  const switchKind = (next: Kind) => {
    if (next === kind) return;
    setKind(next);
    setQuery("trending");
    setActive("trending");
    setView("feed");
    setPlayerIndex(null);
  };

  const openYouTubeSignIn = () => {
    try {
      localStorage.setItem(YT_SIGNIN_KEY, "1");
    } catch {
      /* ignore quota */
    }
    setYtSignedIn(true);
    window.open(YT_SIGNIN_URL, "_blank", "noopener,noreferrer");
  };

  const signOutYouTube = () => {
    try {
      localStorage.removeItem(YT_SIGNIN_KEY);
    } catch {
      /* ignore */
    }
    setYtSignedIn(false);
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-10">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-gradient-to-br from-pink-500 to-violet-500 p-2 text-white shadow-lg shadow-pink-500/30">
            <Film className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground">{t("reels.title")}</h1>
            <p className="text-sm text-muted-foreground">
              {t("reels.subtitle")}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {ytSignedIn ? (
            <Button
              variant="outline"
              size="sm"
              onClick={signOutYouTube}
              data-testid="button-yt-signout"
              className="rounded-full border-red-200 text-red-600 hover:bg-red-50"
            >
              <Youtube className="mr-1.5 h-4 w-4 text-red-500" />
              {t("reels.signedIn")}
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={openYouTubeSignIn}
              data-testid="button-yt-signin"
              className="rounded-full border-red-200 text-red-600 hover:bg-red-50"
            >
              <LogIn className="mr-1.5 h-4 w-4" />
              {t("reels.signIn")}
            </Button>
          )}
        </div>
      </div>

      {/* YouTube-style top tab bar: Shorts | Videos | Saved */}
      <div className="mt-6 flex items-center gap-1 overflow-x-auto border-b border-border pb-0">
        <TabButton
          active={view === "feed" && kind === "short"}
          onClick={() => {
            switchKind("short");
            setView("feed");
          }}
          icon={<Sparkles className="h-4 w-4" />}
          label={t("reels.tabShorts")}
          testId="tab-reels-shorts"
        />
        <TabButton
          active={view === "feed" && kind === "long"}
          onClick={() => {
            switchKind("long");
            setView("feed");
          }}
          icon={<Play className="h-4 w-4" />}
          label={t("reels.tabVideos")}
          testId="tab-reels-videos"
        />
        <TabButton
          active={view === "saved"}
          onClick={() => setView("saved")}
          icon={<Bookmark className="h-4 w-4" />}
          label={saved.length > 0 ? t("reels.tabSavedCount", { count: saved.length }) : t("reels.tabSaved")}
          testId="tab-reels-saved"
        />
      </div>

      {view === "feed" && (
        <>
          <div className="mt-4 flex flex-col gap-3 rounded-xl border border-border bg-card p-4 md:flex-row md:items-center">
            <div className="flex flex-1 items-center gap-2">
              <Search className="h-4 w-4 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") runSearch(query);
                }}
                placeholder={
                  kind === "short"
                    ? t("reels.searchShorts")
                    : t("reels.searchVideos")
                }
                data-testid="input-reels-search"
              />
            </div>
            <Button
              onClick={() => runSearch(query)}
              data-testid="button-reels-search"
            >
              {t("reels.search")}
            </Button>
          </div>

          <div className="mt-3 flex flex-wrap gap-1.5">
            {suggestions.map((q) => (
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
            {view === "saved"
              ? t("reels.yourSaved")
              : kind === "short"
                ? t("reels.ytShorts")
                : t("reels.ytVideos")}
          </h2>
          {view === "feed" && isFetching && !isLoading && (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          )}
        </div>

        {view === "feed" && isLoading ? (
          <ReelGridSkeleton kind={kind} />
        ) : view === "feed" && error ? (
          <ConfigCard />
        ) : items.length > 0 ? (
          <>
            <div
              className={
                kind === "short"
                  ? "grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 md:gap-4 lg:grid-cols-5"
                  : "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
              }
            >
              {items.map((item, idx) => (
                <ReelThumb
                  key={item.id}
                  reel={item}
                  index={idx}
                  saved={isSaved(item.id)}
                  kind={kind}
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
                  {t("reels.loadMore")}
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
            <p className="mt-3 font-medium text-foreground">{t("reels.noSavedTitle")}</p>
            <p className="mt-1">
              {t("reels.noSavedDesc")}
            </p>
          </div>
        ) : (
          <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            {kind === "short" ? t("reels.notFoundShorts") : t("reels.notFoundVideos")}
          </p>
        )}
      </section>

      <AnimatePresence>
        {playing && playerIndex != null && (
          <ReelPlayerModal
            items={items}
            startIndex={playerIndex}
            isSaved={isSaved}
            // In Saved view, items can be a mix of shorts and long-form videos.
            // The modal already adapts each page's aspect, badge, links, and
            // share URL from the per-item `reel.kind`, so we just pass the
            // current tab kind as a fallback for legacy saved entries that
            // were stored before we started stamping `kind` onto them.
            kind={kind}
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

function TabButton({
  active,
  onClick,
  icon,
  label,
  testId,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
  testId: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className={[
        "relative flex items-center gap-1.5 whitespace-nowrap px-4 py-2.5 text-sm font-medium transition-colors",
        active
          ? "text-foreground"
          : "text-muted-foreground hover:text-foreground",
      ].join(" ")}
    >
      {icon}
      {label}
      {active && (
        <motion.span
          layoutId="reels-tab-underline"
          className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-foreground"
          transition={{ type: "spring", stiffness: 500, damping: 36 }}
        />
      )}
    </button>
  );
}

function ReelThumb({
  reel,
  index,
  saved,
  kind,
  onPlay,
  onToggleSave,
}: {
  reel: Reel;
  index: number;
  saved: boolean;
  kind: Kind;
  onPlay: () => void;
  onToggleSave: () => void;
}) {
  const { t } = useTranslation();
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
        <div
          className={[
            "relative overflow-hidden bg-muted",
            (reel.kind ?? kind) === "short" ? "aspect-[9/16]" : "aspect-video",
          ].join(" ")}
        >
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
        aria-label={saved ? t("reels.removeFromSaved") : t("reels.saveReel")}
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
  kind,
  onClose,
  onToggleSave,
  fetchMore,
  hasMore,
  isFetchingMore,
}: {
  items: Reel[];
  startIndex: number;
  isSaved: (id: string) => boolean;
  kind: Kind;
  onClose: () => void;
  onToggleSave: (reel: Reel) => void;
  fetchMore: () => void;
  hasMore: boolean;
  isFetchingMore: boolean;
}) {
  const { t } = useTranslation();
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
    // Lock body + html scroll AND any scrollable ancestor element (AppShell uses
    // <main className="overflow-y-auto"> instead of body for scroll; we walk the
    // DOM and freeze every overflow:auto/scroll ancestor of the modal mount point).
    const prevBody = document.body.style.overflow;
    const prevHtml = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    const lockedAncestors: Array<{ el: HTMLElement; prev: string }> = [];
    document
      .querySelectorAll<HTMLElement>("main, [data-scroll-root]")
      .forEach((el) => {
        const cs = getComputedStyle(el);
        if (cs.overflowY === "auto" || cs.overflowY === "scroll") {
          lockedAncestors.push({ el, prev: el.style.overflow });
          el.style.overflow = "hidden";
        }
      });
    previousActiveElement.current =
      (document.activeElement as HTMLElement | null) ?? null;
    closeBtnRef.current?.focus();
    return () => {
      document.body.style.overflow = prevBody;
      document.documentElement.style.overflow = prevHtml;
      lockedAncestors.forEach(({ el, prev }) => {
        el.style.overflow = prev;
      });
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
    const url = ytWatchUrl(reel, kind);
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

  const canScrollPrev = activeIndex > 0;
  const canScrollNext = activeIndex < items.length - 1;

  const modal = (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] bg-black"
      data-testid="reel-player-modal"
      role="dialog"
      aria-modal="true"
      aria-label={kind === "short" ? t("reels.shortsPlayer") : t("reels.videosPlayer")}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-center justify-between p-4">
        <div className="pointer-events-auto flex items-center gap-2">
          <span className="rounded bg-red-600 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white shadow-md">
            {kind === "short" ? t("reels.shortsBadge") : t("reels.videosBadge")}
          </span>
          <div
            className="rounded-full bg-black/55 px-3 py-1 text-xs font-medium text-white backdrop-blur"
            data-testid="reel-counter"
          >
            {Math.min(activeIndex + 1, items.length)} / {items.length}
          </div>
        </div>
        <button
          ref={closeBtnRef}
          type="button"
          onClick={onClose}
          aria-label={t("reels.close")}
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
          const initials = reel.channel?.charAt(0)?.toUpperCase() ?? "?";
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

              <div
                className={[
                  "relative overflow-hidden bg-black",
                  (reel.kind ?? kind) === "short"
                    ? "h-full w-full max-w-[min(100vw,calc(100dvh*9/16))]"
                    : "aspect-video w-full max-h-[100dvh] max-w-[min(100vw,calc(100dvh*16/9))]",
                ].join(" ")}
              >
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
                    aria-label={t("reels.playTitle", { title: reel.title })}
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

              <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black via-black/60 to-transparent px-4 pb-6 pt-24">
                <div className="mx-auto max-w-[min(100vw,calc(100dvh*9/16))] pr-20">
                  <div className="mb-2 flex items-center gap-2">
                    {reel.channelAvatar ? (
                      <img
                        src={reel.channelAvatar}
                        alt={reel.channel}
                        className="h-9 w-9 rounded-full border-2 border-white/30 object-cover shadow-md"
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-white/30 bg-gradient-to-br from-pink-500 to-violet-500 text-sm font-bold text-white shadow-md">
                        {initials}
                      </div>
                    )}
                    <a
                      href={
                        reel.channelId
                          ? `https://www.youtube.com/channel/${reel.channelId}`
                          : `https://www.youtube.com/results?search_query=${encodeURIComponent(reel.channel)}`
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className="pointer-events-auto truncate text-sm font-semibold text-white drop-shadow-md hover:underline"
                    >
                      @{reel.channel}
                    </a>
                    <a
                      href="https://www.youtube.com/account"
                      target="_blank"
                      rel="noopener noreferrer"
                      data-testid="button-reel-subscribe"
                      className="pointer-events-auto ml-1 rounded-full bg-white px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-black shadow-sm transition hover:bg-white/90"
                    >
                      {t("reels.subscribe")}
                    </a>
                  </div>
                  <p className="line-clamp-2 text-sm font-semibold text-white drop-shadow-md md:text-base">
                    {reel.title}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-white/80 drop-shadow-md">
                    {reel.viewCount != null && (
                      <span className="inline-flex items-center gap-1">
                        <Eye className="h-3 w-3" />
                        {t("reels.views", { count: formatCount(reel.viewCount) })}
                      </span>
                    )}
                    {reel.publishedAt && (
                      <span>{formatRelative(reel.publishedAt, t)}</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="absolute bottom-24 right-3 z-20 flex flex-col items-center gap-4 md:right-6">
                {reel.channelAvatar ? (
                  <a
                    href={
                      reel.channelId
                        ? `https://www.youtube.com/channel/${reel.channelId}`
                        : `https://www.youtube.com/results?search_query=${encodeURIComponent(reel.channel)}`
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={t("reels.openChannel", { name: reel.channel })}
                    className="relative h-12 w-12 overflow-hidden rounded-full border-2 border-white shadow-lg"
                  >
                    <img
                      src={reel.channelAvatar}
                      alt={reel.channel}
                      className="h-full w-full object-cover"
                    />
                    <span className="absolute -bottom-1 left-1/2 flex h-5 w-5 -translate-x-1/2 items-center justify-center rounded-full bg-red-600 text-[12px] font-bold leading-none text-white shadow">
                      +
                    </span>
                  </a>
                ) : null}
                <ActionButton
                  label={
                    reel.likeCount != null
                      ? formatCount(reel.likeCount)
                      : t("reels.like")
                  }
                  onClick={() => onToggleSave(reel)}
                  testId="button-reel-modal-save"
                  active={saved}
                >
                  <ThumbsUp
                    className={[
                      "h-6 w-6",
                      saved ? "fill-current" : "",
                    ].join(" ")}
                  />
                </ActionButton>
                {reel.commentCount != null && (
                  <a
                    href={ytWatchUrl(reel, kind)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex flex-col items-center gap-1 text-white/90 hover:text-white"
                    aria-label={t("reels.openComments")}
                  >
                    <span className="rounded-full bg-black/60 p-3 backdrop-blur transition hover:bg-black/80">
                      <MessageCircle className="h-6 w-6" />
                    </span>
                    <span className="text-[11px] font-medium drop-shadow">
                      {formatCount(reel.commentCount)}
                    </span>
                  </a>
                )}
                <ActionButton
                  label={t("reels.share")}
                  onClick={() => share(reel)}
                  testId="button-reel-share"
                >
                  <Share2 className="h-6 w-6" />
                </ActionButton>
                <ActionButton
                  label={saved ? t("reels.saved") : t("reels.save")}
                  onClick={() => onToggleSave(reel)}
                  testId="button-reel-modal-bookmark"
                  active={saved}
                >
                  <Heart
                    className={[
                      "h-6 w-6",
                      saved ? "fill-current" : "",
                    ].join(" ")}
                  />
                </ActionButton>
                <a
                  href={ytWatchUrl(reel, kind)}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid="link-reel-youtube"
                  className="flex flex-col items-center gap-1 text-white/90 hover:text-white"
                >
                  <span className="rounded-full bg-black/60 p-3 backdrop-blur transition hover:bg-black/80">
                    <ExternalLink className="h-6 w-6" />
                  </span>
                  <span className="text-[11px] font-medium drop-shadow">
                    {t("reels.youtube")}
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
                <Loader2 className="h-4 w-4 animate-spin" /> {kind === "short" ? t("reels.loadingMoreShorts") : t("reels.loadingMoreVideos")}
              </span>
            ) : (
              <span className="text-xs">{t("reels.keepScrolling")}</span>
            )}
          </div>
        )}
      </div>

      {/* Desktop-only side scroll buttons (the YouTube iframe captures wheel
          events on desktop, so users can't scroll with the mouse — these give
          them a way to advance like real YouTube Shorts). */}
      <div className="absolute right-24 top-1/2 z-30 hidden -translate-y-1/2 flex-col gap-3 md:flex lg:right-32">
        <button
          type="button"
          onClick={() => scrollToIndex(Math.max(activeIndex - 1, 0))}
          disabled={!canScrollPrev}
          data-testid="button-reel-scroll-prev"
          aria-label={kind === "short" ? t("reels.previousShort") : t("reels.previousVideo")}
          className="rounded-full bg-white/15 p-3 text-white backdrop-blur transition hover:bg-white/30 disabled:cursor-not-allowed disabled:opacity-30"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-5 w-5"
          >
            <polyline points="18 15 12 9 6 15" />
          </svg>
        </button>
        <button
          type="button"
          onClick={() =>
            scrollToIndex(Math.min(activeIndex + 1, items.length - 1))
          }
          disabled={!canScrollNext}
          data-testid="button-reel-scroll-next"
          aria-label={kind === "short" ? t("reels.nextShort") : t("reels.nextVideo")}
          className="rounded-full bg-white/15 p-3 text-white backdrop-blur transition hover:bg-white/30 disabled:cursor-not-allowed disabled:opacity-30"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-5 w-5"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      </div>

      <button
        type="button"
        onClick={() => setMuted((m) => !m)}
        data-testid="button-reel-mute"
        aria-label={muted ? t("reels.unmute") : t("reels.mute")}
        className="absolute right-4 top-16 z-30 rounded-full bg-black/55 px-3 py-1 text-xs font-medium text-white backdrop-blur transition hover:bg-black/75"
      >
        {muted ? t("reels.tapUnmute") : t("reels.soundOn")}
      </button>

      <div className="pointer-events-none absolute bottom-3 left-1/2 z-20 -translate-x-1/2 rounded-full bg-black/55 px-3 py-1 text-[11px] text-white/80 backdrop-blur md:hidden">
        {t("reels.swipeUp")}
      </div>
      <div className="pointer-events-none absolute bottom-3 left-1/2 z-20 -translate-x-1/2 hidden rounded-full bg-black/55 px-3 py-1 text-[11px] text-white/80 backdrop-blur md:block">
        {t("reels.keyboardHint")}
      </div>
    </motion.div>
  );

  return typeof document !== "undefined"
    ? createPortal(modal, document.body)
    : modal;
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

function ReelGridSkeleton({ kind }: { kind: Kind }) {
  const tileAspect = kind === "short" ? "aspect-[9/16]" : "aspect-video";
  const gridCls =
    kind === "short"
      ? "grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 md:gap-4 lg:grid-cols-5"
      : "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3";
  return (
    <div className={gridCls}>
      {Array.from({ length: 9 }).map((_, i) => (
        <div
          key={i}
          className={`${tileAspect} animate-pulse rounded-xl bg-card`}
        />
      ))}
    </div>
  );
}

function ConfigCard() {
  const { t } = useTranslation();
  return (
    <div
      className="rounded-xl border border-dashed border-border bg-card p-8 text-center"
      data-testid="reels-config-error"
    >
      <Youtube className="mx-auto h-10 w-10 text-muted-foreground/40" />
      <p className="mt-3 font-semibold text-foreground">
        {t("reels.notConnectedTitle")}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        {t("reels.notConnectedDesc")}
      </p>
    </div>
  );
}
