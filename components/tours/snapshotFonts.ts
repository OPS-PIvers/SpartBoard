// Web-font CSS for html-to-image built off to the side, so a picture never writes rules into the page's own stylesheets.

/** The @font-face blocks in a stylesheet's text. */
export const fontFaceBlocks = (css: string): string[] =>
  css.match(/@font-face\s*\{[^}]*\}/g) ?? [];

const familyOf = (block: string): string | null =>
  /font-family:\s*['"]?([^'";]+?)['"]?\s*;/.exec(block)?.[1] ?? null;

/** A font-weight in one spelling, so a CSS block and a loaded FontFace compare equal. */
export const normalizeWeight = (weight: string): string =>
  weight
    .trim()
    .toLowerCase()
    .replace(/\bnormal\b/g, '400')
    .replace(/\bbold\b/g, '700')
    .replace(/\s+/g, ' ');

const weightOf = (block: string): string =>
  normalizeWeight(/font-weight:\s*([^;]+);/.exec(block)?.[1] ?? '400');

const styleOf = (block: string): string =>
  (/font-style:\s*([^;]+);/.exec(block)?.[1] ?? 'normal').trim().toLowerCase();

const FETCH_TIMEOUT_MS = 8000;

/** A unicode-range in one spelling, since the browser rewrites `U+0000-00FF` as `U+0-FF`. */
export const normalizeRange = (range: string): string =>
  range
    .split(',')
    .map((part) => {
      const m = /^\s*U\+([0-9A-F?]+)(?:-([0-9A-F]+))?\s*$/i.exec(part);
      if (!m) return part.trim().toUpperCase();
      const lo = m[1].replace(/\?/g, '0');
      const hi = m[2] ?? (m[1].includes('?') ? m[1].replace(/\?/g, 'F') : '');
      const a = parseInt(lo, 16).toString(16);
      return hi ? `${a}-${parseInt(hi, 16).toString(16)}` : a;
    })
    .join(',');

const rangeOf = (block: string): string =>
  normalizeRange(/unicode-range:\s*([^;]+);/.exec(block)?.[1] ?? 'U+0-10FFFF');

const urlsOf = (block: string): string[] =>
  [...block.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)].map((m) => m[1]);

/** Family, weight, style and unicode range of every face the page has actually loaded. */
export function loadedFaceKeys(fonts: Iterable<FontFace>): Set<string> {
  const keys = new Set<string>();
  for (const face of fonts) {
    if (face.status !== 'loaded') continue;
    const family = face.family.replace(/^['"]|['"]$/g, '');
    keys.add(
      `${family}|${normalizeWeight(face.weight)}|${face.style.toLowerCase()}|${normalizeRange(face.unicodeRange)}`
    );
  }
  return keys;
}

/** The blocks for faces the page has loaded; the rest would only add weight. */
export const usedFontFaceBlocks = (
  blocks: readonly string[],
  loaded: ReadonlySet<string>
): string[] =>
  blocks.filter((b) => {
    const family = familyOf(b);
    return (
      !!family &&
      loaded.has(`${family}|${weightOf(b)}|${styleOf(b)}|${rangeOf(b)}`)
    );
  });

const dataUrls = new Map<string, Promise<string>>();

const toDataUrl = (url: string): Promise<string> => {
  let pending = dataUrls.get(url);
  if (!pending) {
    pending = fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
      .then((res) => {
        if (!res.ok) throw new Error(`Font ${res.status}`);
        return res.blob();
      })
      .then(
        (blob) =>
          new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () =>
              typeof reader.result === 'string'
                ? resolve(reader.result)
                : reject(new Error('Font'));
            reader.onerror = () => reject(reader.error ?? new Error('Font'));
            reader.readAsDataURL(blob);
          })
      );
    // A failed font is retried on the next picture.
    pending.catch(() => dataUrls.delete(url));
    dataUrls.set(url, pending);
  }
  return pending;
};

/** The blocks with each font file inlined; a face whose file fails is left out. */
export async function inlineFontBlocks(
  blocks: readonly string[]
): Promise<string> {
  const inlined = await Promise.all(
    blocks.map(async (block) => {
      try {
        let out = block;
        for (const url of urlsOf(block)) {
          out = out.split(url).join(await toDataUrl(url));
        }
        return out;
      } catch {
        return '';
      }
    })
  );
  return inlined.filter(Boolean).join('\n');
}

const sheetText = new Map<string, Promise<string>>();

const loadSheet = (href: string): Promise<string> => {
  let pending = sheetText.get(href);
  if (!pending) {
    pending = fetch(href, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    }).then((res) => {
      if (!res.ok) throw new Error(`Font sheet ${res.status}`);
      return res.text();
    });
    pending.catch(() => sheetText.delete(href));
    sheetText.set(href, pending);
  }
  return pending;
};

/** A block with each relative `url()` made absolute against its sheet, so it still resolves inside the picture. */
export const absoluteUrls = (block: string, base: string): string =>
  block.replace(
    /url\(\s*(['"]?)([^'")]+)\1\s*\)/g,
    (whole: string, q: string, url: string) => {
      if (/^(data|blob):/i.test(url)) return whole;
      try {
        return `url(${q}${new URL(url, base).href}${q})`;
      } catch {
        return whole;
      }
    }
  );

/** @font-face blocks from the page's own readable sheets (MathLive and other same-origin fonts), read without touching them. */
const sameOriginFontBlocks = (doc: Document): string[] => {
  const out: string[] = [];
  for (const sheet of Array.from(doc.styleSheets)) {
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      continue;
    }
    const base = sheet.href ?? doc.baseURI;
    for (const rule of Array.from(rules)) {
      if (
        typeof CSSFontFaceRule !== 'undefined' &&
        rule instanceof CSSFontFaceRule
      ) {
        out.push(absoluteUrls(rule.cssText, base));
      }
    }
  }
  return out;
};

/** Embed CSS for the web fonts in use; empty when none can be read, so a picture falls back to system fonts. */
export async function snapshotFontEmbedCss(doc: Document): Promise<string> {
  try {
    const hrefs = [
      ...doc.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"][href]'),
    ]
      .map((l) => l.href)
      .filter((h) => /^https:\/\/fonts\.googleapis\.com\//.test(h));
    const texts = await Promise.all(hrefs.map(loadSheet));
    const loaded = loadedFaceKeys(doc.fonts);
    const used = usedFontFaceBlocks(
      [
        ...texts.flatMap((t, i) =>
          fontFaceBlocks(t).map((b) => absoluteUrls(b, hrefs[i]))
        ),
        ...sameOriginFontBlocks(doc),
      ],
      loaded
    );
    return await inlineFontBlocks(used);
  } catch {
    return '';
  }
}
