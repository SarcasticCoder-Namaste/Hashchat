import { useEffect, useRef } from "react";
import { recordPostImpression } from "@workspace/api-client-react";

const sentThisSession = new Set<number>();

export function usePostImpression(
  ref: React.RefObject<HTMLElement | null>,
  postId: number,
  enabled: boolean,
): void {
  const timerRef = useRef<number | null>(null);
  useEffect(() => {
    if (!enabled) return;
    if (sentThisSession.has(postId)) return;
    const node = ref.current;
    if (!node) return;
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries.some(
          (e) => e.isIntersecting && e.intersectionRatio >= 0.5,
        );
        if (visible) {
          if (timerRef.current != null) return;
          timerRef.current = window.setTimeout(() => {
            timerRef.current = null;
            if (sentThisSession.has(postId)) return;
            sentThisSession.add(postId);
            void recordPostImpression(postId, { kind: "view" }).catch(() => {
              sentThisSession.delete(postId);
            });
          }, 600);
        } else {
          if (timerRef.current != null) {
            window.clearTimeout(timerRef.current);
            timerRef.current = null;
          }
        }
      },
      { threshold: [0, 0.5, 1] },
    );
    obs.observe(node);
    return () => {
      obs.disconnect();
      if (timerRef.current != null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [ref, postId, enabled]);
}

export function recordPostClick(
  postId: number,
  kind: "profile_click" | "link_click",
): void {
  void recordPostImpression(postId, { kind }).catch(() => {});
}
