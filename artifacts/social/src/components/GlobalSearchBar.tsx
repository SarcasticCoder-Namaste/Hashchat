import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { Search, Loader2, Hash, MessageSquare, FileText, User as UserIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useGlobalSearch } from "@workspace/api-client-react";

export function GlobalSearchBar({ widthClass = "w-72" }: { widthClass?: string }) {
  const [, setLocation] = useLocation();
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(q.trim()), 250);
    return () => window.clearTimeout(t);
  }, [q]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  // Cmd/Ctrl-K focus shortcut
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const enabled = open && debounced.length >= 1;
  const { data, isFetching } = useGlobalSearch(
    { q: debounced, limit: 5 },
    { query: { enabled, queryKey: ["global-search", debounced] } },
  );

  function go(href: string) {
    setOpen(false);
    setQ("");
    setLocation(href);
  }

  function viewAll() {
    if (!q.trim()) return;
    go(`/app/search?q=${encodeURIComponent(q.trim())}`);
  }

  const totalHits =
    (data?.users.length ?? 0) +
    (data?.hashtags.length ?? 0) +
    (data?.rooms.length ?? 0) +
    (data?.posts.length ?? 0) +
    (data?.messages.length ?? 0);

  return (
    <div ref={containerRef} className={`relative ${widthClass}`}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={inputRef}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              viewAll();
            }
            if (e.key === "Escape") setOpen(false);
          }}
          placeholder="Search HashChat…"
          className="pl-8 pr-12"
          data-testid="input-global-search"
          aria-label="Search HashChat"
        />
        <span className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground sm:block">
          ⌘K
        </span>
      </div>

      {open && debounced.length >= 1 && (
        <div
          className="absolute left-0 right-0 top-full z-30 mt-1 max-h-[70vh] overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-lg"
          data-testid="dropdown-global-search"
        >
          {isFetching && totalHits === 0 ? (
            <div className="flex items-center gap-2 p-3 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Searching…
            </div>
          ) : totalHits === 0 ? (
            <div className="p-3 text-sm text-muted-foreground">
              No results for "{debounced}"
            </div>
          ) : (
            <>
              {(data?.users.length ?? 0) > 0 && (
                <Section title="People" icon={UserIcon}>
                  {data!.users.map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
                      onClick={() => go(`/app/u/${u.username}`)}
                      data-testid={`search-user-${u.username}`}
                    >
                      {u.avatarUrl ? (
                        <img
                          src={u.avatarUrl}
                          alt=""
                          className="h-6 w-6 rounded-full object-cover"
                        />
                      ) : (
                        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-[10px] text-primary">
                          {u.displayName[0]?.toUpperCase()}
                        </div>
                      )}
                      <span className="truncate font-medium">{u.displayName}</span>
                      <span className="truncate text-xs text-muted-foreground">@{u.username}</span>
                    </button>
                  ))}
                </Section>
              )}
              {(data?.hashtags.length ?? 0) > 0 && (
                <Section title="Hashtags" icon={Hash}>
                  {data!.hashtags.map((h) => (
                    <button
                      key={h.tag}
                      type="button"
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
                      onClick={() => go(`/app/tag/${h.tag}`)}
                      data-testid={`search-tag-${h.tag}`}
                    >
                      <Hash className="h-3.5 w-3.5 text-primary" />
                      <span className="font-medium">#{h.tag}</span>
                      <span className="ml-auto text-xs text-muted-foreground">
                        {h.memberCount} members · {h.messageCount} msgs
                      </span>
                    </button>
                  ))}
                </Section>
              )}
              {(data?.rooms.length ?? 0) > 0 && (
                <Section title="Rooms" icon={Hash}>
                  {data!.rooms.map((r) => (
                    <button
                      key={r.tag}
                      type="button"
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
                      onClick={() => go(`/app/rooms/${r.tag}`)}
                      data-testid={`search-room-${r.tag}`}
                    >
                      <Hash className="h-3.5 w-3.5 text-primary" />
                      <span className="font-medium">#{r.tag}</span>
                      {r.isPrivate && (
                        <span className="rounded border border-border px-1 text-[10px] text-muted-foreground">
                          private
                        </span>
                      )}
                      <span className="ml-auto text-xs text-muted-foreground">
                        {r.recentMessages} recent
                      </span>
                    </button>
                  ))}
                </Section>
              )}
              {(data?.posts.length ?? 0) > 0 && (
                <Section title="Posts" icon={FileText}>
                  {data!.posts.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className="block w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
                      onClick={() => go(`/app/u/${p.author.username}`)}
                      data-testid={`search-post-${p.id}`}
                    >
                      <p className="line-clamp-2 text-foreground">{p.snippet}</p>
                      <p className="text-xs text-muted-foreground">
                        @{p.author.username}
                      </p>
                    </button>
                  ))}
                </Section>
              )}
              {(data?.messages.length ?? 0) > 0 && (
                <Section title="Messages" icon={MessageSquare}>
                  {data!.messages.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      className="block w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
                      onClick={() => m.href && go(m.href)}
                      data-testid={`search-msg-${m.id}`}
                    >
                      <p className="line-clamp-2 text-foreground">{m.snippet}</p>
                      <p className="text-xs text-muted-foreground">
                        {m.roomTag ? `#${m.roomTag}` : "DM"} · @{m.senderUsername}
                      </p>
                    </button>
                  ))}
                </Section>
              )}
              <div className="mt-1 border-t border-border pt-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="w-full justify-center text-xs"
                  onClick={viewAll}
                  data-testid="button-search-view-all"
                >
                  View all results for "{debounced}"
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: typeof Search;
  children: React.ReactNode;
}) {
  return (
    <div className="px-1 pb-1.5 pt-1">
      <div className="flex items-center gap-1.5 px-2 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3 w-3" />
        {title}
      </div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}
