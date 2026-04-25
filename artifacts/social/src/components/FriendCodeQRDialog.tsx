import { useEffect, useState } from "react";
import QRCode from "qrcode";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { buildFriendCodeLink } from "@/lib/friendCodeLink";
import { Hash, Loader2, Download, Link2 } from "lucide-react";

export function FriendCodeQRDialog({
  code,
  open,
  onOpenChange,
}: {
  code: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const link = buildFriendCodeLink(code);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setDataUrl(null);
    setError(null);
    QRCode.toDataURL(link, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 512,
      color: { dark: "#0f172a", light: "#ffffff" },
    })
      .then((url) => {
        if (!cancelled) setDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't generate QR code");
      });
    return () => {
      cancelled = true;
    };
  }, [open, link]);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link);
      toast({ title: "Link copied", description: link });
    } catch {
      toast({ title: "Couldn't copy link", variant: "destructive" });
    }
  }

  function downloadImage() {
    if (!dataUrl) return;
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `hashchat-friend-code-${code}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-sm"
        data-testid="friend-code-qr-dialog"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-1.5">
            <Hash className="h-4 w-4 text-primary" /> Your friend QR
          </DialogTitle>
          <DialogDescription>
            Show this code in person — scanning it opens HashChat right to your
            profile.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-3">
          <div
            className="flex h-64 w-64 items-center justify-center rounded-2xl border border-border bg-white p-3 shadow-sm"
            data-testid="friend-code-qr-image-wrapper"
          >
            {error ? (
              <p className="text-sm text-destructive">{error}</p>
            ) : dataUrl ? (
              <img
                src={dataUrl}
                alt={`QR code for friend code ${code}`}
                className="h-full w-full object-contain"
                data-testid="friend-code-qr-image"
              />
            ) : (
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            )}
          </div>

          <div
            className="flex items-center gap-1 rounded-xl bg-muted/50 px-3 py-1.5 font-mono text-base font-bold tracking-wider text-foreground ring-1 ring-border"
            data-testid="friend-code-qr-code-label"
          >
            <Hash className="h-3.5 w-3.5 text-primary" />
            <span>{code}</span>
          </div>
          <p className="break-all text-center text-[11px] text-muted-foreground">
            {link}
          </p>
        </div>

        <div className="mt-2 flex flex-wrap justify-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={copyLink}
            data-testid="button-copy-friend-code-link"
          >
            <Link2 className="mr-1.5 h-3.5 w-3.5" /> Copy link
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={downloadImage}
            disabled={!dataUrl}
            data-testid="button-download-friend-code-qr"
          >
            <Download className="mr-1.5 h-3.5 w-3.5" /> Download
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
