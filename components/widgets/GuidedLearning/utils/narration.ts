// Step narration helpers (docs/plans/GUIDED_LEARNING_STUDIO.md P2-4); the server side is functions/src/guidedLearningNarration.ts.
import { httpsCallable } from 'firebase/functions';
import { getDownloadURL, ref as storageRef } from 'firebase/storage';
import { functions, storage } from '@/config/firebase';

/** Mirrors GL_NARRATION_MAX_CHARS in functions/src/guidedLearningNarration.ts. */
export const GL_NARRATION_MAX_CHARS = 1500;
/** Generated takes live in the TTS cache that quiz read-aloud shares; GL never deletes there. */
const SHARED_TTS_CACHE_PREFIX = 'quiz_tts_cache/';

export interface GeneratedNarration {
  source: 'generated';
  url: string;
  storagePath: string;
  voice: string;
  textHash: string;
  durationMs: number;
}

/** What gets spoken for a step: its label, then its text. */
export function narrationSourceText(step: {
  label?: string;
  text?: string;
}): string {
  const label = step.label?.trim() ?? '';
  const text = step.text?.trim() ?? '';
  if (!label || !text) return label || text;
  return /[.!?:]$/.test(label) ? `${label} ${text}` : `${label}. ${text}`;
}

/** Full SHA-256 hex over the UTF-8 text, byte-identical to the server's `narrationTextHash`. */
export async function narrationTextHash(text: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(text)
  );
  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, '0')
  ).join('');
}

/** True when the step's label or text changed since the narration was made; false without a stored hash. */
export async function isNarrationStale(
  narration: { textHash?: string },
  step: { label?: string; text?: string }
): Promise<boolean> {
  if (!narration.textHash) return false;
  return (
    (await narrationTextHash(narrationSourceText(step))) !== narration.textHash
  );
}

/** The file to queue for deletion when a take is replaced or removed: recorded takes only. */
export function narrationDeletionRef(
  narration:
    | { source: 'generated' | 'recorded'; storagePath?: string }
    | null
    | undefined
): { storagePath: string } | null {
  const path = narration?.storagePath;
  if (narration?.source !== 'recorded' || !path) return null;
  if (path.startsWith(SHARED_TTS_CACHE_PREFIX)) return null;
  return { storagePath: path };
}

/** Admin-only Cloud TTS for one step; the text should come from `narrationSourceText`. */
export async function generateNarration(
  text: string,
  voice?: string
): Promise<GeneratedNarration> {
  const callable = httpsCallable<
    { text: string; voice?: string },
    Omit<GeneratedNarration, 'source' | 'url'>
  >(functions, 'synthesizeGuidedLearningNarrationV1');
  const { data } = await callable(voice ? { text, voice } : { text });
  // The server mints no URL; the signed-in caller resolves it under storage.rules, as quiz read-aloud does.
  const url = await getDownloadURL(storageRef(storage, data.storagePath));
  return { source: 'generated', url, ...data };
}
