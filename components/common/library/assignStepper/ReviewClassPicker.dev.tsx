// DEV-only: Review's Start dialog, today's (?before=1) and with the class menu (D19), for /assign-stepper-dev.

import React from 'react';
import { StartReviewModal } from '@/components/widgets/QuizWidget/components/StartReviewModal';
import { DEFAULT_REVIEW_LAUNCH_SETTINGS } from '@/utils/reviewLaunch';
import { SAMPLE_ROSTERS } from './assignStepperTestRosters';

const Preview: React.FC = () => {
  const before = Boolean(
    new URLSearchParams(window.location.search).get('before')
  );
  return (
    <StartReviewModal
      quizTitle="Chapter 5 Review"
      rosters={SAMPLE_ROSTERS}
      initialRosterIds={['c1']}
      initialSettings={DEFAULT_REVIEW_LAUNCH_SETTINGS}
      skippedCount={0}
      nothingToPlay={false}
      handRaiseMode="teacher-choice"
      readAloudAvailable={false}
      classMenu={!before}
      onClose={() => undefined}
      onStart={() => Promise.resolve()}
    />
  );
};

const ReviewClassPickerDev = {
  title: 'Review class picker',
  render: Preview,
};

export default ReviewClassPickerDev;
