export const PRESENCE_ONLINE_MS = 60 * 1000;
export const PRESENCE_AWAY_MS = 10 * 60 * 1000;

export type PresenceState = "online" | "away" | "offline";

export function presenceStateFor(
  lastSeenAt: Date | string | null | undefined,
  hidePresence: boolean | null | undefined,
): PresenceState {
  if (hidePresence) return "offline";
  if (!lastSeenAt) return "offline";
  const t =
    lastSeenAt instanceof Date
      ? lastSeenAt.getTime()
      : new Date(lastSeenAt).getTime();
  if (!Number.isFinite(t)) return "offline";
  const age = Date.now() - t;
  if (age < PRESENCE_ONLINE_MS) return "online";
  if (age < PRESENCE_AWAY_MS) return "away";
  return "offline";
}

export function publicLastSeenAt(
  lastSeenAt: Date,
  hidePresence: boolean | null | undefined,
): string {
  if (hidePresence) return new Date(0).toISOString();
  return lastSeenAt.toISOString();
}

export function publicCurrentRoom(
  currentRoomTag: string | null | undefined,
  lastSeenAt: Date | string | null | undefined,
  hidePresence: boolean | null | undefined,
): string | null {
  if (hidePresence) return null;
  if (!currentRoomTag) return null;
  const state = presenceStateFor(lastSeenAt, hidePresence);
  if (state === "offline") return null;
  return currentRoomTag;
}
