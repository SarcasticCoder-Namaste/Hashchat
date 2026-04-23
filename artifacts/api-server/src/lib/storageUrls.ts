/**
 * Validate that a URL persisted by the API references an object we minted via
 * /storage/uploads/request-url, not an arbitrary external URL.
 *
 * Persisted URLs look like `${basePath}/objects/<uuid>` where basePath is the
 * artifact prefix (possibly empty). We accept any path that ends with
 * `/objects/<id>` (id is alphanumerics/dashes/underscores).
 */
export function isValidStorageUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return /^(\/[A-Za-z0-9_-]+)*\/objects\/[A-Za-z0-9_-]+$/.test(url);
}
