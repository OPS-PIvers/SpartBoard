/**
 * Executable record of the decisions in `DECISIONS.md` (issue #2360).
 *
 * Same method as the #2335 and #2359 harnesses, which the map records as the
 * method that keeps paying: write each behavioural claim as a test BEFORE
 * settling how it should behave, because choosing the assertion IS the
 * decision.
 *
 * Every espeak string below is REAL OUTPUT, copied from the runs in
 * `measure/`. None of it is hand-written to make a test pass — a fabricated
 * fixture would pin a decision to a pronunciation espeak does not produce.
 */
import { describe, expect, it } from 'vitest';

import nucleiData from '../stress-detection/nuclei.json';
import {
  type Lang,
  type StressReading,
  confirmReference,
  deriveReference,
  effectiveAccepted,
  needsAuthoringPrompt,
  parseEspeak,
  scoreStress,
} from './reference';

const reading = (syllableCount: number, primary: number[]): StressReading => ({
  syllableCount,
  primary,
});

describe('the index space is the model’s, not a human’s', () => {
  it('counts an English aɪə as ONE nucleus — lion is one syllable here, two to a teacher', () => {
    // Real espeak output. `aɪə` is a single token in the model's vocabulary.
    expect(parseEspeak('lˈaɪən').syllableCount).toBe(1);
    expect(parseEspeak('tˈaɪɚd').syllableCount).toBe(1);
    expect(nucleiData.nuclei).toContain('aɪə');
  });

  it('counts a Spanish ue as TWO nuclei — luego is three here, two to a teacher', () => {
    expect(parseEspeak('luˈeɣo').syllableCount).toBe(3);
    expect(parseEspeak('pɾuˈeβa').syllableCount).toBe(3);
  });

  it('counts the vowel-less German nucleus n̩ that “count the vowels” drops', () => {
    // de.wiktionary gives Wagen as ˈvaːɡn̩ — two nuclei, stress on the first.
    const r = parseEspeak('ˈvaːɡn̩');
    expect(r.syllableCount).toBe(2);
    expect(r.primary).toEqual([1]);
  });

  it('discards the secondary mark entirely (S1) rather than recording it', () => {
    // Real espeak: 29% of Spanish words carry a ˌ. None of it is stored.
    // in-me-dia-ta-men-te: six nuclei, the ˌ on syllable 1 discarded, the two
    // ˈ marks landing on `dia` (3) and `men` (5).
    const r = parseEspeak('ˌinmeðjˈatamˈente');
    expect(r.syllableCount).toBe(6);
    expect(r.primary).toEqual([3, 5]);
    expect(JSON.stringify(r)).not.toContain('ˌ');
  });

  it('strips the ZWJ espeak writes inside diphthongs', () => {
    // `a‍ʊ` with a joiner must count as the single vocabulary token `aʊ`.
    expect(parseEspeak('a‍ʊtsˈa‍ɪd').syllableCount).toBe(2);
  });
});

describe('R1 — two sources, and disagreement is accepted-plus-flagged', () => {
  it('agreement stores ONE index and does not flag', () => {
    const r = deriveReference({
      lang: 'en',
      espeakIpa: 'wˈiːkɛnd',
      crossCheck: reading(2, [1]),
    });
    expect(r.accepted).toEqual([1]);
    expect(r.flagged).toBe(false);
    expect(r.source).toBe('espeak+crosscheck');
  });

  it('disagreement keeps BOTH readings, so no correct dialect is penalised (#2342)', () => {
    // `address`: espeak says syllable 2, CMUDict lists 1 and 2.
    const r = deriveReference({
      lang: 'en',
      espeakIpa: 'ɐdɹˈɛs',
      crossCheck: reading(2, [1, 2]),
    });
    expect(r.accepted).toEqual([1, 2]);
    expect(r.flagged).toBe(true);
    expect(r.source).toBe('disagreement');
  });

  it('flags even when espeak is the one that is wrong — we cannot tell which', () => {
    // `outside`: espeak says 2, CMUDict lists only 1. Measured: ~51% of
    // disagreements are espeak being wrong, so both are kept AND flagged.
    const r = deriveReference({
      lang: 'en',
      espeakIpa: 'aʊtsˈaɪd',
      crossCheck: reading(2, [1]),
    });
    expect(r.accepted).toEqual([1, 2]);
    expect(r.flagged).toBe(true);
  });

  it('stores number[], never number[][] — the S1 encoding', () => {
    const r = deriveReference({
      lang: 'en',
      espeakIpa: 'ɐdɹˈɛs',
      crossCheck: reading(2, [1, 2]),
    });
    expect(r.accepted.every((x) => typeof x === 'number')).toBe(true);
  });

  it('does not manufacture a disagreement when the sources disagree on syllable COUNT', () => {
    // espeak syncopates `camera` to 2 nuclei; CMUDict has 3. The indices are
    // not comparable, so the cross-check yields no opinion. Measured at
    // 3.08% (en) / 3.06% (es) / 6.90% (de).
    const r = deriveReference({
      lang: 'en',
      espeakIpa: 'kˈæmɹə',
      crossCheck: reading(3, [1]),
    });
    expect(r.flagged).toBe(false);
    expect(r.accepted).toEqual([1]);
    expect(r.source).toBe('espeak');
  });
});

describe('R2 — the flag has teeth: unconfirmed means unscored', () => {
  const flagged = deriveReference({
    lang: 'en',
    espeakIpa: 'aʊtsˈaɪd',
    crossCheck: reading(2, [1]),
  });

  it('a flagged, unconfirmed reference contributes NOTHING to grading', () => {
    expect(flagged.flagged).toBe(true);
    expect(effectiveAccepted(flagged)).toEqual([]);
  });

  it('degrades rather than scoring zero — the S5 asymmetry, preserved', () => {
    // Empty ACCEPTED is absent evidence (A10a) and must degrade to null.
    // Getting this backwards fails every student whose question was never
    // confirmed, retroactively, because D4 persists no score.
    expect(scoreStress(flagged, 1)).toBeNull();
    expect(scoreStress(flagged, 2)).toBeNull();
  });

  it('surfaces the prompt inline on the question, not only in a queue', () => {
    expect(needsAuthoringPrompt(flagged)).toBe(true);
  });

  it('confirming switches stress scoring ON', () => {
    const c = confirmReference(flagged, [1]);
    expect(c.confirmed).toBe(true);
    expect(c.flagged).toBe(false);
    expect(needsAuthoringPrompt(c)).toBe(false);
    expect(scoreStress(c, 1)).toBe(100);
    expect(scoreStress(c, 2)).toBe(0);
  });

  it('a teacher may confirm BOTH readings, keeping the variant protection', () => {
    const c = confirmReference(flagged, [1, 2]);
    expect(scoreStress(c, 1)).toBe(100);
    expect(scoreStress(c, 2)).toBe(100);
  });

  it('rejects an EMPTY confirmation, which would silently unscore forever', () => {
    // The nastiest shape available: it sets confirmed=true and flagged=false,
    // so needsAuthoringPrompt() goes false and the affordance vanishes, while
    // stress scores null for good. From the outside it is indistinguishable
    // from a question nobody ever flagged.
    expect(() => confirmReference(flagged, [])).toThrow(RangeError);
  });

  it('holds the invariant: a confirmed reference always scores something', () => {
    // The property the empty-confirmation guard exists to protect. If a
    // reference reports itself confirmed, the grader must have a non-empty
    // set to compare against — otherwise "confirmed" and "unassessable" are
    // the same state wearing different labels.
    const c = confirmReference(flagged, [1, 2]);
    expect(c.confirmed).toBe(true);
    expect(effectiveAccepted(c).length).toBeGreaterThan(0);
    expect(scoreStress(c, 1)).not.toBeNull();
  });

  it('rejects a confirmation index outside the word', () => {
    // An out-of-range index can never match a detected value, so it would
    // score 0 forever with nothing to show why.
    expect(() => confirmReference(flagged, [3])).toThrow(RangeError);
    expect(() => confirmReference(flagged, [0])).toThrow(RangeError);
  });

  it('an unflagged reference scores immediately, with no confirmation needed', () => {
    const ok = deriveReference({
      lang: 'en',
      espeakIpa: 'wˈiːkɛnd',
      crossCheck: reading(2, [1]),
    });
    expect(needsAuthoringPrompt(ok)).toBe(false);
    expect(scoreStress(ok, 1)).toBe(100);
  });
});

describe('R3 — Spanish cross-checks against its orthography, not a lexicon', () => {
  it('agrees with espeak on ordinary vocabulary and stores one index', () => {
    // `trabajo` — llana, stress on the penultimate, which is what espeak says.
    const r = deriveReference({
      lang: 'es',
      espeakIpa: 'tɾaβˈaxo',
      crossCheck: reading(3, [2]),
    });
    expect(r.accepted).toEqual([2]);
    expect(r.flagged).toBe(false);
  });

  it('flags a genuine Spanish disagreement so a teacher settles it', () => {
    const r = deriveReference({
      lang: 'es',
      espeakIpa: 'roβˈots',
      crossCheck: reading(2, [1]),
    });
    expect(r.flagged).toBe(true);
    expect(effectiveAccepted(r)).toEqual([]);
  });
});

describe('R4 — German has one source, and says so', () => {
  it('never flags, because there is nothing to disagree with', () => {
    const r = deriveReference({ lang: 'de', espeakIpa: 'ɡˈeːbən' });
    expect(r.accepted).toEqual([1]);
    expect(r.flagged).toBe(false);
    expect(r.source).toBe('espeak');
    expect(scoreStress(r, 1)).toBe(100);
  });

  it('scores German immediately — no confirmation gate on the common path', () => {
    // The accepted cost: when espeak is wrong in German, it is silently wrong.
    const r = deriveReference({ lang: 'de', espeakIpa: 'fɪlˈaɪçt' }); // vielleicht
    expect(r.accepted).toEqual([2]);
    expect(needsAuthoringPrompt(r)).toBe(false);
  });

  it('a teacher can still override a German reference by hand', () => {
    const r = confirmReference(
      deriveReference({ lang: 'de', espeakIpa: 'ɡˈeːbən' }),
      [1]
    );
    expect(r.source).toBe('teacher');
    expect(r.confirmed).toBe(true);
  });
});

describe('R5 — two primary marks from ONE source, handled per language', () => {
  it('Spanish -mente adverbs accept both marks, silently', () => {
    // Real espeak: `rápidamente` -> rˈapiðamˈente. Both readings are correct.
    const r = deriveReference({ lang: 'es', espeakIpa: 'rˈapiðamˈente' });
    expect(r.accepted).toEqual([1, 4]);
    expect(r.flagged).toBe(false);
    expect(r.source).toBe('multi-mark');
    expect(scoreStress(r, 1)).toBe(100);
    expect(scoreStress(r, 4)).toBe(100);
    expect(scoreStress(r, 2)).toBe(0);
  });

  it('English multi-mark words flag, because they are mishandled initialisms', () => {
    const r = deriveReference({ lang: 'en', espeakIpa: 'dʒˈeɪpˈɛɡ' }); // jpeg
    expect(r.flagged).toBe(true);
    expect(effectiveAccepted(r)).toEqual([]);
  });

  it('German multi-mark words flag too', () => {
    const r = deriveReference({ lang: 'de', espeakIpa: 'ˌɛmtsˈeːkˈɛɪ' }); // mckay
    expect(r.flagged).toBe(true);
  });

  it('the es exception is exactly the multi-mark case, not a blanket es rule', () => {
    // An ordinary Spanish disagreement still flags — see R3 above. Only a
    // single source emitting two marks is exempt.
    const single = deriveReference({
      lang: 'es',
      espeakIpa: 'roβˈots',
      crossCheck: reading(2, [1]),
    });
    expect(single.flagged).toBe(true);
  });
});

describe('edges that would otherwise fail silently', () => {
  it('a monosyllable stores [1] and asserts nothing', () => {
    const r = deriveReference({ lang: 'en', espeakIpa: 'kˈæt' });
    expect(r.syllableCount).toBe(1);
    expect(r.accepted).toEqual([1]);
    expect(r.flagged).toBe(false);
  });

  it('a word with no primary mark degrades rather than defaulting to syllable 1', () => {
    const r = deriveReference({ lang: 'en', espeakIpa: 'kətəm' });
    expect(r.accepted).toEqual([]);
    expect(scoreStress(r, 1)).toBeNull();
  });

  it('a null detection degrades even against a confirmed reference (S5)', () => {
    const ok = deriveReference({
      lang: 'en',
      espeakIpa: 'wˈiːkɛnd',
      crossCheck: reading(2, [1]),
    });
    expect(scoreStress(ok, null)).toBeNull();
  });

  it('accepted indices are deduped and ordered, so equality is stable', () => {
    const r = deriveReference({
      lang: 'en',
      espeakIpa: 'ɐdɹˈɛs',
      crossCheck: reading(2, [2, 1, 2]),
    });
    expect(r.accepted).toEqual([1, 2]);
  });

  it('every language reaches a decision without throwing', () => {
    const langs: Lang[] = ['es', 'de', 'en'];
    for (const lang of langs) {
      expect(() =>
        deriveReference({ lang, espeakIpa: 'tɾaβˈaxo' })
      ).not.toThrow();
    }
  });
});
