/**
 * Full-screen placeholder shown to students when their quiz assignment is
 * currently paused. The join URL is still live, but submissions are blocked
 * until the teacher resumes the session.
 */

import React from 'react';
import { PauseCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { QuizSession } from '@/types';

interface QuizPausedPlaceholderProps {
  session: QuizSession;
  /** Roster PIN for anonymous joiners. Empty for SSO `studentRole` joiners. */
  pin: string;
  /** The student's class period closed mid-attempt, rather than a teacher pause. */
  periodClosed?: boolean;
}

export const QuizPausedPlaceholder: React.FC<QuizPausedPlaceholderProps> = ({
  session,
  pin,
  periodClosed = false,
}) => {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen bg-brand-blue-dark flex flex-col items-center justify-center p-6 text-center">
      <PauseCircle className="w-14 h-14 text-white/80 mb-6" aria-hidden />
      <h1 className="font-sans text-4xl font-bold text-white mb-3">
        {periodClosed
          ? t('quizStudent.paused.stopped')
          : t('quizStudent.paused.title')}
      </h1>
      <p className="text-brand-blue-lighter text-lg font-medium mb-2">
        {!periodClosed && session.pauseMessage?.trim()
          ? session.pauseMessage
          : t('quizStudent.paused.saved')}
      </p>
      <p className="text-white/60 text-sm mb-8 max-w-sm">
        {t('quizStudent.paused.keepOpen')}
      </p>
      {pin && (
        <p className="text-brand-blue-lighter text-sm">
          {t('quizStudent.common.joinedAs')}{' '}
          <span className="font-semibold text-white font-mono">{pin}</span>
        </p>
      )}
    </div>
  );
};
