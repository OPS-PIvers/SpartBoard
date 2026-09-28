import type {
  VideoActivityLiveState,
  VideoActivityQuestion,
  VideoActivitySession,
} from '@/types';

type LiveSessionFields = Pick<VideoActivitySession, 'sessionMode' | 'live'>;

export const isLiveVideoActivitySession = (
  session: LiveSessionFields | null | undefined
): boolean => session?.sessionMode === 'teacher';

export const initialVideoActivityLiveState = (
  now: number
): VideoActivityLiveState => ({
  currentQuestionId: null,
  questionPhase: 'closed',
  resultsShown: false,
  answerRevealed: false,
  askedQuestionIds: [],
  skippedQuestionIds: [],
  playheadSeconds: 0,
  updatedAt: now,
});

/** The questions a response is scored over: every question, or only the asked ones in a live session (D11). */
export function scoredVideoActivityQuestions<
  Q extends Pick<VideoActivityQuestion, 'id'>,
>(session: LiveSessionFields | null | undefined, questions: Q[]): Q[] {
  if (!isLiveVideoActivitySession(session)) return questions;
  const asked = new Set(session?.live?.askedQuestionIds ?? []);
  return questions.filter((q) => asked.has(q.id));
}
