import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "hashchat:offline:outbox:v1";

export type QueuedMessage = {
  id: string;
  conversationId: number;
  data: {
    content: string;
    imageUrl?: string | null;
    audioUrl?: string | null;
    gifUrl?: string | null;
  };
  createdAt: number;
  attempts: number;
};

type Listener = (q: QueuedMessage[]) => void;

let cache: QueuedMessage[] | null = null;
const listeners = new Set<Listener>();

async function load(): Promise<QueuedMessage[]> {
  if (cache) return cache;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    cache = raw ? (JSON.parse(raw) as QueuedMessage[]) : [];
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
  return all.filter((m) => m.conversationId === conversationId);
}

export async function enqueueMessage(
  conversationId: number,
  data: QueuedMessage["data"],
): Promise<QueuedMessage> {
  const all = await load();
  const item: QueuedMessage = {
    id: `q_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    conversationId,
    data,
    createdAt: Date.now(),
    attempts: 0,
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

export async function bumpAttempt(id: string): Promise<void> {
  const all = await load();
  const item = all.find((m) => m.id === id);
  if (item) {
    item.attempts += 1;
    cache = all;
    await persist();
  }
}
