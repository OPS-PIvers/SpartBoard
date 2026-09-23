// Guided Learning step narration (docs/plans/GUIDED_LEARNING_STUDIO.md P2-4): admin-only Cloud TTS into the shared quiz cache.
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { createHash } from 'node:crypto';
import { ALLOWED_ORIGINS } from './classlinkShared';
import {
  buildDefaultDeps,
  loadSettings,
  normalizeReadAloudText,
  recordCacheHits,
  synthesizePart,
  voicesForLanguage,
  type QuizReadAloudSettings,
  type ReadAloudDeps,
} from './quizReadAloud';
import './functionsInit';

export const GL_NARRATION_MAX_CHARS = 1500;

export interface NarrationRequest {
  text: string;
  voice?: string;
}

/** No URL: the client resolves `storagePath` through the auth-gated Storage SDK, as quiz read-aloud does. */
export interface NarrationResult {
  storagePath: string;
  voice: string;
  textHash: string;
  durationMs: number;
}

export interface NarrationDeps extends ReadAloudDeps {
  isCallerAdmin: (token: {
    email?: string;
    email_verified?: boolean;
  }) => Promise<boolean>;
}

/** Same digest the client computes over the raw step text, for the stale badge. */
export function narrationTextHash(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

export function parseNarrationRequest(raw: unknown): NarrationRequest {
  const data = (raw ?? {}) as Record<string, unknown>;
  const text = typeof data.text === 'string' ? data.text.trim() : '';
  if (!text) throw new HttpsError('invalid-argument', 'Text is required.');
  if (text.length > GL_NARRATION_MAX_CHARS)
    throw new HttpsError(
      'invalid-argument',
      `Narration text is limited to ${GL_NARRATION_MAX_CHARS} characters.`
    );
  const voice = typeof data.voice === 'string' ? data.voice.trim() : '';
  return voice ? { text, voice } : { text };
}

/** The admin's configured premium voices; anything else is refused. */
export function narrationVoiceAllowList(
  settings: QuizReadAloudSettings
): string[] {
  return [...new Set(Object.values(settings.voicesByLanguage))];
}

export async function synthesizeGuidedLearningNarration(
  request: NarrationRequest,
  token: { uid: string; email?: string; email_verified?: boolean },
  deps: NarrationDeps
): Promise<NarrationResult> {
  if (!(await deps.isCallerAdmin(token)))
    throw new HttpsError('permission-denied', 'Admin access required.');
  const spoken = normalizeReadAloudText(request.text);
  if (!spoken)
    throw new HttpsError('invalid-argument', 'Nothing to read aloud.');
  const settings = await loadSettings(deps.db);
  const defaultVoice = voicesForLanguage(
    settings,
    settings.defaultLanguage
  ).neural2;
  const voice = request.voice ?? defaultVoice;
  if (!narrationVoiceAllowList(settings).includes(voice))
    throw new HttpsError('invalid-argument', 'Unknown voice.');
  const language = voice.split('-').slice(0, 2).join('-');
  const result = await synthesizePart(deps, {
    subParts: [{ text: spoken }],
    language,
    teacherUid: token.uid,
    settings,
    neural2Voice: voice,
  });
  if (result.cached) await recordCacheHits(deps.db, 1, deps.now());
  return {
    storagePath: result.path,
    voice: result.path.split('/')[1] ?? voice,
    textHash: narrationTextHash(request.text),
    durationMs: result.durationMs ?? 0,
  };
}

export function buildNarrationDeps(): NarrationDeps {
  const base = buildDefaultDeps();
  return {
    ...base,
    isCallerAdmin: async (token) => {
      if (token.email_verified !== true || !token.email) return false;
      const snap = await base.db
        .collection('admins')
        .doc(token.email.toLowerCase())
        .get();
      return snap.exists;
    },
  };
}

export const synthesizeGuidedLearningNarrationV1 = onCall(
  {
    memory: '512MiB',
    timeoutSeconds: 60,
    cors: ALLOWED_ORIGINS,
    invoker: 'public',
  },
  async (request) => {
    if (!request.auth)
      throw new HttpsError('unauthenticated', 'Sign in required.');
    if (request.auth.token.studentRole === true)
      throw new HttpsError('permission-denied', 'Admin access required.');
    return synthesizeGuidedLearningNarration(
      parseNarrationRequest(request.data),
      {
        uid: request.auth.uid,
        email: request.auth.token.email,
        email_verified: request.auth.token.email_verified,
      },
      buildNarrationDeps()
    );
  }
);
