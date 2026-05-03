import { Link, useLocation, useSearch } from "wouter";
import { useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetMe,
  useGetMyFollowedHashtags,
  getGetMyFeedPostsQueryKey,
  getGetHashtagPostsQueryKey,
} from "@workspace/api-client-react";
import { PostFeed } from "@/components/PostFeed";
import { PostComposer } from "@/components/PostComposer";
import { Button } from "@/components/ui/button";
import { Hash, Home as HomeIcon, Loader2 } from "lucide-react";
import { useTranslation } from "@/lib/i18n";

export default function Home() {
  const { t } = useTranslation();
  const meQ = useGetMe();
  const meId = meQ.data?.id ?? null;
  const followedQ = useGetMyFollowedHashtags();
  const qc = useQueryClient();
  const [, setLocation] = useLocation();
  const search = useSearch();

  const followed = followedQ.data ?? [];

  const rawTag = useMemo(() => {
    const params = new URLSearchParams(search);
    return params.get("tag")?.toLowerCase() ?? null;
  }, [search]);

  const followedTags = useMemo(() => followed.map((f) => f.tag), [followed]);
  const selectedTag =
    rawTag && followedTags.includes(rawTag) ? rawTag : null;

  function selectTag(tag: string | null) {
    if (tag) {
      setLocation(`/app/home?tag=${encodeURIComponent(tag)}`);
    } else {
      setLocation("/app/home");
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 md:px-8 md:py-10">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500/20 to-pink-500/20 ring-1 ring-violet-500/30">
          <HomeIcon className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-foreground">{t("home.title")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("home.subtitle")}
          </p>
        </div>
      </div>

      {followedQ.isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground/70" />
        </div>
      ) : followed.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card/40 p-8 text-center">
          <Hash className="h-8 w-8 text-muted-foreground/70" />
          <p className="text-sm text-muted-foreground">
            {t("home.emptyFollow")}
          </p>
          <Link href="/app/trending">
            <Button data-testid="link-find-rooms">{t("home.findRooms")}</Button>
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div
            className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1"
            data-testid="home-tag-chips"
          >
            <button
              type="button"
              onClick={() => selectTag(null)}
              className={[
                "shrink-0 rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
                selectedTag === null
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/70",
              ].join(" ")}
              aria-pressed={selectedTag === null}
              data-testid="chip-tag-all"
            >
              {t("home.chipAll")}
            </button>
            {followed.map((f) => {
              const active = selectedTag === f.tag;
              return (
                <button
                  key={f.tag}
                  type="button"
                  onClick={() => selectTag(active ? null : f.tag)}
                  className={[
                    "inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
                    active
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/70",
                  ].join(" ")}
                  aria-pressed={active}
                  data-testid={`chip-tag-${f.tag}`}
                >
                  <Hash className="h-3.5 w-3.5" />
                  {f.tag}
                </button>
              );
            })}
          </div>

          <PostComposer
            placeholder={
              selectedTag
                ? t("home.composerPlaceholderTag", { tag: selectedTag })
                : t("home.composerPlaceholderAll")
            }
            onPosted={() => {
              qc.invalidateQueries({
                queryKey: getGetMyFeedPostsQueryKey(),
              });
              if (selectedTag) {
                qc.invalidateQueries({
                  queryKey: getGetHashtagPostsQueryKey(selectedTag),
                });
              }
            }}
          />
          {selectedTag ? (
            <PostFeed
              key={`tag-${selectedTag}`}
              scope={{ kind: "hashtag", tag: selectedTag }}
              meId={meId}
              emptyMessage={t("home.emptyTagFeed", { tag: selectedTag })}
            />
          ) : (
            <PostFeed
              key="home-all"
              scope={{ kind: "home" }}
              meId={meId}
              emptyMessage={t("home.emptyAllFeed")}
            />
          )}
        </div>
      )}
    </div>
  );
}
