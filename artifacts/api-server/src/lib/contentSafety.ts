import OpenAI from "openai";
import { logger } from "./logger";

let cachedClient: OpenAI | null = null;

function getClient(): OpenAI | null {
  const baseURL = process.env["AI_INTEGRATIONS_OPENAI_BASE_URL"];
  const apiKey = process.env["AI_INTEGRATIONS_OPENAI_API_KEY"];
  if (!baseURL || !apiKey) return null;
  if (!cachedClient) cachedClient = new OpenAI({ baseURL, apiKey });
  return cachedClient;
}

const KEYWORDS: { word: RegExp; category: string; weight: number }[] = [
  { word: /\b(kill|murder|stab|shoot)\s+(you|him|her|them|myself)\b/i, category: "violence", weight: 0.9 },
  { word: /\b(hate|despise)\s+(all\s+)?(jews|blacks|whites|asians|gays|trans|muslims|christians)\b/i, category: "hate", weight: 0.95 },
  { word: /\b(retard(ed)?|faggot|tranny|nigger|chink|spic|kike)\b/i, category: "slur", weight: 0.95 },
  { word: /\b(fuck\s+you|piece\s+of\s+shit|stfu|kys|kill\s+yourself)\b/i, category: "harassment", weight: 0.85 },
  { word: /\b(buy\s+now|click\s+here|free\s+money|crypto\s+giveaway|airdrop|🔥{3,})\b/i, category: "spam", weight: 0.6 },
  { word: /https?:\/\/\S+\.(ru|tk|xyz)\b/i, category: "spam", weight: 0.5 },
];

export interface ContentSafetyResult {
  flagged: boolean;
  score: number;
  categories: string[];
  message: string | null;
}

const SAFETY_THRESHOLD = 0.6;

function heuristic(text: string): ContentSafetyResult {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return { flagged: false, score: 0, categories: [], message: null };
  }
  const cats = new Set<string>();
  let max = 0;
  for (const k of KEYWORDS) {
    if (k.word.test(trimmed)) {
      cats.add(k.category);
      if (k.weight > max) max = k.weight;
    }
  }
  const caps = trimmed.replace(/[^A-Za-z]/g, "");
  if (caps.length >= 8 && caps.toUpperCase() === caps) {
    cats.add("shouting");
    max = Math.max(max, 0.4);
  }
  const flagged = max >= SAFETY_THRESHOLD;
  return {
    flagged,
    score: max,
    categories: Array.from(cats),
    message: flagged
      ? "This may violate community rules — review before posting."
      : null,
  };
}

export async function checkContent(text: string): Promise<ContentSafetyResult> {
  const local = heuristic(text);
  const client = getClient();
  if (!client) return local;
  try {
    type ModerationApi = {
      moderations?: {
        create: (args: {
          model: string;
          input: string;
        }) => Promise<{
          results: Array<{
            flagged: boolean;
            categories: Record<string, boolean>;
            category_scores: Record<string, number>;
          }>;
        }>;
      };
    };
    const mods = (client as unknown as ModerationApi).moderations;
    if (!mods) return local;
    const resp = await mods.create({
      model: "omni-moderation-latest",
      input: text.slice(0, 4000),
    });
    const r = resp.results?.[0];
    if (!r) return local;
    const aiCategories = Object.entries(r.categories ?? {})
      .filter(([, v]) => v)
      .map(([k]) => k);
    const aiScore = Math.max(0, ...Object.values(r.category_scores ?? {}));
    const score = Math.max(local.score, aiScore);
    const categories = Array.from(new Set([...local.categories, ...aiCategories]));
    const flagged = r.flagged || local.flagged || score >= SAFETY_THRESHOLD;
    return {
      flagged,
      score,
      categories,
      message: flagged
        ? "This may violate community rules — review before posting."
        : null,
    };
  } catch (err) {
    logger.warn({ err }, "content safety AI check failed; using heuristic");
    return local;
  }
}
