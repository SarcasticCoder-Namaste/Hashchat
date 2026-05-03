import { useEffect, useRef, useState } from "react";

import {
  bumpAttempt,
  getOutboxFor,
  removeFromOutbox,
  subscribeOutbox,
  type QueuedMessage,
} from "@/lib/offlineQueue";
import { useOnline } from "@/hooks/useOnline";

type SendFn = (m: QueuedMessage) => Promise<unknown>;

export function useConversationOutbox(
  conversationId: number,
  send: SendFn,
): {
  pending: QueuedMessage[];
  online: boolean;
} {
  const [pending, setPending] = useState<QueuedMessage[]>([]);
  const online = useOnline();
  const flushingRef = useRef(false);

  useEffect(() => {
    let active = true;
    const unsub = subscribeOutbox((all) => {
      if (!active) return;
      setPending(all.filter((m) => m.conversationId === conversationId));
    });
    void getOutboxFor(conversationId).then((items) => {
      if (active) setPending(items);
    });
    return () => {
      active = false;
      unsub();
    };
  }, [conversationId]);

  useEffect(() => {
    if (!online) return;
    if (flushingRef.current) return;
    if (pending.length === 0) return;
    flushingRef.current = true;
    (async () => {
      for (const item of pending) {
        try {
          await send(item);
          await removeFromOutbox(item.id);
        } catch {
          await bumpAttempt(item.id);
          break;
        }
      }
      flushingRef.current = false;
    })();
  }, [online, pending, send]);

  return { pending, online };
}
