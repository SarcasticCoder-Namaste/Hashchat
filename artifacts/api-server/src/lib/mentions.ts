import { db, usersTable, mentionsTable } from "@workspace/db";
import { inArray } from "drizzle-orm";

const MENTION_RE = /@([a-zA-Z0-9_]{2,30})/g;

export function extractMentionUsernames(content: string): string[] {
  const out = new Set<string>();
  for (const m of content.matchAll(MENTION_RE)) {
    out.add(m[1].toLowerCase());
  }
  return Array.from(out);
}

export type MentionResolved = {
  id: string;
  username: string;
  displayName: string;
};

export async function resolveMentions(
  content: string,
): Promise<MentionResolved[]> {
  const usernames = extractMentionUsernames(content);
  if (usernames.length === 0) return [];
  const rows = await db
    .select({
      id: usersTable.id,
      username: usersTable.username,
      displayName: usersTable.displayName,
    })
    .from(usersTable)
    .where(inArray(usersTable.username, usernames));
  return rows;
}

export async function recordMentions(opts: {
  mentionerId: string;
  targetType: "post" | "message";
  targetId: number;
  resolved: MentionResolved[];
}): Promise<MentionResolved[]> {
  const { mentionerId, targetType, targetId, resolved } = opts;
  const others = resolved.filter((u) => u.id !== mentionerId);
  if (others.length === 0) return [];
  await db
    .insert(mentionsTable)
    .values(
      others.map((u) => ({
        mentionerId,
        mentionedUserId: u.id,
        targetType,
        targetId,
      })),
    )
    .onConflictDoNothing();
  return others;
}
