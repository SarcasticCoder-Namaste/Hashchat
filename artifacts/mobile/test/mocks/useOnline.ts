import { useEffect, useState } from "react";

let online = true;
const listeners = new Set<(v: boolean) => void>();

export function __setOnlineForTests(v: boolean): void {
  online = v;
  for (const l of listeners) l(v);
}

export function useOnline(): boolean {
  const [v, setV] = useState(online);
  useEffect(() => {
    listeners.add(setV);
    setV(online);
    return () => {
      listeners.delete(setV);
    };
  }, []);
  return v;
}

export async function checkOnlineNow(): Promise<boolean> {
  return online;
}
