import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { Search, Hash, MessageSquare, FileText, User as UserIcon, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useGlobalSearch } from "@workspace/api-client-react";

const TABS = [
  { id: "all", label: "All", icon: Search },
  { id: "users", label: "People", icon: UserIcon },
  { id: "hashtags", label: "Hashtags", icon: Hash },
  { id: "rooms", label: "Rooms", icon: Hash },
  { id: "posts", label: "Posts", icon: FileText },
  { id: "messages", label: "Messages", icon: MessageSquare },
] as const;

export default function SearchResults() {
  const [location, setLocation] = useLocation();
  const initialQ = useMemo(() => {
    const idx = location.indexOf("?");
    if (idx < 0) return "";
    const params = new URLSearchParams(location.slice(idx + 1));
    return params.get("q") ?? "";
  }, [location]);

  const [q, setQ] = useState(initialQ);
  const [debounced, setDebounced] = useState(initialQ);
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("all");

  useEffect(() => {
    setQ(initialQ);
    setDebounced(initialQ);
  }, [initialQ]);

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(q.trim()), 300);
    return () => window.clearTimeout(t);
  }, [q]);

  const { data, isFetching } = useGlobalSearch(
    { q: debounced, kind: tab, limit: 25 },
    {
      query: {
        enabled: debounced.length >= 1,
        queryKey: ["global-search-page", debounced, tab],
      },
    },
  );

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setLocation(`/app/search?q=${encodeURIComponent(q.trim())}`);
  }

  const totalHits =
    (data?.users.length ?? 0) +
    (data?.hashtags.length ?? 0) +
    (data?.rooms.length ?? 0) +
    (data?.posts.length ?? 0) +
    (data?.messages.length ?? 0);

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 md:p-6">
      <form onSubmit={submit}>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            autoFocus
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search HashChat…"
            className="pl-9 pr-3 text-base"
            data-testid="input-search-page"
          />
        </div>
      </form>

      <div className="flex flex-wrap gap-1">
        {TABS.map(({ id, label, icon: Icon }) => (
          <Button
            key={id}
            variant={tab === id ? "default" : "ghost"}
            size="sm"
            className="text-xs"
            onClick={() => setTab(id)}
            data-testid={`tab-search-${id}`}
          >
            <Icon className="mr-1 h-3.5 w-3.5" />
            {label}
          </Button>
        ))}
      </div>

      {debounced.length === 0 && (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Type to search across people, hashtags, rooms, posts, and your messages.
        </div>
      )}

      {debounced.length > 0 && isFetching && totalHits === 0 && (
        <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Searching…
        </div>
      )}

      {debounced.length > 0 && !isFetching && totalHits === 0 && (
        <div className="rounded-lg border border-border p-6 text-center text-sm text-muted-foreground">
          No results for "{debounced}".
        </div>
      )}

      {(tab === "all" || tab === "users") && data?.users.length ? (
        <Section title="People">
          <ul className="divide-y divide-border rounded-lg border border-border bg-card">
            {data.users.map((u) => (
              <li key={u.id}>
                <Link
                  href={`/app/u/${u.username}`}
                  className="flex items-center gap-3 p-3 hover:bg-accent"
                  data-testid={`result-user-${u.username}`}
                >
                  {u.avatarUrl ? (
                    <img
                      src={u.avatarUrl}
                      alt=""
                      className="h-9 w-9 rounded-full object-cover"
                    />
                  ) : (
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/15 text-sm text-primary">
                      {u.displayName[0]?.toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="truncate font-medium">{u.displayName}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      @{u.username}
                      {u.bio ? ` · ${u.bio}` : ""}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {(tab === "all" || tab === "hashtags") && data?.hashtags.length ? (
        <Section title="Hashtags">
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {data.hashtags.map((h) => (
              <li key={h.tag}>
                <Link
                  href={`/app/tag/${h.tag}`}
                  className="block rounded-lg border border-border bg-card p-3 hover:bg-accent"
                  data-testid={`result-tag-${h.tag}`}
                >
                  <div className="flex items-center gap-1 text-sm font-semibold">
                    <Hash className="h-3.5 w-3.5 text-primary" />#{h.tag}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {h.memberCount} members · {h.messageCount} messages
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {(tab === "all" || tab === "rooms") && data?.rooms.length ? (
        <Section title="Rooms">
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {data.rooms.map((r) => (
              <li key={r.tag}>
                <Link
                  href={`/app/rooms/${r.tag}`}
                  className="block rounded-lg border border-border bg-card p-3 hover:bg-accent"
                  data-testid={`result-room-${r.tag}`}
                >
                  <div className="flex items-center gap-1 text-sm font-semibold">
                    <Hash className="h-3.5 w-3.5 text-primary" />#{r.tag}
                    {r.isPrivate && (
                      <span className="ml-1 rounded border border-border px-1 text-[10px] text-muted-foreground">
                        private
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {r.recentMessages} recent · {r.memberCount} members
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {(tab === "all" || tab === "posts") && data?.posts.length ? (
        <Section title="Posts">
          <ul className="space-y-2">
            {data.posts.map((p) => (
              <li
                key={p.id}
                className="rounded-lg border border-border bg-card p-3"
                data-testid={`result-post-${p.id}`}
              >
                <p className="text-xs text-muted-foreground">
                  <Link
                    href={`/app/u/${p.author.username}`}
                    className="hover:underline"
                  >
                    @{p.author.username}
                  </Link>
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm">{p.snippet}</p>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {(tab === "all" || tab === "messages") && data?.messages.length ? (
        <Section title="Messages">
          <ul className="space-y-2">
            {data.messages.map((m) => (
              <li
                key={m.id}
                className="rounded-lg border border-border bg-card p-3"
                data-testid={`result-msg-${m.id}`}
              >
                <p className="text-xs text-muted-foreground">
                  {m.roomTag ? (
                    <Link href={`/app/rooms/${m.roomTag}`} className="hover:underline">
                      #{m.roomTag}
                    </Link>
                  ) : (
                    m.conversationId ? (
                      <Link href={`/app/messages/${m.conversationId}`} className="hover:underline">
                        DM
                      </Link>
                    ) : (
                      "DM"
                    )
                  )}
                  {" · @"}{m.senderUsername}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm">{m.snippet}</p>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h3>
      {children}
    </section>
  );
}
