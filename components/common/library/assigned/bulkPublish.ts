import type { Toast } from '@/types';
import { logError } from '@/utils/logError';

const plural = (n: number) => `${n} assignment${n === 1 ? '' : 's'}`;

/** The level every target already shares, so the dialog opens on it. */
export function sharedVisibility<V>(
  targets: readonly { scoreVisibility?: V }[]
): V | undefined {
  const first = targets[0]?.scoreVisibility;
  return targets.every((t) => t.scoreVisibility === first) ? first : undefined;
}

/** One toast for a bulk publish, plus one for any failures. */
export function reportBulkPublish(
  addToast: (message: string, type?: Toast['type']) => void,
  ok: number,
  failed: number,
  unpublish = false
): void {
  if (ok > 0)
    addToast(
      `Scores ${unpublish ? 'unpublished' : 'published'} for ${plural(ok)}.`,
      'success'
    );
  if (failed > 0)
    addToast(
      `Scores could not be ${unpublish ? 'unpublished' : 'published'} for ${plural(failed)}.`,
      'error'
    );
}

/** Publishes each target in turn with one shared Classroom token, then reports once. */
export async function runBulkPublish<A extends { id: string }>({
  targets,
  unpublish,
  mintToken,
  publishOne,
  addToast,
  logKey,
}: {
  targets: readonly A[];
  unpublish: boolean;
  /** Called once, before any await, so the consent popup still counts as a click. */
  mintToken?: () => Promise<string | null>;
  /** Resolves false when the target was skipped with its own message, so it is not counted again. */
  publishOne: (target: A, token: string | null) => Promise<boolean>;
  addToast: (message: string, type?: Toast['type']) => void;
  logKey: string;
}): Promise<number> {
  let token: string | null = null;
  if (mintToken && !unpublish) {
    try {
      token = await mintToken();
    } catch {
      token = null;
    }
  }
  let ok = 0;
  let failed = 0;
  for (const t of targets) {
    try {
      if (await publishOne(t, token)) ok++;
    } catch (err) {
      failed++;
      logError(logKey, err, { assignmentId: t.id });
    }
  }
  reportBulkPublish(addToast, ok, failed, unpublish);
  return ok;
}
