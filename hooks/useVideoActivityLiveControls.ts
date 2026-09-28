import { useMemo } from 'react';
import { arrayRemove, arrayUnion, doc, updateDoc } from 'firebase/firestore';
import { db } from '@/config/firebase';

const SESSIONS_COLLECTION = 'video_activity_sessions';

export interface VideoActivityLiveControls {
  start: () => Promise<void>;
  openQuestion: (questionId: string, playheadSeconds: number) => Promise<void>;
  resume: (playheadSeconds: number) => Promise<void>;
  showResults: (shown: boolean) => Promise<void>;
  revealAnswer: (revealed: boolean) => Promise<void>;
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
          },
          playheadSeconds
        ),
      showResults: (shown) => write({ 'live.resultsShown': shown }),
      revealAnswer: (revealed) => write({ 'live.answerRevealed': revealed }),
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
