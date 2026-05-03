import { useEffect, useRef, useState } from "react";

import {
  bumpAttempt,
  getOutboxFor,
  getRoomOutboxFor,
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
      setPending(
        all.filter(
          (m) =>
            m.target.kind === "conversation" &&
            m.target.conversationId === conversationId,
        ),
      );
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
    const sendable = pending.filter((m) => m.status === "pending");
    if (sendable.length === 0) return;
    flushingRef.current = true;
    (async () => {
      for (const item of sendable) {
        try {
          await send(item);
          await removeFromOutbox(item.id);
        } catch (e) {
          await bumpAttempt(item.id, describeError(e));
          break;
        }
      }
      flushingRef.current = false;
    })();
  }, [online, pending, send]);

  return { pending, online };
}

export function useRoomOutbox(
  tag: string,
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
      setPending(
        all.filter((m) => m.target.kind === "room" && m.target.tag === tag),
      );
    });
    void getRoomOutboxFor(tag).then((items) => {
      if (active) setPending(items);
    });
    return () => {
      active = false;
      unsub();
    };
  }, [tag]);

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
          await removeFromOutbox(item.id);
        } catch (e) {
          await bumpAttempt(item.id, describeError(e));
          break;
        }
      }
      flushingRef.current = false;
    })();
  }, [online, pending, send]);

  return { pending, online };
}
