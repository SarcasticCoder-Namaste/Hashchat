import { Link } from "wouter";
import {
  useGetMyTipInbox,
  useGetMyTipOutbox,
  useGetMyCreatorBalance,
} from "@workspace/api-client-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Coins, DollarSign, Loader2 } from "lucide-react";

function formatCurrency(t: {
  currency: string;
  amountCents?: number | null;
  amountSol?: number | null;
}): string {
  if (t.currency === "usd")
    return `$${((t.amountCents ?? 0) / 100).toFixed(2)}`;
  if (t.currency === "sol")
    return `${(t.amountSol ?? 0).toFixed(4)} SOL`;
  return "—";
}

export default function TipsInbox() {
  const inbox = useGetMyTipInbox();
  const outbox = useGetMyTipOutbox();
  const balance = useGetMyCreatorBalance();

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4">
      <h1 className="text-xl font-bold">Tips</h1>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">Creator balance</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {balance.isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1 text-2xl font-semibold">
                <DollarSign className="h-5 w-5 text-muted-foreground" />
                {((balance.data?.usdCents ?? 0) / 100).toFixed(2)}
              </div>
              <div className="flex items-center gap-1 text-2xl font-semibold">
                <Coins className="h-5 w-5 text-muted-foreground" />
                {(Number(balance.data?.solLamports ?? "0") / 1_000_000_000).toFixed(4)}{" "}
                <span className="text-sm font-normal text-muted-foreground">SOL</span>
              </div>
            </div>
          )}
          <Button
            disabled
            variant="outline"
            size="sm"
            data-testid="button-cash-out"
          >
            Cash out — coming soon
          </Button>
        </CardContent>
      </Card>

      <Tabs defaultValue="received">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="received" data-testid="tab-tips-received">
            Received
          </TabsTrigger>
          <TabsTrigger value="sent" data-testid="tab-tips-sent">
            Sent
          </TabsTrigger>
        </TabsList>
        <TabsContent value="received" className="mt-3 space-y-2">
          {inbox.isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (inbox.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No tips yet. Share posts and your wallet to start receiving!
            </p>
          ) : (
            (inbox.data ?? []).map((t) => (
              <TipRow
                key={t.id}
                user={t.fromUser}
                amount={formatCurrency(t)}
                currency={t.currency}
                message={t.message}
                createdAt={t.createdAt}
                postId={t.postId ?? null}
                direction="from"
              />
            ))
          )}
        </TabsContent>
        <TabsContent value="sent" className="mt-3 space-y-2">
          {outbox.isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (outbox.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No tips sent.</p>
          ) : (
            (outbox.data ?? []).map((t) => (
              <TipRow
                key={t.id}
                user={t.toUser}
                amount={formatCurrency(t)}
                currency={t.currency}
                message={t.message}
                createdAt={t.createdAt}
                postId={t.postId ?? null}
                direction="to"
              />
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function TipRow({
  user,
  amount,
  currency,
  message,
  createdAt,
  postId,
  direction,
}: {
  user: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl?: string | null;
  };
  amount: string;
  currency: string;
  message: string | null | undefined;
  createdAt: string;
  postId: number | null;
  direction: "from" | "to";
}) {
  return (
    <div
      className="flex items-start gap-3 rounded-lg border bg-card p-3"
      data-testid={`tip-row-${direction}-${user.id}`}
    >
      <Avatar className="h-9 w-9">
        {user.avatarUrl ? <AvatarImage src={user.avatarUrl} /> : null}
        <AvatarFallback>{user.displayName.slice(0, 2).toUpperCase()}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <Link
            href={`/app/u/${user.username}`}
            className="text-sm font-medium hover:underline"
          >
            {user.displayName}
          </Link>
          <span className="text-xs text-muted-foreground">@{user.username}</span>
          <span className="text-xs text-muted-foreground">·</span>
          <span className="text-xs text-muted-foreground">
            {new Date(createdAt).toLocaleString()}
          </span>
        </div>
        {message ? (
          <p className="mt-1 text-sm text-foreground">{message}</p>
        ) : null}
        {postId != null ? (
          <Link
            href={`/app/post/${postId}`}
            className="mt-1 inline-block text-xs text-primary hover:underline"
          >
            View post →
          </Link>
        ) : null}
      </div>
      <div
        className={`shrink-0 text-right text-sm font-semibold ${
          direction === "from" ? "text-emerald-600" : "text-foreground"
        }`}
      >
        {direction === "from" ? "+" : "−"}
        {amount}
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
          {currency}
        </div>
      </div>
    </div>
  );
}
