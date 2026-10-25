// Read-time shim between the legacy single-question PollConfig and `questions[]`.

import type { PollConfig, PollOption, PollQuestion } from '@/types';

export const MAX_POLL_QUESTIONS = 20;

const LEGACY_QUESTION_ID = 'q-1';

/** Canonical question list for any poll config, legacy or migrated. */
export const getPollQuestions = (config: PollConfig): PollQuestion[] => {
  if (Array.isArray(config.questions) && config.questions.length > 0) {
    return config.questions;
  }
  return [
    {
      id: LEGACY_QUESTION_ID,
      question: config.question ?? 'Vote Now!',
      options: Array.isArray(config.options) ? config.options : [],
    },
  ];
};

/** Clamp a stored cursor into range; out-of-range or missing lands on 0. */
export const clampQuestionIndex = (
  index: number | undefined,
  count: number
): number => {
  if (count <= 0 || !Number.isInteger(index)) return 0;
  return Math.min(Math.max(index as number, 0), count - 1);
};

/** The question the board and phones are currently showing. */
export const getCurrentQuestion = (config: PollConfig): PollQuestion => {
  const questions = getPollQuestions(config);
  return questions[
    clampQuestionIndex(config.currentQuestionIndex, questions.length)
  ];
};

/**
 * Write `questions` as canonical and drop the legacy keys from the patch.
 * `updateWidget` merges config shallowly, so a stored legacy mirror can
 * survive this — it stays inert because `getPollQuestions` always prefers
 * `questions`. Clamps the presentation cursor when the list shrinks.
 */
export const withPollQuestions = <T extends PollConfig>(
  config: T,
  questions: PollQuestion[]
): T => {
  const next: T = {
    ...config,
    questions,
    currentQuestionIndex: clampQuestionIndex(
      config.currentQuestionIndex,
      questions.length
    ),
  };
  delete next.question;
  delete next.options;
  return next;
};

/** Replace one question in place, returning the config to persist. */
export const withQuestionAt = <T extends PollConfig>(
  config: T,
  index: number,
  question: PollQuestion
): T =>
  withPollQuestions(
    config,
    getPollQuestions(config).map((q, i) => (i === index ? question : q))
  );

/** A blank question with a fresh id, used by "Add question" and AI drafts. */
export const makeEmptyPollQuestion = (label = ''): PollQuestion => ({
  id: crypto.randomUUID(),
  question: label,
  options: [
    { id: crypto.randomUUID(), label: 'Option A', votes: 0 },
    { id: crypto.randomUUID(), label: 'Option B', votes: 0 },
  ],
});

/** Zero every question's votes and hide every shown answer; a hidden-results poll also hides each question again. Hidden typed answers stay hidden, since Resume reads the same answers. */
export const withVotesReset = (config: PollConfig): PollConfig =>
  withPollQuestions(
    {
      ...config,
      ...(config.hideResults ? { revealedQuestionIds: [] } : {}),
      ...(config.answerShownQuestionIds?.length
        ? { answerShownQuestionIds: [] }
        : {}),
    },
    getPollQuestions(config).map((q) => ({
      ...q,
      options: q.options.map((o) => ({ ...o, votes: 0 })),
    }))
  );

export const SCALE_SIZES = [5, 10] as const;

export const isScaleQuestion = (q: Pick<PollQuestion, 'kind'>): boolean =>
  q.kind === 'scale';

/** Word cloud and open response questions take typed answers instead of options. */
export const isTextQuestion = (q: Pick<PollQuestion, 'kind'>): boolean =>
  q.kind === 'words' || q.kind === 'text';

/** Longest typed answer the rules accept. */
export const MAX_POLL_TEXT = 280;
/** Word cloud answers are a few words. */
export const MAX_POLL_WORDS_TEXT = 40;

/** Numbered options "1".."size" for a rating scale. */
export const makeScaleOptions = (size: number): PollOption[] =>
  Array.from({ length: size }, (_, i) => ({
    id: crypto.randomUUID(),
    label: String(i + 1),
    votes: 0,
  }));

/** Average rating from per-option counts (option i is worth i + 1); null with no votes. */
export const scaleAverage = (counts: readonly number[]): number | null => {
  const total = counts.reduce((sum, n) => sum + n, 0);
  if (total === 0) return null;
  return counts.reduce((sum, n, i) => sum + n * (i + 1), 0) / total;
};
