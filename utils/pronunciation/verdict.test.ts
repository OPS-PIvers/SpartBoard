import { describe, expect, it } from 'vitest';
import type {
  FlashcardSpeakReference,
  SpeakDialect,
  SpeakGroupSetting,
  SpeakLanguage,
} from '@/types';
import {
  PRONUNCIATION_GROUPS,
  RECOGNIZER_TOLERANCE,
  SPEAK_DIALECTS,
  SPEAK_LANGUAGES,
  SPEAK_PRESET_IDS,
  STRESS_GROUP_ID,
  speakPresetSettings,
} from '@/config/pronunciationGroups';
import { EmptyReferenceError } from './score';
import { logSoftmax } from './likelihood';
import vocab from './xlsr53EspeakVocab.json';
import {
  effectiveGroupSettings,
  judgeSpeech,
  SPEAK_MIN_VOICED_MS,
  type SpeakJudgeInput,
} from './verdict';

const ref = (
  tokens: string[],
  dialect: SpeakDialect = 'es-419',
  stress: number[] = []
): FlashcardSpeakReference => ({ dialect, tokens, stress });

const BEGINNER_ES = speakPresetSettings('es', 'beginner');

function judge(
  refs: FlashcardSpeakReference[],
  spoken: string[],
  extra: Partial<SpeakJudgeInput> = {}
) {
  return judgeSpeech({
    refs,
    spoken,
    stressFor: () => null,
    confidence: 0.9,
    voicedMs: 600,
    language: 'es',
    settings: BEGINNER_ES,
    unclearConfidence: 0.5,
    ...extra,
  });
}

const PERRO = ['p', 'e', 'r', 'o'];
const PERO = ['p', 'e', 'ɾ', 'o'];
const kinds = (r: ReturnType<typeof judge>) => r.entries.map((e) => e.kind);

describe('§4.1 classification rows', () => {
  it('a matching take is Exact', () => {
    const r = judge([ref(PERRO)], PERRO);
    expect([r.verdict, r.accuracy, r.forgivenGroups]).toEqual([
      'exact',
      100,
      [],
    ]);
  });

  it('a tolerated pair counts as correct and is not tallied as missed or forgiven', () => {
    const r = judge([ref(PERO)], PERRO);
    expect(kinds(r)).toEqual(['correct', 'correct', 'tolerated', 'correct']);
    expect([r.verdict, r.accuracy]).toEqual(['exact', 100]);
    expect(r.tally['ɾ']).toEqual({ n: 1, m: 0, f: 0 });
  });

  it('tolerance applies under every preset and under Strict', () => {
    for (const preset of SPEAK_PRESET_IDS) {
      const r = judge([ref(PERO)], PERRO, {
        settings: speakPresetSettings('es', preset),
      });
      expect(r.verdict).toBe('exact');
    }
    const strict = judge([ref(PERO)], PERRO, {
      settings: { strict: true, groups: { 'es-tap': 'require' } },
    });
    expect(strict.verdict).toBe('exact');
  });

  it('every es tolerance pair is tolerated', () => {
    for (const pair of RECOGNIZER_TOLERANCE.es) {
      const r = judge([ref(['a', pair.target])], ['a', pair.spoken], {
        settings: { strict: true, groups: {} },
      });
      expect(r.entries[1].kind).toBe('tolerated');
      expect(r.verdict).toBe('exact');
    }
  });

  it('a forgiven group pair is Accepted and names the group', () => {
    const r = judge([ref(PERRO)], PERO);
    expect(r.entries[2]).toMatchObject({
      kind: 'forgiven',
      groupId: 'es-trill',
    });
    expect([r.verdict, r.forgivenGroups]).toEqual(['accepted', ['es-trill']]);
    expect(r.tally.r).toEqual({ n: 1, m: 0, f: 1 });
  });

  it('a required group pair is Not yet and still names its group', () => {
    const r = judge([ref(PERRO)], PERO, {
      settings: speakPresetSettings('es', 'advanced'),
    });
    expect(r.entries[2]).toMatchObject({ kind: 'error', groupId: 'es-trill' });
    expect([r.verdict, r.forgivenGroups]).toEqual(['wrong', []]);
    expect(r.tally.r).toEqual({ n: 1, m: 1, f: 0 });
  });

  it('a substitution outside every group is an error with no group', () => {
    const r = judge([ref(PERRO)], ['p', 'a', 'r', 'o']);
    expect(r.entries[1]).toMatchObject({ kind: 'error' });
    expect(r.entries[1].groupId).toBeUndefined();
    expect(r.verdict).toBe('wrong');
  });

  it('an omission is an error and tallied as missed', () => {
    const r = judge([ref(PERRO)], ['p', 'e', 'o']);
    expect(r.entries.map((e) => [e.status, e.kind])).toContainEqual([
      'omitted',
      'error',
    ]);
    expect(r.verdict).toBe('wrong');
    expect(r.tally.r).toEqual({ n: 1, m: 1, f: 0 });
  });

  it('a non-held insertion is an error but not tallied against a target token', () => {
    const r = judge([ref(PERRO)], ['p', 'e', 'r', 'o', 's']);
    expect(r.entries[4]).toMatchObject({ status: 'inserted', kind: 'error' });
    expect(r.verdict).toBe('wrong');
    expect(Object.values(r.tally).every((t) => t.m === 0)).toBe(true);
  });

  it('a held repeat is not an error (T1)', () => {
    const r = judge([ref(PERRO)], ['p', 'e', 'r', 'r', 'o']);
    expect(kinds(r)).toContain('held');
    expect([r.verdict, r.accuracy]).toEqual(['exact', 100]);
  });

  it('every forgiven entry is explained by a group (no typo budget)', () => {
    const r = judge([ref(PERRO)], ['b', 'e', 'ɾ', 'o']);
    expect(r.verdict).toBe('wrong');
    expect(
      r.entries.filter((e) => e.kind === 'forgiven').every((e) => e.groupId)
    ).toBe(true);
  });
});

describe('stress', () => {
  const CASA = ref(['k', 'a', 's', 'a'], 'es-419', [0]);

  it('is not judged without a confirmed reference, and stressFor is not asked', () => {
    let asked = false;
    const r = judge([ref(['k', 'a', 's', 'a'])], ['k', 'a', 's', 'a'], {
      stressFor: () => {
        asked = true;
        return 1;
      },
    });
    expect([r.stress, r.verdict, asked]).toEqual([
      'not-judged',
      'exact',
      false,
    ]);
  });

  it('is not judged when the detector returns null', () => {
    expect(judge([CASA], ['k', 'a', 's', 'a']).stress).toBe('not-judged');
  });

  it('is correct when the detected syllable is accepted', () => {
    const r = judge([CASA], ['k', 'a', 's', 'a'], { stressFor: () => 0 });
    expect([r.stress, r.verdict]).toEqual(['correct', 'exact']);
  });

  it('is forgiven under a forgiving stress group, and Accepted', () => {
    const r = judge([CASA], ['k', 'a', 's', 'a'], { stressFor: () => 1 });
    expect([r.stress, r.verdict, r.forgivenGroups]).toEqual([
      'forgiven',
      'accepted',
      [STRESS_GROUP_ID],
    ]);
    expect(r.tally[STRESS_GROUP_ID]).toBeUndefined();
  });

  it('is an error under a required stress group, and Not yet', () => {
    const r = judge([CASA], ['k', 'a', 's', 'a'], {
      stressFor: () => 1,
      settings: speakPresetSettings('es', 'advanced'),
    });
    expect([r.stress, r.verdict]).toEqual(['error', 'wrong']);
  });

  it('receives each dialect its own reference and alignment', () => {
    const seen: string[] = [];
    judge([ref(['a'], 'es-419', [0]), ref(['a', 'b'], 'es-ES', [0])], ['a'], {
      stressFor: (r, alignment) => {
        seen.push(`${r.dialect}:${alignment.length}`);
        return 0;
      },
    });
    expect(seen).toEqual(['es-419:1', 'es-ES:2']);
  });
});

describe('every preset × group setting', () => {
  for (const language of SPEAK_LANGUAGES) {
    for (const group of PRONUNCIATION_GROUPS[language]) {
      if (group.pairs.length === 0) continue;
      const pair = group.pairs[0];
      const input = (settings: SpeakJudgeInput['settings']) =>
        judge(
          [ref(['m', pair.target], SPEAK_DIALECTS[language][0])],
          ['m', pair.spoken],
          { language, settings }
        );

      for (const preset of SPEAK_PRESET_IDS) {
        it(`${language} ${preset} ${group.id}`, () => {
          const settings = speakPresetSettings(language, preset);
          const effective = effectiveGroupSettings(language, settings)[
            group.id
          ];
          const r = input(settings);
          expect(r.verdict).toBe(
            effective === 'forgive' ? 'accepted' : 'wrong'
          );
          expect(r.entries[1].groupId).toBe(group.id);
        });
      }

      const cases: Array<[SpeakGroupSetting, boolean, string]> = [
        ['follow', false, 'accepted'],
        ['follow', true, 'wrong'],
        ['forgive', false, 'accepted'],
        ['forgive', true, 'accepted'],
        ['require', false, 'wrong'],
        ['require', true, 'wrong'],
      ];
      it.each(cases)(
        `${language} ${group.id}: %s with strict %s is %s`,
        (setting, strict, verdict) => {
          expect(
            input({ strict, groups: { [group.id]: setting } }).verdict
          ).toBe(verdict);
        }
      );
    }
  }

  it('every pair of every group is attributed to its group at the last position', () => {
    for (const language of SPEAK_LANGUAGES) {
      for (const group of PRONUNCIATION_GROUPS[language]) {
        for (const pair of group.pairs) {
          const r = judge(
            [ref(['m', pair.target], SPEAK_DIALECTS[language][0])],
            ['m', pair.spoken],
            { language, settings: { strict: false, groups: {} } }
          );
          expect(r.entries[1]).toMatchObject({
            kind: 'forgiven',
            groupId: group.id,
          });
        }
      }
    }
  });

  it('a stored unknown setting follows Strict', () => {
    const groups = { 'es-trill': 'Forgive' } as unknown as Record<
      string,
      SpeakGroupSetting
    >;
    expect(
      effectiveGroupSettings('es', { strict: true, groups })['es-trill']
    ).toBe('require');
  });

  it('Beginner forgives the trill and requires the vowels (Paul’s example)', () => {
    const groups = effectiveGroupSettings('es', BEGINNER_ES);
    expect(groups['es-trill']).toBe('forgive');
    expect(groups['es-vowel-glide']).toBe('require');
    expect(groups['es-vowel-reduce']).toBe('require');
  });

  it('an unset group follows Strict, and unknown keys are ignored', () => {
    expect(
      effectiveGroupSettings('de', {
        strict: true,
        groups: { bogus: 'forgive' },
      })
    ).toEqual(
      Object.fromEntries(PRONUNCIATION_GROUPS.de.map((g) => [g.id, 'require']))
    );
  });
});

describe('final pairs', () => {
  const de = {
    language: 'de' as SpeakLanguage,
    settings: speakPresetSettings('de', 'beginner'),
  };
  const dialect: SpeakDialect = 'de-DE';

  it('apply at the last position (Hund)', () => {
    const r = judge(
      [ref(['h', 'ʊ', 'n', 't'], dialect)],
      ['h', 'ʊ', 'n', 'd'],
      de
    );
    expect(r.entries[3]).toMatchObject({
      kind: 'forgiven',
      groupId: 'de-final',
    });
    expect(r.verdict).toBe('accepted');
  });

  it('do not apply away from the end (Tante)', () => {
    const r = judge(
      [ref(['t', 'a', 'n', 't', 'ə'], dialect)],
      ['d', 'a', 'n', 't', 'ə'],
      de
    );
    expect(r.entries[0].kind).toBe('error');
    expect(r.entries[0].groupId).toBeUndefined();
    expect(r.verdict).toBe('wrong');
  });

  it('en final voicing only at the end', () => {
    const en = {
      language: 'en' as SpeakLanguage,
      settings: speakPresetSettings('en', 'beginner'),
    };
    expect(
      judge([ref(['d', 'ɑ', 'ɡ', 'z'], 'en-US')], ['d', 'ɑ', 'ɡ', 's'], en)
        .verdict
    ).toBe('accepted');
    expect(judge([ref(['z', 'uː'], 'en-US')], ['s', 'uː'], en).verdict).toBe(
      'wrong'
    );
  });
});

describe('dialect selection', () => {
  const ES_419 = ref(['s', 'a', 'p', 'a', 't', 'o'], 'es-419');
  const ES_ES = ref(['θ', 'a', 'p', 'a', 't', 'o'], 'es-ES');

  it('picks the dialect the student matched', () => {
    expect(
      judge([ES_ES, ES_419], ['s', 'a', 'p', 'a', 't', 'o'])
    ).toMatchObject({
      verdict: 'exact',
      dialect: 'es-419',
    });
    expect(
      judge([ES_419, ES_ES], ['θ', 'a', 'p', 'a', 't', 'o'])
    ).toMatchObject({
      verdict: 'exact',
      dialect: 'es-ES',
    });
  });

  it('Exact beats Accepted across dialects', () => {
    const trill = ref(PERRO, 'es-419');
    const tap = ref(PERO, 'es-ES');
    expect(judge([trill, tap], PERO)).toMatchObject({
      verdict: 'exact',
      dialect: 'es-ES',
    });
  });

  it('Accepted beats Not yet across dialects', () => {
    const a = ref(['p', 'e', 'r', 'o', 'l'], 'es-419');
    const b = ref(PERRO, 'es-ES');
    expect(judge([a, b], PERO)).toMatchObject({
      verdict: 'accepted',
      dialect: 'es-ES',
    });
  });

  it('breaks an Accepted tie by accuracy', () => {
    const longer = ref(['p', 'e', 'r', 'o', 's'], 'es-419');
    const exact = ref(PERRO, 'es-ES');
    expect(judge([longer, exact], ['p', 'e', 'ɾ', 'o', 's'])).toMatchObject({
      verdict: 'accepted',
      dialect: 'es-419',
      accuracy: 80,
    });
    expect(judge([exact, longer], ['p', 'e', 'ɾ', 'o'])).toMatchObject({
      verdict: 'accepted',
      dialect: 'es-ES',
      accuracy: 75,
    });
  });

  it('breaks a verdict tie by accuracy, then by reference order', () => {
    const far = ref(['x', 'x', 'x', 'o'], 'es-419');
    const near = ref(['p', 'e', 'x', 'o'], 'es-ES');
    expect(judge([far, near], PERRO)).toMatchObject({
      verdict: 'wrong',
      dialect: 'es-ES',
      accuracy: 75,
    });
    expect(
      judge([ref(PERRO, 'es-419'), ref(PERRO, 'es-ES')], PERRO).dialect
    ).toBe('es-419');
  });

  it('a different word is Not yet, not unclear', () => {
    const r = judge([ref(PERRO)], ['ɡ', 'a', 't', 'o']);
    expect(r.verdict).toBe('wrong');
    expect(r.dialect).toBe('es-419');
  });
});

describe('§4.4 unclear', () => {
  const unclear = {
    verdict: 'unclear',
    dialect: null,
    accuracy: 0,
    entries: [],
    stress: 'not-judged',
    forgivenGroups: [],
    tally: {},
  };

  it('under 150 ms of voiced audio', () => {
    expect(
      judge([ref(PERRO)], PERRO, { voicedMs: SPEAK_MIN_VOICED_MS - 1 })
    ).toEqual(unclear);
    expect(
      judge([ref(PERRO)], PERRO, { voicedMs: SPEAK_MIN_VOICED_MS }).verdict
    ).toBe('exact');
  });

  it('no recognized token', () => {
    expect(judge([ref(PERRO)], [])).toEqual(unclear);
  });

  it('confidence below the cut-off', () => {
    expect(judge([ref(PERRO)], PERRO, { confidence: 0.49 })).toEqual(unclear);
    expect(judge([ref(PERRO)], PERRO, { confidence: 0.5 }).verdict).toBe(
      'exact'
    );
  });

  it('an infinite reading is unclear, never a verdict', () => {
    expect(judge([ref(PERRO)], PERRO, { confidence: Infinity }).verdict).toBe(
      'unclear'
    );
    expect(judge([ref(PERRO)], PERRO, { voicedMs: Infinity }).verdict).toBe(
      'unclear'
    );
  });

  it('throws on a non-finite cut-off instead of hearing nothing forever', () => {
    expect(() =>
      judge([ref(PERRO)], PERRO, { unclearConfidence: NaN })
    ).toThrow(RangeError);
  });

  it('a NaN reading is unclear, never a verdict', () => {
    expect(judge([ref(PERRO)], PERRO, { confidence: NaN }).verdict).toBe(
      'unclear'
    );
    expect(judge([ref(PERRO)], PERRO, { voicedMs: NaN }).verdict).toBe(
      'unclear'
    );
  });

  it('never asks for stress', () => {
    let asked = false;
    judge([ref(PERRO, 'es-419', [0])], [], {
      stressFor: () => {
        asked = true;
        return 0;
      },
    });
    expect(asked).toBe(false);
  });
});

describe('references', () => {
  it('throws on no references or an empty one', () => {
    expect(() => judge([], PERRO)).toThrow(EmptyReferenceError);
    expect(() => judge([ref([])], PERRO)).toThrow(EmptyReferenceError);
  });
});

describe('tally', () => {
  it('counts every target token of the chosen dialect', () => {
    const r = judge([ref(['m', 'a', 'm', 'a'])], ['m', 'a', 'n', 'a']);
    expect(r.tally).toEqual({
      m: { n: 2, m: 1, f: 0 },
      a: { n: 2, m: 0, f: 0 },
    });
  });
});

// Seeded generator instead of a fast-check dependency; same property, reproducible.
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('property: forgiving never hurts, requiring never helps', () => {
  const rank = { wrong: 0, accepted: 1, exact: 2, unclear: -1 } as const;
  const settingsPool: Array<SpeakGroupSetting | undefined> = [
    'follow',
    'forgive',
    'require',
    undefined,
  ];

  for (const language of SPEAK_LANGUAGES) {
    it(language, () => {
      const rand = mulberry32(language.charCodeAt(0) * 7919);
      const pick = <T>(list: readonly T[]) =>
        list[Math.floor(rand() * list.length)];
      const groups = PRONUNCIATION_GROUPS[language];
      const pairs = [
        ...groups.flatMap((g) => g.pairs),
        ...RECOGNIZER_TOLERANCE[language],
      ];
      const filler = ['a', 'm', 'n', 'l', 's'];

      for (let run = 0; run < 400; run++) {
        const len = 1 + Math.floor(rand() * 5);
        const dialects = SPEAK_DIALECTS[language];
        const refs = dialects.map((dialect) => {
          const tokens = Array.from({ length: len }, () =>
            rand() < 0.6 ? pick(pairs).target : pick(filler)
          );
          return ref(tokens, dialect, rand() < 0.5 ? [0] : []);
        });
        const spoken = refs[0].tokens.flatMap((t) => {
          const roll = rand();
          if (roll < 0.1) return [];
          if (roll < 0.15) return [t, pick(filler)];
          const swaps = pairs.filter((p) => p.target === t);
          return roll < 0.75 && swaps.length > 0 ? [pick(swaps).spoken] : [t];
        });
        const detected = Math.floor(rand() * 2);
        const settings = {
          strict: rand() < 0.5,
          groups: Object.fromEntries(
            groups.flatMap((g) => {
              const setting = pick(settingsPool);
              return setting ? [[g.id, setting]] : [];
            })
          ),
        };
        const base = { language, stressFor: () => detected };
        const groupId = pick(groups).id;
        const before = judge(refs, spoken, { ...base, settings });
        const forgiving = judge(refs, spoken, {
          ...base,
          settings: {
            ...settings,
            groups: { ...settings.groups, [groupId]: 'forgive' },
          },
        });
        const requiring = judge(refs, spoken, {
          ...base,
          settings: {
            ...settings,
            groups: { ...settings.groups, [groupId]: 'require' },
          },
        });
        expect(rank[forgiving.verdict]).toBeGreaterThanOrEqual(
          rank[before.verdict]
        );
        expect(rank[requiring.verdict]).toBeLessThanOrEqual(
          rank[before.verdict]
        );
        const strictOn = judge(refs, spoken, {
          ...base,
          settings: { ...settings, strict: true },
        });
        expect(rank[strictOn.verdict]).toBeLessThanOrEqual(
          rank[before.verdict]
        );
      }
    });
  }
});

describe('likelihood segments (S11c)', () => {
  const VOCAB: Record<string, number> = vocab;
  const V = Object.keys(VOCAB).length;
  // Each frame strongly favours one symbol; '-' is the CTC blank.
  const spokenAs = (frames: string[]) => {
    const logits = new Float32Array(frames.length * V);
    frames.forEach((f, t) => {
      logits[t * V + (f === '-' ? 0 : VOCAB[f])] = 8;
    });
    return {
      data: logSoftmax(logits, frames.length, V),
      frames: frames.length,
      vocabSize: V,
    };
  };
  const OLA = ['o', 'l', 'a'];

  it('judges segments from the log-probabilities, not the greedy tokens', () => {
    const logProbs = spokenAs(['-', 'o', 'o', '-', 'l', '-', 'a', 'a', '-']);
    // The greedy tokens say "ole"; the frames say "ola".
    const r = judge([ref(OLA)], ['o', 'l', 'e'], { logProbs });
    expect(r.verdict).toBe('exact');
    const wrong = judge([ref(OLA)], OLA, {
      logProbs: spokenAs(['-', 'o', 'o', '-', 'l', '-', 'e', 'e', '-']),
    });
    expect(wrong.verdict).toBe('wrong');
    expect(wrong.entries[2]).toMatchObject({ targetIPA: 'a', spokenIPA: 'e' });
  });

  it('still reads an unclear take from the greedy tokens and confidence', () => {
    const logProbs = spokenAs(['-', 'o', '-', 'l', '-', 'a', '-']);
    expect(judge([ref(OLA)], [], { logProbs }).verdict).toBe('unclear');
    expect(judge([ref(OLA)], OLA, { logProbs, confidence: 0.1 }).verdict).toBe(
      'unclear'
    );
  });

  it('falls back to the greedy tokens for a reference the model cannot spell', () => {
    const logProbs = spokenAs(['-', 'o', '-', 'l', '-', 'a', '-']);
    expect(judge([ref(['☃'])], ['o'], { logProbs }).verdict).toBe('wrong');
  });

  it('places a winning voice reference on the espeak reference letters', () => {
    const letters: FlashcardSpeakReference = {
      ...ref(['a', 'b', 'c']),
      letterSpans: [0, 1, 1, 2, 2, 3],
    };
    const voice: FlashcardSpeakReference = {
      ...ref(['a', 'x', 'b', 'c']),
      source: 'voice',
    };
    const r = judge([letters, voice], ['a', 'x', 'b', 'd']);
    expect(r.verdict).toBe('wrong');
    const error = r.entries.find((e) => e.kind === 'error');
    // Voice position 4 (c) sits on espeak position 3.
    expect(error).toMatchObject({
      position: 3,
      targetIPA: 'c',
      spokenIPA: 'd',
    });
    expect(Math.max(...r.entries.map((e) => e.position))).toBeLessThanOrEqual(
      3
    );
  });
});
