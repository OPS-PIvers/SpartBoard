import { useMemo } from 'react';
import { arrayRemove, arrayUnion, doc, updateDoc } from 'firebase/firestore';
import { db } from '@/config/firebase';

const SESSIONS_COLLECTION = 'video_activity_sessions';

export interface VideoActivityLiveControls {
  start: () => Promise<void>;
  openQuestion: (questionId: string, playheadSeconds: number) => Promise<void>;
  resume: (playheadSeconds: number) => Promise<void>;
  showResults: (shown: boolean) => Promise<void>;
  /** Writes the key for students to see while revealed, and clears it on hide. */
  revealAnswer: (
    revealed: boolean,
    correctAnswer?: string | null
  ) => Promise<void>;
  skip: (questionIds: string[], playheadSeconds: number) => Promise<void>;
  /** Closes any open question and ends the session; the caller runs the assignment finalize path. */
  end: (playheadSeconds: number) => Promise<void>;
}

/** Board pacing writes for a teacher-paced session: small single-doc updates (plan §5.2). */
export function useVideoActivityLiveControls(
  sessionId: string | null | undefined
): VideoActivityLiveControls {
  return useMemo(() => {
    const write = async (
      patch: Record<string, unknown>,
      playheadSeconds?: number
    ): Promise<void> => {
      if (!sessionId) return;
      const data: Record<string, unknown> = {
        ...patch,
        'live.updatedAt': Date.now(),
        ...(playheadSeconds !== undefined
          ? { 'live.playheadSeconds': Math.max(0, playheadSeconds) }
          : {}),
      };
      await updateDoc(doc(db, SESSIONS_COLLECTION, sessionId), data);
    };

    return {
      start: () => write({ status: 'active' }),
      openQuestion: (questionId, playheadSeconds) =>
        write(
          {
            'live.currentQuestionId': questionId,
            'live.questionPhase': 'open',
            'live.resultsShown': false,
            'live.answerRevealed': false,
            'live.revealedAnswer': null,
            'live.askedQuestionIds': arrayUnion(questionId),
            'live.skippedQuestionIds': arrayRemove(questionId),
          },
          playheadSeconds
        ),
      resume: (playheadSeconds) =>
        write(
          {
            'live.currentQuestionId': null,
            'live.questionPhase': 'closed',
            'live.revealedAnswer': null,
          },
          playheadSeconds
        ),
      showResults: (shown) => write({ 'live.resultsShown': shown }),
      revealAnswer: (revealed, correctAnswer = null) =>
        write({
          'live.answerRevealed': revealed,
          'live.revealedAnswer': revealed ? correctAnswer : null,
        }),
      skip: async (questionIds, playheadSeconds) => {
        if (questionIds.length === 0) return;
        await write(
          { 'live.skippedQuestionIds': arrayUnion(...questionIds) },
          playheadSeconds
        );
      },
      end: (playheadSeconds) =>
        write(
          {
            status: 'ended',
            endedAt: Date.now(),
            'live.currentQuestionId': null,
            'live.questionPhase': 'closed',
          },
          playheadSeconds
        ),
    };
  }, [sessionId]);
}
