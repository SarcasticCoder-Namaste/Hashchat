import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetMySparks,
  useGetUserSparks,
  useGetHashtagSparks,
  useCreateSpark,
  useDeleteSpark,
  getGetMySparksQueryKey,
  getGetUserSparksQueryKey,
  getGetHashtagSparksQueryKey,
  type Spark,
} from "@workspace/api-client-react";
import type { QueryKey } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ImageUploadButton } from "@/components/ImageUploadButton";
import { useToast } from "@/hooks/use-toast";
import { Sparkles, Loader2, X, Hash, Clock } from "lucide-react";

function timeRemaining(expiresAt: string): string {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return "expired";
  const hours = Math.floor(ms / 3_600_000);
  if (hours >= 1) return `${hours}h left`;
  const minutes = Math.max(1, Math.floor(ms / 60_000));
  return `${minutes}m left`;
}

export function SparkComposer({
  onCreated,
  defaultTag,
}: {
  onCreated?: () => void;
  defaultTag?: string;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [content, setContent] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const create = useCreateSpark({
    mutation: {
      onSuccess: () => {
        setContent("");
        setImageUrl(null);
        qc.invalidateQueries({ queryKey: getGetMySparksQueryKey() });
        if (defaultTag) {
          qc.invalidateQueries({
            queryKey: getGetHashtagSparksQueryKey(defaultTag),
          });
        }
        toast({ title: "Spark posted — vanishes in 24h" });
        onCreated?.();
      },
      onError: () =>
        toast({ title: "Could not post Spark", variant: "destructive" }),
    },
  });

  function submit() {
    const trimmed = content.trim();
    if (!trimmed && !imageUrl) return;
    create.mutate({
      data: {
        content: trimmed,
        imageUrl,
        hashtags: defaultTag ? [defaultTag] : [],
      },
    });
  }

  return (
    <div
      className="rounded-xl border border-border bg-card p-3"
      data-testid="spark-composer"
    >
      <div className="mb-2 flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-gradient-to-br from-amber-400 to-orange-500 text-white">
          <Sparkles className="h-3 w-3" />
        </span>
        <p className="text-xs font-semibold text-foreground">
          Drop a Spark{defaultTag ? ` in #${defaultTag}` : ""}
        </p>
        <span className="ml-auto text-[10px] text-muted-foreground">
          Disappears in 24h
        </span>
      </div>
      <Textarea
        value={content}
        onChange={(e) => setContent(e.target.value.slice(0, 280))}
        placeholder="What's lighting up your day?"
        rows={2}
        data-testid="spark-input"
        className="resize-none"
      />
      {imageUrl && (
        <div className="relative mt-2 inline-block">
          <img
            src={imageUrl}
            alt=""
            className="max-h-32 rounded-md border border-border"
          />
          <button
            type="button"
            onClick={() => setImageUrl(null)}
            className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-foreground text-background"
            aria-label="Remove image"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}
      <div className="mt-2 flex items-center gap-2">
        <ImageUploadButton
          testId="spark-upload"
          onUploaded={(url) => setImageUrl(url)}
        />
        <span className="text-[10px] text-muted-foreground">
          {content.length}/280
        </span>
        <Button
          size="sm"
          className="ml-auto brand-gradient-bg text-white"
          onClick={submit}
          disabled={create.isPending || (!content.trim() && !imageUrl)}
          data-testid="spark-post"
        >
          {create.isPending && (
            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
          )}
          Spark
        </Button>
      </div>
    </div>
  );
}

export function SparkCard({
  spark,
  canDelete,
  scope,
}: {
  spark: Spark;
  canDelete?: boolean;
  scope?: { kind: "me" | "user" | "hashtag"; key?: string };
}) {
  const qc = useQueryClient();
  const del = useDeleteSpark({
    mutation: {
      onSuccess: () => {
        if (scope?.kind === "me") {
          qc.invalidateQueries({ queryKey: getGetMySparksQueryKey() });
        }
        if (scope?.kind === "user" && scope.key) {
          qc.invalidateQueries({
            queryKey: getGetUserSparksQueryKey(scope.key),
          });
        }
        if (scope?.kind === "hashtag" && scope.key) {
          qc.invalidateQueries({
            queryKey: getGetHashtagSparksQueryKey(scope.key),
          });
        }
      },
    },
  });
  return (
    <div
      className="relative w-44 shrink-0 overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-amber-500/10 via-card to-orange-500/10 p-3"
      data-testid={`spark-${spark.id}`}
    >
      <div className="mb-1.5 flex items-center gap-1.5">
        {spark.author?.avatarUrl ? (
          <img
            src={spark.author.animatedAvatarUrl ?? spark.author.avatarUrl}
            alt={spark.author.displayName}
            className="h-5 w-5 rounded-full"
          />
        ) : (
          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-pink-500 text-[9px] font-semibold text-white">
            {spark.author?.displayName.slice(0, 1).toUpperCase() ?? "?"}
          </div>
        )}
        <p className="min-w-0 flex-1 truncate text-[11px] font-semibold text-foreground">
          {spark.author?.displayName ?? "Unknown"}
        </p>
        {canDelete && (
          <button
            onClick={() => del.mutate({ id: spark.id })}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Delete spark"
            data-testid={`spark-delete-${spark.id}`}
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>
      {spark.imageUrl && (
        <img
          src={spark.imageUrl}
          alt=""
          className="mb-2 h-24 w-full rounded-md border border-border object-cover"
        />
      )}
      {spark.content && (
        <p className="line-clamp-3 whitespace-pre-wrap text-xs text-foreground/90">
          {spark.content}
        </p>
      )}
      {spark.hashtags.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {spark.hashtags.slice(0, 3).map((t) => (
            <span
              key={t}
              className="inline-flex items-center gap-0.5 rounded-full bg-muted px-1.5 py-0.5 text-[9px] text-muted-foreground"
            >
              <Hash className="h-2 w-2" />
              {t}
            </span>
          ))}
        </div>
      )}
      <p className="mt-2 inline-flex items-center gap-0.5 text-[9px] text-muted-foreground">
        <Clock className="h-2.5 w-2.5" />
        {timeRemaining(spark.expiresAt)}
      </p>
    </div>
  );
}

export function SparksRow({
  scope,
  canDelete,
}: {
  scope:
    | { kind: "me" }
    | { kind: "user"; username: string }
    | { kind: "hashtag"; tag: string };
  canDelete?: boolean;
}) {
  const meSparks = useGetMySparks({
    query: {
      queryKey: getGetMySparksQueryKey() as QueryKey,
      enabled: scope.kind === "me",
    },
  });
  const userSparks = useGetUserSparks(
    scope.kind === "user" ? scope.username : "",
    {
      query: {
        queryKey: getGetUserSparksQueryKey(
          scope.kind === "user" ? scope.username : "",
        ) as QueryKey,
        enabled: scope.kind === "user",
      },
    },
  );
  const tagSparks = useGetHashtagSparks(
    scope.kind === "hashtag" ? scope.tag : "",
    {
      query: {
        queryKey: getGetHashtagSparksQueryKey(
          scope.kind === "hashtag" ? scope.tag : "",
        ) as QueryKey,
        enabled: scope.kind === "hashtag",
      },
    },
  );
  const sparks =
    scope.kind === "me"
      ? meSparks.data
      : scope.kind === "user"
        ? userSparks.data
        : tagSparks.data;
  if (!sparks || sparks.length === 0) return null;
  const scopeKey =
    scope.kind === "me"
      ? { kind: "me" as const }
      : scope.kind === "user"
        ? { kind: "user" as const, key: scope.username }
        : { kind: "hashtag" as const, key: scope.tag };
  return (
    <div className="space-y-2" data-testid="sparks-row">
      <div className="flex items-center gap-1.5">
        <Sparkles className="h-3.5 w-3.5 text-amber-500" />
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Sparks · 24h
        </p>
      </div>
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {sparks.map((s) => (
          <SparkCard
            key={s.id}
            spark={s}
            canDelete={canDelete}
            scope={scopeKey}
          />
        ))}
      </div>
    </div>
  );
}
