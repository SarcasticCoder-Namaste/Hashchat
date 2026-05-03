import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import express, { type Express } from "express";
import http from "node:http";
import type { AddressInfo } from "node:net";
import {
  createDbMock,
  createStore,
  defineTable,
} from "../test-utils/dbMock";

const store = createStore();

const callsTable = defineTable("calls", [
  "id",
  "initiatorId",
  "kind",
  "status",
  "conversationId",
  "roomTag",
  "startedAt",
  "endedAt",
] as const);
const callParticipantsTable = defineTable("call_participants", [
  "callId",
  "userId",
  "state",
  "role",
  "handRaisedAt",
  "joinedAt",
  "leftAt",
] as const);
const callSignalsTable = defineTable("call_signals", [
  "id",
  "callId",
  "fromUserId",
  "toUserId",
  "kind",
  "payload",
  "createdAt",
] as const);
const conversationsTable = defineTable("conversations", ["id", "kind"] as const);
const conversationMembersTable = defineTable("conversation_members", [
  "conversationId",
  "userId",
] as const);
const userHashtagsTable = defineTable("user_hashtags", ["userId", "tag"] as const);
const userFollowedHashtagsTable = defineTable("user_followed_hashtags", [
  "userId",
  "tag",
] as const);
const usersTable = defineTable("users", [
  "id",
  "username",
  "displayName",
  "avatarUrl",
] as const);
const roomMembersTable = defineTable("room_members", ["tag", "userId"] as const);

vi.mock("@workspace/db", () => ({
  db: createDbMock(store),
  callsTable,
  callParticipantsTable,
  callSignalsTable,
  conversationsTable,
  conversationMembersTable,
  userHashtagsTable,
  userFollowedHashtagsTable,
  usersTable,
  roomMembersTable,
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

let currentUser = "host_user";

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

vi.mock("../lib/relationships", () => ({
  isBlockedEitherWay: async () => false,
}));

vi.mock("../lib/hashtags", () => ({
  normalizeTag: (t: string) => t.toLowerCase(),
}));

vi.mock("../lib/roomVisibility", () => ({
  getRoomAccess: async () => ({ isPrivate: false, isMember: true, ownerId: null }),
}));

const callsRouter = (await import("./calls")).default;

let server: http.Server;
let baseUrl: string;

function startServer(): Promise<void> {
  const app: Express = express();
  app.use(express.json());
  app.use("/api", callsRouter);
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
  currentUser = "host_user";
});

function seedVoiceRoomCall(opts?: {
  callId?: number;
  hostId?: string;
  listenerIds?: string[];
  speakerIds?: string[];
}): number {
  const callId = opts?.callId ?? 1;
  const hostId = opts?.hostId ?? "host_user";
  const listeners = opts?.listenerIds ?? ["listener_a"];
  const speakers = opts?.speakerIds ?? [];
  store.tables.set("calls", [
    {
      id: callId,
      initiatorId: hostId,
      kind: "voice",
      status: "active",
      conversationId: null,
      roomTag: "general",
      startedAt: new Date(),
      endedAt: null,
    },
  ]);
  const parts = [
    {
      callId,
      userId: hostId,
      state: "joined",
      role: "host",
      handRaisedAt: null,
      joinedAt: new Date(),
      leftAt: null,
    },
    ...listeners.map((u) => ({
      callId,
      userId: u,
      state: "joined",
      role: "listener",
      handRaisedAt: null,
      joinedAt: new Date(),
      leftAt: null,
    })),
    ...speakers.map((u) => ({
      callId,
      userId: u,
      state: "joined",
      role: "speaker",
      handRaisedAt: null,
      joinedAt: new Date(),
      leftAt: null,
    })),
  ];
  store.tables.set("call_participants", parts);
  const userIds = [hostId, ...listeners, ...speakers];
  store.tables.set(
    "users",
    userIds.map((id) => ({
      id,
      username: id,
      displayName: id,
      avatarUrl: null,
    })),
  );
  return callId;
}

async function post(path: string): Promise<{
  status: number;
  body: Record<string, unknown> | null;
}> {
  const res = await fetch(`${baseUrl}${path}`, { method: "POST" });
  const text = await res.text();
  const body = text ? (JSON.parse(text) as Record<string, unknown>) : null;
  return { status: res.status, body };
}

describe("voice room hand-raise / lower-hand", () => {
  it("a listener can raise and lower their own hand", async () => {
    seedVoiceRoomCall();
    currentUser = "listener_a";

    const raised = await post("/api/calls/1/raise-hand");
    expect(raised.status).toBe(200);
    const participants = (raised.body as { participants: Array<{
      userId: string;
      handRaisedAt: string | null;
    }> }).participants;
    const me = participants.find((p) => p.userId === "listener_a")!;
    expect(me.handRaisedAt).not.toBeNull();

    const lowered = await post("/api/calls/1/lower-hand");
    expect(lowered.status).toBe(200);
    const after = (lowered.body as { participants: Array<{
      userId: string;
      handRaisedAt: string | null;
    }> }).participants.find((p) => p.userId === "listener_a")!;
    expect(after.handRaisedAt).toBeNull();
  });

  it("returns 404 for raise-hand from a stranger to a private room", async () => {
    seedVoiceRoomCall();
    // Re-mock roomVisibility to mark this room as private with no membership
    // for the calling stranger.
    const mod = await import("../lib/roomVisibility");
    const spy = vi
      .spyOn(mod, "getRoomAccess")
      .mockResolvedValue({
        isPrivate: true,
        isMember: false,
        ownerId: null,
      } as Awaited<ReturnType<typeof mod.getRoomAccess>>);

    currentUser = "stranger";
    const res = await post("/api/calls/1/raise-hand");
    expect(res.status).toBe(404);
    spy.mockRestore();
  });

  it("returns 400 for an invalid call id", async () => {
    seedVoiceRoomCall();
    const res = await post("/api/calls/not-a-number/raise-hand");
    expect(res.status).toBe(400);
  });
});

describe("voice room promote / demote (host-only)", () => {
  it("host can promote a listener with a raised hand to speaker and clears the hand", async () => {
    const callId = seedVoiceRoomCall({ listenerIds: ["listener_a"] });
    // Listener raises hand first.
    currentUser = "listener_a";
    await post(`/api/calls/${callId}/raise-hand`);

    currentUser = "host_user";
    const res = await post(`/api/calls/${callId}/promote/listener_a`);
    expect(res.status).toBe(200);
    const promoted = (res.body as { participants: Array<{
      userId: string;
      role: string;
      handRaisedAt: string | null;
    }> }).participants.find((p) => p.userId === "listener_a")!;
    expect(promoted.role).toBe("speaker");
    expect(promoted.handRaisedAt).toBeNull();
  });

  it("host can demote a speaker back to listener", async () => {
    const callId = seedVoiceRoomCall({ speakerIds: ["speaker_a"] });
    currentUser = "host_user";
    const res = await post(`/api/calls/${callId}/demote/speaker_a`);
    expect(res.status).toBe(200);
    const target = (res.body as { participants: Array<{
      userId: string;
      role: string;
    }> }).participants.find((p) => p.userId === "speaker_a")!;
    expect(target.role).toBe("listener");
  });

  it("non-host cannot promote (403)", async () => {
    const callId = seedVoiceRoomCall({ listenerIds: ["listener_a", "listener_b"] });
    currentUser = "listener_a";
    const res = await post(`/api/calls/${callId}/promote/listener_b`);
    expect(res.status).toBe(403);
    // Role unchanged.
    const parts = store.tables.get("call_participants")!;
    const target = parts.find(
      (p) => (p as { userId: string }).userId === "listener_b",
    ) as { role: string };
    expect(target.role).toBe("listener");
  });

  it("non-host cannot demote (403)", async () => {
    const callId = seedVoiceRoomCall({ speakerIds: ["speaker_a"] });
    currentUser = "speaker_a";
    const res = await post(`/api/calls/${callId}/demote/speaker_a`);
    expect(res.status).toBe(403);
    const parts = store.tables.get("call_participants")!;
    const target = parts.find(
      (p) => (p as { userId: string }).userId === "speaker_a",
    ) as { role: string };
    expect(target.role).toBe("speaker");
  });

  it("host cannot demote the host (400)", async () => {
    const callId = seedVoiceRoomCall();
    currentUser = "host_user";
    const res = await post(`/api/calls/${callId}/demote/host_user`);
    expect(res.status).toBe(400);
    const parts = store.tables.get("call_participants")!;
    const target = parts.find(
      (p) => (p as { userId: string }).userId === "host_user",
    ) as { role: string };
    expect(target.role).toBe("host");
  });
});
