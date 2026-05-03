const STORAGE_KEY_BASE = "hashchat:offline:outbox:web:v1";

let currentUserId: string | null = null;

function storageKey(): string {
  return `${STORAGE_KEY_BASE}:${currentUserId ?? "anon"}`;
}

export const MAX_SEND_ATTEMPTS = 3;

export type OutboxTarget =
  | { kind: "conversation"; conversationId: number }
  | { kind: "room"; tag: string };

export type QueuedMessageData = {
  content: string;
  imageUrl?: string | null;
  audioUrl?: string | null;
  gifUrl?: string | null;
  replyToId?: number | null;
};

export type QueuedMessageStatus = "pending" | "failed";

export type QueuedMessage = {
  id: string;
  target: OutboxTarget;
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
    if (!target) continue;
    const data = (m.data as QueuedMessageData) ?? { content: "" };
    out.push({
      id: String(
        m.id ?? `q_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      ),
      target,
      data,
      createdAt: typeof m.createdAt === "number" ? m.createdAt : Date.now(),
      attempts: typeof m.attempts === "number" ? m.attempts : 0,
      status: m.status === "failed" ? "failed" : "pending",
      lastError: typeof m.lastError === "string" ? m.lastError : undefined,
    });
  }
  return out;
}

function load(): QueuedMessage[] {
  if (cache) return cache;
  try {
    const raw =
      typeof window === "undefined"
        ? null
        : window.localStorage.getItem(storageKey());
    cache = raw ? migrate(JSON.parse(raw)) : [];
  } catch {
    cache = [];
  }
  return cache;
}

function persist(): void {
  if (!cache) return;
  try {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(storageKey(), JSON.stringify(cache));
    }
  } catch {
    /* ignore */
  }
  for (const l of listeners) l(cache.slice());
}

export function setOutboxUserId(id: string | null): void {
  if (currentUserId === id) return;
  currentUserId = id;
  cache = null;
  const next = load();
  for (const l of listeners) l(next.slice());
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key !== storageKey()) return;
    cache = null;
    const next = load();
    for (const l of listeners) l(next.slice());
  });
}

export function subscribeOutbox(fn: Listener): () => void {
  listeners.add(fn);
  fn(load().slice());
  return () => {
    listeners.delete(fn);
  };
}

export function getOutbox(): QueuedMessage[] {
  return load().slice();
}

export function getOutboxFor(conversationId: number): QueuedMessage[] {
  return load().filter(
    (m) =>
      m.target.kind === "conversation" &&
      m.target.conversationId === conversationId,
  );
}

export function getRoomOutboxFor(tag: string): QueuedMessage[] {
  return load().filter((m) => m.target.kind === "room" && m.target.tag === tag);
}

function makeId(): string {
  return `q_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function enqueueMessage(
  conversationId: number,
  data: QueuedMessageData,
): QueuedMessage {
  const all = load();
  const item: QueuedMessage = {
    id: makeId(),
    target: { kind: "conversation", conversationId },
    data,
    createdAt: Date.now(),
    attempts: 0,
    status: "pending",
  };
  all.push(item);
  cache = all;
  persist();
  return item;
}

export function enqueueRoomMessage(
  tag: string,
  data: QueuedMessageData,
): QueuedMessage {
  const all = load();
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
  persist();
  return item;
}

export function removeFromOutbox(id: string): void {
  const all = load();
  cache = all.filter((m) => m.id !== id);
  persist();
}

export function bumpAttempt(id: string, error?: string): void {
  const all = load();
  const item = all.find((m) => m.id === id);
  if (!item) return;
  item.attempts += 1;
  if (error) item.lastError = error;
  if (item.attempts >= MAX_SEND_ATTEMPTS) {
    item.status = "failed";
  }
  cache = all;
  persist();
}

export function markFailed(id: string, error?: string): void {
  const all = load();
  const item = all.find((m) => m.id === id);
  if (!item) return;
  item.status = "failed";
  if (error) item.lastError = error;
  cache = all;
  persist();
}

export function retryMessage(id: string): void {
  const all = load();
  const item = all.find((m) => m.id === id);
  if (!item) return;
  item.attempts = 0;
  item.status = "pending";
  item.lastError = undefined;
  cache = all;
  persist();
}

export function updateMessageContent(
  id: string,
  data: Partial<QueuedMessageData>,
): void {
  const all = load();
  const item = all.find((m) => m.id === id);
  if (!item) return;
  item.data = { ...item.data, ...data };
  item.attempts = 0;
  item.status = "pending";
  item.lastError = undefined;
  cache = all;
  persist();
}
