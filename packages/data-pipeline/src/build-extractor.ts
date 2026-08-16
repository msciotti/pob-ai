// Matches pobb.in URLs and pastebin.com URLs.
// Note: These regexes are stateful (global flag) — they must be reset before each use via exec,
// or we create fresh RegExp instances per call. We use the pattern-only approach and test() / match().
const POBBIN_URL_PATTERN = /https?:\/\/pobb\.in\/([a-zA-Z0-9_-]+)/;
const PASTEBIN_URL_PATTERN = /https?:\/\/pastebin\.com\/([a-zA-Z0-9]{8})\b/;

/**
 * Extract the first pobb.in or pastebin.com URL from a block of text.
 * Returns the full URL, or null if none found.
 * Prefers pobb.in links over pastebin since they resolve directly to build codes.
 */
export function extractPobSource(text: string): string | null {
  // Prefer pobb.in full URLs
  const pobMatch = POBBIN_URL_PATTERN.exec(text);
  if (pobMatch) return pobMatch[0];

  const pasteMatch = PASTEBIN_URL_PATTERN.exec(text);
  if (pasteMatch) return pasteMatch[0];

  return null;
}

/**
 * Quick check whether the text contains any known build-sharing link.
 * Used to filter posts before the more expensive URL extraction.
 */
export function hasPobLink(text: string): boolean {
  return /pobb\.in\/|pastebin\.com\//.test(text);
}
