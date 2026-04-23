export const ONLINE_WINDOW_MS = 5 * 60 * 1000;

export function isOnline(lastSeenAt: string | Date | null | undefined): boolean {
  if (!lastSeenAt) return false;
  const t = lastSeenAt instanceof Date ? lastSeenAt.getTime() : new Date(lastSeenAt).getTime();
  if (!Number.isFinite(t)) return false;
  return Date.now() - t < ONLINE_WINDOW_MS;
}

export function formatHandle(username: string, discriminator: string | null | undefined): string {
  if (!discriminator) return `@${username}`;
  return `@${username} #${discriminator}`;
}
