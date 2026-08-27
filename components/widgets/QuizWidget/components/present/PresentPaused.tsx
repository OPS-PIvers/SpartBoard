import React from 'react';
import { PauseCircle } from 'lucide-react';
import { QuizSession } from '@/types';

interface PresentPausedProps {
  session: QuizSession;
}

/** Replaces the question entirely — nothing to read ahead on while paused. */
export const PresentPaused: React.FC<PresentPausedProps> = ({ session }) => (
  <>
    <PauseCircle
      className="text-white/70"
      aria-hidden
      style={{ width: '10vh', height: '10vh' }}
    />
    <p
      className="font-sans font-bold text-white leading-none"
      style={{ fontSize: 'clamp(2.5rem, 9vw, 7rem)' }}
    >
      Paused
    </p>
    <p
      className="font-sans text-brand-blue-lighter"
      style={{ fontSize: 'clamp(1.1rem, 2.6vw, 2.4rem)' }}
    >
      {session.quizTitle}
    </p>
    {session.pauseMessage && (
      <p
        className="font-sans text-white max-w-[70vw]"
        style={{ fontSize: 'clamp(1.2rem, 3vw, 2.8rem)', lineHeight: 1.4 }}
      >
        {session.pauseMessage}
      </p>
    )}
  </>
);
