import React from 'react';
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
}) => (
  <>
    <p
      className="font-sans font-bold text-white leading-tight"
      style={{ fontSize: 'clamp(2rem, 7vw, 6rem)', textWrap: 'balance' }}
    >
      {session.quizTitle}
    </p>
    <p
      className="font-sans text-brand-blue-lighter max-w-[70vw]"
      style={{ fontSize: 'clamp(1.1rem, 2.8vw, 2.6rem)', lineHeight: 1.4 }}
    >
      Sign in, open <span className="font-semibold text-white">My</span>{' '}
      <span className="font-semibold text-white">Assignments</span>, then choose{' '}
      <span className="font-semibold text-white">{session.quizTitle}</span>.
    </p>
    <p
      className="font-sans text-white/70 tabular-nums"
      style={{ fontSize: 'clamp(1rem, 2.2vw, 2rem)' }}
    >
      {joined} {joined === 1 ? 'student' : 'students'} here
    </p>
  </>
);
