import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { extractFriendCodeFromText } from "@/lib/friendCodeLink";
import { Camera, Loader2, AlertTriangle, RotateCcw } from "lucide-react";

type ScanState =
  | { status: "starting" }
  | { status: "scanning" }
  | { status: "error"; message: string };

export function FriendCodeScanDialog({
  open,
  onOpenChange,
  onDetected,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDetected: (code: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const detectedRef = useRef(false);
  const [state, setState] = useState<ScanState>({ status: "starting" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!open) return;

    detectedRef.current = false;
    setState({ status: "starting" });

    let cancelled = false;

    async function start() {
      if (
        typeof navigator === "undefined" ||
        !navigator.mediaDevices ||
        !navigator.mediaDevices.getUserMedia
      ) {
        setState({
          status: "error",
          message:
            "Camera access isn't available in this browser. Try paste-the-code instead.",
        });
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        video.srcObject = stream;
        video.setAttribute("playsinline", "true");
        await video.play().catch(() => {
          /* autoplay may be blocked momentarily; user can tap */
        });
        if (cancelled) return;
        setState({ status: "scanning" });
        tick();
      } catch (err) {
        const msg =
          err instanceof Error && err.name === "NotAllowedError"
            ? "Camera permission was denied. Allow camera access in your browser to scan."
            : "Couldn't open the camera. Make sure no other app is using it.";
        if (!cancelled) setState({ status: "error", message: msg });
      }
    }

    function tick() {
      if (cancelled || detectedRef.current) return;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (
        video &&
        canvas &&
        video.readyState === video.HAVE_ENOUGH_DATA &&
        video.videoWidth > 0 &&
        video.videoHeight > 0
      ) {
        const w = video.videoWidth;
        const h = video.videoHeight;
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (ctx) {
          ctx.drawImage(video, 0, 0, w, h);
          const imageData = ctx.getImageData(0, 0, w, h);
          const result = jsQR(imageData.data, w, h, {
            inversionAttempts: "attemptBoth",
          });
          if (result && result.data) {
            const code = extractFriendCodeFromText(result.data);
            if (code) {
              detectedRef.current = true;
              onDetected(code);
              return;
            }
          }
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    }

    start();

    return () => {
      cancelled = true;
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      const stream = streamRef.current;
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }
      streamRef.current = null;
      const video = videoRef.current;
      if (video) {
        try {
          video.pause();
        } catch {
          /* ignore */
        }
        video.srcObject = null;
      }
    };
  }, [open, attempt, onDetected]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-sm"
        data-testid="friend-code-scan-dialog"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-1.5">
            <Camera className="h-4 w-4 text-primary" /> Scan a friend QR
          </DialogTitle>
          <DialogDescription>
            Point your camera at someone's HashChat QR code to find them.
          </DialogDescription>
        </DialogHeader>

        <div
          className="relative aspect-square w-full overflow-hidden rounded-2xl border border-border bg-black"
          data-testid="friend-code-scan-viewport"
        >
          <video
            ref={videoRef}
            className="absolute inset-0 h-full w-full object-cover"
            muted
            autoPlay
            playsInline
            data-testid="friend-code-scan-video"
          />
          <canvas ref={canvasRef} className="hidden" />

          {state.status === "starting" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/60 text-white">
              <Loader2 className="h-6 w-6 animate-spin" />
              <p className="text-sm">Starting camera…</p>
            </div>
          )}

          {state.status === "error" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/70 p-4 text-center text-white">
              <AlertTriangle className="h-6 w-6 text-amber-300" />
              <p
                className="text-sm leading-snug"
                data-testid="friend-code-scan-error"
              >
                {state.message}
              </p>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => setAttempt((n) => n + 1)}
                data-testid="button-friend-code-scan-retry"
              >
                <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Try again
              </Button>
            </div>
          )}

          {state.status === "scanning" && (
            <div
              className="pointer-events-none absolute inset-6 rounded-xl border-2 border-white/70 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]"
              aria-hidden="true"
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
