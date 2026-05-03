export type FeedFocusController = {
  count: () => number;
  getId: (idx: number) => string | null;
  scrollToIndex: (idx: number) => void;
};

let active: FeedFocusController | null = null;
let focusedIdx = -1;

export function registerFeedFocusController(
  controller: FeedFocusController,
): () => void {
  active = controller;
  focusedIdx = -1;
  return () => {
    if (active === controller) {
      active = null;
      focusedIdx = -1;
    }
  };
}

function clearFocusAttrs(): void {
  document
    .querySelectorAll<HTMLElement>('[data-feed-item][data-feed-focused="true"]')
    .forEach((el) => {
      delete el.dataset.feedFocused;
    });
}

function applyFocusToId(id: string): void {
  clearFocusAttrs();
  const el = document.querySelector<HTMLElement>(
    `[data-feed-item][data-feed-item-id="${CSS.escape(id)}"]`,
  );
  if (el) {
    el.dataset.feedFocused = "true";
    el.scrollIntoView({ block: "center", behavior: "smooth" });
  }
}

function applyFocusFromActive(idx: number, attempts = 0): void {
  if (!active) return;
  const id = active.getId(idx);
  if (!id) return;
  const el = document.querySelector<HTMLElement>(
    `[data-feed-item][data-feed-item-id="${CSS.escape(id)}"]`,
  );
  if (el) {
    clearFocusAttrs();
    el.dataset.feedFocused = "true";
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    return;
  }
  if (attempts >= 8) return;
  requestAnimationFrame(() => applyFocusFromActive(idx, attempts + 1));
}

function fallbackDomItems(): HTMLElement[] {
  return Array.from(
    document.querySelectorAll<HTMLElement>("[data-feed-item]"),
  );
}

function fallbackFocusedIndex(items: HTMLElement[]): number {
  return items.findIndex((el) => el.dataset.feedFocused === "true");
}

export function moveFeedFocus(delta: 1 | -1): void {
  if (active) {
    const n = active.count();
    if (n === 0) return;
    const next =
      focusedIdx < 0
        ? delta === 1
          ? 0
          : n - 1
        : Math.max(0, Math.min(n - 1, focusedIdx + delta));
    focusedIdx = next;
    active.scrollToIndex(next);
    requestAnimationFrame(() => applyFocusFromActive(next));
    return;
  }
  // Fallback: pure DOM, used if no controller is registered.
  const items = fallbackDomItems();
  if (items.length === 0) return;
  const idx = fallbackFocusedIndex(items);
  let next: number;
  if (idx < 0) {
    next = delta === 1 ? 0 : items.length - 1;
  } else {
    next = Math.max(0, Math.min(items.length - 1, idx + delta));
  }
  const target = items[next];
  const id = target.dataset.feedItemId;
  if (id) applyFocusToId(id);
}

export function openFeedFocused(navigate: (path: string) => void): void {
  if (active) {
    const n = active.count();
    if (n === 0) return;
    const idx = focusedIdx < 0 ? 0 : focusedIdx;
    const id = active.getId(idx);
    if (id) navigate(`/app/post/${id}`);
    return;
  }
  const items = fallbackDomItems();
  const idx = fallbackFocusedIndex(items);
  const el = idx >= 0 ? items[idx] : items[0];
  if (!el) return;
  const id = el.dataset.feedItemId;
  if (id) navigate(`/app/post/${id}`);
}
