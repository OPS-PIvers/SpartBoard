import { existsSync, readFileSync } from 'node:fs';
import os from 'node:os';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
  computeSpeakReferences,
  SPEAK_G2P_VERSION,
  SPEAK_G2P_VOICES_PENDING,
} from './lookup';
import { loadPhonemizer } from './espeak';
import type { SpeakLookupInput } from './types';
import { parseLinear16Wav } from './voiceAudio';
import {
  createVoiceReader,
  voiceReference,
  VoiceServiceError,
  type ModelOutput,
  type VoiceReader,
} from './voiceRefs';
import { PRONUNCIATION_MODEL, PRONUNCIATION_VOICES } from './voices';
import { VOCAB_TOKENS } from './vocab';

const FIXTURES = resolve(__dirname, 'testdata/voices');
const wav = (name: string) =>
  new Uint8Array(readFileSync(resolve(FIXTURES, name)));
// The pinned model's greedy readings of the recorded takes, from the real model.
const recorded = JSON.parse(
  readFileSync(resolve(FIXTURES, 'readings.json'), 'utf8')
) as Record<string, string[]>;

const reader = (
  readings: Record<string, string[] | Error>
): VoiceReader & { calls: string[] } => {
  const calls: string[] = [];
  return {
    calls,
    read(voice) {
      calls.push(voice);
      const r = readings[voice] ?? [];
      return r instanceof Error ? Promise.reject(r) : Promise.resolve(r);
    },
  };
};

const es = (terms: SpeakLookupInput['terms']): SpeakLookupInput => ({
  language: 'es',
  dialects: ['es-419', 'es-ES'],
  terms,
});

beforeAll(async () => {
  await loadPhonemizer();
});

describe('voice references in the lookup', () => {
  it('adds each distinct reading once, after the espeak refs, on its own dialect', async () => {
    const voices = reader({
      'es-ES-Neural2-A': ['p', 'e', 'ɾ', 'o'],
      'es-ES-Neural2-F': ['p', 'e', 'ɾ', 'o'],
      'es-US-Neural2-A': ['p', 'e', 'r', 'r', 'o'],
      // The espeak reading itself adds nothing.
      'es-US-Wavenet-C': ['p', 'e', 'r', 'o'],
    });
    const out = await computeSpeakReferences(
      es([{ cardId: 'c1', term: 'perro' }]),
      undefined,
      { voices }
    );
    const card = out.cards.c1;
    expect(voices.calls).toEqual(PRONUNCIATION_VOICES.es);
    expect(card.g2pVersion).toBe(SPEAK_G2P_VERSION);
    expect(card.status).toBe('ready');
    expect(card.refs.slice(0, 2).map((r) => r.source)).toEqual([
      undefined,
      undefined,
    ]);
    const added = card.refs.slice(2);
    expect(added).toEqual([
      {
        dialect: 'es-ES',
        tokens: ['p', 'e', 'ɾ', 'o'],
        stress: [0],
        source: 'voice',
      },
      {
        dialect: 'es-419',
        tokens: ['p', 'e', 'r', 'r', 'o'],
        stress: [0],
        source: 'voice',
      },
    ]);
    expect(added.every((r) => r.letterSpans === undefined)).toBe(true);
  });

  it('drops stress when the reading has another vowel count', async () => {
    const out = await computeSpeakReferences(
      {
        language: 'de',
        dialects: ['de-DE'],
        terms: [{ cardId: 'c1', term: 'Auge' }],
      },
      undefined,
      { voices: reader({ 'de-DE-Neural2-G': ['a', 'ʊ', 'ɡ', 'ə'] }) }
    );
    expect(out.cards.c1.refs[1]).toMatchObject({
      tokens: ['a', 'ʊ', 'ɡ', 'ə'],
      stress: [],
    });
  });

  it('only asks the voices of the dialects the set uses', async () => {
    const voices = reader({});
    await computeSpeakReferences(
      {
        language: 'es',
        dialects: ['es-ES'],
        terms: [{ cardId: 'c1', term: 'gato' }],
      },
      undefined,
      { voices }
    );
    expect(voices.calls).toEqual(
      PRONUNCIATION_VOICES.es.filter((v) => v.startsWith('es-ES'))
    );
  });

  it('skips an overridden dialect and an unavailable card', async () => {
    const voices = reader({});
    const out = await computeSpeakReferences(
      es([
        { cardId: 'c1', term: 'gato', ipaOverride: { 'es-ES': 'ɡato' } },
        { cardId: 'c2', term: 'dos palabras' },
      ]),
      undefined,
      { voices }
    );
    expect(voices.calls).toEqual(
      PRONUNCIATION_VOICES.es.filter((v) => v.startsWith('es-US'))
    );
    expect(out.cards.c2.g2pVersion).toBe(SPEAK_G2P_VERSION);
  });

  it('marks a card pending when a voice fails, keeping the readings it got', async () => {
    const out = await computeSpeakReferences(
      es([{ cardId: 'c1', term: 'perro' }]),
      undefined,
      {
        voices: reader({
          'es-ES-Neural2-A': ['p', 'e', 'ɾ', 'o'],
          'es-US-Neural2-B': new Error('UNAVAILABLE'),
        }),
      }
    );
    expect(out.g2pVersion).toBe(SPEAK_G2P_VERSION);
    expect(out.cards.c1.g2pVersion).toBe(SPEAK_G2P_VOICES_PENDING);
    expect(out.cards.c1.refs.filter((r) => r.source === 'voice')).toHaveLength(
      1
    );
  });

  it('stops asking voices for the rest of the request once the service refuses', async () => {
    const voices = reader(
      Object.fromEntries(
        PRONUNCIATION_VOICES.es.map((v) => [v, new VoiceServiceError('off')])
      )
    );
    const out = await computeSpeakReferences(
      es([
        { cardId: 'c1', term: 'perro' },
        { cardId: 'c2', term: 'gato' },
      ]),
      undefined,
      { voices }
    );
    expect(voices.calls).toHaveLength(8);
    expect(out.cards.c2.g2pVersion).toBe(SPEAK_G2P_VOICES_PENDING);
    expect(out.cards.c2.refs).toHaveLength(2);
    expect(out.cards.c2.status).toBe('ready');
  });

  it('leaves cards past the time budget pending with their espeak refs', async () => {
    const voices = reader({});
    const out = await computeSpeakReferences(
      es([{ cardId: 'c1', term: 'perro' }]),
      undefined,
      { voices, voiceBudgetMs: 0 }
    );
    expect(voices.calls).toEqual([]);
    expect(out.cards.c1).toMatchObject({
      g2pVersion: SPEAK_G2P_VOICES_PENDING,
      status: 'ready',
    });
    expect(out.cards.c1.refs).toHaveLength(2);
  });
});

describe('voiceReference', () => {
  const base = {
    dialect: 'en-US' as const,
    tokens: ['k', 'æ', 't'],
    stress: [0],
  };

  it('refuses empty, special-token and oversized readings', () => {
    expect(voiceReference(base, [])).toBeNull();
    expect(voiceReference(base, ['k', '<unk>', 't'])).toBeNull();
    expect(voiceReference(base, ['k', '??'])).toBeNull();
    expect(voiceReference(base, Array(65).fill('t'))).toBeNull();
  });
});

describe('createVoiceReader', () => {
  it('reads the recorded LINEAR16 takes as 16 kHz mono', () => {
    const pcm = parseLinear16Wav(wav('es-ES-Neural2-A_perro.wav'));
    expect(pcm).not.toBeNull();
    expect(pcm!.length).toBeGreaterThan(8000);
    expect(Math.max(...pcm!.map(Math.abs))).toBeLessThanOrEqual(1);
    expect(parseLinear16Wav(new Uint8Array(44))).toBeNull();
  });

  it('trims and normalizes the take, then greedy-decodes the model output', async () => {
    const fake = vi.fn((input: Float32Array): Promise<ModelOutput> => {
      const ids = [
        0,
        VOCAB_TOKENS.indexOf('p'),
        VOCAB_TOKENS.indexOf('p'),
        0,
        VOCAB_TOKENS.indexOf('o'),
      ];
      const data = new Float32Array(ids.length * PRONUNCIATION_MODEL.vocabSize);
      ids.forEach(
        (id, f) => (data[f * PRONUNCIATION_MODEL.vocabSize + id] = 1)
      );
      expect(
        Math.abs(input.reduce((a, b) => a + b, 0) / input.length)
      ).toBeLessThan(1e-3);
      return Promise.resolve({
        data,
        frames: ids.length,
        size: PRONUNCIATION_MODEL.vocabSize,
      });
    });
    const r = createVoiceReader({
      synthesize: () => Promise.resolve(wav('es-ES-Neural2-A_perro.wav')),
      runModel: fake,
    });
    expect(await r.read('es-ES-Neural2-A', 'perro')).toEqual(['p', 'o']);
    expect(await r.read('es-ES-Neural2-A', 'perro')).toEqual(['p', 'o']);
    expect(fake).toHaveBeenCalledTimes(1);
    const raw = parseLinear16Wav(wav('es-ES-Neural2-A_perro.wav'))!;
    expect(fake.mock.calls[0][0].length).toBeLessThan(raw.length);
  });

  it('gives no reading when the voice gives no audio', async () => {
    const runModel = vi.fn();
    const r = createVoiceReader({
      synthesize: () => Promise.resolve(null),
      runModel,
    });
    expect(await r.read('en-US-Neural2-A', 'cat')).toEqual([]);
    expect(runModel).not.toHaveBeenCalled();
  });

  const modelPath = resolve(
    os.homedir(),
    `.cache/spartboard-pronunciation/${PRONUNCIATION_MODEL.id}.onnx`
  );
  // CI has no model; run locally with the gate's cached copy to check the recorded readings.
  it.skipIf(!existsSync(modelPath))(
    'matches the real model on the recorded takes',
    async () => {
      const ort = await import('onnxruntime-web');
      const session = await ort.InferenceSession.create(
        readFileSync(modelPath),
        {
          executionProviders: ['wasm'],
        }
      );
      const r = createVoiceReader({
        synthesize: (voice, word) =>
          Promise.resolve(wav(`${voice}_${word}.wav`)),
        runModel: async (input) => {
          const out = (
            await session.run({
              [session.inputNames[0]]: new ort.Tensor('float32', input, [
                1,
                input.length,
              ]),
            })
          )[session.outputNames[0]];
          return {
            data: out.data as Float32Array,
            frames: out.dims[1],
            size: out.dims[2],
          };
        },
      });
      for (const [file, tokens] of Object.entries(recorded)) {
        const [voice, word] = file.replace('.wav', '').split('_');
        expect(await r.read(voice, word)).toEqual(tokens);
      }
    },
    120_000
  );
});
