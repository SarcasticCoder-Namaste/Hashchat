import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetUserTipTarget,
  useCreateTipCheckout,
  useRecordSolanaTip,
  getGetMyTipInboxQueryKey,
  getGetMyTipOutboxQueryKey,
  getGetMyCreatorBalanceQueryKey,
} from "@workspace/api-client-react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Loader2, DollarSign, Coins } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface TipDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  toUserId: string;
  toDisplayName: string;
  postId?: number | null;
}

const USD_PRESETS = [100, 300, 500, 1000];
const SOL_PRESETS = [0.05, 0.1, 0.25, 0.5];

export function TipDialog({
  open,
  onOpenChange,
  toUserId,
  toDisplayName,
  postId,
}: TipDialogProps) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const target = useGetUserTipTarget(toUserId, {
    query: { enabled: open },
  });
  const [usdCents, setUsdCents] = useState<number>(300);
  const [solAmount, setSolAmount] = useState<number>(0.05);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const wallet = useWallet();
  const { setVisible: openWalletModal } = useWalletModal();
  const { connection } = useConnection();

  const usdCheckout = useCreateTipCheckout();
  const recordSol = useRecordSolanaTip();

  function invalidateTips() {
    qc.invalidateQueries({ queryKey: getGetMyTipInboxQueryKey() });
    qc.invalidateQueries({ queryKey: getGetMyTipOutboxQueryKey() });
    qc.invalidateQueries({ queryKey: getGetMyCreatorBalanceQueryKey() });
  }

  async function handleUsd() {
    if (usdCents < 100) {
      toast({ title: "Minimum is $1", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const r = await usdCheckout.mutateAsync({
        data: {
          toUserId,
          amountCents: usdCents,
          message: message || null,
          postId: postId ?? null,
        },
      });
      window.location.href = r.url;
    } catch (e) {
      toast({ title: "Could not start checkout", variant: "destructive" });
      setSubmitting(false);
    }
  }

  async function handleSol() {
    const t = target.data;
    if (!t?.solanaAddress) {
      toast({
        title: "This user hasn't linked a Solana wallet yet",
        variant: "destructive",
      });
      return;
    }
    if (!wallet.publicKey || !wallet.signTransaction) {
      openWalletModal(true);
      return;
    }
    if (solAmount <= 0) {
      toast({ title: "Enter a valid SOL amount", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const lamports = Math.floor(solAmount * LAMPORTS_PER_SOL);
      const recipient = new PublicKey(t.solanaAddress);
      const tx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: wallet.publicKey,
          toPubkey: recipient,
          lamports,
        }),
      );
      const { blockhash, lastValidBlockHeight } =
        await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = wallet.publicKey;
      const signature = await wallet.sendTransaction(tx, connection);
      await connection.confirmTransaction(
        { signature, blockhash, lastValidBlockHeight },
        "confirmed",
      );
      await recordSol.mutateAsync({
        data: {
          toUserId,
          amountLamports: String(lamports),
          signature,
          message: message || null,
          postId: postId ?? null,
        },
      });
      toast({ title: `Sent ${solAmount} SOL to ${toDisplayName}` });
      invalidateTips();
      onOpenChange(false);
    } catch (e) {
      const msg = (e as Error)?.message ?? "Transaction failed";
      toast({ title: "Tip failed", description: msg, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  const t = target.data;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Tip {toDisplayName}</DialogTitle>
          <DialogDescription>
            Send a one-time tip to support this creator.
          </DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="usd">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="usd" data-testid="tab-tip-usd">
              <DollarSign className="mr-1 h-4 w-4" /> USD (card)
            </TabsTrigger>
            <TabsTrigger
              value="sol"
              disabled={!t?.acceptsSol}
              data-testid="tab-tip-sol"
            >
              <Coins className="mr-1 h-4 w-4" /> SOL
            </TabsTrigger>
          </TabsList>

          <TabsContent value="usd" className="space-y-3">
            <div className="grid grid-cols-4 gap-2">
              {USD_PRESETS.map((c) => (
                <Button
                  key={c}
                  type="button"
                  size="sm"
                  variant={usdCents === c ? "default" : "outline"}
                  onClick={() => setUsdCents(c)}
                  data-testid={`button-usd-preset-${c}`}
                >
                  ${(c / 100).toFixed(c % 100 === 0 ? 0 : 2)}
                </Button>
              ))}
            </div>
            <div>
              <Label htmlFor="tip-usd-custom" className="text-xs">
                Custom amount (USD)
              </Label>
              <Input
                id="tip-usd-custom"
                type="number"
                min={1}
                max={500}
                value={usdCents / 100}
                onChange={(e) =>
                  setUsdCents(Math.max(100, Math.round(Number(e.target.value) * 100)))
                }
                data-testid="input-usd-custom"
              />
            </div>
          </TabsContent>

          <TabsContent value="sol" className="space-y-3">
            {!t?.acceptsSol ? (
              <p className="text-sm text-muted-foreground">
                {toDisplayName} hasn't linked a Solana wallet yet.
              </p>
            ) : (
              <>
                <div className="grid grid-cols-4 gap-2">
                  {SOL_PRESETS.map((s) => (
                    <Button
                      key={s}
                      type="button"
                      size="sm"
                      variant={solAmount === s ? "default" : "outline"}
                      onClick={() => setSolAmount(s)}
                      data-testid={`button-sol-preset-${s}`}
                    >
                      {s}
                    </Button>
                  ))}
                </div>
                <div>
                  <Label htmlFor="tip-sol-custom" className="text-xs">
                    Custom amount (SOL)
                  </Label>
                  <Input
                    id="tip-sol-custom"
                    type="number"
                    step="0.001"
                    min={0.001}
                    value={solAmount}
                    onChange={(e) => setSolAmount(Number(e.target.value))}
                    data-testid="input-sol-custom"
                  />
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Sent directly from your wallet to{" "}
                  <span className="font-mono">
                    {t.solanaAddress?.slice(0, 6)}…{t.solanaAddress?.slice(-4)}
                  </span>
                </p>
              </>
            )}
          </TabsContent>
        </Tabs>

        <div>
          <Label htmlFor="tip-message" className="text-xs">
            Add a note (optional)
          </Label>
          <Input
            id="tip-message"
            value={message}
            onChange={(e) => setMessage(e.target.value.slice(0, 280))}
            placeholder="Thanks for the great post!"
            data-testid="input-tip-message"
          />
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleUsd}
            disabled={submitting}
            data-testid="button-send-usd-tip"
          >
            {submitting ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
            Send ${(usdCents / 100).toFixed(2)}
          </Button>
          {t?.acceptsSol && (
            <Button
              variant="secondary"
              onClick={handleSol}
              disabled={submitting}
              data-testid="button-send-sol-tip"
            >
              {submitting ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
              Send {solAmount} SOL
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
