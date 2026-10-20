import { describe, expect, it } from 'vitest';
import vocab from '@/utils/pronunciation/xlsr53EspeakVocab.json';
import nuclei from '@/utils/pronunciation/xlsr53Nuclei.json';
import { tokenizeIpa as clientTokenize } from '@/utils/pronunciation/tokenizeIpa';
import {
  NUCLEUS_TOKENS,
  VOCAB_TOKENS,
} from '@/functions/src/pronunciation/vocab';
import { tokenizeIpa as serverTokenize } from '@/functions/src/pronunciation/tokenizeIpa';
import * as clientAudio from '@/utils/pronunciation/audio';
import { greedyCtcDecode } from '@/utils/pronunciation/ctcDecode';
import { PRONUNCIATION_MODEL } from '@/config/pronunciationModel';
import {
  PRONUNCIATION_VOICES,
  voiceLanguageCode,
} from '@/config/pronunciationVoices';
import * as serverAudio from '@/functions/src/pronunciation/voiceAudio';
import * as serverVoices from '@/functions/src/pronunciation/voices';

describe('Speak lookup client/server parity', () => {
  it('copies the model vocabulary and nuclei exactly', () => {
    const ids = vocab as Record<string, number>;
    expect(VOCAB_TOKENS).toEqual(
      Object.keys(ids).sort((a, b) => ids[a] - ids[b])
    );
    expect(NUCLEUS_TOKENS).toEqual(nuclei.nuclei);
  });

  it('tokenizes espeak IPA the same way on both sides', () => {
    const fixed = [
      'pˈero',
      'mjˈuːzɪk',
      'tˈa‍ɪm',
      'ˌɪntɚnˈæʃənəl',
      '(en)bˈeɪbi(de)',
      'dˈ??ç',
      'kˈæ§t',
      '',
      'ˈ',
      'xenjˈal',
      'ˌemfeɾmˈeɾa',
    ];
    // Deterministic random strings of real tokens and stress marks.
    let seed = 2383;
    const rand = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31;
      return seed % n;
    };
    const generated = Array.from({ length: 2000 }, () =>
      Array.from({ length: 1 + rand(10) }, () => {
        const mark = ['', '', '', 'ˈ', 'ˌ'][rand(5)];
        return mark + VOCAB_TOKENS[4 + rand(VOCAB_TOKENS.length - 4)];
      }).join('')
    );
    for (const ipa of [...fixed, ...generated]) {
      expect(serverTokenize(ipa)).toEqual(clientTokenize(ipa));
    }
  });

  it('copies the voices and the model pin', () => {
    expect(serverVoices.PRONUNCIATION_VOICES).toEqual(PRONUNCIATION_VOICES);
    for (const voice of Object.values(PRONUNCIATION_VOICES).flat()) {
      expect(serverVoices.voiceLanguageCode(voice)).toBe(
        voiceLanguageCode(voice)
      );
      expect(serverVoices.voiceDialect(voice)).not.toBeNull();
    }
    const { id, bytes, md5Prefix, storagePath, padId, vocabSize } =
      PRONUNCIATION_MODEL;
    expect(serverVoices.PRONUNCIATION_MODEL).toEqual({
      id,
      bytes,
      md5Prefix,
      storagePath,
      padId,
      vocabSize,
    });
  });

  it('trims, normalizes and greedy-decodes voice takes as the recognizer does', () => {
    let seed = 11;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31;
      return seed / 2 ** 31;
    };
    for (let n = 0; n < 20; n++) {
      const length = 2000 + Math.floor(rand() * 30000);
      const loudFrom = Math.floor(rand() * length);
      const audio = Float32Array.from(
        { length },
        (_, i) =>
          (rand() - 0.5) * (i >= loudFrom && i < loudFrom + 4000 ? 1 : 0.001)
      );
      const trimmed = clientAudio.trimSilence(audio);
      expect(serverAudio.trimSilence(audio)).toEqual(trimmed);
      expect(serverAudio.normalizeForWav2Vec2(trimmed)).toEqual(
        clientAudio.normalizeForWav2Vec2(trimmed)
      );
      const frames = 1 + Math.floor(rand() * 60);
      const size = PRONUNCIATION_MODEL.vocabSize;
      const logits = new Float32Array(frames * size);
      for (let f = 0; f < frames; f++) {
        logits[f * size + (rand() < 0.4 ? 0 : Math.floor(rand() * 6))] = 1;
      }
      expect(
        serverAudio.greedyCtcSymbols(logits, frames, size, VOCAB_TOKENS, 0)
      ).toEqual(
        greedyCtcDecode(logits, frames, size, VOCAB_TOKENS, 0).tokens.map(
          (t) => t.symbol
        )
      );
    }
  });
});
