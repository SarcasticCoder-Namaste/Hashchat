import { useState } from "react";
import { useGetYoutubeReels } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { motion } from "framer-motion";
import { Film, Search, Instagram, Youtube, Loader2 } from "lucide-react";

const SUGGESTED_QUERIES = [
  "viral shorts",
  "funny shorts",
  "dance shorts",
  "tech shorts",
  "diy shorts",
];

export default function Reels() {
  const [query, setQuery] = useState("trending shorts");
  const [active, setActive] = useState("trending shorts");
  const { data, isLoading, error } = useGetYoutubeReels({
    q: active,
    max: 12,
  });

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:px-8 md:py-10">
      <div className="flex items-center gap-3">
        <Film className="h-6 w-6 text-pink-500" />
        <h1 className="text-3xl font-bold text-foreground">Reels</h1>
      </div>
      <p className="mt-1 text-muted-foreground">
        Short videos from across the web — pulled into HashChat for your scroll
        breaks.
      </p>

      <div className="mt-6 flex flex-col gap-3 rounded-xl border border-border bg-card p-4 md:flex-row md:items-center">
        <div className="flex flex-1 items-center gap-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") setActive(query);
            }}
            placeholder="Search YouTube Shorts..."
            data-testid="input-reels-search"
          />
        </div>
        <Button
          onClick={() => setActive(query)}
          data-testid="button-reels-search"
        >
          Search
        </Button>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {SUGGESTED_QUERIES.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => {
              setQuery(q);
              setActive(q);
            }}
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

      <section className="mt-8">
        <div className="mb-3 flex items-center gap-2">
          <Youtube className="h-5 w-5 text-red-500" />
          <h2 className="text-lg font-semibold text-foreground">
            YouTube Shorts
          </h2>
        </div>
        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="aspect-[9/16] animate-pulse rounded-xl bg-card"
              />
            ))}
          </div>
        ) : error ? (
          <ConfigCard />
        ) : data && data.items.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {data.items.map((item, idx) => (
              <motion.a
                key={item.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.03, duration: 0.25 }}
                href={`https://www.youtube.com/shorts/${item.id}`}
                target="_blank"
                rel="noopener noreferrer"
                data-testid={`reel-${item.id}`}
                className="group block overflow-hidden rounded-xl border border-border bg-card shadow-sm transition-shadow hover:shadow-lg"
              >
                <div className="relative aspect-[9/16] overflow-hidden bg-muted">
                  <img
                    src={item.thumbnail}
                    alt={item.title}
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    loading="lazy"
                  />
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-3">
                    <p className="line-clamp-2 text-sm font-semibold text-white">
                      {item.title}
                    </p>
                    <p className="mt-1 truncate text-xs text-white/70">
                      {item.channel}
                    </p>
                  </div>
                </div>
              </motion.a>
            ))}
          </div>
        ) : (
          <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            No shorts found. Try another search.
          </p>
        )}
      </section>

      <section className="mt-10">
        <div className="mb-3 flex items-center gap-2">
          <Instagram className="h-5 w-5 text-pink-500" />
          <h2 className="text-lg font-semibold text-foreground">
            Instagram Reels
          </h2>
        </div>
        <div
          className="rounded-xl border border-dashed border-border bg-gradient-to-br from-pink-500/10 to-violet-500/10 p-8 text-center"
          data-testid="reels-instagram-placeholder"
        >
          <Instagram className="mx-auto h-10 w-10 text-pink-500/70" />
          <p className="mt-3 text-lg font-semibold text-foreground">
            Coming soon
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Instagram Reels embedding is in the works. Stay tuned.
          </p>
        </div>
      </section>
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
