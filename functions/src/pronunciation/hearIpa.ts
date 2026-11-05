// "Hear it" for a teacher's typed IPA: Cloud TTS reads the term with an SSML phoneme tag.
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';
import type { TextToSpeechClient } from '@google-cloud/text-to-speech';
import * as admin from '../firebaseAdmin';
import '../functionsInit';
import { ALLOWED_ORIGINS } from '../classlinkShared';
import { assertViewAsAllowed } from '../viewAsGuard';
import { isAiTeacherCaller } from '../aiCallerGate';
import { FLASHCARDS_SPEAK_FEATURE_ID } from './lookup';
import type { SpeakDialect } from './types';

// Neural2 voices honor <phoneme alphabet="ipa">; Chirp and Studio voices ignore it.
export const IPA_VOICES: Record<SpeakDialect, string> = {
  'es-ES': 'es-ES-Neural2-A',
  'es-419': 'es-US-Neural2-A',
  'de-DE': 'de-DE-Neural2-G',
  'en-US': 'en-US-Neural2-J',
};

const MAX_IPA_LENGTH = 200;
const MAX_TERM_LENGTH = 200;
const TTS_TIMEOUT_MS = 15_000;

export interface HearIpaInput {
  dialect: SpeakDialect;
  ipa: string;
  term: string;
}

const escapeXml = (s: string): string =>
  s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');

/** Strips dictionary slashes, brackets and syllable dots the way the lookup does. */
export const cleanIpa = (ipa: string): string =>
  ipa
    .replace(/[/[\].]/g, '')
    .trim()
    .replace(/\s+/gu, ' ');

export const buildIpaSsml = ({ ipa, term }: HearIpaInput): string =>
  `<speak><phoneme alphabet="ipa" ph="${escapeXml(cleanIpa(ipa))}">${escapeXml(
    term.trim() || cleanIpa(ipa)
  )}</phoneme></speak>`;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

export function parseHearIpaInput(raw: unknown): HearIpaInput {
  const bad = (msg: string): never => {
    throw new HttpsError('invalid-argument', msg);
  };
  if (!isRecord(raw)) return bad('Expected an object.');
  const { dialect, ipa, term } = raw;
  if (typeof dialect !== 'string' || !Object.hasOwn(IPA_VOICES, dialect))
    return bad('Unknown dialect.');
  if (typeof ipa !== 'string' || ipa.length > MAX_IPA_LENGTH || !cleanIpa(ipa))
    return bad('ipa must be a short string.');
  if (typeof term !== 'string' || term.length > MAX_TERM_LENGTH)
    return bad('term must be a short string.');
  return { dialect: dialect as SpeakDialect, ipa, term };
}

let ttsClient: TextToSpeechClient | null = null;

export type IpaSynthesizer = (
  voice: string,
  ssml: string
) => Promise<Uint8Array | null>;

const synthesizeIpa: IpaSynthesizer = async (voice, ssml) => {
  const { TextToSpeechClient } = await import('@google-cloud/text-to-speech');
  ttsClient ??= new TextToSpeechClient();
  const [res] = await ttsClient.synthesizeSpeech(
    {
      input: { ssml },
      voice: {
        languageCode: voice.split('-').slice(0, 2).join('-'),
        name: voice,
      },
      audioConfig: { audioEncoding: 'MP3', speakingRate: 0.9 },
    },
    { timeout: TTS_TIMEOUT_MS }
  );
  const content = res.audioContent;
  if (!content) return null;
  return typeof content === 'string'
    ? Uint8Array.from(Buffer.from(content, 'base64'))
    : content;
};

/** MP3 audio of the term read with the teacher's IPA, base64-encoded. */
export async function hearIpaAudio(
  input: HearIpaInput,
  synthesize: IpaSynthesizer = synthesizeIpa
): Promise<{ audio: string }> {
  const audio = await synthesize(
    IPA_VOICES[input.dialect],
    buildIpaSsml(input)
  );
  if (!audio) throw new HttpsError('unavailable', 'No audio came back.');
  return { audio: Buffer.from(audio).toString('base64') };
}

export const hearSpeakIpaV1 = onCall(
  {
    memory: '256MiB',
    maxInstances: 10,
    timeoutSeconds: 30,
    cors: ALLOWED_ORIGINS,
  },
  async (request): Promise<{ audio: string }> => {
    assertViewAsAllowed(request, { read: true });
    const auth = request.auth;
    if (!auth) throw new HttpsError('unauthenticated', 'Sign in first.');
    if (!(await isAiTeacherCaller(admin.firestore(), auth.token))) {
      throw new HttpsError('permission-denied', 'Teachers only.');
    }
    const email =
      typeof auth.token.email === 'string' ? auth.token.email : null;
    const { isGlobalFeatureGranted } = await import('../quizMediaArchive');
    if (
      !(await isGlobalFeatureGranted(
        admin.firestore(),
        FLASHCARDS_SPEAK_FEATURE_ID,
        email,
        auth.uid
      ))
    ) {
      throw new HttpsError('permission-denied', 'Speak is not turned on.');
    }
    const input = parseHearIpaInput(request.data);
    try {
      return await hearIpaAudio(input);
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      logger.warn('[hearSpeakIpa] synthesis failed', {
        dialect: input.dialect,
        err: String(err),
      });
      throw new HttpsError('unavailable', 'Hear it is unavailable right now.');
    }
  }
);
