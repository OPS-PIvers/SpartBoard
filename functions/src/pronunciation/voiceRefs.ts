// Voiced-example references (S11a): Cloud TTS voices speak the term, the pinned model reads each take, and each distinct reading is accepted too.
import { createHash } from 'node:crypto';
import os from 'node:os';
import * as admin from 'firebase-admin';
import * as logger from 'firebase-functions/logger';
import type { TextToSpeechClient } from '@google-cloud/text-to-speech';
import type { FlashcardSpeakReference } from './types';
import { NUCLEUS_TOKENS, VOCAB_TOKENS } from './vocab';
import {
  MODEL_SAMPLE_RATE,
  greedyCtcSymbols,
  normalizeForWav2Vec2,
  parseLinear16Wav,
  trimSilence,
} from './voiceAudio';
import { PRONUNCIATION_MODEL, voiceLanguageCode } from './voices';

/** Voices can't run for this request at all (TTS API off, model missing); the remaining cards skip them. */
export class VoiceServiceError extends Error {}

export interface VoiceReader {
  /** The model's greedy tokens for one voice saying `word`; [] when that voice gives no usable take. */
  read(voice: string, word: string): Promise<string[]>;
}

export interface ModelOutput {
  data: Float32Array;
  frames: number;
  size: number;
}

export interface VoiceReaderDeps {
  /** LINEAR16 WAV bytes, or null when the voice can't say it (retired voice, rejected text). */
  synthesize?: (voice: string, word: string) => Promise<Uint8Array | null>;
  runModel?: (input: Float32Array) => Promise<ModelOutput>;
}

const TTS_TIMEOUT_MS = 15_000;
// Shorter than any spoken word plus the trimmer's 200 ms pads.
const MIN_INPUT_SAMPLES = MODEL_SAMPLE_RATE / 10;
const CACHE_LIMIT = 5000;
const SPECIAL_TOKENS: ReadonlySet<string> = new Set([
  '<pad>',
  '<s>',
  '</s>',
  '<unk>',
  '??',
]);
const USABLE_TOKENS: ReadonlySet<string> = new Set(
  VOCAB_TOKENS.filter((t) => !SPECIAL_TOKENS.has(t))
);
const NUCLEI: ReadonlySet<string> = new Set(NUCLEUS_TOKENS);
export const MAX_VOICE_TOKENS = 64;

const nucleusCount = (tokens: readonly string[]) =>
  tokens.filter((t) => NUCLEI.has(t)).length;

/** A voice reading as a reference beside its dialect's espeak one, or null when the reading is unusable. */
export function voiceReference(
  base: FlashcardSpeakReference,
  tokens: readonly string[]
): FlashcardSpeakReference | null {
  if (
    tokens.length === 0 ||
    tokens.length > MAX_VOICE_TOKENS ||
    !tokens.every((t) => USABLE_TOKENS.has(t))
  ) {
    return null;
  }
  return {
    dialect: base.dialect,
    tokens: [...tokens],
    stress:
      nucleusCount(tokens) === nucleusCount(base.tokens)
        ? [...base.stress]
        : [],
    source: 'voice',
  };
}

let ttsClient: TextToSpeechClient | null = null;

async function synthesizeWithCloudTts(
  voice: string,
  word: string
): Promise<Uint8Array | null> {
  const { TextToSpeechClient } = await import('@google-cloud/text-to-speech');
  ttsClient ??= new TextToSpeechClient();
  try {
    const [res] = await ttsClient.synthesizeSpeech(
      {
        input: { text: word },
        voice: { languageCode: voiceLanguageCode(voice), name: voice },
        audioConfig: {
          audioEncoding: 'LINEAR16',
          sampleRateHertz: MODEL_SAMPLE_RATE,
        },
      },
      { timeout: TTS_TIMEOUT_MS }
    );
    const content = res.audioContent;
    if (!content) return null;
    return typeof content === 'string'
      ? Buffer.from(content, 'base64')
      : content;
  } catch (err) {
    const code = (err as { code?: unknown }).code;
    // PERMISSION_DENIED (API not enabled) and UNAUTHENTICATED fail every voice alike.
    if (code === 7 || code === 16) {
      throw new VoiceServiceError(`Cloud TTS refused (code ${code})`);
    }
    // INVALID_ARGUMENT / NOT_FOUND: this voice is gone or won't say the text, which retrying won't change.
    if (code === 3 || code === 5) {
      logger.warn('[speakLookup] voice skipped', { voice, code });
      return null;
    }
    throw err;
  }
}

interface ModelSession {
  run(input: Float32Array): Promise<ModelOutput>;
}

let modelLoading: Promise<ModelSession> | null = null;
let modelQueue: Promise<unknown> = Promise.resolve();

async function loadModel(): Promise<ModelSession> {
  const [bytes] = await admin
    .storage()
    .bucket()
    .file(PRONUNCIATION_MODEL.storagePath)
    .download();
  const digest = createHash('md5').update(bytes).digest('hex');
  if (
    bytes.length !== PRONUNCIATION_MODEL.bytes ||
    !digest.startsWith(PRONUNCIATION_MODEL.md5Prefix)
  ) {
    throw new Error(
      `Stored model is not the pinned one (size ${bytes.length}, md5 ${digest.slice(0, 12)})`
    );
  }
  const ort = await import('onnxruntime-web');
  ort.env.wasm.numThreads = Math.max(1, os.availableParallelism());
  const session = await ort.InferenceSession.create(bytes, {
    executionProviders: ['wasm'],
  });
  return {
    async run(input) {
      const feeds: Record<string, InstanceType<typeof ort.Tensor>> = {
        [session.inputNames[0]]: new ort.Tensor('float32', input, [
          1,
          input.length,
        ]),
      };
      if (session.inputNames.includes('attention_mask')) {
        feeds.attention_mask = new ort.Tensor(
          'int64',
          new BigInt64Array(input.length).fill(1n),
          [1, input.length]
        );
      }
      const out = (await session.run(feeds))[session.outputNames[0]];
      const [, frames, size] = out.dims;
      return { data: out.data as Float32Array, frames, size };
    },
  };
}

/** One model run at a time per instance; the session is loaded on first use and retried after a failure. */
function runPinnedModel(input: Float32Array): Promise<ModelOutput> {
  const job = modelQueue.then(async () => {
    modelLoading ??= loadModel().catch((err: unknown) => {
      modelLoading = null;
      throw new VoiceServiceError(`Model unavailable: ${String(err)}`);
    });
    return (await modelLoading).run(input);
  });
  modelQueue = job.catch(() => undefined);
  return job;
}

const readings = new Map<string, string[]>();

/** Reads are cached per instance by model, voice and word, so a repeated word costs nothing. */
export function createVoiceReader(deps: VoiceReaderDeps = {}): VoiceReader {
  const synthesize = deps.synthesize ?? synthesizeWithCloudTts;
  const runModel = deps.runModel ?? runPinnedModel;
  const cache =
    deps.synthesize || deps.runModel ? new Map<string, string[]>() : readings;
  return {
    async read(voice, word) {
      const key = `${PRONUNCIATION_MODEL.md5Prefix}\u0000${voice}\u0000${word}`;
      const hit = cache.get(key);
      if (hit) return hit;
      const wav = await synthesize(voice, word);
      const pcm = wav ? parseLinear16Wav(wav) : null;
      let tokens: string[] = [];
      if (pcm) {
        const input = normalizeForWav2Vec2(trimSilence(pcm));
        if (input.length >= MIN_INPUT_SAMPLES) {
          const { data, frames, size } = await runModel(input);
          tokens = greedyCtcSymbols(
            data,
            frames,
            size,
            VOCAB_TOKENS,
            PRONUNCIATION_MODEL.padId
          );
        }
      } else if (wav) {
        logger.warn('[speakLookup] voice audio not 16 kHz mono PCM', { voice });
      }
      const oldest = cache.keys().next().value;
      if (cache.size >= CACHE_LIMIT && oldest !== undefined)
        cache.delete(oldest);
      cache.set(key, tokens);
      return tokens;
    },
  };
}
