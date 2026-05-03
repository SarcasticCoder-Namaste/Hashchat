import { afterEach, describe, expect, it, vi } from "vitest";

import {
  MAX_SEND_ATTEMPTS,
  bumpAttempt,
  enqueueMessage,
  enqueueRoomMessage,
  getOutbox,
  getOutboxFor,
  getRoomOutboxFor,
  removeFromOutbox,
  retryMessage,
  subscribeOutbox,
  updateMessageContent,
  type QueuedMessage,
} from "./offlineQueue";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("offlineQueue - conversation outbox", () => {
  it("enqueues a message while offline and persists it as pending", async () => {
    const item = await enqueueMessage(42, { content: "hello" });

    expect(item.status).toBe("pending");
    expect(item.attempts).toBe(0);
    expect(item.target).toEqual({ kind: "conversation", conversationId: 42 });

    const forConv = await getOutboxFor(42);
    expect(forConv).toHaveLength(1);
    expect(forConv[0].data.content).toBe("hello");

    const otherConv = await getOutboxFor(43);
    expect(otherConv).toHaveLength(0);
  });

  it("bumps attempts on each retry and marks failed at MAX_SEND_ATTEMPTS", async () => {
    const item = await enqueueMessage(1, { content: "hi" });

    for (let i = 0; i < MAX_SEND_ATTEMPTS; i++) {
      await bumpAttempt(item.id, "network down");
    }

    const all = await getOutboxFor(1);
    expect(all).toHaveLength(1);
    expect(all[0].attempts).toBe(MAX_SEND_ATTEMPTS);
    expect(all[0].status).toBe("failed");
    expect(all[0].lastError).toBe("network down");
  });

  it("retryMessage resets attempts and clears the failed state", async () => {
    const item = await enqueueMessage(1, { content: "hi" });
    for (let i = 0; i < MAX_SEND_ATTEMPTS; i++) {
      await bumpAttempt(item.id, "boom");
    }

    let snap = (await getOutboxFor(1))[0];
    expect(snap.status).toBe("failed");

    await retryMessage(item.id);

    snap = (await getOutboxFor(1))[0];
    expect(snap.status).toBe("pending");
    expect(snap.attempts).toBe(0);
    expect(snap.lastError).toBeUndefined();
  });

  it("updateMessageContent edits the body and re-queues the message", async () => {
    const item = await enqueueMessage(1, { content: "typo" });
    for (let i = 0; i < MAX_SEND_ATTEMPTS; i++) {
      await bumpAttempt(item.id, "boom");
    }

    await updateMessageContent(item.id, { content: "fixed" });

    const snap = (await getOutboxFor(1))[0];
    expect(snap.data.content).toBe("fixed");
    expect(snap.status).toBe("pending");
    expect(snap.attempts).toBe(0);
    expect(snap.lastError).toBeUndefined();
  });

  it("removeFromOutbox deletes the failed message", async () => {
    const a = await enqueueMessage(1, { content: "a" });
    const b = await enqueueMessage(1, { content: "b" });

    await removeFromOutbox(a.id);

    const remaining = await getOutboxFor(1);
    expect(remaining.map((m) => m.id)).toEqual([b.id]);
  });

  it("notifies subscribers when the outbox changes", async () => {
    const calls: QueuedMessage[][] = [];
    const unsub = subscribeOutbox((q) => calls.push(q));

    await new Promise((r) => setTimeout(r, 0));
    await enqueueMessage(7, { content: "hello" });

    unsub();
    expect(calls.length).toBeGreaterThanOrEqual(2);
    const last = calls[calls.length - 1];
    expect(last).toHaveLength(1);
    expect(last[0].data.content).toBe("hello");
  });
});

describe("offlineQueue - room outbox", () => {
  it("enqueues, retries-to-failed, retries, edits, and deletes for room messages", async () => {
    const item = await enqueueRoomMessage("#general", { content: "ping" });
    expect(item.target).toEqual({ kind: "room", tag: "#general" });

    let inRoom = await getRoomOutboxFor("#general");
    expect(inRoom).toHaveLength(1);
    expect(await getRoomOutboxFor("#other")).toHaveLength(0);

    for (let i = 0; i < MAX_SEND_ATTEMPTS; i++) {
      await bumpAttempt(item.id, "no signal");
    }
    inRoom = await getRoomOutboxFor("#general");
    expect(inRoom[0].status).toBe("failed");
    expect(inRoom[0].attempts).toBe(MAX_SEND_ATTEMPTS);

    await retryMessage(item.id);
    inRoom = await getRoomOutboxFor("#general");
    expect(inRoom[0].status).toBe("pending");
    expect(inRoom[0].attempts).toBe(0);

    await updateMessageContent(item.id, { content: "ping!" });
    inRoom = await getRoomOutboxFor("#general");
    expect(inRoom[0].data.content).toBe("ping!");
    expect(inRoom[0].status).toBe("pending");

    await removeFromOutbox(item.id);
    expect(await getRoomOutboxFor("#general")).toHaveLength(0);
  });

  it("keeps conversation and room outboxes isolated", async () => {
    await enqueueMessage(99, { content: "convo" });
    await enqueueRoomMessage("#room", { content: "room" });

    expect(await getOutboxFor(99)).toHaveLength(1);
    expect(await getRoomOutboxFor("#room")).toHaveLength(1);
    expect(await getOutbox()).toHaveLength(2);
  });
});
