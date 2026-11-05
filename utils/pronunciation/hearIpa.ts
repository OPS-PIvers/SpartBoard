// "Hear it" for a teacher's typed IPA: a Cloud TTS voice reads the term with that pronunciation.
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/config/firebase';
import type { SpeakDialect } from '@/types';
import { logError } from '@/utils/logError';

interface HearIpaInput {
  dialect: SpeakDialect;
  ipa: string;
  term: string;
}

export type HearIpaCall = (input: HearIpaInput) => Promise<{ audio: string }>;

const callHearIpa: HearIpaCall = async (input) =>
  (
    await httpsCallable<HearIpaInput, { audio: string }>(
      functions,
      'hearSpeakIpaV1',
      { timeout: 30_000 }
    )(input)
  ).data;

const cache = new Map<string, Promise<string>>();
let playing: HTMLAudioElement | null = null;

const toUrl = (base64: string): string => {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  return URL.createObjectURL(new Blob([bytes], { type: 'audio/mpeg' }));
};

/** Plays the term read with `ipa`; resolves false when no audio could be made. */
export async function hearIpa(
  input: HearIpaInput,
  call: HearIpaCall = callHearIpa
): Promise<boolean> {
  const key = JSON.stringify([input.dialect, input.ipa.trim(), input.term]);
  let url = cache.get(key);
  if (!url) {
    url = call({ ...input, ipa: input.ipa.trim() }).then((out) =>
      toUrl(out.audio)
    );
    cache.set(key, url);
  }
  try {
    const audio = new Audio(await url);
    playing?.pause();
    playing = audio;
    await audio.play();
    return true;
  } catch (err) {
    cache.delete(key);
    logError('hearIpa', err, { dialect: input.dialect });
    return false;
  }
}
