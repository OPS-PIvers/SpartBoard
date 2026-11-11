// HTML-to-text helpers for MDE item markup. No dependencies.
const SUB = '₀₁₂₃₄₅₆₇₈₉';
const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';

export const decode = (s) =>
  s
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, '’')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&deg;/g, '°')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, '&');

/** Visible text of an HTML fragment, one block per line. */
export const text = (html) =>
  decode(
    html
      .replace(/<sub>(\d+)<\/sub>/g, (_, d) =>
        [...d].map((c) => SUB[Number(c)]).join('')
      )
      .replace(/<sup>(\d+)<\/sup>/g, (_, d) =>
        [...d].map((c) => SUP[Number(c)]).join('')
      )
      .replace(/<img[^>]*>/g, ' ')
      .replace(/<\/(div|p|li|tr)>|<br\s*\/?>/g, '\n')
      .replace(/<\/(td|th)>/g, ' | ')
      .replace(/<[^>]+>/g, '')
  )
    .split('\n')
    .map((l) =>
      l
        .replace(/\s+/g, ' ')
        .replace(/\s+([.,;:?!%)])/g, '$1')
        .replace(/\(\s+/g, '(')
        .trim()
    )
    .filter(Boolean)
    .join('\n');

export const oneLine = (html) => text(html).replace(/\n/g, ' ');

/** Ids of the pictures an item or tab pulls from MDE's resource endpoint, in order. */
export const imageIds = (html) => [
  ...html.matchAll(/itemresource\?TableID=([0-9a-f-]+)/gi),
].map((m) => m[1]);

/** Alt text of each `<img>`, in order, decoded. */
export const imageAlts = (html) =>
  [...html.matchAll(/<img[^>]*alt="([^"]*)"/g)].map((m) => decode(m[1]).trim());

/** Each `<img>` as `{ id, alt }`, in order. */
export const imagesOf = (html) =>
  [...html.matchAll(/<img[^>]*>/g)].map((m) => ({
    id: /itemresource\?TableID=([0-9a-f-]+)/i.exec(m[0])?.[1] ?? '',
    alt: decode(/alt="([^"]*)"/.exec(m[0])?.[1] ?? '').trim(),
  }));

export const slug = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
