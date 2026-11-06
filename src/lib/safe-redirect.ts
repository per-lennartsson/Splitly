/**
 * Returns `raw` if it is a same-site path (e.g. "/claim/abc"), else `fallback`.
 * Rejects absolute and protocol-relative URLs ("//evil.com", "/\\evil.com") to avoid open redirects.
 */
export function safeNextPath(raw: string | null | undefined, fallback = "/households"): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return fallback;
  return raw;
}
