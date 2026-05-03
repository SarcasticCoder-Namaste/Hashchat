import { useEffect, useRef, useState } from "react";
import { useUpload } from "@workspace/object-storage-web";
import { Button } from "@/components/ui/button";
import { Mic, Square, Loader2, Trash2, ChevronLeft } from "lucide-react";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
const TARGET_PEAKS = 64;
const MAX_DURATION_SECONDS = 120;
const SWIPE_CANCEL_PX = 90;

function pickMimeType(): string {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ];
  for (const t of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)) {
      return t;
    }
  }
  return "";
}

function fmt(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function downsamplePeaks(peaks: number[], target: number): number[] {
  if (peaks.length <= target) return peaks.slice();
  const out: number[] = new Array(target).fill(0);
  const step = peaks.length / target;
  for (let i = 0; i < target; i += 1) {
    const start = Math.floor(i * step);
    const end = Math.max(start + 1, Math.floor((i + 1) * step));
    let max = 0;
    for (let j = start; j < end; j += 1) {
      if (peaks[j] > max) max = peaks[j];
    }
    out[i] = max;
  }
  return out;
}

export function VoiceMessageButton({
  onUploaded,
  testId = "button-record-voice",
}: {
  onUploaded: (audioUrl: string, peaks: number[] | null) => void;
  testId?: string;
}) {
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const startedAtRef = useRef<number>(0);
  const tickRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const meterRafRef = useRef<number | null>(null);
  const peaksRef = useRef<number[]>([]);
  const cancelRef = useRef(false);
  const pendingPeaksRef = useRef<number[] | null>(null);
  const swipeStartRef = useRef<number | null>(null);

  const [isRecording, setIsRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [liveBars, setLiveBars] = useState<number[]>([]);
  const [swipeDx, setSwipeDx] = useState(0);

  const { uploadFile, isUploading } = useUpload({
    basePath: `${basePath}/api/storage`,
    onSuccess: (r) => {
      const peaks = pendingPeaksRef.current;
      pendingPeaksRef.current = null;
      onUploaded(`${basePath}/api/storage${r.objectPath}`, peaks);
    },
  });

  useEffect(() => {
    return () => {
      cleanupRecording();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function cleanupRecording() {
    if (tickRef.current) {
      window.clearInterval(tickRef.current);
      tickRef.current = null;
    }
    if (meterRafRef.current) {
      window.cancelAnimationFrame(meterRafRef.current);
      meterRafRef.current = null;
    }
    try {
      sourceRef.current?.disconnect();
    } catch {
      // ignore
    }
    sourceRef.current = null;
    analyserRef.current = null;
    if (audioCtxRef.current) {
      void audioCtxRef.current.close().catch(() => undefined);
      audioCtxRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  async function startRecording() {
    setError(null);
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setError("Microphone not supported");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = pickMimeType();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      chunksRef.current = [];
      peaksRef.current = [];
      cancelRef.current = false;
      setLiveBars([]);
      setSwipeDx(0);
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        const type = recorder.mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type });
        const peaks = downsamplePeaks(peaksRef.current, TARGET_PEAKS);
        const wasCanceled = cancelRef.current;
        cleanupRecording();
        setIsRecording(false);
        setLiveBars([]);
        setSwipeDx(0);
        if (wasCanceled || blob.size === 0) return;
        const ext = type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm";
        const file = new File([blob], `voice-${Date.now()}.${ext}`, { type });
        pendingPeaksRef.current = peaks.length > 0 ? peaks : null;
        await uploadFile(file);
      };

      const Ctor =
        (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Ctor) {
        try {
          const ctx = new Ctor();
          const source = ctx.createMediaStreamSource(stream);
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 1024;
          source.connect(analyser);
          audioCtxRef.current = ctx;
          analyserRef.current = analyser;
          sourceRef.current = source;
          startMeter();
        } catch {
          // best-effort; recording still works without metering
        }
      }

      recorder.start(100);
      recorderRef.current = recorder;
      startedAtRef.current = Date.now();
      setElapsed(0);
      setIsRecording(true);
      tickRef.current = window.setInterval(() => {
        const e = Math.floor((Date.now() - startedAtRef.current) / 1000);
        setElapsed(e);
        if (e >= MAX_DURATION_SECONDS) stopRecording(false);
      }, 250);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Microphone permission denied";
      setError(msg);
      cleanupRecording();
    }
  }

  function startMeter() {
    const analyser = analyserRef.current;
    if (!analyser) return;
    const buf = new Uint8Array(analyser.fftSize);
    let lastSample = 0;
    const sampleEveryMs = 60;
    const loop = () => {
      if (!analyserRef.current) return;
      analyser.getByteTimeDomainData(buf);
      let peak = 0;
      for (let i = 0; i < buf.length; i += 1) {
        const v = Math.abs(buf[i] - 128) / 128;
        if (v > peak) peak = v;
      }
      const value = Math.min(100, Math.round(peak * 140));
      const now = performance.now();
      if (now - lastSample >= sampleEveryMs) {
        peaksRef.current.push(value);
        lastSample = now;
        setLiveBars((prev) => {
          const next = prev.length >= 48 ? prev.slice(-47) : prev.slice();
          next.push(value);
          return next;
        });
      }
      meterRafRef.current = window.requestAnimationFrame(loop);
    };
    meterRafRef.current = window.requestAnimationFrame(loop);
  }

  function stopRecording(canceled: boolean) {
    cancelRef.current = canceled;
    const rec = recorderRef.current;
    if (rec && rec.state !== "inactive") rec.stop();
    recorderRef.current = null;
  }

  function onPointerDown(e: React.PointerEvent) {
    if (!isRecording) return;
    swipeStartRef.current = e.clientX;
  }
  function onPointerMove(e: React.PointerEvent) {
    if (swipeStartRef.current === null) return;
    const dx = Math.min(0, e.clientX - swipeStartRef.current);
    setSwipeDx(dx);
    if (Math.abs(dx) >= SWIPE_CANCEL_PX) {
      swipeStartRef.current = null;
      stopRecording(true);
    }
  }
  function onPointerEnd() {
    swipeStartRef.current = null;
    setSwipeDx(0);
  }

  if (isRecording) {
    const cancelProgress = Math.min(1, Math.abs(swipeDx) / SWIPE_CANCEL_PX);
    return (
      <div
        className="flex flex-1 items-center gap-2 rounded-full bg-destructive/10 px-3 py-1.5 text-xs text-destructive"
        data-testid={`${testId}-recording`}
        style={{ transform: `translateX(${Math.max(-40, swipeDx / 2)}px)`, transition: swipeDx === 0 ? "transform 150ms" : "none" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
      >
        <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-destructive" />
        <span className="font-mono tabular-nums">{fmt(elapsed)}</span>
        <div className="flex h-6 flex-1 items-center gap-[2px] overflow-hidden" data-testid={`${testId}-live-waveform`}>
          {liveBars.length === 0 ? (
            <span className="text-destructive/70">Listening…</span>
          ) : (
            liveBars.map((v, i) => (
              <span
                key={i}
                className="block w-[3px] rounded-full bg-destructive/80"
                style={{ height: `${Math.max(10, v) * 0.22 + 4}px` }}
              />
            ))
          )}
        </div>
        <span
          className="hidden items-center gap-1 text-[10px] text-destructive/70 sm:inline-flex"
          style={{ opacity: 1 - cancelProgress * 0.6 }}
        >
          <ChevronLeft className="h-3 w-3" /> swipe to cancel
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-destructive hover:bg-destructive/20"
          onClick={() => stopRecording(true)}
          data-testid={`${testId}-cancel`}
          aria-label="Cancel recording"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-destructive hover:bg-destructive/20"
          onClick={() => stopRecording(false)}
          data-testid={`${testId}-stop`}
          aria-label="Stop recording"
        >
          <Square className="h-3.5 w-3.5" />
        </Button>
      </div>
    );
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      disabled={isUploading}
      onClick={startRecording}
      data-testid={testId}
      aria-label={error ?? "Record voice message"}
      title={error ?? "Record voice message"}
    >
      {isUploading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Mic className="h-4 w-4" />
      )}
    </Button>
  );
}
