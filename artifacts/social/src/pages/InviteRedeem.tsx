import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  usePeekRoomInvite,
  useRedeemRoomInvite,
  getGetRoomsQueryKey,
} from "@workspace/api-client-react";
import { ArrowRight, Hash, Loader2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

export default function InviteRedeem({ code }: { code: string }) {
  const [, navigate] = useLocation();
  const peek = usePeekRoomInvite(code);
  const qc = useQueryClient();
  const { toast } = useToast();
  const [done, setDone] = useState(false);

  const redeem = useRedeemRoomInvite({
    mutation: {
      onSuccess: (res) => {
        qc.invalidateQueries({ queryKey: getGetRoomsQueryKey() });
        setDone(true);
        toast({ title: "You're in!" });
        navigate(`/app/rooms/${encodeURIComponent(res.tag)}`);
      },
      onError: () =>
        toast({ title: "Invite could not be redeemed", variant: "destructive" }),
    },
  });

  if (peek.isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const data = peek.data;
  const valid = data?.valid ?? false;

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md items-center justify-center px-4 py-10">
      <div className="w-full overflow-hidden rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-pink-500 text-white">
            <Lock className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Private room invite
            </p>
            <h1 className="text-xl font-bold text-foreground" data-testid="invite-room-tag">
              #{data?.tag ?? "?"}
            </h1>
          </div>
        </div>

        {!valid ? (
          <div className="mt-6 rounded-lg bg-muted p-4 text-sm text-muted-foreground">
            {data?.reason === "expired"
              ? "This invite has expired."
              : data?.reason === "exhausted"
                ? "This invite has reached its maximum uses."
                : "This invite is no longer valid."}
          </div>
        ) : data && data.joined ? (
          <div className="mt-6 space-y-3">
            <p className="text-sm text-muted-foreground">
              You're already a member of this room.
            </p>
            <Button asChild className="w-full">
              <Link href={`/app/rooms/${encodeURIComponent(data.tag)}`}>
                Open room <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
          </div>
        ) : (
          <div className="mt-6 space-y-3">
            <p className="text-sm text-muted-foreground">
              {data?.memberCount ?? 0} member
              {(data?.memberCount ?? 0) === 1 ? "" : "s"} already inside.
            </p>
            <Button
              className="brand-gradient-bg w-full text-white"
              disabled={redeem.isPending || done}
              onClick={() => redeem.mutate({ code })}
              data-testid="button-redeem-invite"
            >
              {redeem.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Join room
            </Button>
          </div>
        )}

        <div className="mt-4 text-center">
          <Link
            href="/app/rooms"
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Back to rooms
          </Link>
        </div>
      </div>
    </div>
  );
}
