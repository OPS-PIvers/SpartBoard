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
  <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-6 text-center">
    <div className="w-20 h-20 bg-amber-500/20 border border-amber-500/30 rounded-2xl flex items-center justify-center mb-6">
      <PauseCircle className="w-10 h-10 text-amber-400" />
    </div>
    <h1 className="text-2xl font-black text-white mb-2">{session.quizTitle}</h1>
    <p className="text-slate-300 text-base font-semibold mb-2">
      This quiz is paused.
    </p>
    <p className="text-slate-400 text-sm mb-8 max-w-sm">
      Your teacher will resume the session shortly. Keep this tab open — your
      place is saved.
    </p>
    {pin && (
      <div className="p-4 bg-slate-800 rounded-xl">
        <p className="text-slate-300 text-sm">
          Joined as PIN{' '}
          <span className="font-semibold text-white font-mono">{pin}</span>
        </p>
      </div>
    )}
  </div>
);
