import {
  isFreeResponseType,
  type QuizBankSlot,
  type QuizQuestion,
  type VideoActivityQuestion,
} from '@/types';

/**
 * Two levels of check. `…IncompleteReason` is the editor's nudge: everything
 * that should be filled in before the work is worth handing out. `…Blocker` is
 * the assign-time gate, and is deliberately narrower — only what leaves a
 * student stuck or breaks auto-grading. Autosave means an unfinished draft is
 * now a normal resting state, so assign can no longer assume completeness
 * simply because something was saved.
 */

interface QuizCompletenessInput {
  title: string;
  questions: QuizQuestion[];
  bankSlots?: QuizBankSlot[];
}

export const quizIncompleteReason = (
  { title, questions, bankSlots = [] }: QuizCompletenessInput,
  isBank = false
): string | null => {
  if (!title.trim())
    return isBank ? 'Bank title is required' : 'Quiz title is required';
  if (questions.length === 0 && bankSlots.length === 0)
    return 'Add at least one question';
  const emptySlot = bankSlots.find(
    (s) => s.mode === 'random' && (s.count ?? 0) < 1
  );
  if (emptySlot)
    return `"${emptySlot.bankTitle}" draws 0 questions. Set how many to draw or remove the slot.`;
  for (let i = 0; i < questions.length; i += 1) {
    const q = questions[i];
    if (!q.text.trim()) return `Question ${i + 1}: text is required`;
    // Free-response questions have no correct answer — they are manually
    // graded after the quiz closes. A `needsKey` question saves without one
    // on purpose (D7).
    if (!isFreeResponseType(q.type) && !q.needsKey && !q.correctAnswer.trim())
      return `Question ${i + 1}: correct answer is required`;
  }
  return null;
};

/** Shared by the editor notice and the assign gate. */
const questionKeyProblem = (questions: QuizQuestion[]): string | null => {
  for (let i = 0; i < questions.length; i += 1) {
    const q = questions[i];
    if (!q.text.trim()) return `question ${i + 1} has no text`;
    if (!isFreeResponseType(q.type) && !q.needsKey && !q.correctAnswer.trim())
      return `question ${i + 1} has no correct answer`;
  }
  return null;
};

/** MA answers are |-joined for grading, so an option containing | is misgraded. */
const maOptionHasPipe = (q: VideoActivityQuestion): boolean =>
  (q.incorrectAnswers ?? []).some((s) => s.includes('|'));

interface VideoActivityCompletenessInput {
  title: string;
  youtubeUrl: string;
  questions: VideoActivityQuestion[];
}

export const videoActivityIncompleteReason = ({
  title,
  youtubeUrl,
  questions,
}: VideoActivityCompletenessInput): string | null => {
  if (!title.trim()) return 'Activity title is required';
  if (!youtubeUrl.trim()) return 'YouTube URL is required';
  if (questions.length === 0) return 'Add at least one question';
  for (let i = 0; i < questions.length; i += 1) {
    const q = questions[i];
    if (!q.text.trim()) return `Question ${i + 1}: text is required`;
    const type = q.type ?? 'MC';
    if (type === 'MA') {
      const correctCount = q.correctAnswer
        .split('|')
        .map((s) => s.trim())
        .filter((s) => s.length > 0).length;
      const incorrectCount = (q.incorrectAnswers ?? []).filter(
        (s) => s.trim().length > 0
      ).length;
      if (correctCount + incorrectCount === 0)
        return `Question ${i + 1}: add at least one option`;
      if (correctCount === 0)
        return `Question ${i + 1}: select at least one correct option`;
      if (maOptionHasPipe(q))
        return `Question ${i + 1}: option text cannot contain the | character`;
    } else if (!q.correctAnswer.trim()) {
      return `Question ${i + 1}: correct answer is required`;
    }
  }
  return null;
};

/** Assign-time gate: a question students cannot answer or the grader cannot score. */
export const quizAssignBlocker = ({
  questions,
  bankSlots = [],
}: Pick<QuizCompletenessInput, 'questions' | 'bankSlots'>): string | null => {
  if (questions.length === 0 && bankSlots.length === 0)
    return 'it has no questions';
  return questionKeyProblem(questions);
};

/**
 * Assign-time gate for an activity. Unlike a quiz, one with no questions is a
 * legitimate watch-only assignment, so only broken questions block.
 */
export const videoActivityAssignBlocker = ({
  questions,
}: Pick<VideoActivityCompletenessInput, 'questions'>): string | null => {
  for (let i = 0; i < questions.length; i += 1) {
    const q = questions[i];
    if (!q.text.trim()) return `question ${i + 1} has no text`;
    const type = q.type ?? 'MC';
    const answered =
      type === 'MA'
        ? q.correctAnswer.split('|').some((s) => s.trim().length > 0)
        : q.correctAnswer.trim().length > 0;
    if (!answered) return `question ${i + 1} has no correct answer`;
    if (type === 'MA' && maOptionHasPipe(q))
      return `question ${i + 1} has an option containing the | character`;
  }
  return null;
};
