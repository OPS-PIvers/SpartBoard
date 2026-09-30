import React, { useState } from 'react';
import {
  QuizLeaderboardEntry,
  QuizQuestion,
  QuizResponse,
  QuizSession,
} from '@/types';
import { PresentLobby } from './PresentLobby';
import { PresentPacedAnswering } from './PresentPacedAnswering';
import { PresentPacedReview } from './PresentPacedReview';
import { PresentSelfPaced } from './PresentSelfPaced';
import { PresentPaused } from './PresentPaused';
import { PresentEnded } from './PresentEnded';
import { boardRankRows } from '@/utils/reviewLaunch';
import {
  DARK_PRESENT_THEME,
  LIGHT_PRESENT_THEME,
  PresentThemeContext,
} from './presentTheme';

export interface PresentData {
  session: QuizSession;
  currentQ: QuizQuestion | undefined;
  responses: QuizResponse[];
  answered: number;
  counts: { notStarted: number; inProgress: number; done: number };
  total: number;
  standings: QuizLeaderboardEntry[];
  isGamified: boolean;
  classAverage: number | null;
}

interface PresentScreenProps extends PresentData {
  showNames: boolean;
}

export const PresentScreen: React.FC<PresentScreenProps> = ({
  session,
  currentQ,
  responses,
  answered,
  counts,
  total,
  standings,
  isGamified,
  classAverage,
  showNames,
}) => {
  const isLobby =
    session.status === 'waiting' || session.currentQuestionIndex < 0;
  const isSelfPaced = session.sessionMode === 'student';
  const unit: 'pts' | '%' = isGamified ? 'pts' : '%';
  const rankRows = session.boardRankLimit
    ? boardRankRows(session.boardRankLimit)
    : undefined;
  const game = session.widgetKind === 'review';
  const theme = game ? LIGHT_PRESENT_THEME : DARK_PRESENT_THEME;
  const reviewingId =
    session.questionPhase === 'reviewing' ? currentQ?.id : undefined;
  // Standings at each review, so the next review can show gains and rank moves.
  const [reviews, setReviews] = useState<{
    id?: string;
    current: QuizLeaderboardEntry[];
    previous?: QuizLeaderboardEntry[];
  }>({ current: standings });
  if (game && reviewingId && reviewingId !== reviews.id) {
    setReviews({
      id: reviewingId,
      current: standings,
      previous: reviews.current,
    });
  } else if (game && reviewingId && reviews.current !== standings) {
    setReviews({ ...reviews, current: standings });
  }
  const revealed =
    (session.showCorrectOnBoard ?? false) &&
    !!currentQ &&
    !!session.revealedAnswers?.[currentQ.id];

  let body: React.ReactNode;
  if (session.status === 'paused') {
    body = <PresentPaused session={session} />;
  } else if (session.status === 'ended') {
    body = (
      <PresentEnded
        standings={standings}
        showNames={showNames}
        unit={unit}
        classAverage={classAverage}
        completed={counts.done}
        total={total}
        rankRows={rankRows}
        game={game}
      />
    );
  } else if (isLobby) {
    body = <PresentLobby session={session} joined={total} />;
  } else if (isSelfPaced) {
    body = (
      <PresentSelfPaced
        counts={counts}
        total={total}
        standings={standings}
        showNames={showNames}
        isGamified={isGamified}
        unit={unit}
      />
    );
  } else if (currentQ && session.questionPhase === 'reviewing') {
    body = (
      <PresentPacedReview
        question={currentQ}
        responses={responses}
        revealed={revealed}
        standings={standings}
        showNames={showNames}
        unit={unit}
        rankRows={rankRows}
        game={game}
        previous={
          game && reviews.id === currentQ.id ? reviews.previous : undefined
        }
      />
    );
  } else if (currentQ) {
    body = (
      <PresentPacedAnswering
        session={session}
        question={currentQ}
        answered={answered}
        total={total}
      />
    );
  } else {
    body = <PresentLobby session={session} joined={total} />;
  }

  return (
    <PresentThemeContext.Provider value={theme}>
      <div
        className={`min-h-screen w-full flex flex-col ${theme.root}`}
        role="region"
        aria-label="Present to class"
      >
        {!isLobby && (
          <header
            className="shrink-0 flex items-center justify-between"
            style={{ padding: '2.5vh 3vw' }}
          >
            <p
              className={`font-sans font-semibold truncate ${theme.muted}`}
              style={{ fontSize: 'clamp(0.9rem, 1.8vw, 1.6rem)' }}
            >
              {session.quizTitle}
            </p>
            {!isSelfPaced && session.status === 'active' && (
              <p
                className={`font-sans uppercase tracking-widest tabular-nums shrink-0 ${theme.faint}`}
                style={{ fontSize: 'clamp(0.7rem, 1.3vw, 1.2rem)' }}
              >
                Q{session.currentQuestionIndex + 1} of {session.totalQuestions}
              </p>
            )}
          </header>
        )}
        <main
          className="flex-1 min-h-0 flex flex-col items-center justify-center text-center"
          style={{ gap: '3vh', padding: '0 4vw 5vh' }}
        >
          {body}
        </main>
      </div>
    </PresentThemeContext.Provider>
  );
};
