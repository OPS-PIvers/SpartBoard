import { deleteField } from 'firebase/firestore';
import type { QuizResponse } from '@/types';
import {
  encodeResponseKeySegment,
  quizPinKeySegment,
} from '@/utils/quizResponseKey';

/**
 * Thrown by `joinQuizSession` when a student attempts to join a session they've
 * already completed and the assignment's attempt limit has been reached. The
 * UI should catch this and render a friendly "ask your teacher" message; the
 * teacher can reset by removing the student from the live monitor.
 */
export class AttemptLimitReachedError extends Error {
  constructor() {
    super(
      "You've already submitted this quiz. Talk to your teacher if you need another attempt."
    );
    this.name = 'AttemptLimitReachedError';
  }
}

/**
 * Thrown by `joinQuizSession` when the resolved code maps only to ended
 * sessions. Callers (notably the SSO auto-join in `QuizStudentApp`) use
 * this as a sentinel to fall back to read-only review mode via
 * `subscribeForReview`, rather than string-matching the error message.
 */
export class SessionEndedError extends Error {
  constructor() {
    super('This quiz session has already ended.');
    this.name = 'SessionEndedError';
  }
}

/**
 * Compute the deterministic response-doc key.
 *
 * For studentRole (real SSO) auth, we continue to key by `auth.uid` because
 * the uid is stable per-user. For anonymous PIN auth the uid rotates every
 * time the student clears storage or switches device, which would let them
 * bypass attempt limits — so we derive a key from `pin + classPeriod` that
 * is stable per-roster-student.
 *
 * Known limitation: two rosters assigned to the same session with overlapping
 * PINs under the same (normalized) classPeriod would collide on the same doc
 * key. Rosters are normally period-scoped, so this is expected to be rare.
 */
export function computeResponseKey(
  authUid: string,
  isAnonymous: boolean,
  pin: string,
  classPeriod: string | undefined
): string {
  if (!isAnonymous) return authUid;
  return `pin-${encodeResponseKeySegment(classPeriod)}-${encodeResponseKeySegment(pin)}`;
}

/** Quiz response key: like `computeResponseKey`, with the PIN in its canonical `quizPinKeySegment` form. */
export function computeQuizResponseKey(
  authUid: string,
  isAnonymous: boolean,
  pin: string,
  classPeriod: string | undefined
): string {
  if (!isAnonymous) return authUid;
  return `pin-${encodeResponseKeySegment(classPeriod)}-${quizPinKeySegment(pin)}`;
}

/**
 * Branded type for the deterministic response-doc key (computed by
 * `computeResponseKey` / read off `_responseKey`). Pure type-level brand —
 * no wire-format change. Lets call sites (delete-confirm state, exported-id
 * sets) enforce that they never accidentally store a raw `string` where a
 * keyed-by-response-doc value is expected.
 *
 * The Firestore wire format stays `string[]` for backwards compatibility;
 * cast at the boundary (read from / write to assignment doc).
 */
export type ResponseDocKey = string & { readonly __brand: 'ResponseDocKey' };

/**
 * Resolve the Firestore doc id for a given response. The snapshot listeners
 * attach `_responseKey` to every row so teacher-side UI can target the
 * underlying doc without knowing the keying scheme; legacy rows predating
 * that field still equate the key with `studentUid`, hence the fallback.
 */
export function getResponseDocKey(response: QuizResponse): ResponseDocKey {
  return (response._responseKey ?? response.studentUid) as ResponseDocKey;
}

/** Deletes the published answer key a retake must not carry into its new attempt (#5811). */
export function retakeKeyStrip(
  r: Pick<
    QuizResponse,
    | 'revealedAnswers'
    | 'revealedRubricExamples'
    | 'revealedExplanations'
    | 'resultsOverride'
  >
): Record<string, ReturnType<typeof deleteField>> {
  const patch: Record<string, ReturnType<typeof deleteField>> = {};
  const override = r.resultsOverride as Record<string, unknown> | undefined;
  for (const f of [
    'revealedAnswers',
    'revealedRubricExamples',
    'revealedExplanations',
  ] as const) {
    if (f in r) patch[f] = deleteField();
    if (override && f in override)
      patch[`resultsOverride.${f}`] = deleteField();
  }
  return patch;
}
