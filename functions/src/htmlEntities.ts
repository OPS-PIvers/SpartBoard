// Decodes the HTML entities page readers meet in text, shared by link previews and page import.
const NAMED: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  hellip: '…',
  bull: '•',
  middot: '·',
  copy: '©',
  reg: '®',
  trade: '™',
  laquo: '«',
  raquo: '»',
  times: '×',
  divide: '÷',
  deg: '°',
};

export function decodeHtmlEntities(value: string): string {
  // Single pass so `&amp;lt;` decodes to `&lt;`, never to `<`.
  return value.replace(
    /&(?:([a-z]+)|#x([0-9a-f]+)|#(\d+));/gi,
    (match, name: string | undefined, hex?: string, dec?: string) => {
      if (name) {
        const key = name.toLowerCase();
        return Object.hasOwn(NAMED, key) ? NAMED[key] : match;
      }
      const code = hex ? parseInt(hex, 16) : parseInt(dec ?? '', 10);
      const valid =
        Number.isFinite(code) &&
        code > 0 &&
        code <= 0x10ffff &&
        (code < 0xd800 || code > 0xdfff);
      return valid ? String.fromCodePoint(code) : match;
    }
  );
}
