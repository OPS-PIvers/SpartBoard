import React from 'react';
import { usePresentTheme } from './presentTheme';
import { QuizSession } from '@/types';

interface PresentLobbyProps {
  session: QuizSession;
  joined: number;
}

/**
 * Wayfinding owns the lobby: SSO students have no code to type, so the screen
 * names the path to the assignment instead.
 */
export const PresentLobby: React.FC<PresentLobbyProps> = ({
  session,
  joined,
}) => {
  const t = usePresentTheme();
  return (
    <>
      <p
        className={`font-sans font-bold leading-tight ${t.strong}`}
        style={{ fontSize: 'clamp(2rem, 7vw, 6rem)', textWrap: 'balance' }}
      >
        {session.quizTitle}
      </p>
      <p
        className={`font-sans max-w-[70vw] ${t.accent}`}
        style={{ fontSize: 'clamp(1.1rem, 2.8vw, 2.6rem)', lineHeight: 1.4 }}
      >
        Sign in, open <span className={`font-semibold ${t.strong}`}>My</span>{' '}
        <span className={`font-semibold ${t.strong}`}>Assignments</span>, then
        choose{' '}
        <span className={`font-semibold ${t.strong}`}>{session.quizTitle}</span>
        .
      </p>
      <p
        className={`font-sans tabular-nums ${t.muted}`}
        style={{ fontSize: 'clamp(1rem, 2.2vw, 2rem)' }}
      >
        {joined} {joined === 1 ? 'student' : 'students'} here
      </p>
    </>
  );
};
