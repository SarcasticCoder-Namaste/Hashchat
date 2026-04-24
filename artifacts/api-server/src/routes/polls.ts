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
} from "@workspace/db";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { requireAuth, getUserId } from "../middlewares/requireAuth";
import { normalizeTag } from "../lib/hashtags";
import { CreateRoomPollBody, VotePollBody } from "@workspace/api-zod";

const router: IRouter = Router();

type PollRow = typeof pollsTable.$inferSelect;

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

  const voteCounts = await db
    .select({
      pollId: pollVotesTable.pollId,
      optionId: pollVotesTable.optionId,
      count: sql<number>`count(*)::int`,
    })
    .from(pollVotesTable)
    .where(inArray(pollVotesTable.pollId, ids))
    .groupBy(pollVotesTable.pollId, pollVotesTable.optionId);
  const voteMap = new Map<string, number>();
  for (const v of voteCounts) {
    voteMap.set(`${v.pollId}:${v.optionId}`, v.count);
  }

  const myVotes = await db
    .select()
    .from(pollVotesTable)
    .where(
      and(
        inArray(pollVotesTable.pollId, ids),
        eq(pollVotesTable.userId, myUserId),
      ),
    );
  const myVoteByPoll = new Map(myVotes.map((v) => [v.pollId, v.optionId]));

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
    let total = 0;
    const myOpt = myVoteByPoll.get(r.id) ?? null;
    const builtOpts = opts.map((o) => {
      const votes = voteMap.get(`${r.id}:${o.id}`) ?? 0;
      total += votes;
      return {
        id: o.id,
        text: o.text,
        votes,
        votedByMe: myOpt === o.id,
      };
    });
    const creator = creatorMap.get(r.creatorId);
    return {
      id: r.id,
      roomTag: r.roomTag,
      creatorId: r.creatorId,
      creatorName: creator?.displayName ?? creator?.username ?? "Unknown",
      question: r.question,
      options: builtOpts,
      totalVotes: total,
      myVoteOptionId: myOpt,
      expiresAt: r.expiresAt ? r.expiresAt.toISOString() : null,
      isExpired: r.expiresAt ? r.expiresAt.getTime() <= now : false,
      createdAt: r.createdAt.toISOString(),
    };
  });
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
    const parsed = CreateRoomPollBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const cleanedOptions = parsed.data.options
      .map((o) => o.trim())
      .filter((o) => o.length > 0);
    if (cleanedOptions.length < 2 || cleanedOptions.length > 6) {
      res.status(400).json({ error: "Polls require 2-6 options" });
      return;
    }
    const question = parsed.data.question.trim();
    if (!question) {
      res.status(400).json({ error: "Question is required" });
      return;
    }

    await db.insert(hashtagsTable).values({ tag }).onConflictDoNothing();

    const me = getUserId(req);
    const [created] = await db
      .insert(pollsTable)
      .values({
        roomTag: tag,
        creatorId: me,
        question,
        expiresAt: parsed.data.expiresAt ?? null,
      })
      .returning();

    await db.insert(pollOptionsTable).values(
      cleanedOptions.map((text, position) => ({
        pollId: created.id,
        text,
        position,
      })),
    );

    // Insert a corresponding chat message so the poll appears inline in
    // the room's message stream, and link the poll via an attachment row.
    const [pollMsg] = await db
      .insert(messagesTable)
      .values({
        roomTag: tag,
        senderId: me,
        content: question,
      })
      .returning();
    await db.insert(messageAttachmentsTable).values({
      messageId: pollMsg.id,
      kind: "poll",
      url: `poll:${created.id}`,
      title: question,
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
    if (poll.expiresAt && poll.expiresAt.getTime() <= Date.now()) {
      res.status(400).json({ error: "Poll has expired" });
      return;
    }
    const [option] = await db
      .select()
      .from(pollOptionsTable)
      .where(
        and(
          eq(pollOptionsTable.id, parsed.data.optionId),
          eq(pollOptionsTable.pollId, id),
        ),
      )
      .limit(1);
    if (!option) {
      res.status(400).json({ error: "Invalid optionId" });
      return;
    }

    await db
      .insert(pollVotesTable)
      .values({ pollId: id, optionId: option.id, userId: me })
      .onConflictDoNothing();

    const [built] = await buildPolls([poll], me);
    res.json(built);
  },
);

export default router;
