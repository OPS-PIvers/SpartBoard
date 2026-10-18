// Average advance of a black-weight glyph, in em; errs wide so wrapped labels never overflow.
const CHAR_EM = 0.66;
const LINE_EM = 1.3;
const MAX_LINES = 20;
/** Icon edge as a multiple of the label font size (keeps the default 38cqmin icon at 9cqmin text). */
export const ICON_PER_FONT = 4.3;

/** Lines a label takes when wrapped at `capacity` characters, breaking over-long words. */
export function wrapLineCount(words: string[], capacity: number): number {
  let lines = 1;
  let used = 0;
  for (const word of words) {
    const len = word.length;
    if (len === 0) continue;
    const need = used === 0 ? len : used + 1 + len;
    if (need <= capacity) {
      used = need;
      continue;
    }
    if (used > 0) lines++;
    lines += Math.ceil(len / capacity) - 1;
    used = len % capacity || capacity;
  }
  return lines;
}

/** For each line count, the narrowest characters-per-line that wraps the label into it. */
export function wrapOptions(
  label: string
): { lines: number; capacity: number }[] {
  const words = label.trim().split(/\s+/).filter(Boolean);
  const total = words.reduce((n, w) => n + w.length, 0) + words.length - 1;
  if (total <= 0) return [{ lines: 1, capacity: 1 }];
  const options: { lines: number; capacity: number }[] = [];
  let prev = Infinity;
  for (let lines = 1; lines <= MAX_LINES; lines++) {
    let lo = 1;
    let hi = total;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (wrapLineCount(words, mid) <= lines) hi = mid;
      else lo = mid + 1;
    }
    if (lo < prev) options.push({ lines, capacity: lo });
    prev = lo;
    if (lo === 1) break;
  }
  return options;
}

/** CSS font size that fits the whole label inside its tile, capped at the usual tile size. */
export function linkLabelFontSize(
  label: string,
  opts: { withIcon: boolean; circle: boolean }
): string {
  // A round tile loses about 30% of its short side to the curve.
  const inset = opts.circle ? ' - 30cqmin' : '';
  const width = `(100cqw${inset} - ${opts.withIcon ? 3 : 10}cqmin)`;
  const height = `(96cqh${inset} - ${opts.withIcon ? 1.5 : 8}cqmin)`;
  const fits = wrapOptions(label).map(({ lines, capacity }) => {
    const byWidth = `calc(${width} / ${round(capacity * CHAR_EM)})`;
    const textH = round(lines * LINE_EM);
    const byHeight = opts.withIcon
      ? `max(calc((${height} - 38cqmin) / ${textH}), calc(${height} / ${round(textH + ICON_PER_FONT)}))`
      : `calc(${height} / ${textH})`;
    return `min(${byWidth}, ${byHeight})`;
  });
  return `min(clamp(11px, 9cqmin, 28px), max(${fits.join(', ')}))`;
}

const round = (n: number) => Math.round(n * 1000) / 1000;
