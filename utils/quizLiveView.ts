import type {
  InputSignalCounts,
  QuizPublicQuestion,
  QuizResponse,
  QuizSession,
  StudentOverride,
} from '@/types';
import { readAttemptSignals } from '@/utils/inputSignals';
import { orderServedQuestions } from '@/utils/questionBanks';
import { countAnsweredQuestions } from '@/utils/quizCompleteness';
import { serveQuestionSubset } from '@/utils/quizOverrideServing';
import { shuffleWithinSections } from '@/utils/quizSections';
import { shufflePublicQuestions } from '@/utils/quizShuffle';
import { resolveAttemptDeadline, timestampMillis } from '@/utils/quizTimeLimit';
import { describeTabExit, totalAwayMs } from '@/utils/tabExits';

export const QUIZ_LIVE_VIEW_FEATURE = 'quiz-live-view' as const;
export const LIVE_VIEW_SESSION_ID = 'live-view-mirror';
/** How long one stamp keeps the student reporting; the open panel renews it before then. */
export const LIVE_VIEW_STAMP_MS = 5 * 60_000;
export const LIVE_VIEW_RENEW_MS = 3 * 60_000;

/** Live view covers self-paced attempts; the board sets the question in teacher-paced and game runs. */
export const liveViewSupported = (session: QuizSession): boolean =>
  session.sessionMode === 'student';

/** The session as the mirror renders it: same questions, nothing that locks, times out, records or writes. */
export function liveViewSession(session: QuizSession): QuizSession {
  const {
    closeAt: _closeAt,
    inputSignals: _inputSignals,
    allowCrossOut: _crossOut,
    timeLimitMinutes: _timeLimit,
    ...rest
  } = session;
  return {
    ...rest,
    id: LIVE_VIEW_SESSION_ID,
    assignmentId: LIVE_VIEW_SESSION_ID,
    status: 'active',
    tabWarningsEnabled: false,
    blockCopyPaste: false,
    handRaiseEnabled: false,
    soundEffectsEnabled: false,
    // Mark for review stays on the student's device (D20).
    reviewStep: false,
  };
}

/** The response as the mirror renders it, without the unlock prompts a student would see. */
export function liveViewResponse(response: QuizResponse): QuizResponse {
  return { ...response, unlocked: false, unlockKind: undefined };
}

/** The question the student touched last; stands in until they report the one on screen. */
export function newestAnswerQuestionId(response: QuizResponse): string | null {
  let newest: { questionId: string; answeredAt: number } | null = null;
  for (const a of response.answers) {
    if (!newest || a.answeredAt >= newest.answeredAt) newest = a;
  }
  return newest?.questionId ?? null;
}

/** This student's questions in the order their device serves them. */
export function studentQuestionOrder(
  session: QuizSession,
  response: QuizResponse,
  override?: StudentOverride
): QuizPublicQuestion[] {
  const drawIds = response.servedQuestionIds;
  const served = drawIds?.length
    ? orderServedQuestions(session.publicQuestions, drawIds)
    : serveQuestionSubset(session.publicQuestions, override?.questionIds);
  if (session.sessionMode !== 'student' || session.shuffleQuestions !== true)
    return served;
  const seed = `${response.studentUid}:attempt-${response.completedAttempts ?? 0}`;
  return session.sections?.length
    ? shuffleWithinSections(served, session.sections, (items, key) =>
        shufflePublicQuestions(items, `${seed}:${key}`)
      )
    : shufflePublicQuestions(served, seed);
}

export interface LiveViewInputTotals {
  keys: number;
  pastes: number;
  pastedChars: number;
  deletions: number;
  clicks: number;
}

export interface LiveViewStats {
  startedAt: number;
  /** Null without a time limit. */
  deadline: number | null;
  /** 1-based place in the student's own order; null when the question is unknown. */
  questionNumber: number | null;
  questionCount: number;
  answeredCount: number;
  /** Server time of the last answer write. */
  lastActivityAt: number | null;
  tabExits: number;
  awayMs: number;
  /** Null when the assignment doesn't track input. */
  input: LiveViewInputTotals | null;
}

const sumCounts = (
  byQuestion: Record<string, InputSignalCounts>
): LiveViewInputTotals => {
  const total = { keys: 0, pastes: 0, pastedChars: 0, deletions: 0, clicks: 0 };
  for (const c of Object.values(byQuestion)) {
    total.keys += c.keys ?? 0;
    total.pastes += c.pastes ?? 0;
    total.pastedChars += c.pastedChars ?? 0;
    total.deletions += c.dels ?? 0;
    total.clicks += c.clicks ?? 0;
  }
  return total;
};

export function liveViewStats(
  session: QuizSession,
  response: QuizResponse,
  questionId: string | null,
  now: number,
  override?: StudentOverride
): LiveViewStats {
  const order = studentQuestionOrder(session, response, override);
  const index = questionId ? order.findIndex((q) => q.id === questionId) : -1;
  const attempt = response.completedAttempts ?? 0;
  const exits = (response.tabExits ?? []).filter((e) => e.attempt === attempt);
  const startedAt =
    timestampMillis(response.attemptStartedAt) ?? response.joinedAt;
  return {
    startedAt,
    deadline:
      session.status === 'paused'
        ? null
        : resolveAttemptDeadline(
            timestampMillis(response.attemptStartedAt),
            session.timeLimitMinutes,
            override?.timeMultiplier,
            session.pauseSpans
          ),
    questionNumber: index >= 0 ? index + 1 : null,
    questionCount: order.length,
    answeredCount: countAnsweredQuestions(
      response.answers,
      order.map((q) => q.id),
      session.paperWrittenQuestionIds
    ),
    lastActivityAt: timestampMillis(response.lastWriteAt),
    tabExits: exits.length,
    awayMs: totalAwayMs(
      exits.map((e) =>
        describeTabExit(e, { completed: false, sessionEnded: false, now })
      )
    ),
    input:
      session.inputSignals === true
        ? sumCounts(readAttemptSignals(response.inputSignals, attempt))
        : null,
  };
}
