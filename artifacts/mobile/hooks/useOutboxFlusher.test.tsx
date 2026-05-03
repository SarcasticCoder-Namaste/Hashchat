import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  MAX_SEND_ATTEMPTS,
  enqueueMessage,
  enqueueRoomMessage,
  getOutbox,
  getOutboxFor,
  getRoomOutboxFor,
} from "@/lib/offlineQueue";
import {
  useConversationOutbox,
  useRoomOutbox,
} from "./useOutboxFlusher";
import { __setOnlineForTests } from "../test/mocks/useOnline";

describe("useConversationOutbox", () => {
  it("does not flush while offline and flushes once back online", async () => {
    __setOnlineForTests(false);
    await enqueueMessage(1, { content: "hi" });

    const send = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useConversationOutbox(1, send));

    await waitFor(() => {
      expect(result.current.pending).toHaveLength(1);
    });
    expect(send).not.toHaveBeenCalled();

    await act(async () => {
      __setOnlineForTests(true);
    });

    await waitFor(() => {
      expect(send).toHaveBeenCalledTimes(1);
    });
    await waitFor(async () => {
      expect(await getOutboxFor(1)).toHaveLength(0);
    });
  });

  it("bumps attempts on each failure and marks failed at MAX_SEND_ATTEMPTS", async () => {
    await enqueueMessage(2, { content: "boom" });
    const send = vi.fn().mockRejectedValue(new Error("network"));

    renderHook(() => useConversationOutbox(2, send));

    await waitFor(
      async () => {
        const all = await getOutboxFor(2);
        expect(all[0]?.status).toBe("failed");
      },
      { timeout: 3000 },
    );

    const final = (await getOutboxFor(2))[0];
    expect(final.attempts).toBe(MAX_SEND_ATTEMPTS);
    expect(final.lastError).toBe("network");
    expect(send).toHaveBeenCalledTimes(MAX_SEND_ATTEMPTS);
  });

  it("does not re-send messages already marked failed", async () => {
    await enqueueMessage(3, { content: "x" });

    // Drive to failed via the hook with a rejecting send.
    const failing = vi.fn().mockRejectedValue(new Error("offline"));
    const { unmount } = renderHook(() => useConversationOutbox(3, failing));
    await waitFor(async () => {
      const all = await getOutboxFor(3);
      expect(all[0]?.status).toBe("failed");
    });
    unmount();

    // Mount a fresh hook with a succeeding send; the failed message must
    // be skipped since it is no longer "pending".
    const success = vi.fn().mockResolvedValue(undefined);
    renderHook(() => useConversationOutbox(3, success));
    await new Promise((r) => setTimeout(r, 50));
    expect(success).not.toHaveBeenCalled();
    const after = await getOutboxFor(3);
    expect(after[0].status).toBe("failed");
  });

  it("removes the message from the outbox after a successful send", async () => {
    await enqueueMessage(4, { content: "ok" });
    const send = vi.fn().mockResolvedValue(undefined);
    renderHook(() => useConversationOutbox(4, send));
    await waitFor(async () => {
      expect(await getOutboxFor(4)).toHaveLength(0);
    });
    expect(send).toHaveBeenCalledTimes(1);
  });
});

describe("useRoomOutbox", () => {
  it("flushes only the matching room outbox once online", async () => {
    __setOnlineForTests(false);
    await enqueueRoomMessage("#a", { content: "in-a" });
    await enqueueRoomMessage("#b", { content: "in-b" });

    const sendA = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useRoomOutbox("#a", sendA));

    await waitFor(() => {
      expect(result.current.pending).toHaveLength(1);
      expect(result.current.pending[0].data.content).toBe("in-a");
    });

    await act(async () => {
      __setOnlineForTests(true);
    });

    await waitFor(() => {
      expect(sendA).toHaveBeenCalledTimes(1);
    });
    await waitFor(async () => {
      expect(await getRoomOutboxFor("#a")).toHaveLength(0);
    });
    expect(await getRoomOutboxFor("#b")).toHaveLength(1);
    expect(await getOutbox()).toHaveLength(1);
  });

  it("marks a room message failed after MAX_SEND_ATTEMPTS retries", async () => {
    await enqueueRoomMessage("#dev", { content: "stuck" });
    const send = vi.fn().mockRejectedValue(new Error("rejected"));
    renderHook(() => useRoomOutbox("#dev", send));

    await waitFor(
      async () => {
        const all = await getRoomOutboxFor("#dev");
        expect(all[0]?.status).toBe("failed");
      },
      { timeout: 3000 },
    );

    const after = (await getRoomOutboxFor("#dev"))[0];
    expect(after.attempts).toBe(MAX_SEND_ATTEMPTS);
    expect(send).toHaveBeenCalledTimes(MAX_SEND_ATTEMPTS);
  });
});
