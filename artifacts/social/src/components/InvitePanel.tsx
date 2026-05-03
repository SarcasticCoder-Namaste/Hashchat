import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetMyInvite,
  useRegenerateMyInvite,
  getGetMyInviteQueryKey,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Gift, Copy, RefreshCw, Share2, Sparkles } from "lucide-react";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

export function InvitePanel() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data, isLoading } = useGetMyInvite();
  const [copied, setCopied] = useState(false);
  const regen = useRegenerateMyInvite({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetMyInviteQueryKey() });
        toast({ title: "New invite link generated" });
      },
    },
  });

  if (isLoading || !data) {
    return null;
  }
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const link = `${origin}${basePath}/invite/${data.token}`;
  const towardNext = data.progressTowardNext;
  const pct = Math.round((towardNext / data.threshold) * 100);
  const grants = Math.floor(data.totalRedemptions / data.threshold);
  const grantedDays = grants * data.rewardDays;

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast({ title: "Could not copy", variant: "destructive" });
    }
  }

  async function nativeShare() {
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({
          title: "Join me on HashChat",
          text: "Come hang out in hashtag rooms with me!",
          url: link,
        });
      } catch {
        // user cancelled
      }
    } else {
      void copy();
    }
  }

  return (
    <div
      className="space-y-4 rounded-2xl border border-border bg-gradient-to-br from-violet-500/10 via-card to-pink-500/10 p-5"
      data-testid="invite-panel"
    >
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-pink-500 text-white">
          <Gift className="h-5 w-5" />
        </span>
        <div>
          <h3 className="text-base font-semibold text-foreground">
            Invite friends, earn MVP
          </h3>
          <p className="text-xs text-muted-foreground">
            Get {data.rewardDays} days of MVP free for every {data.threshold}{" "}
            friends who sign up.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-xs font-medium text-muted-foreground">
          Your invite link
        </label>
        <div className="flex gap-2">
          <Input
            readOnly
            value={link}
            className="flex-1 font-mono text-xs"
            data-testid="invite-link-input"
            onFocus={(e) => e.currentTarget.select()}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={copy}
            data-testid="invite-copy"
          >
            <Copy className="mr-1 h-3.5 w-3.5" />
            {copied ? "Copied!" : "Copy"}
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={nativeShare}
            data-testid="invite-share"
            className="brand-gradient-bg text-white"
          >
            <Share2 className="mr-1 h-3.5 w-3.5" />
            Share
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium text-foreground">
            Next reward in {data.threshold - towardNext}{" "}
            {data.threshold - towardNext === 1 ? "invite" : "invites"}
          </span>
          <span className="text-muted-foreground">
            {towardNext}/{data.threshold}
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full bg-gradient-to-r from-violet-500 to-pink-500 transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-card/70 p-2">
          <p className="text-lg font-bold text-foreground" data-testid="invite-total">
            {data.totalRedemptions}
          </p>
          <p className="text-[10px] text-muted-foreground">friends joined</p>
        </div>
        <div className="rounded-lg bg-card/70 p-2">
          <p className="text-lg font-bold text-foreground">{grants}</p>
          <p className="text-[10px] text-muted-foreground">rewards earned</p>
        </div>
        <div className="rounded-lg bg-card/70 p-2">
          <p className="inline-flex items-center gap-0.5 text-lg font-bold text-foreground">
            <Sparkles className="h-3.5 w-3.5 text-violet-500" />
            {grantedDays}
          </p>
          <p className="text-[10px] text-muted-foreground">MVP days earned</p>
        </div>
      </div>

      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => regen.mutate()}
        disabled={regen.isPending}
        data-testid="invite-regenerate"
        className="w-full"
      >
        <RefreshCw className="mr-1 h-3.5 w-3.5" />
        Generate a new link
      </Button>
    </div>
  );
}
