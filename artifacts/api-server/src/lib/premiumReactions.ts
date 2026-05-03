export const PREMIUM_REACTIONS: string[] = [
  "🪙",
  "💎",
  "👑",
  "🚀",
  "✨",
  "🌟",
  "💫",
  "🦄",
  "🌈",
  "🎯",
  "💯",
  "🏆",
];

export function isPremiumReaction(emoji: string): boolean {
  return PREMIUM_REACTIONS.includes(emoji);
}
