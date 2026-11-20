export const QUIZ_SESSIONS_COLLECTION = 'quiz_sessions';
export const QUIZ_LIVE_COLLECTION = 'live';
export const QUIZ_LIVE_STATE_DOC = 'state';
export const RESPONSES_COLLECTION = 'responses';
/**
 * Archive subcollection for responses removed by the teacher. Holds a
 * copy of the original response doc plus archive metadata
 * (`archivedAt`, `archivedBy`, `archiveReason`). The live doc is deleted
 * so the deterministic key is freed for a fresh rejoin; the archive
 * preserves partial answers for teacher recovery + dev queries beyond
 * the 48h window the user asked for. Cleanup is intentionally not
 * scheduled — retention is currently indefinite; revisit if storage
 * cost becomes a concern.
 */
export const ARCHIVED_RESPONSES_COLLECTION = 'archived_responses';
/**
 * Append-only per-response snapshot log. Each entry captures the prior
 * value of a question's answer just before it gets overwritten in the
 * `responses/{rid}.answers` array, so a teacher (or admin) can recover
 * text that was lost to a race, a stray empty draft, or a student who
 * retyped over their own work. Writes are fire-and-forget and throttled
 * per-question (see `HISTORY_SNAPSHOT_THROTTLE_MS`) to keep storage and
 * write costs bounded — typical essay quiz has a low double-digit
 * count per student.
 */
export const RESPONSE_HISTORY_COLLECTION = 'history';
/**
 * Top-level cross-launch attempt ledger. Sits alongside `/quiz_sessions/`
 * and accumulates a student's completed-attempt count across every LAUNCH of a
 * single ASSIGNMENT. It is scoped per (assignment, student) — NOT per quiz
 * template — so a student can complete every assignment a teacher builds from
 * the same library quiz; the cap only stops re-attempts of the SAME assignment
 * across re-launches (where the per-session `responses/{key}` counter resets
 * each launch and a teacher's "1 attempt" intent would otherwise be bypassed).
 *
 * Doc id: `${assignmentId}__${studentUid}` (see `quizLedgerKey`), where
 * `assignmentId` is the session id — a deep-link/Classroom attach is 1:1 with a
 * session, and re-launching the same assignment resolves to the same session by
 * code. Schema: `QuizAttemptLedger` in types.ts.
 */
export const QUIZ_ATTEMPT_LEDGER_COLLECTION = 'quiz_attempt_ledger';
