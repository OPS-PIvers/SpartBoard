import React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { QuizSession, QuizQuestion } from '@/types';
import { Z_INDEX } from '@/config/zIndex';

interface PresentModeProps {
  session: QuizSession;
  currentQ: QuizQuestion | undefined;
  answered: number;
  doneCount: number;
  total: number;
  onExit: () => void;
}

// Class-safe fullscreen display: never shows names or scores.
export const PresentMode: React.FC<PresentModeProps> = ({
  session,
  currentQ,
  answered,
  doneCount,
  total,
  onExit,
}) => {
  const isSelfPaced = session.sessionMode === 'student';
  return createPortal(
    <div
      className="fixed inset-0 bg-brand-blue-dark text-white flex flex-col"
      style={{ zIndex: Z_INDEX.overlay }}
      role="dialog"
      aria-label="Present to class"
    >
      <div className="flex items-center justify-between px-8 py-6">
        <p className="font-sans font-semibold text-white/80 text-xl truncate">
          {session.quizTitle}
        </p>
        <button
          onClick={onExit}
          aria-label="Exit presentation"
          className="rounded-md p-2 text-white/70 hover:text-white hover:bg-white/10 transition-colors"
        >
          <X className="w-7 h-7" />
        </button>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center gap-10 px-10 text-center">
        {session.code && (
          <div>
            <p className="font-sans uppercase tracking-widest text-white/60 text-lg mb-3">
              Join at {window.location.host}/quiz
            </p>
            <p className="font-sans font-bold tracking-[0.2em] tabular-nums text-[clamp(3rem,12vw,9rem)] leading-none">
              {session.code}
            </p>
          </div>
        )}
        {!isSelfPaced && currentQ && session.status === 'active' && (
          <p className="font-sans font-semibold text-[clamp(1.5rem,4vw,3rem)] max-w-5xl leading-snug">
            {currentQ.text}
          </p>
        )}
        <p className="font-sans text-white/80 text-[clamp(1.25rem,3vw,2.25rem)] tabular-nums">
          {isSelfPaced || !currentQ || session.status !== 'active'
            ? `${doneCount} of ${total} finished`
            : `${answered} of ${total} answered`}
        </p>
      </div>
    </div>,
    document.body
  );
};
