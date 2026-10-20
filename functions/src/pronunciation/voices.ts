// Copies of config/pronunciationVoices.ts and config/pronunciationModel.ts; tests/pronunciation/lookupParity.test.ts keeps them equal.
import type { SpeakDialect, SpeakLanguage } from './types';

export const PRONUNCIATION_VOICES: Record<SpeakLanguage, readonly string[]> = {
  es: [
    'es-ES-Neural2-A',
    'es-ES-Neural2-F',
    'es-ES-Wavenet-E',
    'es-ES-Chirp3-HD-Charon',
    'es-US-Neural2-A',
    'es-US-Neural2-B',
    'es-US-Wavenet-C',
    'es-US-Chirp3-HD-Kore',
  ],
  de: [
    'de-DE-Neural2-G',
    'de-DE-Neural2-H',
    'de-DE-Wavenet-G',
    'de-DE-Wavenet-H',
    'de-DE-Chirp3-HD-Charon',
    'de-DE-Chirp3-HD-Kore',
    'de-DE-Studio-B',
    'de-DE-Studio-C',
  ],
  en: [
    'en-US-Neural2-A',
    'en-US-Neural2-F',
    'en-US-Neural2-J',
    'en-US-Wavenet-B',
    'en-US-Wavenet-H',
    'en-US-Chirp3-HD-Charon',
    'en-US-Chirp3-HD-Kore',
    'en-US-Studio-O',
  ],
};

export const voiceLanguageCode = (voice: string): string =>
  voice.split('-').slice(0, 2).join('-');

const VOICE_DIALECT: Record<string, SpeakDialect> = {
  'es-ES': 'es-ES',
  'es-US': 'es-419',
  'de-DE': 'de-DE',
  'en-US': 'en-US',
};

/** The Speak dialect a voice's references belong to, or null for an unmapped locale. */
export const voiceDialect = (voice: string): SpeakDialect | null =>
  VOICE_DIALECT[voiceLanguageCode(voice)] ?? null;

export const PRONUNCIATION_MODEL = {
  id: 'wav2vec2-xlsr-53-espeak-cv-ft-q4',
  bytes: 241_430_967,
  md5Prefix: 'b9e69f089908',
  storagePath:
    'pronunciation-models/wav2vec2-xlsr-53-espeak-cv-ft-q4/model_q4.onnx',
  padId: 0,
  vocabSize: 392,
} as const;
