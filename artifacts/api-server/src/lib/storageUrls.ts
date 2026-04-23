/**
 * Validate that a URL persisted by the API references an object we minted via
 * /storage/uploads/request-url, not an arbitrary external URL.
 *
 * Persisted URLs look like `${basePath}/objects/<...path>` where:
 *   - `basePath` is the artifact prefix (possibly empty, e.g. "/social"),
 *   - `<...path>` is one or more path segments produced by the storage layer,
 *     typically `uploads/<uuid>` (so `/objects/uploads/<uuid>`).
 *
 * We accept any path that contains an `/objects/` segment followed by one or
 * more `[A-Za-z0-9_-]` segments. We deliberately reject schemes (`http:`,
 * `data:`, `javascript:`, etc.) by requiring the string to start with `/`.
 */
export function isValidStorageUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return /^(\/[A-Za-z0-9_-]+)*\/objects(\/[A-Za-z0-9_-]+)+$/.test(url);
}
