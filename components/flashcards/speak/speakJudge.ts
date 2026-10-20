// Speak player glue (plan §4.1, §4.5): judge one take, then turn the judgement into letter marks.
import type {
  FlashcardCard,
  FlashcardSpeakReference,
  FlashcardSpeakSettings,
  SpeakDialect,
  SpeakLanguage,
} from '@/types';
import { PRONUNCIATION_GROUPS } from '@/config/pronunciationGroups';
import { DEFAULT_UNCLEAR_CONFIDENCE } from '@/config/flashcardsSpeakAdmin';
import { parseFlashcardAnswerVariants } from '@/utils/flashcardMatch';
import {
  judgeSpeech,
  type SpeakJudgeEntry,
  type SpeakJudgement,
} from '@/utils/pronunciation/verdict';
import type { RecognizeResult } from '@/utils/pronunciation/recognizer';
import {
  DEFAULT_STRESS_CONFIG,
  detectStress,
  extractNuclei,
  isNucleus,
  measureNuclei,
} from '@/utils/pronunciation/stress';

/** The word Speak judges: the term's first variant, which `letterSpans` index into (F2). */
export const spokenWord = (card: FlashcardCard): string =>
  parseFlashcardAnswerVariants(card.speak?.term ?? card.term)[0] ?? card.term;

/** The card's references for the stamped dialects; every ref when none match. */
export function cardRefs(
  card: FlashcardCard,
  dialects: readonly SpeakDialect[]
): FlashcardSpeakReference[] {
  const refs = card.speak?.refs.filter((ref) => ref.tokens.length > 0) ?? [];
  const picked = refs.filter((ref) => dialects.includes(ref.dialect));
  const chosen = picked.length > 0 ? picked : refs;
  // R2: a disputed stress reading isn't judged until the teacher confirms it.
  const stressDisputed =
    card.speak?.status === 'needs-review' &&
    card.speak.reasons?.includes('stress-disagree') === true &&
    card.speak.confirmedAt === undefined;
  return stressDisputed
    ? chosen.map((ref) => ({ ...ref, stress: [] }))
    : chosen;
}

export interface JudgeTakeInput {
  card: FlashcardCard;
  result: RecognizeResult;
  language: SpeakLanguage;
  settings: Pick<FlashcardSpeakSettings, 'strict' | 'groups' | 'dialects'>;
  unclearConfidence?: number;
}

export function judgeTake({
  card,
  result,
  language,
  settings,
  unclearConfidence,
}: JudgeTakeInput): SpeakJudgement {
  const refs = cardRefs(card, settings.dialects);
  const spoken = result.tokens.map((token) => token.symbol);
  return judgeSpeech({
    refs,
    spoken,
    confidence: result.confidence,
    voicedMs: result.voicedMs,
    language,
    settings,
    // A stamp written before the cut-off was stamped, or a malformed one, uses the default.
    unclearConfidence:
      typeof unclearConfidence === 'number' &&
      unclearConfidence >= 0 &&
      unclearConfidence <= 1
        ? unclearConfidence
        : DEFAULT_UNCLEAR_CONFIDENCE,
    stressFor: (ref, alignment) => {
      const nuclei = extractNuclei(result.tokens, alignment);
      const found = detectStress({
        nuclei,
        measurements: measureNuclei(result.audio16k, nuclei),
        alignment,
        targetPhonemes: ref.tokens,
        // The detector counts syllables from 1; references store them from 0.
        accepted: ref.stress.map((index) => index + 1),
        config: { ...DEFAULT_STRESS_CONFIG, language },
      });
      return found ? found.detected - 1 : null;
    },
  });
}

export type SpeakMarkKind = 'correct' | 'changed' | 'missed' | 'extra';

export interface SpeakMark {
  id: string;
  kind: Exclude<SpeakMarkKind, 'correct'>;
  /** The sound the student should make (the extra sound for `extra`). */
  token: string;
  /** 0-based reference token the mark belongs to; an extra sound sits after it (-1 = before the word). */
  tokenIndex: number;
  forgiven: boolean;
  groupId?: string;
  emphasised: boolean;
}

const markKind = (entry: SpeakJudgeEntry): SpeakMark['kind'] | null => {
  if (entry.kind === 'correct' || entry.kind === 'held') return null;
  if (entry.kind === 'tolerated') return null;
  if (entry.status === 'omitted') return 'missed';
  if (entry.status === 'inserted') return 'extra';
  return 'changed';
};

/** §4.5: every non-correct sound, with at most two emphasised (errors before forgiven, consonants before vowels, then group order). */
export function speakMarks(
  judgement: SpeakJudgement,
  language: SpeakLanguage
): SpeakMark[] {
  const groupOrder = PRONUNCIATION_GROUPS[language].map((group) => group.id);
  const marks: SpeakMark[] = [];
  judgement.entries.forEach((entry, index) => {
    const kind = markKind(entry);
    if (!kind) return;
    const token =
      kind === 'extra' ? (entry.spokenIPA ?? '') : (entry.targetIPA ?? '');
    if (!token) return;
    marks.push({
      id: `${index}`,
      kind,
      token,
      tokenIndex: entry.position - 1,
      forgiven: entry.kind === 'forgiven',
      groupId: entry.groupId,
      emphasised: false,
    });
  });
  const rank = (mark: SpeakMark): number[] => {
    const group = mark.groupId ? groupOrder.indexOf(mark.groupId) : -1;
    return [
      mark.forgiven ? 1 : 0,
      isNucleus(mark.token) ? 1 : 0,
      group === -1 ? groupOrder.length : group,
      mark.tokenIndex,
    ];
  };
  const ordered = [...marks].sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    for (let i = 0; i < ra.length; i++) {
      if (ra[i] !== rb[i]) return ra[i] - rb[i];
    }
    return 0;
  });
  const hasError = marks.some((mark) => !mark.forgiven);
  const emphasised = new Set(
    ordered
      .filter((mark) => (hasError ? !mark.forgiven : true))
      .slice(0, 2)
      .map((mark) => mark.id)
  );
  return marks.map((mark) => ({
    ...mark,
    emphasised: emphasised.has(mark.id),
  }));
}

export interface LetterSegment {
  text: string;
  /** Marks on the letters of this segment; extra sounds attach to the segment before them. */
  marks: SpeakMark[];
  extras: SpeakMark[];
}

const spanOf = (
  ref: FlashcardSpeakReference,
  index: number,
  length: number
): [number, number] | null => {
  const spans = ref.letterSpans;
  if (!spans || spans.length !== ref.tokens.length * 2) return null;
  const start = spans[index * 2];
  const end = spans[index * 2 + 1];
  if (!Number.isInteger(start) || !Number.isInteger(end)) return null;
  if (start < 0 || end < start || end > length) return null;
  return [start, end];
};

/** The word cut at every letter-span edge, each piece carrying its marks; null without usable spans. */
export function letterSegments(
  word: string,
  ref: FlashcardSpeakReference | undefined,
  marks: readonly SpeakMark[]
): LetterSegment[] | null {
  if (!ref?.letterSpans) return null;
  const spans: Array<[number, number]> = [];
  for (let i = 0; i < ref.tokens.length; i++) {
    const span = spanOf(ref, i, word.length);
    if (!span) return null;
    spans.push(span);
  }
  const cuts = new Set<number>([0, word.length]);
  for (const [start, end] of spans) {
    cuts.add(start);
    cuts.add(end);
  }
  const edges = [...cuts].sort((a, b) => a - b);
  const segments: Array<LetterSegment & { start: number; end: number }> = [];
  for (let i = 0; i < edges.length - 1; i++) {
    const [start, end] = [edges[i], edges[i + 1]];
    segments.push({
      text: word.slice(start, end),
      start,
      end,
      marks: marks.filter(
        (mark) =>
          mark.kind !== 'extra' &&
          spans[mark.tokenIndex] !== undefined &&
          spans[mark.tokenIndex][0] < end &&
          spans[mark.tokenIndex][1] > start
      ),
      extras: [],
    });
  }
  for (const mark of marks) {
    const placed =
      mark.kind === 'extra' ||
      (spans[mark.tokenIndex] !== undefined &&
        spans[mark.tokenIndex][0] === spans[mark.tokenIndex][1]);
    if (!placed) continue;
    // An extra sound, or a sound with no letters of its own, shows after the letters before it.
    const after =
      mark.kind === 'extra'
        ? (spans[mark.tokenIndex]?.[1] ?? 0)
        : spans[mark.tokenIndex][0];
    const host =
      [...segments].reverse().find((segment) => segment.end <= after) ??
      segments[0];
    if (host) host.extras.push(mark);
  }
  return segments.map(({ text, marks: own, extras }) => ({
    text,
    marks: own,
    extras,
  }));
}

/** The word split into syllables with the stressed one marked, for the one-line stress hint; null without spans. */
export function stressSyllables(
  word: string,
  ref: FlashcardSpeakReference | undefined
): Array<{ text: string; stressed: boolean }> | null {
  if (!ref || ref.stress.length === 0) return null;
  const spans: Array<[number, number]> = [];
  for (let i = 0; i < ref.tokens.length; i++) {
    const span = spanOf(ref, i, word.length);
    if (!span) return null;
    spans.push(span);
  }
  const nuclei = ref.tokens
    .map((token, index) => (isNucleus(token) ? index : -1))
    .filter((index) => index >= 0);
  if (nuclei.length < 2) return null;
  // A syllable starts at the consonant just before its vowel, or at the vowel when two vowels meet.
  const starts = nuclei.map((nucleus, n) => {
    if (n === 0) return 0;
    const onset = nucleus - 1;
    return onset > nuclei[n - 1] ? spans[onset][0] : spans[nucleus][0];
  });
  const stressed = ref.stress[0];
  const pieces = starts.map((start, n) => ({
    text: word.slice(start, n + 1 < starts.length ? starts[n + 1] : undefined),
    stressed: n === stressed,
  }));
  return pieces.every((piece) => piece.text.length > 0) ? pieces : null;
}

/** The reference the judgement matched, for marks and the stress line. */
export const judgedRef = (
  refs: readonly FlashcardSpeakReference[],
  judgement: SpeakJudgement
): FlashcardSpeakReference | undefined =>
  refs.find((ref) => ref.dialect === judgement.dialect) ?? refs[0];
