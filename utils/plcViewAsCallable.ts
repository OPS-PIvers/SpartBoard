// The View as guard and audit a raw Firestore write gets (utils/firestoreViewAsGuard.ts), for PLC write callables.
import {
  ViewAsReadOnlyError,
  viewAsBlocksRawWrite,
  viewAsRawWriteNeedsAudit,
} from '@/utils/viewAsTab';
import type { ViewAsRawWrite } from '@/utils/viewAsAudit';

/** Runs a PLC write callable only when View as allows the write, then audits it (D16). */
export async function guardPlcCallable<T>(
  writes: readonly ViewAsRawWrite[],
  run: () => Promise<T>
): Promise<T> {
  if (writes.length === 0) return run();
  const paths = writes.map((w) => w.path);
  if (viewAsBlocksRawWrite(paths)) throw new ViewAsReadOnlyError();
  const out = await run();
  if (viewAsRawWriteNeedsAudit(paths)) {
    const { recordViewAsRawWrites } = await import('@/utils/viewAsAudit');
    await recordViewAsRawWrites(writes);
  }
  return out;
}
