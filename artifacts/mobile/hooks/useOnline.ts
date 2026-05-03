import { useEffect, useState } from "react";

const PING_INTERVAL_MS = 15000;

function pingUrl(): string {
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  const base = domain ? `https://${domain}` : "";
  return `${base}/api/healthz`;
}

async function check(): Promise<boolean> {
  try {
    const res = await fetch(pingUrl(), { method: "GET" });
    return res.ok;
  } catch {
    return false;
  }
}

let cachedOnline = true;
const listeners = new Set<(v: boolean) => void>();
let timer: ReturnType<typeof setInterval> | null = null;

function ensurePolling(): void {
  if (timer) return;
  void check().then((v) => {
    cachedOnline = v;
    listeners.forEach((l) => l(v));
  });
  timer = setInterval(async () => {
    const v = await check();
    if (v !== cachedOnline) {
      cachedOnline = v;
      listeners.forEach((l) => l(v));
    }
  }, PING_INTERVAL_MS);
}

function maybeStop(): void {
  if (listeners.size === 0 && timer) {
    clearInterval(timer);
    timer = null;
  }
}

export function useOnline(): boolean {
  const [online, setOnline] = useState<boolean>(cachedOnline);
  useEffect(() => {
    listeners.add(setOnline);
    ensurePolling();
    return () => {
      listeners.delete(setOnline);
      maybeStop();
    };
  }, []);
  return online;
}

export async function checkOnlineNow(): Promise<boolean> {
  const v = await check();
  cachedOnline = v;
  listeners.forEach((l) => l(v));
  return v;
}
