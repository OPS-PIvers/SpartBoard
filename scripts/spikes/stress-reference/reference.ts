/**
 * Reference implementation — deriving a question's ACCEPTED STRESS reference.
 *
 * SPIKE / DECISION HARNESS. Not wired into the app, not imported by any
 * feature code. It exists to prove that the decisions recorded in
 * `DECISIONS.md` (issue #2360) are internally consistent and to pin them as
 * executable assertions. See `reference.test.ts`.
 *
 * This runs SERVER-SIDE AT AUTHORING TIME, not on the student's device. D1
 * moved G2P server-side; this is part of that same step. The output is stored
 * on the question document and read back by `gradeAnswer()` at grading time.
 *
 * Scope guard, inherited from #2359 S1: the reference is a set of syllable
 * indices that may carry PRIMARY stress. Secondary stress is out of scope on
 * the map and `ˌ` is discarded everywhere below.
 */

import nucleiData from '../stress-detection/nuclei.json';

/** The 244 nucleus-bearing tokens, derived from the model's own vocabulary. */
const NUCLEUS_TOKENS: readonly string[] = [...nucleiData.nuclei].sort(
  (a, b) => b.length - a.length
);

/** The three in-scope languages. Mandarin is out of scope on the map. */
export type Lang = 'es' | 'de' | 'en';

export const PRIMARY_MARK = 'ˈ';
export const SECONDARY_MARK = 'ˌ';
/**
 * espeak's `--ipa=3` writes a ZERO WIDTH JOINER inside diphthongs (`a‍ʊ`),
 * but the model's vocabulary holds them as bare single tokens (`aʊ`). The
 * map tracks the full projection step as fog ("Server-side symbol
 * normalization"); stripping the ZWJ is the one part of it this harness needs.
 */
const ZWJ = '‍';

/** What a source says about one word: how many syllables, and which are primary. */
export interface StressReading {
  syllableCount: number;
  /** 1-based indices carrying a PRIMARY mark. Usually one; see R5. */
  primary: number[];
}

/**
 * Parse espeak IPA into a reading, counting syllables in the MODEL'S nucleus
 * space rather than a human's.
 *
 * These are not the same space, and the difference is load-bearing for the
 * teacher UI (#2341):
 *   - English `aɪə` is ONE vocabulary token, so *lion*, *tired* and *fire*
 *     have one nucleus here and two syllables to a teacher.
 *   - Spanish `ue` is written as two tokens, so *luego* and *prueba* have
 *     three nuclei here and two syllables to a Spanish teacher.
 * The index space MUST be this one, because it is the space the detector
 * ranks prominence in (#2359 S2). A teacher-facing syllable picker therefore
 * has to render syllables FROM THE PHONEME STREAM, never from spelling.
 */
export function parseEspeak(ipa: string): StressReading {
  const s = ipa.replaceAll(ZWJ, '');
  const primary: number[] = [];
  let i = 0;
  let n = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === PRIMARY_MARK) {
      primary.push(n + 1);
      i += 1;
      continue;
    }
    if (c === SECONDARY_MARK) {
      // S1: secondary stress is out of scope and discarded, never stored.
      i += 1;
      continue;
    }
    const tok = NUCLEUS_TOKENS.find((t) => s.startsWith(t, i));
    if (tok) {
      n += 1;
      i += tok.length;
    } else {
      i += 1;
    }
  }
  return { syllableCount: n, primary };
}

/** Why an `accepted` list has the members it has — stored for auditability. */
export type ReferenceSource =
  | 'espeak' // single source agreed with, or no cross-check for this language
  | 'espeak+crosscheck' // two sources, agreed
  | 'disagreement' // two sources, disagreed — both kept (R1)
  | 'multi-mark' // one source, two primary marks (R5)
  | 'teacher'; // a human set it

export interface StressReference {
  /** 1-based syllable indices that may carry primary stress. NEVER number[][]. */
  accepted: number[];
  /** Syllable count in the model's nucleus space, for the authoring UI. */
  syllableCount: number;
  /** R1: sources disagreed, or a language-specific multi-mark case (R5). */
  flagged: boolean;
  /** R2: a human has confirmed this reference. */
  confirmed: boolean;
  source: ReferenceSource;
}

export interface DeriveInput {
  lang: Lang;
  /** espeak's `--ipa=3` output for the word. Always present. */
  espeakIpa: string;
  /**
   * The independent cross-check's reading, if this language has one.
   *   en → CMUDict (measured: espeak agrees on 94.9% of comparable words)
   *   es → the orthographic rule in `measure/spanish.py` (99.65%)
   *   de → NONE. R4 — no usable second source exists.
   */
  crossCheck?: StressReading;
}

/**
 * R1 + R4 + R5 — derive the stored accepted-stress reference for one word.
 */
export function deriveReference(input: DeriveInput): StressReference {
  const { lang, espeakIpa, crossCheck } = input;
  const esp = parseEspeak(espeakIpa);
  const base = { syllableCount: esp.syllableCount, confirmed: false };

  // A monosyllable has nothing to place. #2359's one-syllable path already
  // bypasses ranking; storing [1] keeps `accepted.includes(detected)` true
  // without asserting a judgement.
  if (esp.syllableCount <= 1) {
    return {
      ...base,
      accepted: esp.syllableCount === 1 ? [1] : [],
      flagged: false,
      source: 'espeak',
    };
  }

  // R5 — one source, two primary marks. Spanish takes both silently (it is
  // one regular morphological class, -mente, and both readings are correct);
  // en/de flag, because their multi-mark words are overwhelmingly initialisms
  // espeak mishandles (cnet, xbox, mpeg, jpeg, ibm).
  if (esp.primary.length > 1) {
    return {
      ...base,
      accepted: dedupe(esp.primary),
      flagged: lang !== 'es',
      source: 'multi-mark',
    };
  }

  if (esp.primary.length === 0) {
    // No mark at all: nothing to assert. A10a treats an empty accepted list as
    // absent evidence and degrades — which is the honest reading here.
    return { ...base, accepted: [], flagged: false, source: 'espeak' };
  }

  const espPrimary = esp.primary[0];

  // R4 — German has no second source. Single member, never flagged.
  if (!crossCheck) {
    return {
      ...base,
      accepted: [espPrimary],
      flagged: false,
      source: 'espeak',
    };
  }

  // Decided without asking, flagged in DECISIONS.md: when the two sources
  // disagree about HOW MANY syllables the word has, their indices are not
  // comparable, so the cross-check yields no opinion rather than a
  // manufactured disagreement. espeak's count is authoritative because it IS
  // the detector's index space. Measured frequency: 3.08% (en), 3.06% (es),
  // 6.90% (de).
  if (crossCheck.syllableCount !== esp.syllableCount) {
    return {
      ...base,
      accepted: [espPrimary],
      flagged: false,
      source: 'espeak',
    };
  }

  const cc = dedupe(crossCheck.primary);
  if (cc.length === 0) {
    return {
      ...base,
      accepted: [espPrimary],
      flagged: false,
      source: 'espeak',
    };
  }

  // Sources agree, and the cross-check offers exactly what espeak did.
  if (cc.length === 1 && cc[0] === espPrimary) {
    return {
      ...base,
      accepted: [espPrimary],
      flagged: false,
      source: 'espeak+crosscheck',
    };
  }

  // R1 — disagreement (or a cross-check that itself lists several attested
  // readings). Accept the union so no correct dialect is ever penalised
  // (#2342), and flag it, because roughly half of these are espeak simply
  // being wrong rather than a genuine variant.
  return {
    ...base,
    accepted: dedupe([espPrimary, ...cc]),
    flagged: true,
    source: 'disagreement',
  };
}

/**
 * R2 — what the GRADER may use.
 *
 * A flagged, unconfirmed reference contributes NOTHING: it returns an empty
 * accepted list, which A10a already defines as absent evidence, so A9's
 * stress weight collapses to 0 and the word scores sounds-only. This is the
 * flag's teeth. Confirming the reference switches stress scoring on.
 *
 * Note the asymmetry #2359 S5 warns about, which this preserves: an empty
 * ACCEPTED list degrades, whereas an empty DETECTED value would score 0 at
 * full weight. They are opposite, and only the former appears here.
 */
export function effectiveAccepted(ref: StressReference): number[] {
  if (ref.flagged && !ref.confirmed) return [];
  return ref.accepted;
}

/** R2 — the authoring UI must surface this inline on the question itself. */
export function needsAuthoringPrompt(ref: StressReference): boolean {
  return ref.flagged && !ref.confirmed;
}

/** A teacher's confirmation replaces the reference and clears the flag. */
export function confirmReference(
  ref: StressReference,
  chosen: number[]
): StressReference {
  const accepted = dedupe(chosen);
  if (accepted.some((i) => i < 1 || i > ref.syllableCount)) {
    // A10's accepted list is indices into THIS word; an out-of-range index
    // could never match a detected value and would silently score 0 forever.
    throw new RangeError(
      `stress index out of range: got ${JSON.stringify(chosen)} for a ${ref.syllableCount}-syllable word`
    );
  }
  return {
    ...ref,
    accepted,
    flagged: false,
    confirmed: true,
    source: 'teacher',
  };
}

/** #2359 S1: scoring is equality against the set — never partial credit. */
export function scoreStress(
  ref: StressReference,
  detected: number | null
): number | null {
  const accepted = effectiveAccepted(ref);
  if (detected === null || accepted.length === 0) return null; // degrade (A9/A10a)
  return accepted.includes(detected) ? 100 : 0;
}

function dedupe(xs: number[]): number[] {
  return [...new Set(xs)].sort((a, b) => a - b);
}
