/**
 * plcSyncPull — the §5.2 "auto-pull when safe, prompt on conflict" decision.
 *
 * The PLC synced-content model (quizzes + video activities) keeps a local
 * Drive replica (`QuizMetadata` / `VideoActivityMetadata`) carrying a
 * `sync.lastSyncedVersion` — the canonical `version` this replica was last
 * reconciled with — alongside a live canonical group whose `version` is
 * bumped on every peer publish.
 *
 * Decision 5.2 (PRD §5.2) replaces the old purely-manual `pullSyncedQuizContent`
 * trigger with an automatic pull whenever it is *safe* to overwrite the local
 * replica, falling back to a conflict prompt when the teacher has local edits
 * that the auto-pull would silently clobber:
 *
 *   - Canonical NOT ahead (`canonicalVersion <= lastSyncedVersion`)
 *       → `up-to-date` (nothing to pull).
 *   - Canonical ahead AND the local replica has NO unsaved edits
 *       → `auto-pull` (safe to overwrite; do it without asking).
 *   - Canonical ahead AND the local replica HAS unsaved edits
 *       → `conflict` (do NOT overwrite — surface "keep yours / pull theirs").
 *
 * This rule is identical for quizzes and video activities, so it lives here as
 * one pure, unit-tested function consumed by both card paths. It performs no
 * I/O and holds no React state — callers feed it the already-known local +
 * canonical version state and act on the verdict.
 */

/**
 * The verdict for a single synced replica, consumed by the card UI.
 *
 *   - `up-to-date` — local replica already at (or ahead of) canonical; no-op.
 *   - `auto-pull`  — canonical advanced and the local replica is clean; the
 *                    caller should pull canonical into the replica silently.
 *   - `conflict`   — canonical advanced but the local replica is dirty; the
 *                    caller must prompt ("keep yours / pull theirs") and must
 *                    NOT overwrite local edits without the teacher's choice.
 */
export type PlcSyncPullDecision = 'up-to-date' | 'auto-pull' | 'conflict';

/**
 * The minimal local-replica state the pull decision needs. Both
 * `QuizMetadataSyncLinkage` and `VideoActivityMetadataSyncLinkage` satisfy the
 * `lastSyncedVersion` half; `dirty` is the caller's "has unsaved local edits"
 * signal (e.g. the collaborative editor is open with unsaved changes for this
 * replica). When `dirty` is omitted it is treated as `false` (clean) — a
 * replica with no tracked local edits is safe to auto-pull.
 */
export interface PlcLocalReplicaSyncState {
  /**
   * The canonical `version` this local Drive replica was last reconciled with.
   * Compared against the live canonical `version` to detect drift.
   */
  lastSyncedVersion: number;
  /**
   * `true` iff the local replica carries unsaved edits that an auto-pull would
   * overwrite. Defaults to `false` (clean) when absent.
   */
  dirty?: boolean;
}

/**
 * Decide what to do when a synced replica's canonical may have advanced.
 *
 * Pure: no I/O, no side effects. See the module docstring for the rule.
 *
 * @param local            Local replica sync state (`lastSyncedVersion` + dirty flag).
 * @param canonicalVersion The live canonical group `version`.
 * @returns the {@link PlcSyncPullDecision} verdict.
 */
export function decidePlcSyncPull(
  local: PlcLocalReplicaSyncState,
  canonicalVersion: number
): PlcSyncPullDecision {
  // Canonical hasn't moved past what we already have — nothing to pull.
  // (`<=` rather than `<` so a local replica that is somehow ahead — e.g. a
  // just-published edit whose canonical snapshot hasn't landed yet — is also
  // treated as up-to-date rather than forcing a redundant pull/conflict.)
  if (canonicalVersion <= local.lastSyncedVersion) {
    return 'up-to-date';
  }
  // Canonical advanced. Safe to auto-overwrite only when the replica is clean.
  return local.dirty ? 'conflict' : 'auto-pull';
}

/**
 * Convenience predicate: would pulling canonical into this replica silently
 * discard unsaved local edits? `true` only in the `conflict` case. Lets card
 * code branch on "must prompt" without re-deriving the decision.
 */
export function isPlcSyncPullConflict(
  local: PlcLocalReplicaSyncState,
  canonicalVersion: number
): boolean {
  return decidePlcSyncPull(local, canonicalVersion) === 'conflict';
}
