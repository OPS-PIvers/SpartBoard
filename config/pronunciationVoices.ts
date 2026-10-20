import type { SpeakLanguage } from '@/types';

// Cloud TTS voices whose model readings become extra Speak references (S11a); S11-calibration.md round 2.
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

/** The BCP-47 code a voice name starts with (`es-US-Neural2-A` is `es-US`). */
export const voiceLanguageCode = (voice: string): string =>
  voice.split('-').slice(0, 2).join('-');
