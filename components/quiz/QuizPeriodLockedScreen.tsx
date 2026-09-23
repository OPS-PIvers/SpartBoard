import React from 'react';
import { Lock } from 'lucide-react';
import type { QuizSession } from '@/types';
import { formatOpensLabel } from '@/utils/assignmentWindow';

interface QuizPeriodLockedScreenProps {
  session: QuizSession;
  /** Epoch ms of the student's next scheduled open, when one is set. */
  opensAt: number | null;
  /** Roster PIN for anonymous joiners. Empty for SSO `studentRole` joiners. */
  pin: string;
}

/** Shown before a student's class period is open; the questions stay hidden until it is. */
export const QuizPeriodLockedScreen: React.FC<QuizPeriodLockedScreenProps> = ({
  session,
  opensAt,
  pin,
}) => (
  <div className="min-h-screen bg-brand-blue-dark flex flex-col items-center justify-center p-6 text-center">
    <Lock className="w-14 h-14 text-white/80 mb-6" aria-hidden />
    <h1 className="font-sans text-4xl font-bold text-white mb-3">
      {session.quizTitle}
    </h1>
    <p className="text-brand-blue-lighter text-lg font-medium mb-8">
      {opensAt != null
        ? formatOpensLabel(opensAt)
        : 'Opens when your teacher starts it.'}
    </p>
    <p className="text-white/60 text-sm mb-8 max-w-sm">
      Keep this tab open. The quiz appears here as soon as your class is let in.
    </p>
    {pin && (
      <p className="text-brand-blue-lighter text-sm">
        Joined as PIN{' '}
        <span className="font-semibold text-white font-mono">{pin}</span>
      </p>
    )}
  </div>
);
