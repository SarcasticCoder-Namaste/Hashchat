import { Router, type IRouter } from "express";
import {
  db,
  friendshipsTable,
  usersTable,
  userHashtagsTable,
} from "@workspace/db";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import {
  requireAuth,
  getUserId,
  normalizeFriendCode,
  withFriendCodeRetry,
} from "../middlewares/requireAuth";
import { isBlockedEitherWay } from "../lib/relationships";

const router: IRouter = Router();

function pair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

async function loadMatchUsers(myId: string, otherIds: string[]) {
  if (otherIds.length === 0) return [];
  const others = await db
    .select()
    .from(usersTable)
    .where(inArray(usersTable.id, otherIds));
  const tagsRows = await db
    .select()
    .from(userHashtagsTable)
    .where(inArray(userHashtagsTable.userId, otherIds));
  const myTagsRows = await db
    .select({ tag: userHashtagsTable.tag })
    .from(userHashtagsTable)
    .where(eq(userHashtagsTable.userId, myId));
  const myTagSet = new Set(myTagsRows.map((r) => r.tag));
  const otherTags = new Map<string, string[]>();
  for (const r of tagsRows) {
    if (!otherTags.has(r.userId)) otherTags.set(r.userId, []);
    otherTags.get(r.userId)!.push(r.tag);
  }
  return others.map((o) => {
    const tags = otherTags.get(o.id) ?? [];
    const shared = tags.filter((t) => myTagSet.has(t));
    return {
      id: o.id,
      username: o.username,
      displayName: o.displayName,
      bio: o.bio,
      avatarUrl: o.avatarUrl,
      status: o.status,
      featuredHashtag: o.featuredHashtag,
      discriminator: o.discriminator,
      role: o.role,
      mvpPlan: o.mvpPlan,
      lastSeenAt: o.lastSeenAt.toISOString(),
      hashtags: tags,
      sharedHashtags: shared,
      matchScore: shared.length,
    };
  });
}

router.get("/users/lookup", requireAuth, async (req, res): Promise<void> => {
  const me = getUserId(req);
  const raw = req.query.code;
  const code = (Array.isArray(raw) ? raw[0] : raw)?.toString().trim() ?? "";
  if (!code) {
    res.status(400).json({ error: "Missing code" });
    return;
  }
  const cleaned = code.replace(/^@/, "");
  const [usernamePart, discPart] = cleaned.split("#");
  const username = usernamePart?.trim().toLowerCase();
  const disc = discPart?.trim();
  if (!username) {
    res.status(400).json({ error: "Invalid code" });
    return;
  }
  const where = disc
    ? and(eq(usersTable.username, username), eq(usersTable.discriminator, disc))
    : eq(usersTable.username, username);
  const [match] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(where)
    .limit(1);
  if (!match) {
    res.status(404).json({ error: "No user found with that code" });
    return;
  }
  if (match.id === me) {
    res.status(400).json({ error: "That's you!" });
    return;
  }
  const [user] = await loadMatchUsers(me, [match.id]);
  const statusMap = await loadFriendStatuses(me, [match.id]);
  res.json({ ...user, friendStatus: statusMap.get(match.id) ?? null });
});

router.get("/me/friend-code", requireAuth, async (req, res): Promise<void> => {
  const me = getUserId(req);
  const [row] = await db
    .select({ friendCode: usersTable.friendCode })
    .from(usersTable)
    .where(eq(usersTable.id, me))
    .limit(1);
  res.json({ friendCode: row?.friendCode ?? null });
});

router.post(
  "/me/friend-code/regenerate",
  requireAuth,
  async (req, res): Promise<void> => {
    const me = getUserId(req);
    const { code: friendCode } = await withFriendCodeRetry(async (code) => {
      await db
        .update(usersTable)
        .set({ friendCode: code })
        .where(eq(usersTable.id, me));
    });
    res.json({ friendCode });
  },
);

router.get(
  "/users/by-code/:code",
  requireAuth,
  async (req, res): Promise<void> => {
    const me = getUserId(req);
    const raw = Array.isArray(req.params.code)
      ? req.params.code[0]
      : req.params.code;
    const code = normalizeFriendCode(String(raw));
    if (!code || code.length < 3) {
      res.status(400).json({ error: "Invalid code" });
      return;
    }
    // Match either the normalized code or formatted variant
    const formatted =
      code.length === 7 ? `${code.slice(0, 3)}-${code.slice(3)}` : code;
    const [user] = await db
      .select()
      .from(usersTable)
      .where(
        or(
          eq(usersTable.friendCode, formatted),
          eq(usersTable.friendCode, code),
        ),
      )
      .limit(1);
    if (!user || user.id === me) {
      res.status(404).json({ error: "No user found for that code" });
      return;
    }
    const [match] = await loadMatchUsers(me, [user.id]);
    if (!match) {
      res.status(404).json({ error: "No user found for that code" });
      return;
    }
    const friendMap = await loadFriendStatuses(me, [user.id]);
    res.json({
      ...match,
      friendStatus: friendMap.get(user.id) ?? "none",
    });
  },
);


router.get("/me/friends", requireAuth, async (req, res): Promise<void> => {
  const me = getUserId(req);
  const rows = await db
    .select()
    .from(friendshipsTable)
    .where(
      and(
        or(
          eq(friendshipsTable.requesterId, me),
          eq(friendshipsTable.addresseeId, me),
        ),
        eq(friendshipsTable.status, "accepted"),
      ),
    );
  const otherIds = rows.map((r) =>
    r.requesterId === me ? r.addresseeId : r.requesterId,
  );
  const users = await loadMatchUsers(me, otherIds);
  res.json(users.map((u) => ({ ...u, friendStatus: "friends" })));
});

router.get(
  "/me/friends/requests",
  requireAuth,
  async (req, res): Promise<void> => {
    const me = getUserId(req);
    const rows = await db
      .select()
      .from(friendshipsTable)
      .where(
        and(
          or(
            eq(friendshipsTable.requesterId, me),
            eq(friendshipsTable.addresseeId, me),
          ),
          eq(friendshipsTable.status, "pending"),
        ),
      );
    const incomingIds = rows
      .filter((r) => r.addresseeId === me)
      .map((r) => r.requesterId);
    const outgoingIds = rows
      .filter((r) => r.requesterId === me)
      .map((r) => r.addresseeId);
    const [incoming, outgoing] = await Promise.all([
      loadMatchUsers(me, incomingIds),
      loadMatchUsers(me, outgoingIds),
    ]);
    res.json({
      incoming: incoming.map((u) => ({ ...u, friendStatus: "request_received" })),
      outgoing: outgoing.map((u) => ({ ...u, friendStatus: "request_sent" })),
    });
  },
);

router.post(
  "/users/:id/friend-request",
  requireAuth,
  async (req, res): Promise<void> => {
    const me = getUserId(req);
    const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const otherId = String(raw);
    if (otherId === me) {
      res.status(400).json({ error: "Cannot friend yourself" });
      return;
    }
    const [other] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.id, otherId))
      .limit(1);
    if (!other) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    if (await isBlockedEitherWay(me, otherId)) {
      res.status(403).json({ error: "Blocked" });
      return;
    }
    const [a, b] = pair(me, otherId);
    const [existing] = await db
      .select()
      .from(friendshipsTable)
      .where(
        or(
          and(
            eq(friendshipsTable.requesterId, me),
            eq(friendshipsTable.addresseeId, otherId),
          ),
          and(
            eq(friendshipsTable.requesterId, otherId),
            eq(friendshipsTable.addresseeId, me),
          ),
        ),
      )
      .limit(1);
    if (existing) {
      // If incoming pending, accept it. Otherwise no-op.
      if (existing.status === "pending" && existing.addresseeId === me) {
        await db
          .update(friendshipsTable)
          .set({ status: "accepted", updatedAt: new Date() })
          .where(
            and(
              eq(friendshipsTable.requesterId, existing.requesterId),
              eq(friendshipsTable.addresseeId, existing.addresseeId),
            ),
          );
      }
      res.status(204).end();
      return;
    }
    void a;
    void b;
    await db
      .insert(friendshipsTable)
      .values({ requesterId: me, addresseeId: otherId, status: "pending" })
      .onConflictDoNothing();
    res.status(204).end();
  },
);

router.delete(
  "/users/:id/friend-request",
  requireAuth,
  async (req, res): Promise<void> => {
    const me = getUserId(req);
    const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const otherId = String(raw);
    await db
      .delete(friendshipsTable)
      .where(
        and(
          eq(friendshipsTable.requesterId, me),
          eq(friendshipsTable.addresseeId, otherId),
          eq(friendshipsTable.status, "pending"),
        ),
      );
    res.status(204).end();
  },
);

router.post(
  "/me/friends/:id/accept",
  requireAuth,
  async (req, res): Promise<void> => {
    const me = getUserId(req);
    const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const otherId = String(raw);
    await db
      .update(friendshipsTable)
      .set({ status: "accepted", updatedAt: new Date() })
      .where(
        and(
          eq(friendshipsTable.requesterId, otherId),
          eq(friendshipsTable.addresseeId, me),
          eq(friendshipsTable.status, "pending"),
        ),
      );
    res.status(204).end();
  },
);

router.post(
  "/me/friends/:id/decline",
  requireAuth,
  async (req, res): Promise<void> => {
    const me = getUserId(req);
    const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const otherId = String(raw);
    await db
      .delete(friendshipsTable)
      .where(
        and(
          eq(friendshipsTable.requesterId, otherId),
          eq(friendshipsTable.addresseeId, me),
          eq(friendshipsTable.status, "pending"),
        ),
      );
    res.status(204).end();
  },
);

router.delete(
  "/me/friends/:id",
  requireAuth,
  async (req, res): Promise<void> => {
    const me = getUserId(req);
    const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const otherId = String(raw);
    await db
      .delete(friendshipsTable)
      .where(
        or(
          and(
            eq(friendshipsTable.requesterId, me),
            eq(friendshipsTable.addresseeId, otherId),
          ),
          and(
            eq(friendshipsTable.requesterId, otherId),
            eq(friendshipsTable.addresseeId, me),
          ),
        ),
      );
    res.status(204).end();
  },
);

// Helper used by other routes (and exported)
export async function loadFriendStatuses(
  myId: string,
  otherIds: string[],
): Promise<Map<string, "friends" | "request_sent" | "request_received">> {
  const out = new Map<
    string,
    "friends" | "request_sent" | "request_received"
  >();
  if (otherIds.length === 0) return out;
  const rows = await db
    .select()
    .from(friendshipsTable)
    .where(
      or(
        and(
          eq(friendshipsTable.requesterId, myId),
          inArray(friendshipsTable.addresseeId, otherIds),
        ),
        and(
          eq(friendshipsTable.addresseeId, myId),
          inArray(friendshipsTable.requesterId, otherIds),
        ),
      ),
    );
  for (const r of rows) {
    const other = r.requesterId === myId ? r.addresseeId : r.requesterId;
    if (r.status === "accepted") out.set(other, "friends");
    else if (r.status === "pending") {
      out.set(
        other,
        r.requesterId === myId ? "request_sent" : "request_received",
      );
    }
  }
  // suppress unused
  void sql;
  return out;
}

export default router;
