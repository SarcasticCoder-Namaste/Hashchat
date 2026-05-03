import { Router, type IRouter } from "express";
import {
  db,
  pollsTable,
  pollOptionsTable,
  pollVotesTable,
  hashtagsTable,
  usersTable,
  messagesTable,
  messageAttachmentsTable,
  conversationMembersTable,
} from "@workspace/db";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { requireAuth, getUserId } from "../middlewares/requireAuth";
import { normalizeTag } from "../lib/hashtags";
import { CreateRoomPollBody, VotePollBody } from "@workspace/api-zod";
import {
  publishPollUpdate,
  subscribePollUpdates,
  type PollScope,
} from "../lib/pollEvents";

const router: IRouter = Router();

type PollRow = typeof pollsTable.$inferSelect;
type VoteRow = typeof pollVotesTable.$inferSelect;

interface RoundResult {
  round: number;
  tallies: { optionId: number; votes: number }[];
  eliminated: number[];
}

function computeIRV(
  optionIds: number[],
  ballots: number[][],
): { rounds: RoundResult[]; winner: number | null } {
  const rounds: RoundResult[] = [];
  const eliminated = new Set<number>();
  let active = [...optionIds];
  let round = 0;
  while (active.length > 0) {
    round++;
    const counts = new Map<number, number>();
    for (const oid of active) counts.set(oid, 0);
    for (const ballot of ballots) {
      const top = ballot.find((o) => !eliminated.has(o));
      if (top !== undefined) counts.set(top, (counts.get(top) ?? 0) + 1);
    }
    const tallies = active.map((oid) => ({
      optionId: oid,
      votes: counts.get(oid) ?? 0,
    }));
    const total = tallies.reduce((s, t) => s + t.votes, 0);
    const top = [...tallies].sort((a, b) => b.votes - a.votes)[0];
    if (total === 0) {
      rounds.push({ round, tallies, eliminated: [] });
      return { rounds, winner: null };
    }
    if (top.votes * 2 > total || active.length <= 1) {
      rounds.push({ round, tallies, eliminated: [] });
      return { rounds, winner: top.votes > 0 ? top.optionId : null };
    }
    const minVotes = Math.min(...tallies.map((t) => t.votes));
    const losers = tallies.filter((t) => t.votes === minVotes).map((t) => t.optionId);
    rounds.push({ round, tallies, eliminated: losers });
    for (const l of losers) eliminated.add(l);
    active = active.filter((o) => !eliminated.has(o));
    if (round > 20) break;
  }
  return { rounds, winner: null };
}

async function buildPolls(rows: PollRow[], myUserId: string) {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);

  const options = await db
    .select()
    .from(pollOptionsTable)
    .where(inArray(pollOptionsTable.pollId, ids))
    .orderBy(pollOptionsTable.position);
  const optionsByPoll = new Map<number, typeof options>();
  for (const o of options) {
    if (!optionsByPoll.has(o.pollId)) optionsByPoll.set(o.pollId, []);
    optionsByPoll.get(o.pollId)!.push(o);
  }

  const allVotes: VoteRow[] = await db
    .select()
    .from(pollVotesTable)
    .where(inArray(pollVotesTable.pollId, ids));
  const votesByPoll = new Map<number, VoteRow[]>();
  for (const v of allVotes) {
    if (!votesByPoll.has(v.pollId)) votesByPoll.set(v.pollId, []);
    votesByPoll.get(v.pollId)!.push(v);
  }

  const creatorIds = Array.from(new Set(rows.map((r) => r.creatorId)));
  const creators = await db
    .select({
      id: usersTable.id,
      displayName: usersTable.displayName,
      username: usersTable.username,
    })
    .from(usersTable)
    .where(inArray(usersTable.id, creatorIds));
  const creatorMap = new Map(creators.map((c) => [c.id, c]));

  const now = Date.now();
  return rows.map((r) => {
    const opts = optionsByPoll.get(r.id) ?? [];
    const votes = votesByPoll.get(r.id) ?? [];
    const myVotes = votes.filter((v) => v.userId === myUserId);
    const myOptionIds = myVotes.map((v) => v.optionId);
    const myRankByOption = new Map(myVotes.map((v) => [v.optionId, v.rank]));

    let rounds: RoundResult[] | undefined;
    let winnerOptionId: number | null = null;

    let perOptionVotes: Map<number, number>;
    let totalVotes: number;

    if (r.mode === "ranked") {
      const ballotsByUser = new Map<string, VoteRow[]>();
      for (const v of votes) {
        if (!ballotsByUser.has(v.userId)) ballotsByUser.set(v.userId, []);
        ballotsByUser.get(v.userId)!.push(v);
      }
      const ballots: number[][] = [];
      for (const userVotes of ballotsByUser.values()) {
        const sorted = [...userVotes].sort((a, b) => a.rank - b.rank);
        ballots.push(sorted.map((v) => v.optionId));
      }
      const irv = computeIRV(
        opts.map((o) => o.id),
        ballots,
      );
      rounds = irv.rounds;
      winnerOptionId = irv.winner;
      const firstRound = irv.rounds[0];
      perOptionVotes = new Map(
        (firstRound?.tallies ?? []).map((t) => [t.optionId, t.votes]),
      );
      totalVotes = ballots.length;
    } else {
      perOptionVotes = new Map();
      for (const v of votes) {
        perOptionVotes.set(v.optionId, (perOptionVotes.get(v.optionId) ?? 0) + 1);
      }
      totalVotes =
        r.mode === "multi"
          ? new Set(votes.map((v) => v.userId)).size
          : votes.length;
    }

    const builtOpts = opts.map((o) => ({
      id: o.id,
      text: o.text,
      votes: perOptionVotes.get(o.id) ?? 0,
      votedByMe: myOptionIds.includes(o.id),
      myRank: myRankByOption.get(o.id) ?? null,
    }));

    const creator = creatorMap.get(r.creatorId);
    return {
      id: r.id,
      roomTag: r.roomTag,
      conversationId: r.conversationId,
      creatorId: r.creatorId,
      creatorName: creator?.displayName ?? creator?.username ?? "Unknown",
      question: r.question,
      mode: r.mode as "single" | "multi" | "ranked",
      maxSelections: r.maxSelections,
      options: builtOpts,
      totalVotes,
      myVoteOptionId: r.mode === "single" ? (myOptionIds[0] ?? null) : null,
      myVoteOptionIds: myOptionIds,
      rounds: rounds ?? [],
      winnerOptionId,
      expiresAt: r.expiresAt ? r.expiresAt.toISOString() : null,
      isExpired: r.expiresAt ? r.expiresAt.getTime() <= now : false,
      createdAt: r.createdAt.toISOString(),
    };
  });
}

function pollScope(p: { roomTag: string | null; conversationId: number | null }): PollScope | null {
  if (p.roomTag) return { kind: "room", tag: p.roomTag };
  if (p.conversationId != null) return { kind: "conversation", id: p.conversationId };
  return null;
}

async function isConversationMember(conversationId: number, userId: string): Promise<boolean> {
  const [m] = await db
    .select()
    .from(conversationMembersTable)
    .where(
      and(
        eq(conversationMembersTable.conversationId, conversationId),
        eq(conversationMembersTable.userId, userId),
      ),
    )
    .limit(1);
  return !!m;
}

interface NormalizedCreate {
  question: string;
  options: string[];
  mode: "single" | "multi" | "ranked";
  maxSelections: number;
  expiresAt: Date | null;
}

function normalizeCreatePoll(body: unknown): { ok: true; data: NormalizedCreate } | { ok: false; error: string } {
  const parsed = CreateRoomPollBody.safeParse(body);
  if (!parsed.success) return { ok: false, error: parsed.error.message };
  const cleanedOptions = parsed.data.options
    .map((o) => o.trim())
    .filter((o) => o.length > 0);
  if (cleanedOptions.length < 2 || cleanedOptions.length > 6) {
    return { ok: false, error: "Polls require 2-6 options" };
  }
  const question = parsed.data.question.trim();
  if (!question) return { ok: false, error: "Question is required" };
  const mode = (parsed.data.mode ?? "single") as "single" | "multi" | "ranked";
  if (!["single", "multi", "ranked"].includes(mode)) {
    return { ok: false, error: "Invalid mode" };
  }
  let maxSelections = parsed.data.maxSelections ?? 1;
  if (mode === "single") maxSelections = 1;
  else if (mode === "ranked") maxSelections = cleanedOptions.length;
  else maxSelections = Math.max(2, Math.min(cleanedOptions.length, maxSelections));
  return {
    ok: true,
    data: {
      question,
      options: cleanedOptions,
      mode,
      maxSelections,
      expiresAt: parsed.data.expiresAt ?? null,
    },
  };
}

router.get(
  "/rooms/:tag/polls",
  requireAuth,
  async (req, res): Promise<void> => {
    const raw = Array.isArray(req.params.tag)
      ? req.params.tag[0]
      : req.params.tag;
    const tag = normalizeTag(raw);
    if (!tag) {
      res.status(400).json({ error: "Invalid tag" });
      return;
    }
    const rows = await db
      .select()
      .from(pollsTable)
      .where(eq(pollsTable.roomTag, tag))
      .orderBy(desc(pollsTable.createdAt))
      .limit(50);
    res.json(await buildPolls(rows, getUserId(req)));
  },
);

router.post(
  "/rooms/:tag/polls",
  requireAuth,
  async (req, res): Promise<void> => {
    const raw = Array.isArray(req.params.tag)
      ? req.params.tag[0]
      : req.params.tag;
    const tag = normalizeTag(raw);
    if (!tag) {
      res.status(400).json({ error: "Invalid tag" });
      return;
    }
    const norm = normalizeCreatePoll(req.body);
    if (!norm.ok) {
      res.status(400).json({ error: norm.error });
      return;
    }
    const me = getUserId(req);

    await db.insert(hashtagsTable).values({ tag }).onConflictDoNothing();

    const [created] = await db
      .insert(pollsTable)
      .values({
        roomTag: tag,
        creatorId: me,
        question: norm.data.question,
        mode: norm.data.mode,
        maxSelections: norm.data.maxSelections,
        expiresAt: norm.data.expiresAt,
      })
      .returning();

    await db.insert(pollOptionsTable).values(
      norm.data.options.map((text, position) => ({
        pollId: created.id,
        text,
        position,
      })),
    );

    const [pollMsg] = await db
      .insert(messagesTable)
      .values({
        roomTag: tag,
        senderId: me,
        content: norm.data.question,
      })
      .returning();
    await db.insert(messageAttachmentsTable).values({
      messageId: pollMsg.id,
      kind: "poll",
      url: `poll:${created.id}`,
      title: norm.data.question,
    });

    const [built] = await buildPolls([created], me);
    res.status(201).json(built);
  },
);

router.get(
  "/conversations/:id/polls",
  requireAuth,
  async (req, res): Promise<void> => {
    const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const id = parseInt(raw, 10);
    if (Number.isNaN(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const me = getUserId(req);
    if (!(await isConversationMember(id, me))) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const rows = await db
      .select()
      .from(pollsTable)
      .where(eq(pollsTable.conversationId, id))
      .orderBy(desc(pollsTable.createdAt))
      .limit(50);
    res.json(await buildPolls(rows, me));
  },
);

router.post(
  "/conversations/:id/polls",
  requireAuth,
  async (req, res): Promise<void> => {
    const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const id = parseInt(raw, 10);
    if (Number.isNaN(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const me = getUserId(req);
    if (!(await isConversationMember(id, me))) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const norm = normalizeCreatePoll(req.body);
    if (!norm.ok) {
      res.status(400).json({ error: norm.error });
      return;
    }

    const [created] = await db
      .insert(pollsTable)
      .values({
        conversationId: id,
        creatorId: me,
        question: norm.data.question,
        mode: norm.data.mode,
        maxSelections: norm.data.maxSelections,
        expiresAt: norm.data.expiresAt,
      })
      .returning();

    await db.insert(pollOptionsTable).values(
      norm.data.options.map((text, position) => ({
        pollId: created.id,
        text,
        position,
      })),
    );

    const [pollMsg] = await db
      .insert(messagesTable)
      .values({
        conversationId: id,
        senderId: me,
        content: norm.data.question,
      })
      .returning();
    await db.insert(messageAttachmentsTable).values({
      messageId: pollMsg.id,
      kind: "poll",
      url: `poll:${created.id}`,
      title: norm.data.question,
    });

    const [built] = await buildPolls([created], me);
    res.status(201).json(built);
  },
);

router.post(
  "/polls/:id/vote",
  requireAuth,
  async (req, res): Promise<void> => {
    const raw = Array.isArray(req.params.id)
      ? req.params.id[0]
      : req.params.id;
    const id = parseInt(raw, 10);
    if (Number.isNaN(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const parsed = VotePollBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const me = getUserId(req);
    const [poll] = await db
      .select()
      .from(pollsTable)
      .where(eq(pollsTable.id, id))
      .limit(1);
    if (!poll) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (poll.conversationId != null) {
      if (!(await isConversationMember(poll.conversationId, me))) {
        res.status(404).json({ error: "Not found" });
        return;
      }
    }
    if (poll.expiresAt && poll.expiresAt.getTime() <= Date.now()) {
      res.status(400).json({ error: "Poll has expired" });
      return;
    }

    const validOptions = await db
      .select({ id: pollOptionsTable.id })
      .from(pollOptionsTable)
      .where(eq(pollOptionsTable.pollId, id));
    const validIds = new Set(validOptions.map((o) => o.id));

    let chosen: { optionId: number; rank: number }[] = [];

    if (poll.mode === "single") {
      const oid = parsed.data.optionId;
      if (typeof oid !== "number" || !validIds.has(oid)) {
        res.status(400).json({ error: "Invalid optionId" });
        return;
      }
      chosen = [{ optionId: oid, rank: 1 }];
    } else if (poll.mode === "multi") {
      const ids = parsed.data.optionIds ?? [];
      const unique = Array.from(new Set(ids));
      if (unique.length < 1 || unique.some((o) => !validIds.has(o))) {
        res.status(400).json({ error: "Invalid optionIds" });
        return;
      }
      if (unique.length > poll.maxSelections) {
        res.status(400).json({
          error: `At most ${poll.maxSelections} selections allowed`,
        });
        return;
      }
      chosen = unique.map((oid) => ({ optionId: oid, rank: 1 }));
    } else if (poll.mode === "ranked") {
      const ranked = parsed.data.rankedOptionIds ?? [];
      const unique = Array.from(new Set(ranked));
      if (unique.length !== ranked.length || unique.length < 1) {
        res.status(400).json({ error: "Invalid rankedOptionIds" });
        return;
      }
      if (unique.some((o) => !validIds.has(o))) {
        res.status(400).json({ error: "Invalid rankedOptionIds" });
        return;
      }
      chosen = unique.map((oid, idx) => ({ optionId: oid, rank: idx + 1 }));
    }

    await db
      .delete(pollVotesTable)
      .where(
        and(eq(pollVotesTable.pollId, id), eq(pollVotesTable.userId, me)),
      );
    if (chosen.length > 0) {
      await db.insert(pollVotesTable).values(
        chosen.map((c) => ({
          pollId: id,
          optionId: c.optionId,
          userId: me,
          rank: c.rank,
        })),
      );
    }

    const [built] = await buildPolls([poll], me);
    const scope = pollScope(poll);
    if (scope) {
      publishPollUpdate(scope, {
        pollId: poll.id,
        totalVotes: built.totalVotes,
        at: Date.now(),
      });
    }
    res.json(built);
  },
);

function streamHandler(getScope: (req: import("express").Request) => PollScope | null | Promise<PollScope | null>) {
  return async (req: import("express").Request, res: import("express").Response): Promise<void> => {
    const scope = await getScope(req);
    if (!scope) {
      res.status(400).json({ error: "Invalid scope" });
      return;
    }

    res.status(200);
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders?.();

    res.write(`retry: 3000\n\n`);
    res.write(`: connected\n\n`);

    const unsubscribe = subscribePollUpdates(scope, (event) => {
      res.write(`event: poll-update\n`);
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    });

    const heartbeat = setInterval(() => {
      res.write(`: ping\n\n`);
    }, 25_000);

    const cleanup = () => {
      clearInterval(heartbeat);
      unsubscribe();
      try {
        res.end();
      } catch {
        // ignore
      }
    };

    req.on("close", cleanup);
    req.on("aborted", cleanup);
  };
}

router.get(
  "/rooms/:tag/polls/stream",
  requireAuth,
  streamHandler((req) => {
    const raw = Array.isArray(req.params.tag) ? req.params.tag[0] : req.params.tag;
    const tag = normalizeTag(raw);
    return tag ? { kind: "room", tag } : null;
  }),
);

router.get(
  "/conversations/:id/polls/stream",
  requireAuth,
  streamHandler(async (req) => {
    const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const id = parseInt(raw, 10);
    if (Number.isNaN(id)) return null;
    const me = getUserId(req);
    if (!(await isConversationMember(id, me))) return null;
    return { kind: "conversation", id };
  }),
);

void isNull;

export default router;
