export const PRESENCE_ONLINE_MS = 60 * 1000;
export const PRESENCE_AWAY_MS = 10 * 60 * 1000;

export type PresenceState = "online" | "away" | "offline";

function toMs(lastSeenAt: string | Date | null | undefined): number | null {
  if (!lastSeenAt) return null;
  const t =
    lastSeenAt instanceof Date
      ? lastSeenAt.getTime()
      : new Date(lastSeenAt).getTime();
  if (!Number.isFinite(t) || t <= 0) return null;
  return t;
}

export function getPresenceState(
  lastSeenAt: string | Date | null | undefined,
  explicit?: PresenceState | null,
): PresenceState {
  if (explicit) return explicit;
  const t = toMs(lastSeenAt);
  if (t == null) return "offline";
  const age = Date.now() - t;
  if (age < PRESENCE_ONLINE_MS) return "online";
  if (age < PRESENCE_AWAY_MS) return "away";
  return "offline";
}

export function isOnline(lastSeenAt: string | Date | null | undefined): boolean {
  return getPresenceState(lastSeenAt) === "online";
}

export function formatLastSeen(
  lastSeenAt: string | Date | null | undefined,
  state?: PresenceState | null,
): string {
  const s = state ?? getPresenceState(lastSeenAt);
  if (s === "online") return "Active now";
  const t = toMs(lastSeenAt);
  if (t == null) return "Offline";
  const ageMin = Math.max(1, Math.floor((Date.now() - t) / 60000));
  if (ageMin < 60) return `Active ${ageMin}m ago`;
  const ageH = Math.floor(ageMin / 60);
  if (ageH < 24) return `Active ${ageH}h ago`;
  const ageD = Math.floor(ageH / 24);
  return `Active ${ageD}d ago`;
}

export function formatHandle(
  username: string,
  discriminator: string | null | undefined,
): string {
  if (!discriminator) return `@${username}`;
  return `@${username} #${discriminator}`;
}
