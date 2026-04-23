import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import {
  useGetHashtagSuggestions,
  useSetMyHashtags,
  getGetMeQueryKey,
  getGetMyHashtagsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Hash, Loader2, Sparkles } from "lucide-react";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function Onboarding() {
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const { data: suggested } = useGetHashtagSuggestions();
  const [picked, setPicked] = useState<string[]>([]);
  const [custom, setCustom] = useState("");
  const setMine = useSetMyHashtags({
    mutation: {
      onSuccess: async () => {
        await qc.invalidateQueries({ queryKey: getGetMeQueryKey() });
        await qc.invalidateQueries({ queryKey: getGetMyHashtagsQueryKey() });
        setLocation("/app/discover");
      },
    },
  });

  const allTags = useMemo(() => {
    const map = new Map<string, number>();
    suggested?.forEach((h) => map.set(h.tag, h.memberCount));
    picked.forEach((t) => {
      if (!map.has(t)) map.set(t, 0);
    });
    return Array.from(map.entries()).map(([tag, memberCount]) => ({
      tag,
      memberCount,
    }));
  }, [suggested, picked]);

  function toggle(tag: string) {
    setPicked((p) =>
      p.includes(tag) ? p.filter((t) => t !== tag) : [...p, tag],
    );
  }

  function addCustom() {
    const tag = custom.trim().toLowerCase().replace(/^#/, "").replace(/\s+/g, "");
    if (!tag) return;
    if (!picked.includes(tag)) setPicked((p) => [...p, tag]);
    setCustom("");
  }

  const canSave = picked.length >= 3;

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <div className="flex items-center gap-2">
        <img src={`${basePath}/logo.svg`} alt="HashChat" className="h-8 w-8" />
        <span className="text-lg font-bold text-foreground">HashChat</span>
      </div>
      <div className="mt-8">
        <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-card px-3 py-1 text-xs font-medium text-primary">
          <Sparkles className="h-3.5 w-3.5" /> Step 1 of 1
        </div>
        <h1 className="mt-4 text-3xl font-bold text-foreground md:text-4xl">
          What are you into?
        </h1>
        <p className="mt-2 text-muted-foreground">
          Pick at least 3 hashtags. We'll match you with people and rooms that share
          your interests.
        </p>
      </div>

      <div className="mt-8 rounded-2xl border border-border bg-card p-6 shadow-sm">
        <p className="text-sm font-medium text-foreground">
          {picked.length} selected
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {allTags.map(({ tag, memberCount }) => {
            const active = picked.includes(tag);
            return (
              <button
                type="button"
                key={tag}
                onClick={() => toggle(tag)}
                data-testid={`tag-${tag}`}
                className={[
                  "inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                  active
                    ? "border-primary bg-primary text-white"
                    : "border-border bg-card text-foreground hover:border-primary/50 hover:text-primary",
                ].join(" ")}
              >
                <Hash className="h-3.5 w-3.5" />
                {tag}
                {memberCount > 0 && (
                  <span
                    className={[
                      "ml-1 text-xs",
                      active ? "text-primary-foreground/80" : "text-muted-foreground/70",
                    ].join(" ")}
                  >
                    {memberCount}
                  </span>
                )}
              </button>
            );
          })}
          {!suggested && (
            <div className="h-24 w-full animate-pulse rounded-lg bg-muted" />
          )}
        </div>

        <div className="mt-6 flex gap-2">
          <Input
            placeholder="Add your own (e.g. mountainbiking)"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addCustom();
              }
            }}
            data-testid="input-custom-tag"
          />
          <Button
            type="button"
            variant="outline"
            onClick={addCustom}
            data-testid="button-add-tag"
          >
            Add
          </Button>
        </div>

        <div className="mt-8 flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {canSave
              ? "Looking good. Let's go!"
              : `Pick ${3 - picked.length} more to continue.`}
          </p>
          <Button
            disabled={!canSave || setMine.isPending}
            onClick={() => setMine.mutate({ data: { hashtags: picked } })}
            className="bg-primary hover:bg-primary/90"
            data-testid="button-save-tags"
          >
            {setMine.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Continue
          </Button>
        </div>
      </div>
    </div>
  );
}
