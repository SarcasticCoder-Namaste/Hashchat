import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import express, { type Express } from "express";
import http from "node:http";
import type { AddressInfo } from "node:net";

type UserRow = {
  id: string;
  username: string;
  displayName: string;
  bio: string | null;
  avatarUrl: string | null;
  bannerUrl: string | null;
  pronouns: string | null;
  location: string | null;
  website: string | null;
  statusEmoji: string | null;
  statusText: string | null;
  status: string;
  featuredHashtag: string | null;
  discriminator: string | null;
  friendCode: string | null;
  role: string;
  mvpPlan: boolean;
  verified: boolean;
  tier: string;
  billingPeriod: string | null;
  animatedAvatarUrl: string | null;
  bannerGifUrl: string | null;
  premiumUntil: Date | null;
  hidePresence: boolean;
  lastSeenAt: Date;
  createdAt: Date;
};

const userStore = new Map<string, UserRow>();

function defaultUser(overrides: Partial<UserRow> = {}): UserRow {
  return {
    id: "u_test",
    username: "alice",
    displayName: "Alice",
    bio: null,
    avatarUrl: null,
    bannerUrl: null,
    pronouns: null,
    location: null,
    website: null,
    statusEmoji: null,
    statusText: null,
    status: "online",
    featuredHashtag: null,
    discriminator: "12345",
    friendCode: "ABC-DEFG",
    role: "user",
    mvpPlan: false,
    verified: false,
    tier: "free",
    billingPeriod: null,
    animatedAvatarUrl: null,
    bannerGifUrl: null,
    premiumUntil: null,
    hidePresence: false,
    lastSeenAt: new Date("2025-01-01T00:00:00Z"),
    createdAt: new Date("2024-01-01T00:00:00Z"),
    ...overrides,
  };
}


const USERS_TABLE = Symbol("users");
const USER_HASHTAGS_TABLE = Symbol("user_hashtags");
const USER_FOLLOWED_HASHTAGS_TABLE = Symbol("user_followed_hashtags");
const HASHTAGS_TABLE = Symbol("hashtags");

type Predicate = { __userId?: string } | undefined;

function makeChain(resolveResult: (predicate: Predicate) => unknown[]) {
  let predicate: Predicate;
  const chain: Record<string, unknown> = {};
  chain.where = (p: Predicate) => {
    predicate = p;
    return chain;
  };
  chain.limit = () => chain;
  chain.groupBy = () => chain;
  chain.orderBy = () => chain;
  chain.then = (
    resolve: (v: unknown) => unknown,
    reject?: (e: unknown) => unknown,
  ) => {
    try {
      return Promise.resolve(resolveResult(predicate)).then(resolve, reject);
    } catch (err) {
      return reject ? reject(err) : Promise.reject(err);
    }
  };
  return chain;
}

vi.mock("@workspace/db", () => ({
  db: {
    select: (cols?: Record<string, unknown>) => ({
      from: (table: symbol) => {
        if (table === USERS_TABLE) {
          return makeChain((predicate) => {
            const id = predicate?.__userId ?? "u_test";
            const row = userStore.get(id);
            if (!row) return [];
            if (cols && Object.keys(cols).length > 0) {
              const out: Record<string, unknown> = {};
              for (const k of Object.keys(cols)) {
                out[k] = (row as unknown as Record<string, unknown>)[k];
              }
              return [out];
            }
            return [row];
          });
        }
        return makeChain(() => []);
      },
    }),
    update: (_table: symbol) => ({
      set: (values: Partial<UserRow>) => ({
        where: async (predicate: Predicate) => {
          const id = predicate?.__userId ?? "u_test";
          const existing = userStore.get(id);
          if (existing) userStore.set(id, { ...existing, ...values });
        },
      }),
    }),
  },
  usersTable: USERS_TABLE,
  userHashtagsTable: USER_HASHTAGS_TABLE,
  userFollowedHashtagsTable: USER_FOLLOWED_HASHTAGS_TABLE,
  hashtagsTable: HASHTAGS_TABLE,
}));

vi.mock("drizzle-orm", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("drizzle-orm");
  return {
    ...actual,
    // Tag predicates with the userId we filtered on so the mock can return
    // the correct row from the store.
    eq: (_col: unknown, value: unknown) => ({ __userId: value }),
  };
});

vi.mock("../middlewares/requireAuth", () => ({
  requireAuth: (
    req: express.Request,
    _res: express.Response,
    next: express.NextFunction,
  ) => {
    (req as express.Request & { userId?: string }).userId = "u_test";
    next();
  },
  getUserId: (req: express.Request) =>
    (req as express.Request & { userId?: string }).userId ?? "u_test",
}));

vi.mock("../lib/relationships", () => ({
  isBlockedEitherWay: async () => false,
}));

vi.mock("../lib/presence", () => ({
  publicLastSeenAt: (d: Date) => d.toISOString(),
}));

vi.mock("../lib/hashtags", () => ({
  normalizeTag: (t: string) => t.toLowerCase(),
}));

const usersRouter = (await import("./users")).default;

let server: http.Server;
let baseUrl: string;

function startServer(): Promise<void> {
  const app: Express = express();
  app.use(express.json());
  app.use("/api", usersRouter);
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
  userStore.clear();
});

async function patchMe(body: unknown): Promise<{
  status: number;
  json: Record<string, unknown>;
}> {
  const res = await fetch(`${baseUrl}/api/me`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

describe("PATCH /api/users/me — Pro-only field gating", () => {
  it("ignores animatedAvatarUrl and bannerGifUrl writes when caller is on free tier", async () => {
    userStore.set("u_test", defaultUser({ tier: "free" }));
    const res = await patchMe({
      animatedAvatarUrl: "https://cdn.example.com/new.gif",
      bannerGifUrl: "https://cdn.example.com/banner.gif",
    });
    expect(res.status).toBe(200);
    const stored = userStore.get("u_test")!;
    expect(stored.animatedAvatarUrl).toBeNull();
    expect(stored.bannerGifUrl).toBeNull();
  });

  it("ignores animatedAvatarUrl and bannerGifUrl writes when caller is on premium tier", async () => {
    userStore.set(
      "u_test",
      defaultUser({
        tier: "premium",
        animatedAvatarUrl: "https://cdn.example.com/old.gif",
      }),
    );
    const res = await patchMe({
      animatedAvatarUrl: "https://cdn.example.com/new.gif",
      bannerGifUrl: "https://cdn.example.com/banner.gif",
    });
    expect(res.status).toBe(200);
    const stored = userStore.get("u_test")!;
    // Existing DB value is preserved; the write is a no-op.
    expect(stored.animatedAvatarUrl).toBe("https://cdn.example.com/old.gif");
    expect(stored.bannerGifUrl).toBeNull();
  });

  it("accepts animatedAvatarUrl and bannerGifUrl writes when caller is Pro", async () => {
    userStore.set("u_test", defaultUser({ tier: "pro" }));
    const res = await patchMe({
      animatedAvatarUrl: "https://cdn.example.com/new.gif",
      bannerGifUrl: "https://cdn.example.com/banner.gif",
    });
    expect(res.status).toBe(200);
    const stored = userStore.get("u_test")!;
    expect(stored.animatedAvatarUrl).toBe("https://cdn.example.com/new.gif");
    expect(stored.bannerGifUrl).toBe("https://cdn.example.com/banner.gif");
  });

  it("still applies non-Pro field updates while ignoring Pro-only fields on free tier", async () => {
    userStore.set("u_test", defaultUser({ tier: "free", displayName: "Old" }));
    const res = await patchMe({
      displayName: "New Name",
      animatedAvatarUrl: "https://cdn.example.com/new.gif",
    });
    expect(res.status).toBe(200);
    const stored = userStore.get("u_test")!;
    expect(stored.displayName).toBe("New Name");
    expect(stored.animatedAvatarUrl).toBeNull();
  });
});
