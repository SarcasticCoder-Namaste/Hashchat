import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import bs58 from "bs58";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListMyWallets,
  useCreateWalletChallenge,
  useVerifyWalletChallenge,
  useUnlinkMyWallet,
  useSetPrimaryWallet,
  getListMyWalletsQueryKey,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Wallet as WalletIcon,
  Loader2,
  Star,
  Trash2,
  ShieldCheck,
  Copy,
} from "lucide-react";
import { SOLANA_NETWORK } from "@/components/SolanaProvider";

function shortKey(k: string): string {
  return k.length > 12 ? `${k.slice(0, 4)}…${k.slice(-4)}` : k;
}

export function WalletConnectSection() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { publicKey, signMessage, connected, disconnect } = useWallet();
  const [label, setLabel] = useState("");
  const [linking, setLinking] = useState(false);

  const { data, isLoading } = useListMyWallets();
  const challenge = useCreateWalletChallenge();
  const verify = useVerifyWalletChallenge();
  const unlink = useUnlinkMyWallet({
    mutation: {
      onSuccess: () =>
        qc.invalidateQueries({ queryKey: getListMyWalletsQueryKey() }),
    },
  });
  const setPrimary = useSetPrimaryWallet({
    mutation: {
      onSuccess: () =>
        qc.invalidateQueries({ queryKey: getListMyWalletsQueryKey() }),
    },
  });

  const wallets = data?.wallets ?? [];
  const currentKey = publicKey?.toBase58() ?? null;
  const alreadyLinked = currentKey
    ? wallets.some((w) => w.publicKey === currentKey)
    : false;

  async function handleLink() {
    if (!publicKey || !signMessage) {
      toast({
        title: "Connect a wallet first",
        description: "Click Select Wallet to connect Phantom or Solflare.",
        variant: "destructive",
      });
      return;
    }
    setLinking(true);
    try {
      const ch = await challenge.mutateAsync({
        data: { publicKey: publicKey.toBase58() },
      });
      const sig = await signMessage(new TextEncoder().encode(ch.message));
      await verify.mutateAsync({
        data: {
          publicKey: publicKey.toBase58(),
          signature: bs58.encode(sig),
          label: label.trim() || null,
        },
      });
      qc.invalidateQueries({ queryKey: getListMyWalletsQueryKey() });
      setLabel("");
      toast({
        title: "Wallet linked",
        description: `${shortKey(publicKey.toBase58())} is now verified on your profile.`,
      });
    } catch (err: any) {
      toast({
        title: "Could not link wallet",
        description:
          err?.response?.data?.error ?? err?.message ?? "Please try again.",
        variant: "destructive",
      });
    } finally {
      setLinking(false);
    }
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: "Copied", description: text });
    } catch {
      // ignore
    }
  }

  return (
    <div className="space-y-5 rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
            <WalletIcon className="h-5 w-5" />
            Solana wallets
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Link a Solana wallet to show a verified badge on your profile.
            Signing only proves you own the wallet — no funds move and no
            transaction is sent.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Network:{" "}
            <span className="font-mono uppercase">{SOLANA_NETWORK}</span>
          </p>
        </div>
      </div>

      <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <WalletMultiButton />
          {connected && publicKey && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => disconnect()}
              data-testid="button-wallet-disconnect"
            >
              Disconnect
            </Button>
          )}
        </div>

        {connected && publicKey && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Connected:</span>
              <span className="font-mono text-foreground">
                {shortKey(publicKey.toBase58())}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => copy(publicKey.toBase58())}
                aria-label="Copy address"
              >
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </div>

            {alreadyLinked ? (
              <p className="text-sm text-emerald-600 dark:text-emerald-400">
                This wallet is already linked to your account.
              </p>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="wallet-label" className="text-xs">
                  Label (optional)
                </Label>
                <div className="flex flex-wrap gap-2">
                  <Input
                    id="wallet-label"
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    placeholder="e.g. Main wallet"
                    maxLength={64}
                    className="max-w-xs"
                    data-testid="input-wallet-label"
                  />
                  <Button
                    onClick={handleLink}
                    disabled={linking}
                    data-testid="button-wallet-link"
                  >
                    {linking ? (
                      <>
                        <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                        Signing…
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="mr-1.5 h-4 w-4" />
                        Verify & link
                      </>
                    )}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Your wallet will pop up asking you to sign a short message.
                  This is free and safe.
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-foreground">
          Linked wallets ({wallets.length})
        </h3>
        {isLoading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground/70" />
          </div>
        ) : wallets.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border bg-muted/20 p-4 text-center text-sm text-muted-foreground">
            No wallets linked yet.
          </p>
        ) : (
          <ul className="space-y-2" data-testid="list-wallets">
            {wallets.map((w) => (
              <li
                key={w.id}
                className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-background px-3 py-2"
                data-testid={`row-wallet-${w.id}`}
              >
                <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-500" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-mono text-sm text-foreground">
                      {shortKey(w.publicKey)}
                    </span>
                    {w.isPrimary && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                        <Star className="h-3 w-3" />
                        Primary
                      </span>
                    )}
                    {w.label && (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                        {w.label}
                      </span>
                    )}
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    Linked{" "}
                    {new Date(w.createdAt).toLocaleDateString(undefined, {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => copy(w.publicKey)}
                  aria-label="Copy full address"
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
                {!w.isPrimary && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setPrimary.mutate({ id: w.id }, undefined)
                    }
                    data-testid={`button-set-primary-${w.id}`}
                  >
                    <Star className="mr-1 h-3.5 w-3.5" />
                    Make primary
                  </Button>
                )}
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      aria-label="Unlink wallet"
                      data-testid={`button-unlink-${w.id}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Unlink this wallet?</AlertDialogTitle>
                      <AlertDialogDescription>
                        {shortKey(w.publicKey)} will be removed from your
                        profile. You can re-link it later by signing again.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => unlink.mutate({ id: w.id })}
                      >
                        Unlink
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
