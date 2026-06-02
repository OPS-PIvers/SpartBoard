/**
 * Quiz join-code canonicalization.
 *
 * Teacher session creation, student join, in-session review, and the Google
 * Classroom add-on routes (teacher + student) all run a raw code through THIS
 * one function before querying `quiz_sessions` by `code`. Funneling every path
 * through the same normalization guarantees a given code resolves to the SAME
 * session everywhere — a lowercase, spaced, or hyphenated entry still matches the
 * stored uppercase-alphanumeric code. Drift between any two of these call sites
 * would let a teacher and a student (or the dashboard monitor and the in-iframe
 * grader) silently resolve different sessions for the same code.
 */

/** Trim, strip every non-alphanumeric character, and uppercase a quiz join code. */
export function normalizeQuizCode(code: string): string {
  return code
    .trim()
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase();
}
