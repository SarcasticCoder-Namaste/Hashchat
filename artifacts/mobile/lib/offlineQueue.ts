import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "hashchat:offline:outbox:v1";

export const MAX_SEND_ATTEMPTS = 3;

export type OutboxTarget =
  | { kind: "conversation"; conversationId: number }
  | { kind: "room"; tag: string };

export type QueuedMessageData = {
  content: string;
  imageUrl?: string | null;
  audioUrl?: string | null;
  gifUrl?: string | null;
};

export type QueuedMessageStatus = "pending" | "failed";

export type QueuedMessage = {
  id: string;
  target: OutboxTarget;
  /** @deprecated kept for backwards compatibility with old persisted entries */
  conversationId?: number;
  data: QueuedMessageData;
  createdAt: number;
  attempts: number;
  status: QueuedMessageStatus;
  lastError?: string;
};

type Listener = (q: QueuedMessage[]) => void;

let cache: QueuedMessage[] | null = null;
const listeners = new Set<Listener>();

function migrate(raw: unknown): QueuedMessage[] {
  if (!Array.isArray(raw)) return [];
  const out: QueuedMessage[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const m = r as Record<string, unknown>;
    let target: OutboxTarget | null = null;
    const t = m.target as Record<string, unknown> | undefined;
    if (t && typeof t === "object") {
      if (t.kind === "conversation" && typeof t.conversationId === "number") {
        target = { kind: "conversation", conversationId: t.conversationId };
      } else if (t.kind === "room" && typeof t.tag === "string") {
        target = { kind: "room", tag: t.tag };
      }
    }
    if (!target && typeof m.conversationId === "number") {
      target = { kind: "conversation", conversationId: m.conversationId };
    }
    if (!target) continue;
    const data = (m.data as QueuedMessageData) ?? { content: "" };
    out.push({
      id: String(m.id ?? `q_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`),
      target,
      conversationId:
        target.kind === "conversation" ? target.conversationId : undefined,
      data,
      createdAt: typeof m.createdAt === "number" ? m.createdAt : Date.now(),
      attempts: typeof m.attempts === "number" ? m.attempts : 0,
      status: m.status === "failed" ? "failed" : "pending",
      lastError: typeof m.lastError === "string" ? m.lastError : undefined,
    });
  }
  return out;
}

async function load(): Promise<QueuedMessage[]> {
  if (cache) return cache;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    cache = raw ? migrate(JSON.parse(raw)) : [];
  } catch {
    cache = [];
  }
  return cache;
}

async function persist(): Promise<void> {
  if (!cache) return;
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  } catch {
    /* ignore */
  }
  for (const l of listeners) l(cache.slice());
}

export function subscribeOutbox(fn: Listener): () => void {
  listeners.add(fn);
  void load().then(() => fn((cache ?? []).slice()));
  return () => {
    listeners.delete(fn);
  };
}

export async function getOutbox(): Promise<QueuedMessage[]> {
  return (await load()).slice();
}

export async function getOutboxFor(
  conversationId: number,
): Promise<QueuedMessage[]> {
  const all = await load();
  return all.filter(
    (m) =>
      m.target.kind === "conversation" &&
      m.target.conversationId === conversationId,
  );
}

export async function getRoomOutboxFor(tag: string): Promise<QueuedMessage[]> {
  const all = await load();
  return all.filter((m) => m.target.kind === "room" && m.target.tag === tag);
}

function makeId(): string {
  return `q_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function enqueueMessage(
  conversationId: number,
  data: QueuedMessageData,
): Promise<QueuedMessage> {
  const all = await load();
  const item: QueuedMessage = {
    id: makeId(),
    target: { kind: "conversation", conversationId },
    conversationId,
    data,
    createdAt: Date.now(),
    attempts: 0,
    status: "pending",
  };
  all.push(item);
  cache = all;
  await persist();
  return item;
}

export async function enqueueRoomMessage(
  tag: string,
  data: QueuedMessageData,
): Promise<QueuedMessage> {
  const all = await load();
  const item: QueuedMessage = {
    id: makeId(),
    target: { kind: "room", tag },
    data,
    createdAt: Date.now(),
    attempts: 0,
    status: "pending",
  };
  all.push(item);
  cache = all;
  await persist();
  return item;
}

export async function removeFromOutbox(id: string): Promise<void> {
  const all = await load();
  cache = all.filter((m) => m.id !== id);
  await persist();
}

export async function bumpAttempt(id: string, error?: string): Promise<void> {
  const all = await load();
  const item = all.find((m) => m.id === id);
  if (!item) return;
  item.attempts += 1;
  if (error) item.lastError = error;
  if (item.attempts >= MAX_SEND_ATTEMPTS) {
    item.status = "failed";
  }
  cache = all;
  await persist();
}

export async function markFailed(id: string, error?: string): Promise<void> {
  const all = await load();
  const item = all.find((m) => m.id === id);
  if (!item) return;
  item.status = "failed";
  if (error) item.lastError = error;
  cache = all;
  await persist();
}

export async function retryMessage(id: string): Promise<void> {
  const all = await load();
  const item = all.find((m) => m.id === id);
  if (!item) return;
  item.attempts = 0;
  item.status = "pending";
  item.lastError = undefined;
  cache = all;
  await persist();
}

export async function updateMessageContent(
  id: string,
  data: Partial<QueuedMessageData>,
): Promise<void> {
  const all = await load();
  const item = all.find((m) => m.id === id);
  if (!item) return;
  item.data = { ...item.data, ...data };
  item.attempts = 0;
  item.status = "pending";
  item.lastError = undefined;
  cache = all;
  await persist();
}
