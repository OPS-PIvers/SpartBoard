// espeak-ng (GPL-3.0, WASM build) for server-side reference phonemes only; loaded on first use so other functions' cold starts don't pay for it.
import type { SpeakDialect } from './types';

const VOICES: Record<SpeakDialect, string> = {
  'es-419': 'es-419',
  'es-ES': 'es',
  'de-DE': 'de',
  'en-US': 'en-us',
};

interface EspeakWorker {
  set_voice(name: string): number;
  text_to_phonemes(text: string, mode: number): { ptr: number };
}

interface EspeakModule {
  eSpeakNGWorker: new () => EspeakWorker;
  HEAPU8: Uint8Array;
}

export interface Phonemizer {
  /** espeak IPA for one word, stress marks kept and phoneme separators removed. */
  phonemize(dialect: SpeakDialect, word: string): string;
}

let loading: Promise<Phonemizer> | null = null;

// Mode 1 is IPA; this build separates phonemes with `_`, which the tokenizer doesn't need.
const IPA_MODE = 1;

export function loadPhonemizer(): Promise<Phonemizer> {
  loading ??= (async (): Promise<Phonemizer> => {
    const pkg = (await import('@echogarden/espeak-ng-emscripten')) as {
      default: () => Promise<EspeakModule>;
    };
    const mod = await pkg.default();
    const worker = new mod.eSpeakNGWorker();
    const decoder = new TextDecoder();
    let voice: string | null = null;
    return {
      phonemize(dialect, word) {
        const wanted = VOICES[dialect];
        if (voice !== wanted) {
          if (worker.set_voice(wanted) !== 0)
            throw new Error(`espeak voice ${wanted} failed to load`);
          voice = wanted;
        }
        const { ptr } = worker.text_to_phonemes(word, IPA_MODE);
        const heap = mod.HEAPU8;
        let end = ptr;
        while (heap[end] !== 0) end++;
        return decoder
          .decode(heap.subarray(ptr, end))
          .replaceAll('_', '')
          .trim();
      },
    };
  })().catch((err: unknown) => {
    loading = null;
    throw err;
  });
  return loading;
}
