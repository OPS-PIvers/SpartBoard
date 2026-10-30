// Decodes the few HTML entities page readers need, shared by link previews and page import.
export function decodeHtmlEntities(value: string): string {
  const named: Record<string, string> = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
  };
  // Single pass so `&amp;lt;` decodes to `&lt;`, never to `<`.
  return value.replace(
    /&(?:(amp|lt|gt|quot)|#x([0-9a-f]+)|#(\d+));/gi,
    (match, name: string | undefined, hex?: string, dec?: string) => {
      if (name) return named[name.toLowerCase()] ?? match;
      const code = hex ? parseInt(hex, 16) : parseInt(dec ?? '', 10);
      if (!Number.isFinite(code) || code > 0x10ffff) return match;
      return String.fromCodePoint(code);
    }
  );
}
