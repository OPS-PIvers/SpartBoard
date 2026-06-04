/**
 * Single shared grader for Video Activity questions. All three call-sites
 * (student-side QuestionOverlay, post-completion summary in
 * VideoActivityStudentApp, teacher Results) MUST route correctness checks
 * through this module. Bypassing it via raw `answer === correctAnswer`
 * comparison silently drifts pre-PR2a logic and creates student/gradebook
 * discrepancies — see PR1b/PR2 alignment plan for the regression history.
 *
 * Wire format per question type:
 *   - MC  : correctAnswer = "the right option text"
 *   - FIB : correctAnswer = "canonical answer"; acceptableVariants?: string[]
 *   - MA  : correctAnswer = "opt1|opt2|opt3"  (correct selections, |-encoded)
 *
 * For MA, the student client packages selections as `selected.sort().join('|')`
 * before submission so the grader's set-compare is deterministic against any
 * checkbox order.
 */

import type { GradeResult, VideoActivityQuestion } from '@/types';
import { normalizeAnswer as quizNormalizeAnswer } from '@/hooks/useQuizSession';

/**
 * VA-specific answer normalization. Applies Quiz's whitespace + case pass
 * AND additionally strips combining diacritical marks (NFD + remove
 * `\u0300-\u036f`), so that `café` and `cafe`, `naïve` and `naive`, or
 * `résumé` and `resume` all compare as equivalent. This is a deliberate
 * VA-only forgiveness — Quiz's own grading stays strict to keep Matching
 * pair-equality behavior unchanged.
 */
function normalizeAnswer(s: string): string {
  return quizNormalizeAnswer(s)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Grade a single Video Activity answer.
 *
 * Returns full-credit (`isCorrect: true`, `pointsEarned = pointsMax`) when
 * the answer matches exactly. For MA with `allowPartialCredit` set, may
 * return a fractional `pointsEarned` even when `isCorrect` is `false`.
 *
 * Defensive against missing/legacy fields:
 *   - missing `type`     → treated as 'MC'
 *   - missing `points`   → 1
 *   - missing `correctAnswer` → empty string (always wrong unless given
 *     is also empty, which is a no-op)
 */
export function gradeVideoActivityAnswer(
  question: VideoActivityQuestion,
  studentAnswer: string
): GradeResult {
  const max = question.points ?? 1;
  const type = question.type ?? 'MC';
  const correct = question.correctAnswer ?? '';

  if (type === 'MC') {
    // Misconfigured-question guard: an MC with no `correctAnswer` set is a
    // stub (un-authored or AI-generated placeholder). Without this guard,
    // a student who submits an empty string would grade as correct because
    // `normalize('') === normalize('')`. Fail closed instead.
    const correctNorm = normalizeAnswer(correct);
    if (correctNorm.length === 0) {
      return { isCorrect: false, pointsEarned: 0, pointsMax: max };
    }
    const isCorrect = correctNorm === normalizeAnswer(studentAnswer);
    return { isCorrect, pointsEarned: isCorrect ? max : 0, pointsMax: max };
  }

  if (type === 'FIB') {
    // Same misconfigured-question guard as MC: an FIB with no canonical
    // answer + no variants would otherwise mark a blank submission correct.
    const accepted = [correct, ...(question.acceptableVariants ?? [])];
    const acceptedNorm = accepted
      .map(normalizeAnswer)
      .filter((s) => s.length > 0);
    if (acceptedNorm.length === 0) {
      return { isCorrect: false, pointsEarned: 0, pointsMax: max };
    }
    const givenNorm = normalizeAnswer(studentAnswer);
    const isCorrect = acceptedNorm.some((a) => a === givenNorm);
    return { isCorrect, pointsEarned: isCorrect ? max : 0, pointsMax: max };
  }

  if (type === 'MA') {
    const correctSet = new Set(
      correct
        .split('|')
        .map(normalizeAnswer)
        .filter((s) => s.length > 0)
    );
    const givenSet = new Set(
      studentAnswer
        .split('|')
        .map(normalizeAnswer)
        .filter((s) => s.length > 0)
    );
    let intersection = 0;
    for (const s of givenSet) {
      if (correctSet.has(s)) intersection++;
    }
    const wrongSelections = givenSet.size - intersection;
    const isCorrect =
      correctSet.size > 0 &&
      intersection === correctSet.size &&
      wrongSelections === 0;

    if (!question.allowPartialCredit) {
      return { isCorrect, pointsEarned: isCorrect ? max : 0, pointsMax: max };
    }
    if (correctSet.size === 0) {
      return { isCorrect: false, pointsEarned: 0, pointsMax: max };
    }
    // Partial credit: reward correct picks, penalize wrong picks. Floor at 0
    // so a student who picked nothing right but every wrong option doesn't
    // go negative. Cap at max for the all-correct case.
    const raw = (intersection - wrongSelections) / correctSet.size;
    const pointsEarned = Math.max(0, Math.min(1, raw)) * max;
    return { isCorrect, pointsEarned, pointsMax: max };
  }

  // Unknown type — fail closed.
  return { isCorrect: false, pointsEarned: 0, pointsMax: max };
}

/**
 * Convenience: compute a student's percentage score across all questions.
 * Uses points-aware totals so a 5-point MA question counts more than a
 * 1-point MC. Returns 0 when there are no questions.
 *
 * `answers` may contain duplicates per question (e.g. arrayUnion races);
 * we credit only the first answer per question id to avoid inflation.
 */
export function computeVideoActivityScorePct(
  questions: VideoActivityQuestion[],
  answers: { questionId: string; answer: string }[]
): number {
  if (questions.length === 0) return 0;
  const seen = new Set<string>();
  let earned = 0;
  let max = 0;
  for (const q of questions) {
    if (seen.has(q.id)) continue;
    seen.add(q.id);
    max += q.points ?? 1;
    const a = answers.find((x) => x.questionId === q.id);
    if (!a) continue;
    earned += gradeVideoActivityAnswer(q, a.answer).pointsEarned;
  }
  if (max === 0) return 0;
  return Math.round((earned / max) * 100);
}

/**
 * The gradebook denominator for a video activity: the sum of per-question points
 * (each question defaults to 1 point), or 100 when the activity has no scorable
 * points to sum. The VA mirror of `quizMaxPoints`.
 *
 * This single value is frozen into the Schoology line item's `scoreMaximum` when
 * a VA is ATTACHED (the deep-link picker) and is also the denominator the later
 * grade PUSH (VA Results) scales onto, so attach and push MUST compute it
 * identically — otherwise a VA attached as N points could be pushed against a
 * different denominator and post the wrong fraction. Sharing one helper makes
 * that drift impossible (it previously lived as an inline `reduce(...) || 100`
 * copied across the picker and the Results view).
 */
export function videoActivityMaxPoints(
  questions: VideoActivityQuestion[]
): number {
  return questions.reduce((sum, q) => sum + (q.points ?? 1), 0) || 100;
}

/**
 * Whether a Video Activity response can be meaningfully scored against the
 * given question set — the VA mirror of `quizScoreboard.canScoreResponse`.
 *
 * Guards the same "false 0" failure mode. `computeVideoActivityScorePct`
 * grades each answer against `questions[].correctAnswer`, so when the question
 * set is the wrong one (or absent) it silently yields 0: every `answers.find`
 * misses a loaded question and contributes nothing. That 0 then renders as a
 * real "0%", which reads as a student who failed rather than a scoring
 * artifact. Two cases produce it:
 *
 *   1. **Question set not loaded** — `questions` is empty. The teacher Results
 *      view scores against `session.questions`; before that hydrates from
 *      Firestore (or if it arrives empty) EVERY completed response scores 0,
 *      so the monitor shows a "0%" class average as if everyone failed.
 *   2. **Question-id drift** — a completed response's answers reference no
 *      question in the loaded set (e.g. a PLC-synced activity whose question
 *      IDs were regenerated after the student submitted). Grading skips all of
 *      them and the response scores 0 despite real answers.
 *
 * Callers should render a pending / "—" indicator (not a score) when this
 * returns false, exclude these responses from the class average / aggregate,
 * and keep them out of any Google Classroom gradebook push rather than seating
 * them at a phantom 0.
 *
 * A response with zero answers is treated as scoreable: its 0 is a genuine
 * "didn't answer", not a missing-key artifact, so the caller can still show 0.
 */
export function canScoreVideoActivityResponse(
  questions: VideoActivityQuestion[],
  answers: { questionId: string; answer: string }[]
): boolean {
  // Case 1: the question set hasn't loaded — nothing can be graded yet.
  if (questions.length === 0) return false;
  // A genuine empty submission is scoreable (a real 0, not a missing key).
  if (answers.length === 0) return true;
  // Case 2: at least one answer must map to a loaded question. Partial drift
  // (some ids match, some don't) is still gradable — the matched answers score
  // and the unmatched ones are skipped, same as computeVideoActivityScorePct.
  const ids = new Set(questions.map((q) => q.id));
  return answers.some((a) => ids.has(a.questionId));
}
