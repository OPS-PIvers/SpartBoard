/**
 * Full-screen placeholder shown to students when their quiz assignment is
 * currently paused. The join URL is still live, but submissions are blocked
 * until the teacher resumes the session.
 */

import React from 'react';
import { PauseCircle } from 'lucide-react';
import { QuizSession } from '@/types';

interface QuizPausedPlaceholderProps {
  session: QuizSession;
  /** Roster PIN for anonymous joiners. Empty for SSO `studentRole` joiners. */
  pin: string;
}

export const QuizPausedPlaceholder: React.FC<QuizPausedPlaceholderProps> = ({
  session,
  pin,
}) => (
  <div className="min-h-screen bg-brand-blue-dark flex flex-col items-center justify-center p-6 text-center">
    <PauseCircle className="w-14 h-14 text-white/80 mb-6" aria-hidden />
    <h1 className="font-sans text-4xl font-bold text-white mb-3">
      Paused — eyes up
    </h1>
    <p className="text-brand-blue-lighter text-lg font-medium mb-2">
      {session.pauseMessage?.trim()
        ? session.pauseMessage
        : 'Your answers are saved.'}
    </p>
    <p className="text-white/60 text-sm mb-8 max-w-sm">
      {session.quizTitle} will resume when your teacher is ready. Keep this tab
      open — your place is held.
    </p>
    {pin && (
      <p className="text-brand-blue-lighter text-sm">
        Joined as PIN{' '}
        <span className="font-semibold text-white font-mono">{pin}</span>
      </p>
    )}
  </div>
);
