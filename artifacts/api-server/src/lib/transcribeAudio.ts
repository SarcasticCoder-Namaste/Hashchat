import OpenAI from "openai";
import { db, messagesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

let cachedClient: OpenAI | null = null;

function getClient(): OpenAI | null {
  const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  if (!baseURL || !apiKey) return null;
  if (!cachedClient) cachedClient = new OpenAI({ baseURL, apiKey });
  return cachedClient;
}

const MAX_BYTES = 20 * 1024 * 1024;

function extFromUrl(url: string): string {
  const m = url.match(/\.([a-z0-9]+)(?:\?|#|$)/i);
  if (!m) return "webm";
  const ext = m[1].toLowerCase();
  if (["webm", "mp3", "mp4", "m4a", "wav", "ogg", "oga", "flac", "mpga", "mpeg"].includes(ext)) {
    return ext;
  }
  return "webm";
}

export function transcribeMessageAudio(messageId: number, audioUrl: string): void {
  const client = getClient();
  if (!client) {
    logger.warn({ messageId }, "skipping transcription: openai not configured");
    return;
  }
  void (async () => {
    try {
      const res = await fetch(audioUrl);
      if (!res.ok) {
        logger.warn({ messageId, status: res.status }, "audio fetch failed");
        return;
      }
      const ab = await res.arrayBuffer();
      if (ab.byteLength === 0 || ab.byteLength > MAX_BYTES) {
        logger.warn({ messageId, size: ab.byteLength }, "audio size out of range");
        return;
      }
      const ext = extFromUrl(audioUrl);
      const file = new File([ab], `voice-${messageId}.${ext}`, {
        type: `audio/${ext === "m4a" ? "mp4" : ext}`,
      });
      const result = await client.audio.transcriptions.create({
        file,
        model: "gpt-4o-mini-transcribe",
        response_format: "json",
      });
      const text = (result.text ?? "").trim();
      if (!text) return;
      await db
        .update(messagesTable)
        .set({ audioTranscript: text })
        .where(eq(messagesTable.id, messageId));
    } catch (err) {
      logger.warn({ err, messageId }, "voice transcription failed");
    }
  })();
}
