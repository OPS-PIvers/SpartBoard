// Copied by utils/pronunciation/fitSpeakToDoc.ts; tests/pronunciation/fitSpeakToDocParity.test.ts keeps them equal.

// Firestore refuses a document over 1 MiB; a set copied into a session doc also carries that doc's own fields.
export const SPEAK_DOC_BUDGET_BYTES = 900 * 1024;

const SPEAK_DIALECTS: Record<string, readonly string[]> = {
  es: ['es-419', 'es-ES'],
  de: ['de-DE'],
  en: ['en-US'],
};

const encoder = new TextEncoder();
const strBytes = (s: string): number => encoder.encode(s).length + 1;

/** Firestore's storage size for a value (strings UTF-8 + 1, numbers 8, map keys as strings). */
export function firestoreBytes(value: unknown): number {
  if (value === undefined) return 0;
  if (value === null || typeof value === 'boolean') return 1;
  if (typeof value === 'number') return 8;
  if (typeof value === 'string') return strBytes(value);
  if (Array.isArray(value)) {
    return value.reduce<number>((n, v) => n + firestoreBytes(v), 0);
  }
  if (value instanceof Date) return 8;
  if (typeof value === 'object') {
    let n = 0;
    for (const [k, v] of Object.entries(value)) {
      if (v === undefined) continue;
      n += strBytes(k) + firestoreBytes(v);
    }
    return n;
  }
  return 0;
}

type SpeakRecord = Record<string, unknown>;

const isRecord = (v: unknown): v is SpeakRecord =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const refsOf = (speak: SpeakRecord): SpeakRecord[] =>
  Array.isArray(speak.refs) ? speak.refs.filter(isRecord) : [];

const withoutVoices = (speak: SpeakRecord): SpeakRecord => {
  const refs = refsOf(speak);
  const kept = refs.filter((ref) => ref.source !== 'voice');
  return kept.length === refs.length ? speak : { ...speak, refs: kept };
};

const withoutSpans = (speak: SpeakRecord): SpeakRecord => {
  const refs = refsOf(speak);
  if (!refs.some((ref) => ref.letterSpans !== undefined)) return speak;
  return {
    ...speak,
    refs: refs.map((ref) =>
      Object.fromEntries(
        Object.entries(ref).filter(([key]) => key !== 'letterSpans')
      )
    ),
  };
};

// The accents a stub counts as looked up, so the next save doesn't look it up (and shed it) again.
const coveredDialects = (speak: SpeakRecord): string[] => {
  if (Array.isArray(speak.dialects)) {
    return speak.dialects.filter((d): d is string => typeof d === 'string');
  }
  const language = refsOf(speak)
    .map((ref) => (typeof ref.dialect === 'string' ? ref.dialect : ''))
    .find(Boolean)
    ?.split('-')[0];
  return [...((language && SPEAK_DIALECTS[language]) ?? [])];
};

const asStub = (speak: SpeakRecord): SpeakRecord => {
  if (refsOf(speak).length === 0) return speak;
  const { term, g2pVersion, ipaOverride } = speak;
  return {
    term,
    refs: [],
    g2pVersion,
    status: 'unavailable',
    dialects: coveredDialects(speak),
    ...(ipaOverride !== undefined ? { ipaOverride } : {}),
  };
};

// Voice readings go first (extra accepted readings), then letter highlights, then a card's references.
const TIERS = [withoutVoices, withoutSpans, asStub];

/** Sheds Speak data from the last cards first until the document fits; returns `set` itself when it already does. */
export function fitSpeakToDoc<T extends { cards: unknown[] }>(
  path: string,
  set: T,
  budget = SPEAK_DOC_BUDGET_BYTES
): T {
  let over = strBytes(path) + 32 + firestoreBytes(set) - budget;
  if (over <= 0) return set;
  const cards = [...set.cards];
  for (const shed of TIERS) {
    for (let i = cards.length - 1; i >= 0 && over > 0; i--) {
      const card = cards[i];
      if (!isRecord(card) || !isRecord(card.speak)) continue;
      const next = shed(card.speak);
      if (next === card.speak) continue;
      over -= firestoreBytes(card.speak) - firestoreBytes(next);
      cards[i] = { ...card, speak: next };
    }
    if (over <= 0) break;
  }
  return { ...set, cards };
}
