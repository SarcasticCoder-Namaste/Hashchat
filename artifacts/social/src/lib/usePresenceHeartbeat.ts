import { useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { usePingPresence } from "@workspace/api-client-react";

const HEARTBEAT_MS = 30_000;
const ROOM_PATH_RE = /^\/app\/rooms\/([^/?#]+)/;

function roomTagFromPath(path: string): string | null {
  const m = path.match(ROOM_PATH_RE);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return m[1];
  }
}

export function usePresenceHeartbeat(enabled: boolean) {
  const [location] = useLocation();
  const ping = usePingPresence();
  const lastSentRef = useRef<number>(0);
  const roomTagRef = useRef<string | null>(null);
  const pingRef = useRef(ping);
  pingRef.current = ping;

  const roomTag = roomTagFromPath(location);
  roomTagRef.current = roomTag;

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    function send() {
      if (cancelled) return;
      if (typeof document !== "undefined" && document.visibilityState !== "visible") {
        return;
      }
      lastSentRef.current = Date.now();
      pingRef.current.mutate({ data: { roomTag: roomTagRef.current } });
    }
    send();
    const interval = window.setInterval(send, HEARTBEAT_MS);
    function onVisibility() {
      if (document.visibilityState === "visible") {
        if (Date.now() - lastSentRef.current > HEARTBEAT_MS / 2) send();
      }
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
    lastSentRef.current = Date.now();
    pingRef.current.mutate({ data: { roomTag } });
  }, [enabled, roomTag]);
}
