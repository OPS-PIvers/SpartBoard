const WORD = /[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu;

interface Token {
  word: string;
  /** Lower-cased word, for matching. */
  key: string;
  /** Punctuation and spacing that followed the word. */
  after: string;
}

function tokens(text: string): { lead: string; list: Token[] } {
  const list: Token[] = [];
  let lead = '';
  let last = 0;
  for (const m of text.matchAll(WORD)) {
    const gap = text.slice(last, m.index);
    if (list.length === 0) lead = gap;
    else list[list.length - 1].after = gap;
    list.push({ word: m[0], key: m[0].toLowerCase(), after: '' });
    last = m.index + m[0].length;
  }
  if (list.length > 0) list[list.length - 1].after = text.slice(last);
  return { lead, list };
}

/** True when a transcript came back with no punctuation of its own. */
export const lacksPunctuation = (text: string): boolean =>
  !/[.,!?;:…。]/u.test(text);

/** Gives an unpunctuated transcript the punctuation and capitals of the text it replaces, wherever the words line up. */
export function carryPunctuation(previous: string, next: string): string {
  const a = tokens(previous);
  const b = tokens(next);
  if (b.list.length === 0) return next;
  const n = a.list.length;
  const m = b.list.length;
  const lcs: number[][] = Array.from({ length: n + 1 }, () =>
    new Array<number>(m + 1).fill(0)
  );
  for (let i = n - 1; i >= 0; i -= 1)
    for (let j = m - 1; j >= 0; j -= 1)
      lcs[i][j] =
        a.list[i].key === b.list[j].key
          ? lcs[i + 1][j + 1] + 1
          : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a.list[i].key === b.list[j].key) {
      const from = a.list[i];
      const to = b.list[j];
      if (from.word[0] !== from.word[0].toLowerCase())
        to.word = to.word[0].toUpperCase() + to.word.slice(1);
      const isLast = j === m - 1;
      to.after = isLast ? from.after : from.after.trim() ? from.after : ' ';
      i += 1;
      j += 1;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) i += 1;
    else j += 1;
  }
  return (
    a.lead +
    b.list
      .map((t, k) => t.word + (t.after || (k === m - 1 ? '' : ' ')))
      .join('')
  );
}
