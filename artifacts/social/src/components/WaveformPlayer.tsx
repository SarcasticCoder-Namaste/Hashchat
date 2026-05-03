import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";

const BAR_COUNT = 40;

function fmt(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function resamplePeaks(peaks: number[], target: number): number[] {
  if (peaks.length === 0) return new Array(target).fill(8);
  if (peaks.length === target) return peaks;
  const out: number[] = new Array(target);
  for (let i = 0; i < target; i += 1) {
    const start = Math.floor((i * peaks.length) / target);
    const end = Math.max(start + 1, Math.floor(((i + 1) * peaks.length) / target));
    let max = 0;
    for (let j = start; j < end; j += 1) {
      const v = peaks[j] ?? 0;
      if (v > max) max = v;
    }
    out[i] = max;
  }
  return out;
}

async function decodePeaksFromUrl(url: string, target = BAR_COUNT): Promise<number[] | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    const Ctor =
      (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    const ctx = new Ctor();
    try {
      const audio = await ctx.decodeAudioData(buf.slice(0));
      const ch = audio.getChannelData(0);
      const block = Math.max(1, Math.floor(ch.length / target));
      const peaks: number[] = [];
      for (let i = 0; i < target; i += 1) {
        let max = 0;
        const start = i * block;
        const end = Math.min(ch.length, start + block);
        for (let j = start; j < end; j += 1) {
          const v = Math.abs(ch[j]);
          if (v > max) max = v;
        }
        peaks.push(Math.min(100, Math.round(max * 100)));
      }
      return peaks;
    } finally {
      void ctx.close().catch(() => undefined);
    }
  } catch {
    return null;
  }
}

interface Props {
  src: string;
  peaks: number[] | null | undefined;
  isMine?: boolean;
  testId?: string;
  conversationKey?: string | number | null;
}

const SPEED_OPTIONS = [1, 1.5, 2] as const;
type Speed = (typeof SPEED_OPTIONS)[number];

function speedStorageKey(conversationKey: string | number | null | undefined): string | null {
  if (conversationKey === null || conversationKey === undefined || conversationKey === "") {
    return null;
  }
  return `hashchat:voice-speed:${String(conversationKey)}`;
}

function readStoredSpeed(conversationKey: string | number | null | undefined): Speed {
  const key = speedStorageKey(conversationKey);
  if (!key || typeof window === "undefined") return 1;
  try {
    const raw = window.localStorage.getItem(key);
    const parsed = raw ? Number(raw) : NaN;
    if (SPEED_OPTIONS.includes(parsed as Speed)) return parsed as Speed;
  } catch {
    // ignore storage errors
  }
  return 1;
}

function formatSpeed(s: Speed): string {
  return Number.isInteger(s) ? `${s}x` : `${s}x`;
}

export function WaveformPlayer({ src, peaks, isMine, testId, conversationKey }: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [duration, setDuration] = useState(0);
  const [current, setCurrent] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [livePeaks, setLivePeaks] = useState<number[] | null>(
    peaks && peaks.length > 0 ? peaks : null,
  );
  const [decoding, setDecoding] = useState(false);
  const [speed, setSpeed] = useState<Speed>(() => readStoredSpeed(conversationKey));

  useEffect(() => {
    setLivePeaks(peaks && peaks.length > 0 ? peaks : null);
  }, [peaks]);

  useEffect(() => {
    setSpeed(readStoredSpeed(conversationKey));
  }, [conversationKey]);

  useEffect(() => {
    const a = audioRef.current;
    if (a) a.playbackRate = speed;
    const key = speedStorageKey(conversationKey);
    if (key && typeof window !== "undefined") {
      try {
        window.localStorage.setItem(key, String(speed));
      } catch {
        // ignore storage errors
      }
    }
  }, [speed, conversationKey, src]);

  function cycleSpeed() {
    setSpeed((prev) => {
      const idx = SPEED_OPTIONS.indexOf(prev);
      const next = SPEED_OPTIONS[(idx + 1) % SPEED_OPTIONS.length];
      return next;
    });
  }

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onTime = () => setCurrent(a.currentTime);
    const onLoaded = () => {
      if (Number.isFinite(a.duration)) setDuration(a.duration);
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnded = () => {
      setPlaying(false);
      setCurrent(0);
    };
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("loadedmetadata", onLoaded);
    a.addEventListener("durationchange", onLoaded);
    a.addEventListener("play", onPlay);
    a.addEventListener("pause", onPause);
    a.addEventListener("ended", onEnded);
    return () => {
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("loadedmetadata", onLoaded);
      a.removeEventListener("durationchange", onLoaded);
      a.removeEventListener("play", onPlay);
      a.removeEventListener("pause", onPause);
      a.removeEventListener("ended", onEnded);
    };
  }, [src]);

  async function togglePlay() {
    const a = audioRef.current;
    if (!a) return;
    if (playing) {
      a.pause();
      return;
    }
    if (!livePeaks && !decoding) {
      setDecoding(true);
      void decodePeaksFromUrl(src).then((p) => {
        if (p) setLivePeaks(p);
        setDecoding(false);
      });
    }
    try {
      await a.play();
    } catch {
      // ignore play() interruptions
    }
  }

  function seekTo(clientX: number) {
    const el = containerRef.current;
    const a = audioRef.current;
    if (!el || !a || !duration) return;
    const rect = el.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    a.currentTime = ratio * duration;
    setCurrent(a.currentTime);
  }

  const draw = resamplePeaks(livePeaks ?? [], BAR_COUNT);
  const playedRatio = duration > 0 ? Math.min(1, current / duration) : 0;
  const playedBars = Math.round(playedRatio * BAR_COUNT);
  const displayDuration = duration || 0;

  const playedColor = isMine ? "bg-primary-foreground" : "bg-primary";
  const restColor = isMine ? "bg-primary-foreground/30" : "bg-primary/30";

  return (
    <div
      className="flex w-64 max-w-full items-center gap-2 px-2 py-2"
      data-testid={testId}
    >
      <audio ref={audioRef} src={src} preload="metadata" className="hidden" />
      <button
        type="button"
        onClick={togglePlay}
        className={[
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
          isMine
            ? "bg-primary-foreground/20 text-primary-foreground hover:bg-primary-foreground/30"
            : "bg-primary/15 text-primary hover:bg-primary/25",
        ].join(" ")}
        aria-label={playing ? "Pause voice message" : "Play voice message"}
        data-testid={testId ? `${testId}-toggle` : "waveform-toggle"}
      >
        {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 translate-x-[1px]" />}
      </button>
      <div
        ref={containerRef}
        role="slider"
        aria-label="Seek voice message"
        aria-valuemin={0}
        aria-valuemax={Math.max(1, Math.round(displayDuration))}
        aria-valuenow={Math.round(current)}
        tabIndex={0}
        className="flex h-8 flex-1 cursor-pointer items-center gap-[2px] select-none"
        onPointerDown={(e) => {
          (e.target as Element).setPointerCapture?.(e.pointerId);
          seekTo(e.clientX);
        }}
        onPointerMove={(e) => {
          if (e.buttons !== 1) return;
          seekTo(e.clientX);
        }}
        data-testid={testId ? `${testId}-scrub` : "waveform-scrub"}
      >
        {draw.map((p, i) => {
          const h = Math.max(10, Math.min(100, p)) * 0.28 + 4;
          return (
            <span
              key={i}
              className={[
                "block w-[3px] flex-1 rounded-full transition-colors",
                i < playedBars ? playedColor : restColor,
              ].join(" ")}
              style={{ height: `${h}px` }}
            />
          );
        })}
      </div>
      <span
        className={[
          "shrink-0 font-mono tabular-nums text-[10px]",
          isMine ? "text-primary-foreground/80" : "text-muted-foreground",
        ].join(" ")}
      >
        {fmt(playing || current > 0 ? current : displayDuration)}
        {displayDuration > 0 && (current > 0 || playing) ? ` / ${fmt(displayDuration)}` : ""}
      </span>
      <button
        type="button"
        onClick={cycleSpeed}
        className={[
          "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums transition-colors",
          isMine
            ? "bg-primary-foreground/20 text-primary-foreground hover:bg-primary-foreground/30"
            : "bg-primary/15 text-primary hover:bg-primary/25",
        ].join(" ")}
        aria-label={`Playback speed ${formatSpeed(speed)}, click to change`}
        data-testid={testId ? `${testId}-speed` : "waveform-speed"}
      >
        {formatSpeed(speed)}
      </button>
    </div>
  );
}
