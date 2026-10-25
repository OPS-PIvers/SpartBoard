// Shared poll-session surface: live vote subscription, per-question tallies,
// and the presentation cursor. Used by the board widget and the phone remote.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';

import { db } from '@/config/firebase';
import { logError } from '@/utils/logError';
import type { PollConfig, PollOption, PollQuestion } from '@/types';
import {
  clampQuestionIndex,
  getPollQuestions,
  withVotesReset,
} from '@/utils/pollQuestions';
import {
  aggregateVotes,
  makePollSessionId,
  setSessionQuestionIndex,
  syncSessionResultsState,
  type PollVoteEntry,
} from '@/components/poll/pollSession';

interface UsePollSessionArgs {
  config: PollConfig;
  teacherUid?: string;
  onConfigChange: (next: PollConfig) => void;
}

interface UsePollSessionResult {
  questions: PollQuestion[];
  currentQuestionIndex: number;
  currentQuestion: PollQuestion;
  isLive: boolean;
  /** Current question's options, with live device tallies when a session runs. */
  displayOptions: PollOption[];
  canGoPrev: boolean;
  canGoNext: boolean;
  goToQuestion: (index: number) => void;
  /** Current question's results are held back until the teacher reveals them. */
  resultsHidden: boolean;
  /** Current question refuses new votes (live sessions only). */
  isLocked: boolean;
  setRevealed: (revealed: boolean) => void;
  setLocked: (locked: boolean) => void;
  /** Zero the votes; a hidden-results poll hides every question again, on phones too. */
  resetVotes: () => void;
  /** The current question has at least one option marked correct. */
  hasCorrectAnswer: boolean;
  /** The current question's correct answer is shown on the board and phones. */
  answerShown: boolean;
  setAnswerShown: (shown: boolean) => void;
}

const toggleId = (
  ids: string[] | undefined,
  id: string,
  on: boolean
): string[] => {
  const rest = (ids ?? []).filter((x) => x !== id);
  return on ? [...rest, id] : rest;
};

export const usePollSession = ({
  config,
  teacherUid,
  onConfigChange,
}: UsePollSessionArgs): UsePollSessionResult => {
  const activePollSessionId = config.activePollSessionId ?? null;
  const isLive = !!activePollSessionId;

  const questions = useMemo(() => getPollQuestions(config), [config]);
  const currentQuestionIndex = clampQuestionIndex(
    config.currentQuestionIndex,
    questions.length
  );
  const currentQuestion = questions[currentQuestionIndex];

  const [votes, setVotes] = useState<PollVoteEntry[]>([]);

  // One listener covers every question — vote docs carry their own index.
  useEffect(() => {
    if (!activePollSessionId || !teacherUid) return;
    const sessionId = makePollSessionId(teacherUid, activePollSessionId);
    const unsub = onSnapshot(
      collection(db, 'poll_sessions', sessionId, 'votes'),
      (snap) => {
        setVotes(
          snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<PollVoteEntry, 'id'>),
          }))
        );
      },
      (err) => logError('usePollSession.votes', err, { sessionId })
    );
    return () => {
      unsub();
      // Clear on teardown so a stopped session's counts don't flash on the
      // board when a fresh session starts before its first snapshot arrives.
      setVotes([]);
    };
  }, [activePollSessionId, teacherUid]);

  const displayOptions = useMemo(() => {
    const options = currentQuestion?.options ?? [];
    if (!isLive) return options;
    const tally = aggregateVotes(votes, currentQuestionIndex, options.length);
    return options.map((o, i) => ({ ...o, votes: tally[i] ?? 0 }));
  }, [currentQuestion, isLive, votes, currentQuestionIndex]);

  const goToQuestion = useCallback(
    (index: number) => {
      const next = clampQuestionIndex(index, questions.length);
      if (next === currentQuestionIndex) return;
      onConfigChange({ ...config, currentQuestionIndex: next });
      // Lockstep: joined phones follow the teacher's cursor off the session doc.
      if (activePollSessionId && teacherUid) {
        void setSessionQuestionIndex(
          teacherUid,
          activePollSessionId,
          next
        ).catch((err) => logError('usePollSession.navigate', err));
      }
    },
    [
      questions.length,
      currentQuestionIndex,
      onConfigChange,
      config,
      activePollSessionId,
      teacherUid,
    ]
  );

  const currentId = currentQuestion?.id ?? '';
  const resultsHidden =
    config.hideResults === true &&
    !(config.revealedQuestionIds ?? []).includes(currentId);
  const isLocked =
    isLive && (config.lockedQuestionIds ?? []).includes(currentId);

  // Phones stay on a stopped session's doc, so a reveal after Stop still reaches them.
  const resultsSessionId =
    activePollSessionId ?? config.lastPollSessionId ?? null;

  const applyResultsState = useCallback(
    (next: PollConfig) => {
      onConfigChange(next);
      if (resultsSessionId && teacherUid) {
        void syncSessionResultsState(teacherUid, resultsSessionId, next).catch(
          (err) => logError('usePollSession.resultsState', err)
        );
      }
    },
    [onConfigChange, resultsSessionId, teacherUid]
  );

  const setRevealed = useCallback(
    (revealed: boolean) => {
      if (!currentId) return;
      applyResultsState({
        ...config,
        revealedQuestionIds: toggleId(
          config.revealedQuestionIds,
          currentId,
          revealed
        ),
      });
    },
    [applyResultsState, config, currentId]
  );

  const setLocked = useCallback(
    (locked: boolean) => {
      if (!currentId) return;
      applyResultsState({
        ...config,
        lockedQuestionIds: toggleId(
          config.lockedQuestionIds,
          currentId,
          locked
        ),
      });
    },
    [applyResultsState, config, currentId]
  );

  const resetVotes = useCallback(() => {
    const next = withVotesReset(config);
    if (config.hideResults || config.answerShownQuestionIds?.length) {
      applyResultsState(next);
    } else onConfigChange(next);
  }, [config, applyResultsState, onConfigChange]);

  const hasCorrectAnswer = (currentQuestion?.options ?? []).some(
    (o) => o.correct === true
  );
  const answerShown =
    hasCorrectAnswer &&
    (config.answerShownQuestionIds ?? []).includes(currentId);

  const setAnswerShown = useCallback(
    (shown: boolean) => {
      if (!currentId) return;
      applyResultsState({
        ...config,
        answerShownQuestionIds: toggleId(
          config.answerShownQuestionIds,
          currentId,
          shown
        ),
      });
    },
    [applyResultsState, config, currentId]
  );

  return {
    questions,
    currentQuestionIndex,
    currentQuestion,
    isLive,
    displayOptions,
    canGoPrev: currentQuestionIndex > 0,
    canGoNext: currentQuestionIndex < questions.length - 1,
    goToQuestion,
    resultsHidden,
    isLocked,
    setRevealed,
    setLocked,
    resetVotes,
    hasCorrectAnswer,
    answerShown,
    setAnswerShown,
  };
};
