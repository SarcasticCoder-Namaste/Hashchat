import { Router, type IRouter } from "express";
import OpenAI from "openai";
import {
  db,
  messagesTable,
  messageTranslationsTable,
  conversationMembersTable,
} from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { requireAuth, getUserId } from "../middlewares/requireAuth";
import { TranslateMessageBody } from "@workspace/api-zod";
import { logger } from "../lib/logger";
import { getRoomAccess } from "../lib/roomVisibility";

const router: IRouter = Router();

let cached: OpenAI | null = null;
function getClient(): OpenAI | null {
  const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  if (!baseURL || !apiKey) return null;
  if (!cached) cached = new OpenAI({ baseURL, apiKey });
  return cached;
}

const MODEL = "gpt-4o-mini";

function normalizeLang(input: string): string {
  return input.trim().slice(0, 32);
}

router.post(
  "/messages/:id/translate",
  requireAuth,
  async (req, res): Promise<void> => {
    const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const id = parseInt(raw, 10);
    if (Number.isNaN(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const parsed = TranslateMessageBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const language = normalizeLang(parsed.data.language);
    if (!language) {
      res.status(400).json({ error: "language required" });
      return;
    }
    const me = getUserId(req);

    const [msg] = await db
      .select()
      .from(messagesTable)
      .where(eq(messagesTable.id, id))
      .limit(1);
    if (!msg) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    // Authorize: must be a member of the conversation, or have access to the room.
    if (msg.conversationId) {
      const [member] = await db
        .select()
        .from(conversationMembersTable)
        .where(
          and(
            eq(conversationMembersTable.conversationId, msg.conversationId),
            eq(conversationMembersTable.userId, me),
          ),
        )
        .limit(1);
      if (!member) {
        res.status(404).json({ error: "Not found" });
        return;
      }
    } else if (msg.roomTag) {
      const access = await getRoomAccess(msg.roomTag, me);
      if (access.isPrivate && !access.isMember) {
        res.status(404).json({ error: "Not found" });
        return;
      }
    }

    const source = (msg.content ?? "").trim() || (msg.audioTranscript ?? "").trim();
    if (!source) {
      res.status(400).json({ error: "Nothing to translate" });
      return;
    }

    const [existing] = await db
      .select()
      .from(messageTranslationsTable)
      .where(
        and(
          eq(messageTranslationsTable.messageId, id),
          eq(messageTranslationsTable.language, language),
        ),
      )
      .limit(1);
    if (existing) {
      res.json({
        messageId: id,
        language,
        text: existing.translatedText,
        cached: true,
      });
      return;
    }

    const client = getClient();
    if (!client) {
      res.status(503).json({ error: "Translation not configured" });
      return;
    }

    let translated: string;
    try {
      const completion = await client.chat.completions.create({
        model: MODEL,
        temperature: 0,
        messages: [
          {
            role: "system",
            content:
              "You are a translation engine. Translate the user's message into the target language. Reply ONLY with the translated text, no explanations, no quotes, no language labels. Preserve emoji, mentions like @name, hashtags like #tag, URLs, and code spans verbatim.",
          },
          {
            role: "user",
            content: `Target language: ${language}\n\nMessage:\n${source}`,
          },
        ],
      });
      translated = (completion.choices[0]?.message?.content ?? "").trim();
      if (!translated) throw new Error("Empty translation");
    } catch (err) {
      logger.warn({ err, messageId: id, language }, "translation failed");
      res.status(503).json({ error: "Translation failed" });
      return;
    }

    await db
      .insert(messageTranslationsTable)
      .values({
        messageId: id,
        language,
        translatedText: translated,
        model: MODEL,
      })
      .onConflictDoNothing();

    res.json({
      messageId: id,
      language,
      text: translated,
      cached: false,
    });
  },
);

export default router;
