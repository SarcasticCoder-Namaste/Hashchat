import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useReducedMotion } from "@/hooks/useReducedMotion";

export function isGifUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const u = new URL(url, window.location.href);
    if (u.pathname.toLowerCase().endsWith(".gif")) return true;
    const host = u.hostname.toLowerCase();
    if (host.endsWith("giphy.com") || host.endsWith("tenor.com")) return true;
  } catch {
    if (url.toLowerCase().split("?")[0]?.endsWith(".gif")) return true;
  }
  return false;
}

interface GifMediaProps {
  src: string;
  alt: string;
  className?: string;
  style?: CSSProperties;
  loading?: "lazy" | "eager";
  testId?: string;
  /**
   * When true, render as a plain <img> regardless of reduced-motion preference.
   * Useful when the caller has already decided animation is desired.
   */
  forceAnimated?: boolean;
}

/**
 * Renders an animated GIF, but pauses on the first frame when the user prefers
 * reduced motion. The animated source is revealed on hover/focus of the
 * nearest focusable ancestor (or the wrapper itself).
 */
export function GifMedia({
  src,
  alt,
  className,
  style,
  loading = "lazy",
  testId,
  forceAnimated,
}: GifMediaProps) {
  const reducedMotion = useReducedMotion();
  const wrapRef = useRef<HTMLSpanElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stillReady, setStillReady] = useState(false);
  const [active, setActive] = useState(false);

  const paused = reducedMotion && !forceAnimated;

  useEffect(() => {
    setStillReady(false);
    if (!paused) return;
    let cancelled = false;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.onload = () => {
      if (cancelled) return;
      const c = canvasRef.current;
      if (!c) return;
      const w = img.naturalWidth || 1;
      const h = img.naturalHeight || 1;
      c.width = w;
      c.height = h;
      const ctx = c.getContext("2d");
      if (!ctx) return;
      try {
        ctx.drawImage(img, 0, 0);
        setStillReady(true);
      } catch {
        // Tainted canvas (CORS) — fall back to showing the animated image.
      }
    };
    img.src = src;
    return () => {
      cancelled = true;
    };
  }, [src, paused]);

  useEffect(() => {
    if (!paused) return;
    const wrap = wrapRef.current;
    if (!wrap) return;
    const focusable = wrap.closest<HTMLElement>(
      'a, button, [tabindex]:not([tabindex="-1"])',
    );
    if (!focusable || focusable === wrap) return;
    const onFocus = () => setActive(true);
    const onBlur = () => setActive(false);
    focusable.addEventListener("focus", onFocus);
    focusable.addEventListener("blur", onBlur);
    return () => {
      focusable.removeEventListener("focus", onFocus);
      focusable.removeEventListener("blur", onBlur);
    };
  }, [paused]);

  if (!paused) {
    return (
      <img
        src={src}
        alt={alt}
        className={className}
        style={style}
        loading={loading}
        data-testid={testId}
      />
    );
  }

  const showStill = stillReady && !active;

  return (
    <span
      ref={wrapRef}
      className={["relative block", className].join(" ")}
      style={style}
      onPointerEnter={() => setActive(true)}
      onPointerLeave={() => setActive(false)}
      data-testid={testId}
      data-gif-paused={showStill ? "true" : "false"}
    >
      <img
        src={src}
        alt={alt}
        loading={loading}
        className={className}
        style={{
          ...style,
          display: "block",
          visibility: showStill ? "hidden" : "visible",
        }}
      />
      <canvas
        ref={canvasRef}
        aria-hidden
        className={className}
        style={{
          ...style,
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          display: stillReady ? "block" : "none",
          visibility: showStill ? "visible" : "hidden",
        }}
      />
      {showStill && (
        <span
          aria-hidden
          className="pointer-events-none absolute bottom-1 right-1 rounded bg-black/60 px-1 py-0.5 text-[10px] font-semibold uppercase leading-none text-white"
        >
          GIF
        </span>
      )}
    </span>
  );
}
