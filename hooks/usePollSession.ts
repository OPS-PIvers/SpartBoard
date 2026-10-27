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
  isTextQuestion,
  withVotesReset,
} from '@/utils/pollQuestions';
import {
  aggregateVotes,
  answerTime,
  makePollSessionId,
  setSessionQuestionIndex,
  syncSessionResultsState,
  withStoppedSessionEnded,
  type PollVoteEntry,
} from '@/components/poll/pollSession';

interface UsePollSessionArgs {
  config: PollConfig;
  teacherUid?: string;
  onConfigChange: (next: PollConfig) => void;
  /** The viewer owns the session, so the rules let it read typed answers. */
  readAnswers?: boolean;
  /** Reset also ends a stopped session (poll-pro), so its votes can't come back. */
  endSessionOnReset?: boolean;
  /** The viewer has poll-pro, so hidden results and locks reach phones. */
  pollPro?: boolean;
}

export interface PollResponse {
  id: string;
  text: string;
}

interface UsePollSessionResult {
  questions: PollQuestion[];
  currentQuestionIndex: number;
  currentQuestion: PollQuestion;
  isLive: boolean;
  /** Current question's options, with live device tallies when a session runs. */
  displayOptions: PollOption[];
  /** Current question's typed answers (word cloud, open response), newest first. */
  responses: PollResponse[];
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

/** Live vote and typed-answer docs for one session; answers only when the rules let the viewer read them. */
export const usePollSessionDocs = (
  teacherUid: string | undefined,
  pollSessionId: string | null,
  readAnswers: boolean
): { votes: PollVoteEntry[]; answers: PollVoteEntry[] } => {
  const [votes, setVotes] = useState<PollVoteEntry[]>([]);

  // One listener covers every question — vote docs carry their own index.
  useEffect(() => {
    if (!pollSessionId || !teacherUid) return;
    const sessionId = makePollSessionId(teacherUid, pollSessionId);
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
  }, [pollSessionId, teacherUid]);

  const [answers, setAnswers] = useState<PollVoteEntry[]>([]);

  useEffect(() => {
    if (!pollSessionId || !teacherUid || !readAnswers) return;
    const sessionId = makePollSessionId(teacherUid, pollSessionId);
    const unsub = onSnapshot(
      collection(db, 'poll_sessions', sessionId, 'answers'),
      (snap) => {
        setAnswers(
          snap.docs.map((d) => {
            const { answeredAt, ...data } = d.data() as Omit<
              PollVoteEntry,
              'id' | 'answeredAt'
            > & { answeredAt?: { toMillis?: () => number } | null };
            const at = answeredAt?.toMillis?.();
            return {
              id: d.id,
              ...data,
              ...(typeof at === 'number' ? { answeredAt: at } : {}),
            };
          })
        );
      },
      (err) => logError('usePollSession.answers', err, { sessionId })
    );
    return () => {
      unsub();
      setAnswers([]);
    };
  }, [pollSessionId, teacherUid, readAnswers]);

  return { votes, answers };
};

/** Word cloud words the session owner hid, by question id; empty for anyone else. */
export const usePollHiddenWords = (
  teacherUid: string | undefined,
  pollSessionId: string | null,
  enabled: boolean
): ReadonlyMap<string, readonly string[]> => {
  const [hidden, setHidden] = useState<ReadonlyMap<string, readonly string[]>>(
    () => new Map()
  );

  useEffect(() => {
    if (!pollSessionId || !teacherUid || !enabled) return;
    const sessionId = makePollSessionId(teacherUid, pollSessionId);
    const unsub = onSnapshot(
      collection(db, 'poll_sessions', sessionId, 'hidden_words'),
      (snap) => {
        const next = new Map<string, readonly string[]>();
        for (const d of snap.docs) {
          const words: unknown = d.data().words;
          if (Array.isArray(words))
            next.set(
              d.id,
              words.filter((w): w is string => typeof w === 'string')
            );
        }
        setHidden(next);
      },
      (err) => logError('usePollSession.hiddenWords', err, { sessionId })
    );
    return () => {
      unsub();
      setHidden(new Map());
    };
  }, [pollSessionId, teacherUid, enabled]);

  return hidden;
};

export const usePollSession = ({
  config,
  teacherUid,
  onConfigChange,
  readAnswers = false,
  endSessionOnReset = false,
  pollPro = false,
}: UsePollSessionArgs): UsePollSessionResult => {
  const activePollSessionId = config.activePollSessionId ?? null;
  const isLive = !!activePollSessionId;

  const questions = useMemo(() => getPollQuestions(config), [config]);
  const currentQuestionIndex = clampQuestionIndex(
    config.currentQuestionIndex,
    questions.length
  );
  const currentQuestion = questions[currentQuestionIndex];

  const hasTextQuestion = questions.some(isTextQuestion);
  const { votes, answers } = usePollSessionDocs(
    teacherUid,
    activePollSessionId,
    readAnswers && hasTextQuestion
  );

  const displayOptions = useMemo(() => {
    const options = currentQuestion?.options ?? [];
    if (!isLive) return options;
    const tally = aggregateVotes(votes, currentQuestionIndex, options.length);
    return options.map((o, i) => ({ ...o, votes: tally[i] ?? 0 }));
  }, [currentQuestion, isLive, votes, currentQuestionIndex]);

  const responses = useMemo(
    () =>
      isLive
        ? answers
            .filter(
              (v) =>
                v.questionIndex === currentQuestionIndex &&
                typeof v.text === 'string' &&
                v.text.trim() !== ''
            )
            .sort((a, b) => answerTime(b) - answerTime(a))
            .map((v) => ({ id: v.id, text: (v.text ?? '').trim() }))
        : [],
    [isLive, answers, currentQuestionIndex]
  );

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
  // On a shared board only the member who ran the session can update its doc.
  const resultsOwnerUid =
    (activePollSessionId
      ? config.activePollSessionOwnerUid
      : config.lastPollSessionOwnerUid) ?? teacherUid;

  const applyResultsState = useCallback(
    (next: PollConfig) => {
      onConfigChange(next);
      if (resultsSessionId && teacherUid && resultsOwnerUid === teacherUid) {
        void syncSessionResultsState(
          teacherUid,
          resultsSessionId,
          next,
          pollPro
        ).catch((err) => logError('usePollSession.resultsState', err));
      }
    },
    [onConfigChange, resultsSessionId, resultsOwnerUid, teacherUid, pollPro]
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
    const reset = withVotesReset(config);
    const next = endSessionOnReset ? withStoppedSessionEnded(reset) : reset;
    if (config.hideResults || config.answerShownQuestionIds?.length) {
      applyResultsState(next);
    } else onConfigChange(next);
  }, [config, endSessionOnReset, applyResultsState, onConfigChange]);

  const hasCorrectAnswer = (currentQuestion?.options ?? []).some(
    (o) => o.correct === true
  );
  const answerShown =
    hasCorrectAnswer &&
    (config.answerShownQuestionIds ?? []).includes(currentId);

  const setAnswerShown = useCallback(
    (shown: boolean) => {
      if (!currentId) return;
      // Showing the answer also locks voting, so no one switches to it afterwards.
      applyResultsState({
        ...config,
        answerShownQuestionIds: toggleId(
          config.answerShownQuestionIds,
          currentId,
          shown
        ),
        ...(shown
          ? {
              lockedQuestionIds: toggleId(
                config.lockedQuestionIds,
                currentId,
                true
              ),
            }
          : {}),
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
    responses,
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
