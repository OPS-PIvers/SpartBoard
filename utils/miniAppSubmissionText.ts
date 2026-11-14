// Plain-language text for a Mini App's free-form result values.
export type Plain = Record<string, unknown>;

export const isPlain = (v: unknown): v is Plain =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** "correctAnswers" and "time_spent" read as "Correct answers" and "Time spent". */
export const humanizeKey = (key: string): string => {
  const words = key
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z\d])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .trim()
    .toLowerCase();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : key;
};

const isPrimitive = (v: unknown): boolean =>
  v === null || ['string', 'number', 'boolean', 'undefined'].includes(typeof v);

/** One value as short text, or null when it needs rows or a table. */
export const primitiveText = (v: unknown): string | null => {
  if (v === null || v === undefined || v === '') return '–';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (typeof v === 'number')
    return Number.isFinite(v)
      ? String(Number(v.toFixed(Math.abs(v) < 1 ? 4 : 2)))
      : String(v);
  if (typeof v === 'string') return v;
  if (Array.isArray(v) && v.every(isPrimitive))
    return v.length === 0 ? 'None' : v.map((x) => primitiveText(x)).join(', ');
  return null;
};

/** A one-line reading of an answer that is not plain text. */
export const answerSummary = (answer: unknown): string => {
  const text = primitiveText(answer);
  if (text !== null) return text;
  if (Array.isArray(answer)) return answer.map(answerSummary).join('; ');
  if (isPlain(answer))
    return Object.entries(answer)
      .map(([k, v]) => `${humanizeKey(k)}: ${answerSummary(v)}`)
      .join(', ');
  return '–';
};
