import React from 'react';
import { useTranslation } from 'react-i18next';
import { Lock } from 'lucide-react';
import type { GuidedLearningSession } from '@/types';
import {
  StudentScreenEyebrow,
  StudentScreenMark,
  StudentScreenShell,
  StudentScreenTitle,
} from '@/components/student/StudentScreenShell';

/** Shown once the session's close time has passed and this student hasn't submitted. */
export const GuidedLearningClosedScreen: React.FC<{
  session: GuidedLearningSession;
}> = ({ session }) => {
  const { t } = useTranslation();
  return (
    <StudentScreenShell>
      <StudentScreenMark icon={Lock} />
      <StudentScreenEyebrow>{session.title}</StudentScreenEyebrow>
      <StudentScreenTitle>{t('glStudent.closed.title')}</StudentScreenTitle>
    </StudentScreenShell>
  );
};
