// Narration for connector tours (LIVE_TOUR_ONE_SHOT.md D11): every step with text gets a generated take on save.
import * as admin from 'firebase-admin';
import { createHash, randomUUID } from 'node:crypto';
import type { ToolContext } from './activity';
import type { GlSet } from './glTools';

type Step = GlSet['steps'][number] & {
  label?: string;
  text?: string;
  narration?: { source?: string; textHash?: string };
};

export interface Narrated {
  storagePath: string;
  voice: string;
  textHash: string;
  durationMs: number;
}

export interface NarrationDeps {
  hash: (text: string) => string;
  synthesize: (text: string) => Promise<Narrated>;
  urlFor: (storagePath: string) => Promise<string>;
}

const CONCURRENCY = 4;
// Mirrors GL_NARRATION_MAX_CHARS; longer text keeps the browser voice.
const MAX_CHARS = 1500;

/** Mirrors narrationSourceText in components/widgets/GuidedLearning/utils/narration.ts. */
export function narrationSourceText(step: {
  label?: string;
  text?: string;
}): string {
  const label = step.label?.trim() ?? '';
  const text = step.text?.trim() ?? '';
  if (!label || !text) return label || text;
  return /[.!?:]$/.test(label) ? `${label} ${text}` : `${label}. ${text}`;
}

/** Same hash as narrationTextHash in guidedLearningNarration.ts, without loading the TTS module. */
export const narrationHash = (text: string): string =>
  createHash('sha256').update(text, 'utf8').digest('hex');

/** Ids of the steps that needed a take, for when narration can't run at all. */
export const unnarratedIds = (steps: readonly Step[]): string[] =>
  stepsToNarrate(steps, narrationHash).map((i) => steps[i].id);

/** Steps that need a new take: text and no narration, or a generated take whose words changed. A recorded take stays. */
export function stepsToNarrate(
  steps: readonly Step[],
  hash: (text: string) => string
): number[] {
  return steps.flatMap((step, i) => {
    const spoken = narrationSourceText(step);
    if (!step.text?.trim() || spoken.length > MAX_CHARS) return [];
    const n = step.narration;
    if (n?.source === 'recorded') return [];
    if (n && n.textHash === hash(spoken)) return [];
    return [i];
  });
}

/** Adds a take to each step that needs one; a step TTS fails on keeps its old take and is reported. */
export async function narrateTourSteps(
  steps: readonly Step[],
  deps: NarrationDeps
): Promise<{ steps: Step[]; failed: string[] }> {
  const out = [...steps];
  const failed: string[] = [];
  const todo = stepsToNarrate(steps, deps.hash);
  for (let i = 0; i < todo.length; i += CONCURRENCY) {
    await Promise.all(
      todo.slice(i, i + CONCURRENCY).map(async (index) => {
        const step = steps[index];
        try {
          const take = await deps.synthesize(narrationSourceText(step));
          out[index] = {
            ...step,
            narration: {
              source: 'generated',
              url: await deps.urlFor(take.storagePath),
              ...take,
            },
          } as Step;
        } catch (err) {
          console.warn('[live tour] narration failed', step.id, err);
          failed.push(step.id);
        }
      })
    );
  }
  return { steps: out, failed };
}

/** The same download URL the Studio's getDownloadURL gives: the object's token, minted once if it has none. */
async function downloadUrl(storagePath: string): Promise<string> {
  const bucket = admin.storage().bucket();
  const file = bucket.file(storagePath);
  const [meta] = await file.getMetadata();
  const custom = (meta.metadata ?? {}) as Record<string, unknown>;
  const tokens = custom.firebaseStorageDownloadTokens;
  let token = typeof tokens === 'string' ? tokens.split(',')[0] : '';
  if (!token) {
    token = randomUUID();
    await file.setMetadata({
      metadata: { firebaseStorageDownloadTokens: token },
    });
  }
  return `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(storagePath)}?alt=media&token=${token}`;
}

/** Real TTS through the Studio's narration pipeline; the caller has already checked the admin. */
export async function narrationDeps(ctx: ToolContext): Promise<NarrationDeps> {
  const {
    buildNarrationDeps,
    narrationTextHash,
    synthesizeGuidedLearningNarration,
  } = await import('../guidedLearningNarration');
  const deps = {
    ...buildNarrationDeps(),
    isCallerAdmin: () => Promise.resolve(true),
  };
  return {
    hash: narrationTextHash,
    synthesize: (text) =>
      synthesizeGuidedLearningNarration(
        { text },
        { uid: ctx.uid, email: ctx.email, email_verified: true },
        deps
      ),
    urlFor: downloadUrl,
  };
}
