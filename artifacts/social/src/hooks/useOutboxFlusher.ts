import { useEffect, useMemo, useRef, useState } from "react";

import {
  bumpAttempt,
  removeFromOutbox,
  subscribeOutbox,
  type QueuedMessage,
} from "@/lib/offlineQueue";
import { useOnline } from "@/hooks/useOnline";

type SendFn = (m: QueuedMessage) => Promise<unknown>;

function describeError(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  return "Send failed";
}

function useOutbox(
  filter: (m: QueuedMessage) => boolean,
  send: SendFn,
): { pending: QueuedMessage[]; online: boolean } {
  const [all, setAll] = useState<QueuedMessage[]>([]);
  const online = useOnline();
  const flushingRef = useRef(false);

  useEffect(() => {
    return subscribeOutbox(setAll);
  }, []);

  const pending = useMemo(() => all.filter(filter), [all, filter]);

  useEffect(() => {
    if (!online) return;
    if (flushingRef.current) return;
    const sendable = pending.filter((m) => m.status === "pending");
    if (sendable.length === 0) return;
    flushingRef.current = true;
    (async () => {
      for (const item of sendable) {
        try {
          await send(item);
          removeFromOutbox(item.id);
        } catch (e) {
          bumpAttempt(item.id, describeError(e));
          break;
        }
      }
      flushingRef.current = false;
    })();
  }, [online, pending, send]);

  return { pending, online };
}

export function useConversationOutbox(
  conversationId: number,
  send: SendFn,
): { pending: QueuedMessage[]; online: boolean } {
  const filter = useMemo(
    () => (m: QueuedMessage) =>
      m.target.kind === "conversation" &&
      m.target.conversationId === conversationId,
    [conversationId],
  );
  return useOutbox(filter, send);
}

export function useRoomOutbox(
  tag: string,
  send: SendFn,
): { pending: QueuedMessage[]; online: boolean } {
  const filter = useMemo(
    () => (m: QueuedMessage) => m.target.kind === "room" && m.target.tag === tag,
    [tag],
  );
  return useOutbox(filter, send);
}
