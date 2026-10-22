// Flashcards Speak verdict (docs/multilingual-pronunciation-engine.md §4.1, §4.4); pure, no I/O.

import type {
  FlashcardSpeakReference,
  FlashcardSpeakSettings,
  SpeakDialect,
  SpeakLanguage,
  SpeakVerdict,
} from '@/types';
import {
  PRONUNCIATION_GROUPS,
  RECOGNIZER_TOLERANCE,
  STRESS_GROUP_ID,
  type PronunciationPair,
} from '@/config/pronunciationGroups';
import {
  alignPronunciation,
  EmptyReferenceError,
  type AlignmentEntry,
} from './score';
import {
  decideSounds,
  scoreReference,
  scoringCandidates,
  wordFinalPositions,
  type SpeakLogProbs,
} from './likelihood';

/** §4.4 rule 1: under this much voiced audio after trimSilence reads as unclear. */
export const SPEAK_MIN_VOICED_MS = 150;

export interface SpeakJudgeInput {
  refs: readonly FlashcardSpeakReference[];
  /** Recognized tokens. */
  spoken: readonly string[];
  /** Detected 0-based target syllable for this dialect's alignment, or null when stress can't be detected. */
  stressFor: (
    ref: FlashcardSpeakReference,
    alignment: readonly AlignmentEntry[]
  ) => number | null;
  /** Mean max-posterior over non-blank frames. */
  confidence: number;
  voicedMs: number;
  language: SpeakLanguage;
  settings: Pick<FlashcardSpeakSettings, 'strict' | 'groups'>;
  unclearConfidence: number;
  /** The take's per-frame log-probabilities; with them segments are judged by likelihood, without them by the greedy tokens. */
  logProbs?: SpeakLogProbs | null;
}

export interface SpeakJudgeEntry extends AlignmentEntry {
  kind: 'correct' | 'held' | 'tolerated' | 'forgiven' | 'error';
  groupId?: string;
}

export type SpeakSoundTally = Record<
  string,
  { n: number; m: number; f: number }
>;

export interface SpeakJudgement {
  verdict: SpeakVerdict;
  /** Null when unclear. */
  dialect: SpeakDialect | null;
  /** 0-100 segment score with tolerated pairs counted correct; progress only, never the verdict. */
  accuracy: number;
  entries: SpeakJudgeEntry[];
  stress: 'correct' | 'forgiven' | 'error' | 'not-judged';
  /** Forgiven group ids in the language's group order. */
  forgivenGroups: string[];
  /** This attempt's F8 delta, keyed by target token. */
  tally: SpeakSoundTally;
  /** The matched reference's `text`, when it isn't the term's first variant. */
  text?: string;
}

const VERDICT_RANK: Record<Exclude<SpeakVerdict, 'unclear'>, number> = {
  wrong: 0,
  accepted: 1,
  exact: 2,
};

/** Follow resolves through the Strict switch; a missing or unknown setting follows it. */
export function effectiveGroupSettings(
  language: SpeakLanguage,
  settings: Pick<FlashcardSpeakSettings, 'strict' | 'groups'>
): Record<string, 'forgive' | 'require'> {
  const effective: Record<string, 'forgive' | 'require'> = {};
  for (const group of PRONUNCIATION_GROUPS[language]) {
    const setting = settings.groups[group.id];
    effective[group.id] =
      setting === 'forgive' || setting === 'require'
        ? setting
        : settings.strict
          ? 'require'
          : 'forgive';
  }
  return effective;
}

const pairMatches = (
  pair: PronunciationPair,
  entry: AlignmentEntry,
  finals: ReadonlySet<number>
) =>
  pair.target === entry.targetIPA &&
  pair.spoken === entry.spokenIPA &&
  (!pair.final || finals.has(entry.position));

function classify(
  entry: AlignmentEntry,
  language: SpeakLanguage,
  effective: Record<string, 'forgive' | 'require'>,
  finals: ReadonlySet<number>
): SpeakJudgeEntry {
  if (entry.status === 'correct') return { ...entry, kind: 'correct' };
  if (entry.status === 'held') return { ...entry, kind: 'held' };
  if (entry.status !== 'substituted') return { ...entry, kind: 'error' };
  if (
    RECOGNIZER_TOLERANCE[language].some((p) => pairMatches(p, entry, finals))
  ) {
    return { ...entry, kind: 'tolerated' };
  }
  const group = PRONUNCIATION_GROUPS[language].find((g) =>
    g.pairs.some((p) => pairMatches(p, entry, finals))
  );
  if (!group) return { ...entry, kind: 'error' };
  return {
    ...entry,
    kind: effective[group.id] === 'forgive' ? 'forgiven' : 'error',
    groupId: group.id,
  };
}

type DialectJudgement = Omit<SpeakJudgement, 'verdict' | 'dialect'> & {
  verdict: Exclude<SpeakVerdict, 'unclear'>;
  dialect: SpeakDialect;
};

function judgeDialect(
  ref: FlashcardSpeakReference,
  input: SpeakJudgeInput,
  effective: Record<string, 'forgive' | 'require'>,
  candidates: readonly string[]
): DialectJudgement {
  const n = ref.tokens.length;
  const { alignment } = alignPronunciation(ref.tokens, input.spoken);
  const readings = input.logProbs
    ? scoreReference(input.logProbs, ref.tokens, candidates)
    : null;
  const segments = readings
    ? decideSounds(
        ref.tokens,
        readings,
        input.language,
        effective,
        undefined,
        ref.wordEnds
      )
    : alignment;
  const finals = wordFinalPositions(n, ref.wordEnds);
  const entries = segments.map((e) =>
    classify(e, input.language, effective, finals)
  );

  let stress: SpeakJudgement['stress'] = 'not-judged';
  if (ref.stress.length > 0) {
    const detected = input.stressFor(ref, alignment);
    if (detected !== null) {
      stress = ref.stress.includes(detected)
        ? 'correct'
        : effective[STRESS_GROUP_ID] === 'forgive'
          ? 'forgiven'
          : 'error';
    }
  }

  const forgiven = new Set(
    entries.filter((e) => e.kind === 'forgiven').map((e) => e.groupId)
  );
  if (stress === 'forgiven') forgiven.add(STRESS_GROUP_ID);
  const forgivenGroups = PRONUNCIATION_GROUPS[input.language]
    .map((g) => g.id)
    .filter((id) => forgiven.has(id));

  const hasError =
    stress === 'error' || entries.some((e) => e.kind === 'error');
  const verdict = hasError
    ? 'wrong'
    : forgivenGroups.length > 0
      ? 'accepted'
      : 'exact';

  // T3: held entries are not edits; tolerated pairs count as correct.
  const edits = entries.filter(
    (e) => e.kind === 'error' || e.kind === 'forgiven'
  ).length;
  const accuracy = Math.max(0, Math.round((1 - edits / n) * 100));

  // F8: n per target token attempted; m for an unforgiven substitution or omission; f for forgiven.
  const tally: SpeakSoundTally = {};
  for (const e of entries) {
    if (e.targetIPA === null) continue;
    const t = (tally[e.targetIPA] ??= { n: 0, m: 0, f: 0 });
    t.n++;
    if (e.kind === 'error') t.m++;
    else if (e.kind === 'forgiven') t.f++;
  }

  return {
    verdict,
    dialect: ref.dialect,
    accuracy,
    entries,
    stress,
    forgivenGroups,
    tally,
  };
}

// A non-finite reading counts as unclear rather than as a verdict.
const isUnclear = (input: SpeakJudgeInput) =>
  !Number.isFinite(input.voicedMs) ||
  !Number.isFinite(input.confidence) ||
  input.voicedMs < SPEAK_MIN_VOICED_MS ||
  input.spoken.length === 0 ||
  input.confidence < input.unclearConfidence;

/** Best verdict across the accepted dialects (Exact > Accepted > Not yet), ties broken by accuracy. */
export function judgeSpeech(input: SpeakJudgeInput): SpeakJudgement {
  if (
    input.refs.length === 0 ||
    input.refs.some((r) => r.tokens.length === 0)
  ) {
    throw new EmptyReferenceError();
  }
  // A bad cut-off would read every take as unclear, which costs no attempt and never ends.
  if (!Number.isFinite(input.unclearConfidence)) {
    throw new RangeError(
      `unclearConfidence must be finite, received ${input.unclearConfidence}`
    );
  }

  if (isUnclear(input)) {
    return {
      verdict: 'unclear',
      dialect: null,
      accuracy: 0,
      entries: [],
      stress: 'not-judged',
      forgivenGroups: [],
      tally: {},
    };
  }

  const effective = effectiveGroupSettings(input.language, input.settings);
  const candidates = scoringCandidates(
    input.language,
    input.refs.filter((r) => r.source !== 'voice').flatMap((r) => r.tokens)
  );
  const judged = input.refs.map((ref) => ({
    ref,
    result: judgeDialect(ref, input, effective, candidates),
  }));
  const best = judged.reduce((top, next) =>
    VERDICT_RANK[next.result.verdict] > VERDICT_RANK[top.result.verdict] ||
    (next.result.verdict === top.result.verdict &&
      next.result.accuracy > top.result.accuracy)
      ? next
      : top
  );
  const result = onLetterRef(best.ref, best.result, input.refs);
  return best.ref.text === undefined
    ? result
    : { ...result, text: best.ref.text };
}

// A voice reference has no letter spans, so its marks move onto the dialect's espeak reference.
function onLetterRef(
  ref: FlashcardSpeakReference,
  result: DialectJudgement,
  refs: readonly FlashcardSpeakReference[]
): DialectJudgement {
  if (ref.source !== 'voice') return result;
  const letters = refs.find(
    (r) =>
      r.dialect === ref.dialect && r.text === ref.text && r.source !== 'voice'
  );
  if (!letters) return result;
  const { alignment } = alignPronunciation(letters.tokens, ref.tokens);
  // Each voice token's espeak position, and the espeak sound when the two line up.
  const toLetters: Array<{ position: number; token: string | null }> = [];
  for (const a of alignment) {
    if (a.spokenIPA === null) continue;
    toLetters.push({
      position: Math.min(Math.max(a.position, 1), letters.tokens.length),
      token: a.targetIPA,
    });
  }
  return {
    ...result,
    entries: result.entries.map((e) => {
      const at = toLetters[e.position - 1];
      if (!at) return e;
      return {
        ...e,
        position: at.position,
        targetIPA: e.targetIPA !== null && at.token ? at.token : e.targetIPA,
      };
    }),
  };
}
