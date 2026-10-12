import type { GuidedLearningSet } from '@/types';

/** What a guarded save expects the stored `updatedAt` to be; undefined skips the check (Overwrite). */
export interface GuidedLearningSaveGuard {
  expectedUpdatedAt: number | undefined;
}

export interface GuidedLearningLatestSet {
  set: GuidedLearningSet;
  /** Stored revision the reloaded editor saves against. */
  updatedAt: number;
}

/** A stored revision seen while the editor is open; `byClaude` when the connector wrote it. */
export interface GuidedLearningStoredRevision {
  updatedAt: number;
  byClaude: boolean;
  loadLatest: () => Promise<GuidedLearningLatestSet>;
}

/** Subscribes to the stored revision of one set; returns the unsubscribe. */
export type GuidedLearningRevisionWatch = (
  onRevision: (revision: GuidedLearningStoredRevision) => void
) => () => void;

/** Thrown when someone else saved the set since the editor loaded it. */
export class GuidedLearningSaveConflictError extends Error {
  constructor(readonly loadLatest: () => Promise<GuidedLearningLatestSet>) {
    super('This set was edited elsewhere since you opened it.');
    this.name = 'GuidedLearningSaveConflictError';
  }
}

/** True when the stored doc moved past the revision the editor loaded. */
export function isStaleRevision(
  stored: { updatedAt?: unknown } | undefined,
  guard: GuidedLearningSaveGuard | undefined
): boolean {
  if (!stored || guard?.expectedUpdatedAt === undefined) return false;
  return stored.updatedAt !== guard.expectedUpdatedAt;
}
