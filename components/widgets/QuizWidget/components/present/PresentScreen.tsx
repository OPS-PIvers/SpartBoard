import React from 'react';
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
    <div
      className="min-h-screen w-full bg-brand-blue-dark text-white flex flex-col"
      role="region"
      aria-label="Present to class"
    >
      {!isLobby && (
        <header
          className="shrink-0 flex items-center justify-between"
          style={{ padding: '2.5vh 3vw' }}
        >
          <p
            className="font-sans font-semibold text-white/70 truncate"
            style={{ fontSize: 'clamp(0.9rem, 1.8vw, 1.6rem)' }}
          >
            {session.quizTitle}
          </p>
          {!isSelfPaced && session.status === 'active' && (
            <p
              className="font-sans uppercase tracking-widest text-white/50 tabular-nums shrink-0"
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
  );
};
