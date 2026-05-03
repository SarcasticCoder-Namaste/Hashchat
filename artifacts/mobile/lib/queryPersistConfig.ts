type QueryKey = readonly unknown[];
type QueryLike = {
  queryKey: QueryKey;
  state: { status: string };
};

const MAX_FEED_ITEMS = 60;
const MAX_CONVERSATIONS = 50;
const MAX_THREAD_MESSAGES = 60;
const MAX_ROOM_MESSAGES = 60;

type Bounder = {
  match: (path: string, key: QueryKey) => boolean;
  bound: (data: unknown) => unknown;
};

function head<T>(arr: T[], n: number): T[] {
  return arr.length > n ? arr.slice(0, n) : arr;
}

function tail<T>(arr: T[], n: number): T[] {
  return arr.length > n ? arr.slice(arr.length - n) : arr;
}

const BOUNDERS: Bounder[] = [
  {
    match: (path) => path === "/api/discover/foryou",
    bound: (data) => {
      if (
        data &&
        typeof data === "object" &&
        Array.isArray((data as { items?: unknown }).items)
      ) {
        const obj = data as { items: unknown[] };
        return { ...obj, items: head(obj.items, MAX_FEED_ITEMS) };
      }
      return data;
    },
  },
  {
    match: (path) => path === "/api/conversations",
    bound: (data) =>
      Array.isArray(data) ? head(data, MAX_CONVERSATIONS) : data,
  },
  {
    match: (path) => /^\/api\/conversations\/\d+\/messages$/.test(path),
    bound: (data) =>
      Array.isArray(data) ? tail(data, MAX_THREAD_MESSAGES) : data,
  },
  {
    match: (path) => /^\/api\/rooms\/[^/]+\/messages$/.test(path),
    bound: (data) =>
      Array.isArray(data) ? tail(data, MAX_ROOM_MESSAGES) : data,
  },
];

function pathFromKey(key: QueryKey): string | null {
  if (Array.isArray(key) && typeof key[0] === "string") return key[0];
  return null;
}

function findBounder(key: QueryKey): Bounder | null {
  const path = pathFromKey(key);
  if (!path) return null;
  for (const b of BOUNDERS) if (b.match(path, key)) return b;
  return null;
}

export function shouldDehydrateQuery(query: QueryLike): boolean {
  if (query.state.status !== "success") return false;
  return findBounder(query.queryKey) !== null;
}

export function boundQueryData(key: QueryKey, data: unknown): unknown {
  const b = findBounder(key);
  return b ? b.bound(data) : data;
}
