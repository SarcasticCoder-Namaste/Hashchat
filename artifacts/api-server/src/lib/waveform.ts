const MAX_PEAKS = 200;

export function serializeWaveform(peaks: number[] | null | undefined): string | null {
  if (!peaks || peaks.length === 0) return null;
  const clean = peaks
    .map((v) => Math.max(0, Math.min(100, Math.round(Number(v)))))
    .filter((v) => Number.isFinite(v))
    .slice(0, MAX_PEAKS);
  if (clean.length === 0) return null;
  return JSON.stringify(clean);
}
