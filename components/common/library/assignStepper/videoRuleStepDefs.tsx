// The Video Activity rule steps as stepper defs, in getAssignSteps order (va-quiz-alignment V4, V5).
import React from 'react';
import type { AssignStepDef } from './assignSteps';
import { getAssignStepTitle } from './assignSteps';
import {
  VideoAttemptsStep,
  VideoFeedbackStep,
  VideoIntegrityStep,
  VideoPlaybackStep,
} from './VideoRuleSteps';
import {
  VIDEO_ANSWER_ROWS_READY,
  formatVideoAttemptsValue,
  formatVideoFeedbackValue,
  formatVideoIntegrityValue,
  formatVideoPlaybackValue,
  type VideoAssignRules,
} from './VideoRuleStepValues';

export function videoRuleStepDefs({
  value,
  onChange,
  answerRows = VIDEO_ANSWER_ROWS_READY,
}: {
  value: VideoAssignRules;
  onChange: (next: VideoAssignRules) => void;
  answerRows?: boolean;
}): AssignStepDef[] {
  const title = (id: 'attempts' | 'video' | 'integrity' | 'feedback') =>
    getAssignStepTitle(id, 'video', { kind: 'work' });
  const props = { value, onChange, answerRows };
  const defs: AssignStepDef[] = [
    {
      id: 'attempts',
      title: title('attempts'),
      value: formatVideoAttemptsValue(value, answerRows),
      body: <VideoAttemptsStep {...props} />,
    },
    {
      id: 'video',
      title: title('video'),
      value: formatVideoPlaybackValue(value, answerRows),
      body: <VideoPlaybackStep {...props} />,
    },
    {
      id: 'integrity',
      title: title('integrity'),
      value: formatVideoIntegrityValue(value),
      body: <VideoIntegrityStep {...props} />,
    },
  ];
  if (answerRows) {
    defs.push({
      id: 'feedback',
      title: title('feedback'),
      value: formatVideoFeedbackValue(value),
      body: <VideoFeedbackStep {...props} />,
    });
  }
  return defs;
}
