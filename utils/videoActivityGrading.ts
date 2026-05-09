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
 * `̀-ͯ`), so that `café` and `cafe`, `naïve` and `naive`, or
 * `résumé` and `resume` all compare as equivalent. This is a deliberate
 * VA-only forgiveness — Quiz's own grading stays strict to keep Matching
 * pair-equality behavior unchanged.
 */
function normalizeAnswer(s: string): string {
  return quizNormalizeAnswer(s).normalize('NFD').replace(/[̀-ͯ]/g, '');
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
    max += q.points ?? 1;
    if (seen.has(q.id)) continue;
    const a = answers.find((x) => x.questionId === q.id);
    if (!a) continue;
    seen.add(q.id);
    earned += gradeVideoActivityAnswer(q, a.answer).pointsEarned;
  }
  if (max === 0) return 0;
  return Math.round((earned / max) * 100);
}
