// Server copy of findStudentData's roster-free patterns in components/tours/web/studentData.ts; tests/webTourStudentDataSync.test.ts keeps them in step.
export type WebTourTextHit = 'email' | 'id-number' | 'uuid' | 'possible-name';

const EMAIL_RE = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+/gu;
const ID_RE =
  /(?<![\p{L}\p{N}])(?:\d{5,}|\(?\d{3}\)?[ .-]?\d{3}[ .-]\d{4})(?![\p{L}\p{N}])/gu;
const UUID_RE =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/giu;
const LAST_FIRST_RE =
  /(?<![\p{L}])\p{Lu}[\p{Ll}'-]+(?:[ -]\p{Lu}[\p{Ll}'-]+)?, \p{Lu}[\p{Ll}'-]+(?: \p{Lu}\.?)?(?![\p{L}])/gu;

const PATTERNS: [RegExp, WebTourTextHit][] = [
  [EMAIL_RE, 'email'],
  [UUID_RE, 'uuid'],
  [ID_RE, 'id-number'],
  [LAST_FIRST_RE, 'possible-name'],
];

/** The kinds of student data the text seems to hold; every kind but possible-name blocks publishing. */
export function webTourTextHits(text: string): Set<WebTourTextHit> {
  const out = new Set<WebTourTextHit>();
  if (!text) return out;
  for (const [re, kind] of PATTERNS) if (text.match(re)) out.add(kind);
  return out;
}

export const isHardTextHit = (kind: WebTourTextHit): boolean =>
  kind !== 'possible-name';
