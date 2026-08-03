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
  it('counts English aɪə as ONE nucleus — lion is one syllable here, two to a teacher', () => {
    // Real espeak output. `aɪə` is a single token in the model's vocabulary.
    expect(parseEspeak('lˈaɪən').syllableCount).toBe(1);
    expect(nucleiData.nuclei).toContain('aɪə'); // a + ɪ + ə (U+0259)
  });

  it('counts English aɪɚ as ONE nucleus too — a DIFFERENT token from aɪə', () => {
    // `tired` collapses for the same reason as `lion` but via a separate
    // vocabulary entry: `aɪɚ` ends in the r-coloured schwa U+025A, not the
    // plain schwa U+0259. Asserted separately so that dropping either token
    // fails with an obvious message instead of leaving one word's count
    // unexplained.
    expect(parseEspeak('tˈaɪɚd').syllableCount).toBe(1);
    expect(nucleiData.nuclei).toContain('aɪɚ'); // a + ɪ + ɚ (U+025A)
    expect('aɪə').not.toBe('aɪɚ');
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

  it('falls back to espeak when the cross-check supplies no primary index at all', () => {
    // Real and rare: 55 polysyllabic CMUDict headwords carry secondary stress
    // but no primary in any variant. `accredit` is one — AH0 K R EH2 D AH0 T.
    // Its 3 syllables match espeak's 3 nuclei, so R1a's count guard does NOT
    // fire and this lands squarely on the empty-primary path. A cross-check
    // with no opinion must not be read as disagreement.
    const r = deriveReference({
      lang: 'en',
      espeakIpa: 'ɐkɹˈɛdɪt',
      crossCheck: reading(3, []),
    });
    expect(r.syllableCount).toBe(3);
    expect(r.accepted).toEqual([2]);
    expect(r.flagged).toBe(false);
    expect(r.source).toBe('espeak');
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

describe('R1b — an unrenderable espeak symbol yields no reference', () => {
  // espeak writes a literal `?` where an internal phoneme has no IPA mapping.
  // Real, measured, and German-only: 0.97% of the top-12k German words,
  // 0/12000 Spanish and 0/9974 English. All strings below are real output.

  it('refuses when the syllable count itself is untrustworthy', () => {
    // `durch` -> d'URC in espeak's own scheme. The whole vowel vanishes.
    const r = deriveReference({ lang: 'de', espeakIpa: 'dˈ??ç' });
    expect(r.accepted).toEqual([]);
    expect(r.source).toBe('unrenderable');
    expect(scoreStress(r, 1)).toBeNull();
  });

  it('does NOT let a mis-parsed word fall through the monosyllable path', () => {
    // The reason filtering the bad index is not enough on its own: `geburt`
    // scans as ONE nucleus, so without this guard it would take the
    // monosyllable branch and assert stress on syllable 1 of a word whose
    // vowel espeak never rendered.
    const r = deriveReference({ lang: 'de', espeakIpa: 'ɡəbˈ??t' });
    expect(r.accepted).not.toEqual([1]);
    expect(r.accepted).toEqual([]);
  });

  it('flags rather than silently degrading, so a teacher can see it', () => {
    // For German this is the only flag source there is — R4 leaves it with
    // no cross-check, so nothing else can ever raise one.
    const r = deriveReference({ lang: 'de', espeakIpa: 'ɡəbˈ??tstɑːk' });
    expect(r.flagged).toBe(true);
    expect(needsAuthoringPrompt(r)).toBe(true);
    expect(effectiveAccepted(r)).toEqual([]);
  });

  it('reports the syllable count as UNKNOWN, not as the surviving nuclei', () => {
    // The trap this closes. `durch` leaves ZERO nuclei and `geburt` leaves
    // ONE for a two-syllable word — so storing the survivor count would let a
    // teacher who correctly wants syllable 2 of `geburt` be rejected as out
    // of range, with the reference looking perfectly valid. null means "we
    // do not know", which is the only honest value here.
    expect(
      deriveReference({ lang: 'de', espeakIpa: 'dˈ??ç' }).syllableCount
    ).toBeNull();
    expect(
      deriveReference({ lang: 'de', espeakIpa: 'ɡəbˈ??t' }).syllableCount
    ).toBeNull();
  });

  it('refuses to be confirmed without the true count supplied from outside', () => {
    const r = deriveReference({ lang: 'de', espeakIpa: 'ɡəbˈ??t' });
    expect(() => confirmReference(r, [2])).toThrow(RangeError);
  });

  it('lets a teacher rescue the word by supplying the count', () => {
    // geburt is ge-burt: two syllables, stress on the second. espeak rendered
    // one nucleus. #2341's UI has to pass the real count for this to work.
    const r = deriveReference({ lang: 'de', espeakIpa: 'ɡəbˈ??t' });
    const c = confirmReference(r, [2], 2);
    expect(c.confirmed).toBe(true);
    expect(c.syllableCount).toBe(2);
    expect(scoreStress(c, 2)).toBe(100);
    expect(scoreStress(c, 1)).toBe(0);
  });

  it('still bounds-checks against the supplied count', () => {
    const r = deriveReference({ lang: 'de', espeakIpa: 'ɡəbˈ??t' });
    expect(() => confirmReference(r, [3], 2)).toThrow(RangeError);
  });

  it('refuses to override a count that is already KNOWN', () => {
    // Not a repair — a way to make the reference unreachable. `camera` really
    // does have two nuclei in the model's space (kˈæmɹə), so "correcting" it
    // to a human's three would store an index the detector can never emit,
    // scoring 0 forever against a reference that looks right. Throws rather
    // than being ignored so a caller who believes espeak miscounted finds out
    // here instead of in a grade.
    const r = deriveReference({ lang: 'en', espeakIpa: 'kˈæmɹə' });
    expect(r.syllableCount).toBe(2);
    expect(() => confirmReference(r, [1], 3)).toThrow(RangeError);
    expect(() => confirmReference(r, [1], 2)).toThrow(RangeError); // even if it agrees
    expect(confirmReference(r, [1]).syllableCount).toBe(2); // the supported call
  });
});

describe('no derived reference may contain an out-of-range index', () => {
  it('drops a dangling primary mark rather than emitting index n+1', () => {
    // An out-of-range index is the worst value available: it never matches,
    // so it scores every student 0 while `accepted` stays non-empty and so
    // never degrades. confirmReference already forbids it on the teacher
    // path; derivation must not be able to produce it either.
    expect(parseEspeak('bɛtɚˈ')).toEqual({ syllableCount: 2, primary: [] });
    expect(parseEspeak('bˈɛtɚˈ')).toEqual({ syllableCount: 2, primary: [1] });
  });

  it('drops an out-of-range CROSS-CHECK index instead of storing it', () => {
    // The sweep below originally missed this because it only exercised
    // fixtures with no cross-check. Neither CMUDict nor R3 can produce an
    // out-of-range index, but deriveReference takes caller-supplied data.
    const r = deriveReference({
      lang: 'en',
      espeakIpa: 'ɐdɹˈɛs',
      crossCheck: reading(2, [3]),
    });
    expect(r.accepted).toEqual([2]);
    expect(r.accepted).not.toContain(3);
  });

  it('treats a wholly out-of-range cross-check as no opinion, not disagreement', () => {
    // A malformed cross-check is not evidence of a second reading, so it must
    // not raise the R1 flag — that is R1a's reasoning applied to a different
    // way of being incomparable.
    const r = deriveReference({
      lang: 'en',
      espeakIpa: 'ɐdɹˈɛs',
      crossCheck: reading(2, [3]),
    });
    expect(r.flagged).toBe(false);
    expect(r.source).toBe('espeak');
  });

  it('holds across every fixture in this suite', () => {
    const fixtures: Array<[Lang, string]> = [
      ['en', 'wˈiːkɛnd'],
      ['en', 'ɐdɹˈɛs'],
      ['en', 'aʊtsˈaɪd'],
      ['en', 'kˈæmɹə'],
      ['en', 'dʒˈeɪpˈɛɡ'],
      ['en', 'lˈaɪən'],
      ['en', 'ɐkɹˈɛdɪt'],
      ['es', 'rˈapiðamˈente'],
      ['es', 'tɾaβˈaxo'],
      ['es', 'ˌinmeðjˈatamˈente'],
      ['de', 'ˈvaːɡn̩'],
      ['de', 'fɪlˈaɪçt'],
      ['de', 'dˈ??ç'],
    ];
    // Sweep each fixture with NO cross-check, an agreeing one, a disagreeing
    // one, an empty one, and a malformed out-of-range one. The first version
    // of this sweep only did the first, which is how the cross-check bounds
    // hole survived it.
    //
    // Read for what it is: a BOUNDS invariant, not decision coverage. The
    // monosyllabic fixtures short-circuit before the R1a count guard, so this
    // sweep does not exercise R1a for them — the `camera` case in the R1 block
    // is what covers that. A sweep this wide looks like it proves more than it
    // does.
    const crossChecks: Array<StressReading | undefined> = [
      undefined,
      reading(1, [1]),
      reading(2, [1]),
      reading(2, [2]),
      reading(2, []),
      reading(2, [3]),
      reading(3, [9]),
    ];
    for (const [lang, ipa] of fixtures) {
      for (const crossCheck of crossChecks) {
        const rr = deriveReference({ lang, espeakIpa: ipa, crossCheck });
        if (rr.syllableCount === null) {
          expect(rr.accepted).toEqual([]);
          continue;
        }
        for (const i of rr.accepted) {
          expect(i).toBeGreaterThanOrEqual(1);
          expect(i).toBeLessThanOrEqual(rr.syllableCount);
        }
      }
      const r = deriveReference({ lang, espeakIpa: ipa });
      if (r.syllableCount === null) {
        // An unknown count can bound nothing, so the only safe accepted list
        // is an empty one. R1b guarantees it.
        expect(r.accepted).toEqual([]);
        continue;
      }
      for (const i of r.accepted) {
        expect(i).toBeGreaterThanOrEqual(1);
        expect(i).toBeLessThanOrEqual(r.syllableCount);
      }
    }
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

  it('is NOT special-cased: a German cross-check, if one ever exists, is used', () => {
    // R4 is a fact about available data, not a ban in the function. The map
    // records re-scraping Wiktionary with stress preserved as the move if
    // German stress proves a real classroom problem — supplying a cross-check
    // here is how R4 gets superseded, so `de` behaves like any two-source
    // language rather than silently discarding it.
    const r = deriveReference({
      lang: 'de',
      espeakIpa: 'fɪlˈaɪçt',
      crossCheck: reading(2, [1]),
    });
    expect(r.accepted).toEqual([1, 2]);
    expect(r.flagged).toBe(true);
    expect(r.source).toBe('disagreement');
  });

  it('flags nothing today, because nothing is ever passed', () => {
    // The R4 guarantee as it actually holds: it follows from there being no
    // German cross-check to pass, not from a guard.
    const r = deriveReference({ lang: 'de', espeakIpa: 'fɪlˈaɪçt' });
    expect(r.flagged).toBe(false);
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

  it('degrades even when a cross-check HAS a reading — deliberately', () => {
    // Measured: espeak marks primary stress on every polysyllabic word it
    // renders, 0 exceptions in 33,974 across es/de/en. So reaching this path
    // means the input is no longer espeak output, which makes the syllable
    // COUNT as suspect as the missing mark — and a cross-check index is only
    // meaningful against a count we can trust. Same reasoning as R1b.
    const r = deriveReference({
      lang: 'en',
      espeakIpa: 'kətəm',
      crossCheck: reading(2, [2]),
    });
    expect(r.accepted).toEqual([]);
    expect(r.source).toBe('espeak');
    expect(scoreStress(r, 2)).toBeNull();
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
