/**
 * Quiz join-code canonicalization — FUNCTIONS-SIDE copy.
 *
 * This MUST stay byte-for-byte identical to the client's `utils/quizCode.ts`
 * `normalizeQuizCode`. The teacher creates a session and students join from the
 * CLIENT (which normalizes there), while `pinLoginV1` resolves that same
 * `quiz_sessions` doc by `code` HERE on the server — so if the two normalizers
 * drift, a student's PIN login would query a differently-cased/-stripped code
 * than the one stored and silently resolve a different session (or none).
 *
 * It can't be a single shared module: `functions/` is a separate TypeScript
 * project that bundles/deploys on its own and can't import the repo-root
 * `utils/`. The drift guard is instead a test (`quizCode.test.ts`) that pins the
 * SAME cases as the client's, so a change on either side fails its suite.
 */

/** Trim, strip every non-alphanumeric character, and uppercase a quiz join code. */
export function normalizeQuizCode(code: string): string {
  return code
    .trim()
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase();
}
