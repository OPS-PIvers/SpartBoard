// Read-time shim between the legacy single-question PollConfig and `questions[]`.

import type { PollConfig, PollQuestion } from '@/types';

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
