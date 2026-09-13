/** Cache key for one free-response back-translation (plan §6): SHA-256 hex over the answer text and its locale. */
export async function backTranslationCacheKey(
  text: string,
  locale: string
): Promise<string> {
  // Length-prefixed locale: both halves are client-asserted, so no delimiter alone is collision-proof.
  const bytes = new TextEncoder().encode(`${locale.length}:${locale}${text}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Absent and English-family locales are never back-translated. */
export function isBackTranslatableLocale(locale?: string): boolean {
  const tag = locale?.trim().toLowerCase() ?? '';
  if (!tag) return false;
  return tag !== 'en' && !tag.startsWith('en-');
}
