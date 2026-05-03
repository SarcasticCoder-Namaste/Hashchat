import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import express, { type Express } from "express";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { createDbMock, createStore, defineTable } from "../test-utils/dbMock";

const store = createStore();

const scheduledMessagesTable = defineTable("scheduled_messages", [
  "id",
  "senderId",
  "conversationId",
  "content",
  "replyToId",
  "imageUrl",
  "imageAlt",
  "status",
  "scheduledFor",
  "createdAt",
] as const);
const conversationMembersTable = defineTable("conversation_members", [
  "conversationId",
  "userId",
] as const);
const messagesTable = defineTable("messages", [
  "id",
  "conversationId",
  "senderId",
  "content",
  "replyToId",
  "imageUrl",
  "imageAlt",
  "createdAt",
] as const);

vi.mock("@workspace/db", () => ({
  db: createDbMock(store),
  scheduledMessagesTable,
  conversationMembersTable,
  messagesTable,
}));

vi.mock("drizzle-orm", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("drizzle-orm");
  type Col = { __col: string };
  return {
    ...actual,
    eq: (col: Col, val: unknown) => ({ __op: "eq", col: col.__col, val }),
    and: (...args: unknown[]) => ({ __op: "and", args: args.filter(Boolean) }),
    or: (...args: unknown[]) => ({ __op: "or", args: args.filter(Boolean) }),
    inArray: (col: Col, val: unknown[]) => ({
      __op: "inArray",
      col: col.__col,
      val,
    }),
    lt: (col: Col, val: unknown) => ({ __op: "lt", col: col.__col, val }),
    gt: (col: Col, val: unknown) => ({ __op: "gt", col: col.__col, val }),
    isNull: (col: Col) => ({ __op: "isNull", col: col.__col }),
    isNotNull: (col: Col) => ({ __op: "isNotNull", col: col.__col }),
    asc: (col: Col) => ({ __order: "asc", col: col.__col }),
    desc: (col: Col) => ({ __order: "desc", col: col.__col }),
    sql: new Proxy(() => ({ __sql: true }), { apply: () => ({ __sql: true }) }),
  };
});

let currentUser = "u_alice";

vi.mock("../middlewares/requireAuth", () => ({
  requireAuth: (
    req: express.Request,
    _res: express.Response,
    next: express.NextFunction,
  ) => {
    (req as express.Request & { userId?: string }).userId = currentUser;
    next();
  },
  getUserId: (req: express.Request) =>
    (req as express.Request & { userId?: string }).userId ?? currentUser,
}));

vi.mock("../lib/logger", () => ({
  logger: {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  },
}));

const mod = await import("./scheduledMessages");
const router = mod.default;
const { publishDueScheduledMessages } = mod;

let server: http.Server;
let baseUrl: string;

function startServer(): Promise<void> {
  const app: Express = express();
  app.use(express.json());
  app.use("/api", router);
  return new Promise((resolve) => {
    server = app.listen(0, "127.0.0.1", () => {
      const addr = server.address() as AddressInfo;
      baseUrl = `http://127.0.0.1:${addr.port}`;
      resolve();
    });
  });
}

await startServer();

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  store.tables.clear();
  store.nextId.clear();
  currentUser = "u_alice";
});

function seedMembership(conversationId: number, userId: string) {
  const rows = store.tables.get("conversation_members") ?? [];
  rows.push({ conversationId, userId });
  store.tables.set("conversation_members", rows);
}

async function api(
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const parsed = text ? JSON.parse(text) : null;
  return { status: res.status, body: parsed };
}

const FUTURE_ISO = () =>
  new Date(Date.now() + 60 * 60 * 1000).toISOString();

describe("POST /api/conversations/:id/scheduled-messages", () => {
  it("creates a scheduled DM for a conversation member", async () => {
    seedMembership(7, "u_alice");
    const res = await api("POST", "/api/conversations/7/scheduled-messages", {
      content: "hello later",
      scheduledFor: FUTURE_ISO(),
    });
    expect(res.status).toBe(201);
    const body = res.body as {
      id: number;
      senderId: string;
      conversationId: number;
      content: string;
      status: string;
    };
    expect(body.senderId).toBe("u_alice");
    expect(body.conversationId).toBe(7);
    expect(body.content).toBe("hello later");
    expect(body.status).toBe("scheduled");
    expect(store.tables.get("scheduled_messages")).toHaveLength(1);
  });

  it("rejects a scheduled DM when the user is not a conversation member", async () => {
    // No membership seeded.
    const res = await api("POST", "/api/conversations/7/scheduled-messages", {
      content: "hello",
      scheduledFor: FUTURE_ISO(),
    });
    expect(res.status).toBe(404);
    expect(store.tables.get("scheduled_messages") ?? []).toHaveLength(0);
  });

  it("rejects times in the past", async () => {
    seedMembership(7, "u_alice");
    const past = new Date(Date.now() - 60 * 1000).toISOString();
    const res = await api("POST", "/api/conversations/7/scheduled-messages", {
      content: "too late",
      scheduledFor: past,
    });
    expect(res.status).toBe(400);
  });

  it("rejects times more than a year out", async () => {
    seedMembership(7, "u_alice");
    const farFuture = new Date(
      Date.now() + 366 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const res = await api("POST", "/api/conversations/7/scheduled-messages", {
      content: "way too far",
      scheduledFor: farFuture,
    });
    expect(res.status).toBe(400);
  });

  it("enforces the 100-per-user cap", async () => {
    seedMembership(7, "u_alice");
    const rows = [];
    for (let i = 0; i < 100; i++) {
      rows.push({
        id: i + 1,
        senderId: "u_alice",
        conversationId: 7,
        content: `m${i}`,
        replyToId: null,
        imageUrl: null,
        imageAlt: null,
        status: "scheduled",
        scheduledFor: new Date(Date.now() + 3600_000 + i * 1000),
        createdAt: new Date(),
      });
    }
    store.tables.set("scheduled_messages", rows);

    const res = await api("POST", "/api/conversations/7/scheduled-messages", {
      content: "one more",
      scheduledFor: FUTURE_ISO(),
    });
    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toMatch(/100/);
  });

  it("does not count cancelled or sent rows toward the cap", async () => {
    seedMembership(7, "u_alice");
    const rows = [];
    for (let i = 0; i < 100; i++) {
      rows.push({
        id: i + 1,
        senderId: "u_alice",
        conversationId: 7,
        content: `m${i}`,
        replyToId: null,
        imageUrl: null,
        imageAlt: null,
        status: i % 2 === 0 ? "sent" : "cancelled",
        scheduledFor: new Date(Date.now() + 3600_000 + i * 1000),
        createdAt: new Date(),
      });
    }
    store.tables.set("scheduled_messages", rows);

    const res = await api("POST", "/api/conversations/7/scheduled-messages", {
      content: "fresh",
      scheduledFor: FUTURE_ISO(),
    });
    expect(res.status).toBe(201);
  });
});

describe("GET /api/me/scheduled-messages", () => {
  it("returns only the caller's scheduled rows in chronological order", async () => {
    const now = Date.now();
    store.tables.set("scheduled_messages", [
      {
        id: 1,
        senderId: "u_alice",
        conversationId: 7,
        content: "later",
        replyToId: null,
        imageUrl: null,
        imageAlt: null,
        status: "scheduled",
        scheduledFor: new Date(now + 3 * 3600_000),
        createdAt: new Date(),
      },
      {
        id: 2,
        senderId: "u_alice",
        conversationId: 7,
        content: "soonest",
        replyToId: null,
        imageUrl: null,
        imageAlt: null,
        status: "scheduled",
        scheduledFor: new Date(now + 3600_000),
        createdAt: new Date(),
      },
      {
        id: 3,
        senderId: "u_alice",
        conversationId: 7,
        content: "already gone",
        replyToId: null,
        imageUrl: null,
        imageAlt: null,
        status: "sent",
        scheduledFor: new Date(now - 3600_000),
        createdAt: new Date(),
      },
      {
        id: 4,
        senderId: "u_other",
        conversationId: 9,
        content: "not mine",
        replyToId: null,
        imageUrl: null,
        imageAlt: null,
        status: "scheduled",
        scheduledFor: new Date(now + 3600_000),
        createdAt: new Date(),
      },
    ]);

    const res = await api("GET", "/api/me/scheduled-messages");
    expect(res.status).toBe(200);
    const list = res.body as Array<{ id: number; content: string }>;
    expect(list.map((r) => r.id)).toEqual([2, 1]);
    expect(list.map((r) => r.content)).toEqual(["soonest", "later"]);
  });
});

describe("DELETE /api/me/scheduled-messages/:id", () => {
  it("cancels the caller's own scheduled DM", async () => {
    store.tables.set("scheduled_messages", [
      {
        id: 1,
        senderId: "u_alice",
        conversationId: 7,
        content: "later",
        replyToId: null,
        imageUrl: null,
        imageAlt: null,
        status: "scheduled",
        scheduledFor: new Date(Date.now() + 3600_000),
        createdAt: new Date(),
      },
    ]);
    const res = await api("DELETE", "/api/me/scheduled-messages/1");
    expect(res.status).toBe(204);
    expect(store.tables.get("scheduled_messages")).toHaveLength(0);
  });

  it("does not cancel another user's scheduled DM (404)", async () => {
    store.tables.set("scheduled_messages", [
      {
        id: 1,
        senderId: "u_other",
        conversationId: 7,
        content: "not mine",
        replyToId: null,
        imageUrl: null,
        imageAlt: null,
        status: "scheduled",
        scheduledFor: new Date(Date.now() + 3600_000),
        createdAt: new Date(),
      },
    ]);
    const res = await api("DELETE", "/api/me/scheduled-messages/1");
    expect(res.status).toBe(404);
    expect(store.tables.get("scheduled_messages")).toHaveLength(1);
  });
});

describe("publishDueScheduledMessages", () => {
  it("publishes due rows, leaves future rows alone, and marks failed when sender is no longer a member", async () => {
    seedMembership(7, "u_alice"); // alice is still a member of convo 7
    // Bob is NOT a member of convo 9, simulating a left/kicked sender.
    const past = new Date(Date.now() - 60_000);
    const future = new Date(Date.now() + 60 * 60_000);
    store.tables.set("scheduled_messages", [
      {
        id: 1,
        senderId: "u_alice",
        conversationId: 7,
        content: "go now",
        replyToId: null,
        imageUrl: null,
        imageAlt: null,
        status: "scheduled",
        scheduledFor: past,
        createdAt: new Date(),
      },
      {
        id: 2,
        senderId: "u_bob",
        conversationId: 9,
        content: "should fail",
        replyToId: null,
        imageUrl: null,
        imageAlt: null,
        status: "scheduled",
        scheduledFor: past,
        createdAt: new Date(),
      },
      {
        id: 3,
        senderId: "u_alice",
        conversationId: 7,
        content: "later",
        replyToId: null,
        imageUrl: null,
        imageAlt: null,
        status: "scheduled",
        scheduledFor: future,
        createdAt: new Date(),
      },
    ]);

    const published = await publishDueScheduledMessages();
    expect(published).toBe(1);

    const rows = store.tables.get("scheduled_messages") as Array<{
      id: number;
      status: string;
    }>;
    const byId = new Map(rows.map((r) => [r.id, r.status]));
    expect(byId.get(1)).toBe("sent");
    expect(byId.get(2)).toBe("failed");
    expect(byId.get(3)).toBe("scheduled");

    const messages = store.tables.get("messages") as Array<{
      conversationId: number;
      senderId: string;
      content: string;
    }>;
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      conversationId: 7,
      senderId: "u_alice",
      content: "go now",
    });
  });

  it("returns 0 when there is nothing due", async () => {
    expect(await publishDueScheduledMessages()).toBe(0);
  });
});
