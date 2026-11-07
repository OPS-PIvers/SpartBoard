// Equations in question text are stored as plain math between ⟦ and ⟧, e.g. "Solve ⟦(x+1)/2=3⟧".
export const PROMPT_MATH_OPEN = '⟦';
export const PROMPT_MATH_CLOSE = '⟧';

const PROMPT_MATH_RE = /⟦([^⟦⟧]*)⟧/g;

export type PromptPart =
  | { kind: 'text'; text: string }
  | { kind: 'math'; math: string; start: number; end: number };

export const hasPromptMath = (text: string): boolean =>
  text.includes(PROMPT_MATH_OPEN) && /⟦[^⟦⟧]*⟧/.test(text);

/** Text and equation runs in order; `start`/`end` locate an equation's markers in the text. */
export function splitPromptMath(text: string): PromptPart[] {
  const parts: PromptPart[] = [];
  let last = 0;
  for (const m of text.matchAll(PROMPT_MATH_RE)) {
    const start = m.index ?? 0;
    if (start > last)
      parts.push({ kind: 'text', text: text.slice(last, start) });
    const end = start + m[0].length;
    parts.push({ kind: 'math', math: m[1] ?? '', start, end });
    last = end;
  }
  if (last < text.length) parts.push({ kind: 'text', text: text.slice(last) });
  return parts;
}

/** Question text with each equation as its plain math, for lists, exports and titles. */
export const plainPromptText = (text: string): string =>
  text.replace(PROMPT_MATH_RE, '$1');

export const wrapPromptMath = (math: string): string =>
  `${PROMPT_MATH_OPEN}${math.replace(/[⟦⟧]/g, '')}${PROMPT_MATH_CLOSE}`;
