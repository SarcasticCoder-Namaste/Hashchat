export function normalizeTag(input: string): string {
  return input
    .replace(/^#+/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 32);
}
