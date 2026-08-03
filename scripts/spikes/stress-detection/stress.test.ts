/**
 * Executable record of the decisions in `DECISIONS.md` (issue #2359).
 *
 * Same method as the #2335 harness, which is the method the map records as
 * having paid off: write each behavioural claim as a test BEFORE settling how
 * it should behave, because choosing the assertion IS the decision.
 */
import { describe, expect, it } from 'vitest';

import nucleiData from './nuclei.json';
import vocabData from './vocab.json';
import {
  type AlignmentEntryLike,
  type NucleusMeasurement,
  type StressDetectorConfig,
  type TimedPhoneme,
  countSyllables,
  detectStress,
  extractNuclei,
  REDUCED_VOWELS,
  isNucleus,
  mapToTargetSyllable,
  prominenceScores,
  scoreStress,
} from './stress';

/** ~20 ms per frame at the model's stride; one frame ≈ one 20 ms slice. */
const tp = (
  symbol: string,
  startFrame: number,
  endFrame: number
): TimedPhoneme => ({
  symbol,
  startFrame,
  endFrame,
});

const measure = (
  energy: number,
  f0Hz: number | null = 200
): NucleusMeasurement => ({
  energy,
  f0Hz,
});

const CONFIG: StressDetectorConfig = {
  cueWeights: { duration: 1, energy: 1, pitch: 1 },
  minProminenceMargin: 0.15,
  language: 'es',
};

/** Every sound correct, one alignment entry per target position. */
const allCorrect = (phonemes: readonly string[]): AlignmentEntryLike[] =>
  phonemes.map((p, i) => ({
    position: i + 1,
    targetIPA: p,
    spokenIPA: p,
    status: 'correct' as const,
  }));

describe('the nucleus set is derived from the model, not from memory', () => {
  it('matches the committed vocabulary — 244 of 387 sound tokens', () => {
    expect(nucleiData.vocabSize).toBe(392);
    expect(nucleiData.counts).toEqual({
      vowelHeaded: 239,
      syllabicConsonants: 3,
      glideInitial: 2,
      total: 244,
    });
  });

  it('counts syllabic consonants as nuclei — German would undercount without them', () => {
    // `gehen`, `Wagen`, `haben`: the -en ending reduces to a syllabic n with
    // no vowel in it at all. "Count the vowels" silently loses a syllable on
    // a large share of German.
    expect(nucleiData.syllabicConsonants).toEqual(['n̩', 'l̩', 'r̩']);
    expect(isNucleus('n̩')).toBe(true);
    expect(countSyllables(['ɡ', 'eː', 'n̩'])).toBe(2);
  });

  it('counts the two glide-initial tokens — both are ordinary German words', () => {
    // `ja` and `ju` are whole syllables in one token, and they begin with a
    // consonant, so a head-character rule drops them. `ja` / `Jugend`.
    expect(nucleiData.glideInitial).toEqual(['ja', 'ju']);
    expect(isNucleus('ja')).toBe(true);
    expect(countSyllables(['ja'])).toBe(1);
  });

  it('treats a diphthong as ONE syllable — it is a single vocabulary token', () => {
    expect(isNucleus('aɪ')).toBe(true);
    // English `time` /taɪm/ — one syllable, not two.
    expect(countSyllables(['t', 'aɪ', 'm'])).toBe(1);
  });

  it('every reduced vowel the English cue looks for is a symbol the model can emit', () => {
    // A rule keyed on a symbol outside the vocabulary can never fire, and it
    // fails silently. An earlier draft carried `ɪ̈` (ɪ + combining diaeresis),
    // which is absent from vocab.json — caught only by checking. This pins
    // the whole set rather than the one symbol.
    const vocab = vocabData as Record<string, number>;
    for (const symbol of REDUCED_VOWELS) {
      expect(Object.hasOwn(vocab, symbol)).toBe(true);
      expect(isNucleus(symbol)).toBe(true);
    }
  });

  it('counts the vowels a textbook IPA list omits — ɚ and ᵻ are English syllables', () => {
    // Found by auditing the heads of the tokens the rule REJECTED, not by
    // trusting the vowel list. `better` /bɛtɚ/ and `roses` /ɹoʊzᵻz/ each lose
    // a syllable without these — and a lost syllable shifts every stress
    // index after it.
    for (const symbol of ['ɚ', 'ᵻ', 'ä', 'ũ']) {
      expect(isNucleus(symbol)).toBe(true);
    }
    expect(countSyllables(['b', 'ɛ', 't', 'ɚ'])).toBe(2);
    expect(countSyllables(['ɹ', 'oʊ', 'z', 'ᵻ', 'z'])).toBe(2);
  });

  it('still excludes the consonant look-alikes', () => {
    // `ʲ` is a palatalization modifier and `ɫ` is dark l — neither carries a
    // syllable. The syllabic form of l is the separate token `l̩`.
    expect(isNucleus('ʲ')).toBe(false);
    expect(isNucleus('ɫ')).toBe(false);
  });

  it('does not treat the full KIT vowel as reduced', () => {
    // `ɪ` is stressed in `bit`. Marking it reduced would rule out stress on
    // every syllable containing it.
    expect([...REDUCED_VOWELS]).not.toContain('ɪ');
  });

  it('does not count consonants', () => {
    for (const c of ['p', 'r', 'ɹ', 'ɾ', 't', 'ʃ']) {
      expect(isNucleus(c)).toBe(false);
    }
  });
});

describe('S1 — the detector reports one syllable index, not a per-syllable vector', () => {
  it('scores 100 for any accepted index and 0 otherwise', () => {
    expect(scoreStress({ detected: 2, accepted: [2] })).toBe(100);
    expect(scoreStress({ detected: 1, accepted: [2] })).toBe(0);
  });

  it('gives full credit for ANY accepted regional variant (A10 survives)', () => {
    // A10 bound stress to the never-penalize-a-correct-dialect rule (#2342).
    // Making the encoding an index did not weaken that — `accepted` simply
    // became a list of indices rather than a list of vectors.
    expect(scoreStress({ detected: 1, accepted: [1, 2] })).toBe(100);
    expect(scoreStress({ detected: 2, accepted: [1, 2] })).toBe(100);
    expect(scoreStress({ detected: 3, accepted: [1, 2] })).toBe(0);
  });
});

describe('S3 — the count mismatch A10b penalised no longer exists', () => {
  // Target `perro` /pero/ — two syllables. The student produces THREE nuclei.
  const target = ['p', 'e', 'r', 'o'];
  const spoken = [
    tp('p', 0, 3),
    tp('e', 3, 9),
    tp('r', 9, 11),
    tp('e', 11, 20),
    tp('o', 20, 23),
  ];
  const alignment: AlignmentEntryLike[] = [
    { position: 1, targetIPA: 'p', spokenIPA: 'p', status: 'correct' },
    { position: 2, targetIPA: 'e', spokenIPA: 'e', status: 'correct' },
    { position: 3, targetIPA: 'r', spokenIPA: 'r', status: 'correct' },
    { position: 4, targetIPA: 'o', spokenIPA: 'e', status: 'substituted' },
    { position: 4, targetIPA: null, spokenIPA: 'o', status: 'inserted' },
  ];

  it('maps a prominent nucleus onto its TARGET syllable despite the extra one', () => {
    const result = detectStress({
      spokenPhonemes: spoken,
      // The middle nucleus is longest and loudest, so it wins outright.
      measurements: [measure(0.2), measure(0.9), measure(0.2)],
      alignment,
      targetPhonemes: target,
      accepted: [2],
      config: CONFIG,
    });

    // Three syllables said against a two-syllable word, and it still scores
    // full credit. A10b measured agreement over the longer of the two
    // patterns and would have docked this; there is nothing left to mismatch.
    expect(result).toEqual({ detected: 2, accepted: [2] });
    expect(scoreStress(result!)).toBe(100);
  });

  it('S3a — a prominent nucleus that is an INSERTION is absent evidence, not a wrong answer', () => {
    const result = detectStress({
      spokenPhonemes: spoken,
      // Now the inserted final nucleus is the loudest and longest.
      measurements: [measure(0.1), measure(0.1), measure(0.9)],
      alignment,
      targetPhonemes: target,
      accepted: [2],
      config: CONFIG,
    });

    // It has no target counterpart, so there is no syllable it could have
    // stressed. Degrading beats inventing an answer.
    expect(result).toBeNull();
  });

  it('S3b — a nucleus substituted over a target CONSONANT is absent evidence', () => {
    // The student says `a` where the target has `p`: a vowel in the onset,
    // before the first target nucleus. No target syllable has been reached,
    // so there is nothing to have stressed. Mapping it to syllable 1 anyway
    // would assert a stress placement the student never made.
    const nuclei = extractNuclei([
      tp('a', 0, 4),
      tp('e', 4, 8),
      tp('r', 8, 10),
      tp('o', 10, 14),
    ]);
    const substitutedOnset: AlignmentEntryLike[] = [
      { position: 1, targetIPA: 'p', spokenIPA: 'a', status: 'substituted' },
      { position: 2, targetIPA: 'e', spokenIPA: 'e', status: 'correct' },
      { position: 3, targetIPA: 'r', spokenIPA: 'r', status: 'correct' },
      { position: 4, targetIPA: 'o', spokenIPA: 'o', status: 'correct' },
    ];
    expect(mapToTargetSyllable(nuclei[0], substitutedOnset, target)).toBeNull();
    // The genuine nuclei after it still map normally.
    expect(mapToTargetSyllable(nuclei[1], substitutedOnset, target)).toBe(1);
    expect(mapToTargetSyllable(nuclei[2], substitutedOnset, target)).toBe(2);
  });

  it('maps each nucleus to the target syllable that contains it', () => {
    const nuclei = extractNuclei([
      tp('p', 0, 2),
      tp('e', 2, 6),
      tp('r', 6, 8),
      tp('o', 8, 12),
    ]);
    expect(nuclei).toHaveLength(2);
    expect(mapToTargetSyllable(nuclei[0], allCorrect(target), target)).toBe(1);
    expect(mapToTargetSyllable(nuclei[1], allCorrect(target), target)).toBe(2);
  });
});

describe('S5 — absence is signalled by reporting nothing, never by an empty value', () => {
  const target = ['p', 'e', 'r', 'o'];
  const spoken = [
    tp('p', 0, 2),
    tp('e', 2, 8),
    tp('r', 8, 10),
    tp('o', 10, 16),
  ];

  it('reports nothing when two syllables are too close to call', () => {
    const result = detectStress({
      spokenPhonemes: spoken,
      measurements: [measure(0.5), measure(0.5)],
      alignment: allCorrect(target),
      targetPhonemes: target,
      accepted: [2],
      config: CONFIG,
    });
    expect(result).toBeNull();
  });

  it('reports nothing when there are no nuclei at all', () => {
    expect(
      detectStress({
        spokenPhonemes: [tp('p', 0, 2), tp('r', 2, 4)],
        measurements: [],
        alignment: allCorrect(target),
        targetPhonemes: target,
        accepted: [2],
        config: CONFIG,
      })
    ).toBeNull();
  });

  it('reports nothing when the measurement count does not match the nucleus count', () => {
    // A distinct guard from the one above: there ARE nuclei here, but the
    // caller supplied the wrong number of measurements, so the two arrays
    // cannot be zipped and any ranking would be against the wrong syllable.
    expect(
      detectStress({
        spokenPhonemes: spoken, // two nuclei
        measurements: [measure(0.5)], // one measurement
        alignment: allCorrect(target),
        targetPhonemes: target,
        accepted: [2],
        config: CONFIG,
      })
    ).toBeNull();
  });

  it('A10a — no accepted reference is absent evidence, so it reports nothing', () => {
    expect(
      detectStress({
        spokenPhonemes: spoken,
        measurements: [measure(0.1), measure(0.9)],
        alignment: allCorrect(target),
        targetPhonemes: target,
        accepted: [],
        config: CONFIG,
      })
    ).toBeNull();
  });

  it('never expresses uncertainty as a detected value — the type has no empty case', () => {
    // The trap recorded on #2359: `accepted: []` degrades, but an empty
    // DETECTED value against a populated `accepted` reads as "matched none of
    // it" and scores 0 at full weight. Every unreadable path above returns
    // null, so no caller can confuse the two.
    const unreadable = detectStress({
      spokenPhonemes: spoken,
      measurements: [measure(0.5), measure(0.5)],
      alignment: allCorrect(target),
      targetPhonemes: target,
      accepted: [2],
      config: CONFIG,
    });
    expect(unreadable).toBeNull();
    // A populated result is always a real syllable index, never a falsy one.
    const readable = detectStress({
      spokenPhonemes: spoken,
      measurements: [measure(0.1), measure(0.9)],
      alignment: allCorrect(target),
      targetPhonemes: target,
      accepted: [2],
      config: CONFIG,
    });
    expect(readable?.detected).toBeGreaterThan(0);
  });
});

describe('S4 — the four cues', () => {
  const target = ['ə', 'b', 'aʊ', 't'];
  // English `about` /əbaʊt/ — stress on the second syllable.
  const spoken = [
    tp('ə', 0, 5),
    tp('b', 5, 7),
    tp('aʊ', 7, 12),
    tp('t', 12, 14),
  ];
  const flat: NucleusMeasurement[] = [measure(0.5), measure(0.5)];

  it('uses the reduced vowel already in the phoneme stream to settle English', () => {
    // Identical duration, energy and pitch — acoustically a coin flip. The ə
    // decides it, at no measurement cost.
    const result = detectStress({
      spokenPhonemes: spoken,
      measurements: flat,
      alignment: allCorrect(target),
      targetPhonemes: target,
      accepted: [2],
      config: { ...CONFIG, language: 'en' },
    });
    expect(result).toEqual({ detected: 2, accepted: [2] });
  });

  it('does NOT apply the reduced-vowel cue to Spanish, which does not reduce vowels', () => {
    // Same input, Spanish. There is genuinely nothing to go on, so it degrades
    // rather than borrowing an English rule that would be wrong here.
    const result = detectStress({
      spokenPhonemes: spoken,
      measurements: flat,
      alignment: allCorrect(target),
      targetPhonemes: target,
      accepted: [2],
      config: { ...CONFIG, language: 'es' },
    });
    expect(result).toBeNull();
  });

  it('redistributes the pitch weight when pitch is untracked, rather than scoring it zero', () => {
    const nuclei = extractNuclei(spoken);
    // Second nucleus is louder; pitch could not be tracked on the first.
    const untracked = [measure(0.2, null), measure(0.8, 300)];
    const withoutPitch = prominenceScores(
      nuclei,
      [measure(0.2), measure(0.8)],
      {
        ...CONFIG,
        cueWeights: { duration: 1, energy: 1, pitch: 0 },
      }
    );
    expect(prominenceScores(nuclei, untracked, CONFIG)).toEqual(withoutPitch);
  });

  it('ranks a longer, louder, higher-pitched syllable as the prominent one', () => {
    const nuclei = extractNuclei(spoken);
    const scores = prominenceScores(
      nuclei,
      [measure(0.1, 180), measure(0.9, 260)],
      CONFIG
    );
    expect(scores[1]).toBeGreaterThan(scores[0]);
  });

  it('compares only within the word, so recording level cancels out', () => {
    const nuclei = extractNuclei(spoken);
    const quiet = prominenceScores(
      nuclei,
      [measure(0.05, 180), measure(0.45, 260)],
      CONFIG
    );
    const loud = prominenceScores(
      nuclei,
      [measure(0.5, 180), measure(4.5, 260)],
      CONFIG
    );
    expect(quiet).toEqual(loud);
  });
});

describe('scope guard', () => {
  it('reports lexical stress only — one index per word, and nothing else', () => {
    const target = ['p', 'e', 'r', 'o'];
    const result = detectStress({
      spokenPhonemes: [
        tp('p', 0, 2),
        tp('e', 2, 8),
        tp('r', 8, 10),
        tp('o', 10, 16),
      ],
      measurements: [measure(0.1), measure(0.9)],
      alignment: allCorrect(target),
      targetPhonemes: target,
      accepted: [2],
      config: CONFIG,
    });
    // No rhythm, no intonation contour, no fluency measure anywhere in the
    // payload. Fluency, rhythm and intonation remain out of scope on the map.
    expect(Object.keys(result!).sort()).toEqual(['accepted', 'detected']);
  });
});
