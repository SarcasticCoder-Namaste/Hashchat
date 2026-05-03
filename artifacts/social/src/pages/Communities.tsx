import { useState } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListCommunities,
  useCreateCommunity,
  useGetPremiumStatus,
  getListCommunitiesQueryKey,
} from "@workspace/api-client-react";
import type { Community } from "@workspace/api-client-react";
import { motion } from "framer-motion";
import { Users, Plus, Hash, Lock, Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { CardSkeleton } from "@/components/Skeleton";
import { EmptyState } from "@/components/EmptyState";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "@/lib/i18n";

export default function Communities() {
  const { t } = useTranslation();
  const [showMine, setShowMine] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const list = useListCommunities({ mine: showMine });
  const premium = useGetPremiumStatus();

  return (
    <div className="mx-auto max-w-4xl space-y-8 px-4 py-6 md:px-8 md:py-10">
      <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-violet-500/10 via-card to-pink-500/10 p-6 md:p-8">
        <div className="hero-grid absolute inset-0 opacity-40" aria-hidden="true" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground md:text-4xl">
              <span className="brand-gradient-text">{t("communities.title")}</span>
            </h1>
            <p className="mt-2 max-w-xl text-muted-foreground">
              {t("communities.subtitle")}
            </p>
          </div>
          <Button
            onClick={() => setCreateOpen(true)}
            className="brand-gradient-bg text-white"
            data-testid="button-create-community"
          >
            <Plus className="mr-1.5 h-4 w-4" />
            {t("communities.create")}
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant={showMine ? "ghost" : "secondary"}
          onClick={() => setShowMine(false)}
          data-testid="tab-all-communities"
        >
          {t("communities.discover")}
        </Button>
        <Button
          size="sm"
          variant={showMine ? "secondary" : "ghost"}
          onClick={() => setShowMine(true)}
          data-testid="tab-my-communities"
        >
          {t("communities.joined")}
        </Button>
      </div>

      {list.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <CardSkeleton />
          <CardSkeleton />
        </div>
      ) : list.data && list.data.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {list.data.map((c, idx) => (
            <motion.div
              key={c.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.03, duration: 0.22 }}
            >
              <CommunityCard c={c} />
            </motion.div>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={Users}
          title={showMine ? t("communities.emptyJoinedTitle") : t("communities.emptyDiscoverTitle")}
          description={
            showMine
              ? t("communities.emptyJoinedDesc")
              : t("communities.emptyDiscoverDesc")
          }
          action={
            <Button
              onClick={() => setCreateOpen(true)}
              className="brand-gradient-bg text-white"
            >
              <Plus className="mr-1.5 h-4 w-4" />
              {t("communities.createOne")}
            </Button>
          }
        />
      )}

      <CreateCommunityDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        isPremium={premium.data?.verified ?? false}
      />
    </div>
  );
}

function CommunityCard({ c }: { c: Community }) {
  const { t } = useTranslation();
  return (
    <Link
      href={`/app/communities/${c.slug}`}
      className="lift block rounded-xl border border-border bg-card p-4 shadow-sm"
      data-testid={`community-${c.slug}`}
    >
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-pink-500 text-white shadow-md">
          <Users className="h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-semibold text-foreground">{c.name}</p>
          <p className="text-xs text-muted-foreground">
            {c.memberCount === 1
              ? t("communities.memberCount", { count: c.memberCount })
              : t("communities.memberCountPlural", { count: c.memberCount })}
            {" · "}
            {c.hashtags.length === 1
              ? t("communities.tagCount", { count: c.hashtags.length })
              : t("communities.tagCountPlural", { count: c.hashtags.length })}
            {c.isMember && <span className="ml-2 text-violet-500">{t("communities.joinedBadge")}</span>}
          </p>
        </div>
      </div>
      {c.description && (
        <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{c.description}</p>
      )}
      {c.hashtags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {c.hashtags.slice(0, 6).map((t) => (
            <span
              key={t}
              className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
            >
              <Hash className="mr-0.5 h-2.5 w-2.5" />
              {t}
            </span>
          ))}
          {c.hashtags.length > 6 && (
            <span className="text-[11px] text-muted-foreground">
              +{c.hashtags.length - 6}
            </span>
          )}
        </div>
      )}
    </Link>
  );
}

function CreateCommunityDialog({
  open,
  onOpenChange,
  isPremium,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  isPremium: boolean;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [hashtagsInput, setHashtagsInput] = useState("");
  const qc = useQueryClient();
  const { toast } = useToast();
  const create = useCreateCommunity({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListCommunitiesQueryKey({ mine: false }) });
        qc.invalidateQueries({ queryKey: getListCommunitiesQueryKey({ mine: true }) });
        toast({ title: t("communities.created") });
        setName("");
        setDescription("");
        setHashtagsInput("");
        onOpenChange(false);
      },
      onError: (err: unknown) => {
        const e = err as { status?: number; message?: string };
        if (e?.status === 402) {
          toast({
            title: t("communities.freeLimit"),
            description: t("communities.freeLimitDesc"),
            variant: "destructive",
          });
        } else {
          toast({
            title: t("communities.couldNotCreate"),
            description: e?.message ?? t("communities.tryAgain"),
            variant: "destructive",
          });
        }
      },
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const hashtags = hashtagsInput
      .split(/[\s,]+/)
      .map((t) => t.replace(/^#/, "").trim().toLowerCase())
      .filter((t) => t.length > 0);
    if (name.trim().length < 2) {
      toast({ title: t("communities.nameTooShort"), variant: "destructive" });
      return;
    }
    if (hashtags.length === 0) {
      toast({ title: t("communities.addOneTag"), variant: "destructive" });
      return;
    }
    create.mutate({
      data: {
        name: name.trim(),
        description: description.trim() || null,
        hashtags,
      },
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("communities.dialogTitle")}</DialogTitle>
          <DialogDescription>
            {t("communities.dialogSubtitle")}
            {!isPremium && (
              <span className="mt-2 flex items-center gap-1 text-xs text-violet-500">
                <Sparkles className="h-3 w-3" />
                {t("communities.freePlanNote")}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">{t("communities.fieldName")}</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              placeholder={t("communities.namePlaceholder")}
              data-testid="input-community-name"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              {t("communities.fieldDescription")}
            </label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={280}
              placeholder={t("communities.descPlaceholder")}
              rows={2}
              data-testid="input-community-description"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              {t("communities.fieldHashtags")}
            </label>
            <Input
              value={hashtagsInput}
              onChange={(e) => setHashtagsInput(e.target.value)}
              placeholder={t("communities.tagsPlaceholder")}
              data-testid="input-community-hashtags"
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={create.isPending}
            >
              {t("common.cancel")}
            </Button>
            <Button
              type="submit"
              disabled={create.isPending}
              className="brand-gradient-bg text-white"
              data-testid="button-submit-community"
            >
              {create.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              {t("communities.create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
