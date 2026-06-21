/**
 * usePlcAutoPullSync — §5.2 auto-pull-when-safe orchestration for PLC synced
 * content (quizzes + video activities).
 *
 * Decision 5.2 (PRD §5.2): a teacher's local Drive replica of a PLC-shared
 * quiz / video activity should AUTOMATICALLY pick up a teammate's published
 * edit when the local replica has no unsaved edits — no manual "pull" click.
 * When the local replica DOES carry unsaved edits and the canonical advanced,
 * we must NOT silently overwrite; we surface a conflict the card renders as a
 * "Synced copy changed — keep yours / pull theirs" prompt.
 *
 * This hook wires the pure {@link decidePlcSyncPull} verdict to the live
 * canonical-version stream and the per-replica pull function. It is generic
 * over the replica metadata so the quiz and VA cards share identical logic:
 *
 *   - `replicas`        — the teacher's synced personal copies (each carries
 *                         `id` + `sync.{groupId,lastSyncedVersion}`).
 *   - `canonicalGroups` — live `Map<groupId, { version }>` (from
 *                         `useSyncedQuizGroupsByIds` / VA equivalent).
 *   - `dirtyReplicaId`  — the replica with unsaved local edits right now (the
 *                         open collaborative editor's replica id), or null.
 *   - `pull`            — pulls canonical into one replica (`pullSyncedQuiz` /
 *                         `pullSyncedVideoActivity`); returns the refreshed meta.
 *
 * Behavior:
 *   - For every replica whose canonical advanced AND that is NOT dirty, the
 *     hook fires `pull(replica)` exactly once per (groupId, canonicalVersion),
 *     surfacing the refreshed title via `onAutoPulled` so the card can toast.
 *   - For a dirty replica whose canonical advanced, the hook records a
 *     `conflict` entry (keyed by groupId) instead of pulling. The card renders
 *     the prompt; `resolveConflict(groupId, 'theirs')` pulls (discarding local
 *     edits — the teacher's explicit choice), `resolveConflict(groupId,'mine')`
 *     dismisses the prompt and bumps the local `lastSyncedVersion` so the same
 *     canonical version doesn't re-prompt (their change is acknowledged; the
 *     next teammate publish re-arms it).
 *
 * The hook never blocks the canonical write path and tolerates pull failures
 * (logged, surfaced via `onError`); a failed auto-pull is retried on the next
 * canonical bump.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { decidePlcSyncPull } from '@/utils/plcSyncPull';
import { logError } from '@/utils/logError';

/** Minimal replica shape the orchestration needs (quiz + VA metas satisfy it). */
export interface PlcSyncReplica {
  id: string;
  title: string;
  sync?: {
    groupId: string;
    lastSyncedVersion: number;
  };
}

/** Live canonical-version view of a synced group. */
export interface PlcCanonicalGroupVersion {
  version: number;
}

/** How a teacher resolved a `conflict` prompt. */
export type PlcSyncConflictChoice =
  | 'theirs' // pull canonical, discarding unsaved local edits
  | 'mine'; // keep local edits; acknowledge their version (no re-prompt)

/** A surfaced conflict the card renders as a keep-yours / pull-theirs prompt. */
export interface PlcSyncConflict {
  groupId: string;
  replicaId: string;
  title: string;
  /** The canonical version that advanced past the local replica. */
  canonicalVersion: number;
}

export interface UsePlcAutoPullSyncArgs<TMeta extends PlcSyncReplica> {
  replicas: readonly TMeta[];
  canonicalGroups: ReadonlyMap<string, PlcCanonicalGroupVersion>;
  /** Replica id with unsaved local edits right now (open editor), or null. */
  dirtyReplicaId: string | null;
  /** Pull canonical content into one replica; returns the refreshed meta. */
  pull: (replica: TMeta) => Promise<TMeta>;
  /**
   * Acknowledge a teammate's version on a "keep mine" choice — bump the local
   * replica's `lastSyncedVersion` to `canonicalVersion` WITHOUT overwriting the
   * teacher's edits, so the same version doesn't re-prompt. Returns when saved.
   */
  acknowledgeVersion: (
    replica: TMeta,
    canonicalVersion: number
  ) => Promise<void>;
  /** Called after a successful auto-pull (clean replica) — card toasts. */
  onAutoPulled?: (replica: TMeta) => void;
  /** Called when an auto-pull fails (card toasts; retried on next bump). */
  onAutoPullError?: (replica: TMeta, err: unknown) => void;
  /** Called after the teacher chose "pull theirs" on a conflict. */
  onConflictPulled?: (replica: TMeta) => void;
  /** Called after the teacher chose "keep yours" on a conflict. */
  onConflictKept?: (replica: TMeta) => void;
  /** Surface a conflict-resolution failure (card toasts). */
  onError?: (replica: TMeta, err: unknown) => void;
  /** Disable the whole machinery (e.g. viewer role, Drive disconnected). */
  enabled?: boolean;
}

export interface UsePlcAutoPullSyncResult {
  /** Conflicts currently awaiting a keep-yours / pull-theirs decision. */
  conflicts: PlcSyncConflict[];
  /** Resolve a conflict prompt by groupId. */
  resolveConflict: (groupId: string, choice: PlcSyncConflictChoice) => void;
}

export function usePlcAutoPullSync<TMeta extends PlcSyncReplica>({
  replicas,
  canonicalGroups,
  dirtyReplicaId,
  pull,
  acknowledgeVersion,
  onAutoPulled,
  onAutoPullError,
  onConflictPulled,
  onConflictKept,
  onError,
  enabled = true,
}: UsePlcAutoPullSyncArgs<TMeta>): UsePlcAutoPullSyncResult {
  // Conflicts keyed by groupId so a card renders at most one prompt per group.
  const [conflicts, setConflicts] = useState<PlcSyncConflict[]>([]);

  // Guard against re-firing an auto-pull for the same (groupId@version). This
  // set is NOT cleared on success — once a (groupId@canonicalVersion) has been
  // pulled we never pull it again, even before the local snapshot's
  // `lastSyncedVersion` catches up (snapshot lag would otherwise re-trigger).
  // Entries are removed only on FAILURE so the next canonical bump retries.
  // Keyed `${groupId}@${canonicalVersion}`.
  const handledAutoPull = useRef<Set<string>>(new Set());

  // Latest non-reactive views the effect reads — keeps the effect dependency
  // list to the genuinely reactive inputs (replicas/canonical/dirty/enabled)
  // and avoids re-running it when only callbacks change identity. Refs are
  // assigned inside an effect (never during render) per the repo's
  // `react-hooks/refs` rule.
  const pullRef = useRef(pull);
  const onAutoPulledRef = useRef(onAutoPulled);
  const onAutoPullErrorRef = useRef(onAutoPullError);
  useEffect(() => {
    pullRef.current = pull;
    onAutoPulledRef.current = onAutoPulled;
    onAutoPullErrorRef.current = onAutoPullError;
  });

  // Drive the auto-pull side effect. (Genuine external-system sync: the
  // canonical Firestore stream → local Drive replica reconciliation.)
  useEffect(() => {
    if (!enabled) return;
    for (const replica of replicas) {
      const sync = replica.sync;
      if (!sync) continue;
      const canonical = canonicalGroups.get(sync.groupId);
      if (!canonical) continue;
      const isDirty = replica.id === dirtyReplicaId;
      const decision = decidePlcSyncPull(
        { lastSyncedVersion: sync.lastSyncedVersion, dirty: isDirty },
        canonical.version
      );
      if (decision !== 'auto-pull') continue;
      const key = `${sync.groupId}@${canonical.version}`;
      if (handledAutoPull.current.has(key)) continue;
      handledAutoPull.current.add(key);
      void (async () => {
        try {
          const refreshed = await pullRef.current(replica);
          onAutoPulledRef.current?.(refreshed);
        } catch (err) {
          // Allow a retry of this exact version on the next render/bump.
          handledAutoPull.current.delete(key);
          logError('usePlcAutoPullSync.autoPull', err, {
            groupId: sync.groupId,
            replicaId: replica.id,
            canonicalVersion: canonical.version,
          });
          onAutoPullErrorRef.current?.(replica, err);
        }
      })();
    }
  }, [replicas, canonicalGroups, dirtyReplicaId, enabled]);

  // Derive conflicts during render (no effect) so the prompt reflects the
  // current replica/canonical/dirty state on every commit. A conflict exists
  // for a dirty replica whose canonical advanced. We reconcile into state only
  // when the set actually changes to avoid an update loop.
  const nextConflicts: PlcSyncConflict[] = [];
  if (enabled) {
    for (const replica of replicas) {
      const sync = replica.sync;
      if (!sync) continue;
      const canonical = canonicalGroups.get(sync.groupId);
      if (!canonical) continue;
      const isDirty = replica.id === dirtyReplicaId;
      const decision = decidePlcSyncPull(
        { lastSyncedVersion: sync.lastSyncedVersion, dirty: isDirty },
        canonical.version
      );
      if (decision === 'conflict') {
        nextConflicts.push({
          groupId: sync.groupId,
          replicaId: replica.id,
          title: replica.title,
          canonicalVersion: canonical.version,
        });
      }
    }
  }
  const nextKey = nextConflicts
    .map((c) => `${c.groupId}@${c.canonicalVersion}`)
    .sort()
    .join('|');
  // Sentinel initial value (distinct from any real key, including the empty
  // "no conflicts" key '') so the FIRST render always reconciles conflicts
  // into state — otherwise an initial set of conflicts would never surface.
  const [prevKey, setPrevKey] = useState<string | null>(null);
  if (prevKey !== nextKey) {
    setPrevKey(nextKey);
    setConflicts(nextConflicts);
  }

  const resolveConflict = useCallback(
    (groupId: string, choice: PlcSyncConflictChoice) => {
      const conflict = conflicts.find((c) => c.groupId === groupId);
      const replica = replicas.find((r) => r.sync?.groupId === groupId);
      // Clear the prompt immediately so the UI feels responsive; the async
      // write below reconciles the underlying replica.
      setConflicts((prev) => prev.filter((c) => c.groupId !== groupId));
      if (!conflict || !replica) return;
      void (async () => {
        try {
          if (choice === 'theirs') {
            const refreshed = await pull(replica);
            onConflictPulled?.(refreshed);
          } else {
            await acknowledgeVersion(replica, conflict.canonicalVersion);
            onConflictKept?.(replica);
          }
        } catch (err) {
          logError('usePlcAutoPullSync.resolveConflict', err, {
            groupId,
            replicaId: replica.id,
            choice,
          });
          onError?.(replica, err);
        }
      })();
    },
    [
      conflicts,
      replicas,
      pull,
      acknowledgeVersion,
      onConflictPulled,
      onConflictKept,
      onError,
    ]
  );

  return { conflicts, resolveConflict };
}
