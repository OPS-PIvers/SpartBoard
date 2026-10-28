// Video Activity rule step bodies: only rows the VA player honors (va-quiz-alignment V4, V5).
import React from 'react';
import { AttemptLimitRow } from '../AssignmentSettingsToggleGroup';
import { FocusModeRows } from './QuizIntegrityStep';
import { StepToggleRow } from './QuizStepRows';
import {
  VIDEO_ANSWER_ROWS_READY,
  patchVideoBehaviorOptions,
  patchVideoPlayer,
  type VideoAssignRules,
} from './VideoRuleStepValues';
import { tourFieldAttr } from '@/config/tourAnchors';

export interface VideoRuleStepProps {
  value: VideoAssignRules;
  onChange: (next: VideoAssignRules) => void;
  /** Shows the shuffle and feedback rows; defaults to whether the player honors them. */
  answerRows?: boolean;
}

/** "Attempts and order": attempts allowed, shuffle answer options. */
export const VideoAttemptsStep: React.FC<VideoRuleStepProps> = ({
  value,
  onChange,
  answerRows = VIDEO_ANSWER_ROWS_READY,
}) => (
  <div className="space-y-1.5">
    <div className="flex min-h-[2rem] flex-col justify-center">
      <AttemptLimitRow
        label="Attempts allowed"
        value={value.behavior.attemptLimit}
        onChange={(attemptLimit) =>
          onChange({ ...value, behavior: { ...value.behavior, attemptLimit } })
        }
      />
    </div>
    {answerRows && (
      <StepToggleRow
        label="Shuffle answer options"
        anchor={tourFieldAttr(
          'assign-rule.toggle',
          'assign',
          'shuffle-answers'
        )}
        checked={value.behavior.sessionOptions.shuffleAnswerOptions ?? true}
        onChange={(shuffleAnswerOptions) =>
          onChange(patchVideoBehaviorOptions(value, { shuffleAnswerOptions }))
        }
      />
    )}
  </div>
);

/** "Video": the player rules that used to live in the widget settings drawer. */
export const VideoPlaybackStep: React.FC<VideoRuleStepProps> = ({
  value,
  onChange,
}) => {
  const p = value.player;
  const patch = (next: Parameters<typeof patchVideoPlayer>[1]) =>
    onChange(patchVideoPlayer(value, next));
  return (
    <div className="space-y-1.5">
      <StepToggleRow
        label="Allow skipping ahead"
        anchor={tourFieldAttr('assign-rule.toggle', 'assign', 'allow-skipping')}
        checked={p.allowSkipping}
        onChange={(allowSkipping) => patch({ allowSkipping })}
      />
      <StepToggleRow
        label="Rewind on a wrong answer"
        anchor={tourFieldAttr(
          'assign-rule.toggle',
          'assign',
          'rewind-on-wrong'
        )}
        checked={p.requireCorrectAnswer}
        onChange={(requireCorrectAnswer) => patch({ requireCorrectAnswer })}
      />
      <StepToggleRow
        label="Autoplay after a question"
        anchor={tourFieldAttr('assign-rule.toggle', 'assign', 'autoplay')}
        checked={p.autoPlay}
        onChange={(autoPlay) => patch({ autoPlay })}
      />
    </div>
  );
};

/** "Integrity": focus mode with its two auto-submit rows. */
export const VideoIntegrityStep: React.FC<VideoRuleStepProps> = ({
  value,
  onChange,
}) => (
  <div className="space-y-1.5">
    <FocusModeRows
      options={value.behavior.sessionOptions}
      patch={(next) => onChange(patchVideoBehaviorOptions(value, next))}
    />
  </div>
);

/** "What students see": right and wrong after each answer, and the correct answer. */
export const VideoFeedbackStep: React.FC<VideoRuleStepProps> = ({
  value,
  onChange,
  answerRows = VIDEO_ANSWER_ROWS_READY,
}) => {
  if (!answerRows) return null;
  const o = value.behavior.sessionOptions;
  const rightWrong = o.showResultToStudent ?? true;
  const patch = (next: Parameters<typeof patchVideoBehaviorOptions>[1]) =>
    onChange(patchVideoBehaviorOptions(value, next));
  return (
    <div className="space-y-1.5">
      <StepToggleRow
        label="Show right and wrong to students"
        anchor={tourFieldAttr(
          'assign-rule.toggle',
          'assign',
          'show-right-wrong'
        )}
        checked={rightWrong}
        onChange={(showResultToStudent) => patch({ showResultToStudent })}
      />
      <StepToggleRow
        label="Reveal correct answer to students"
        anchor={tourFieldAttr('assign-rule.toggle', 'assign', 'reveal-correct')}
        checked={rightWrong && (o.showCorrectAnswerToStudent ?? true)}
        disabled={!rightWrong}
        onChange={(showCorrectAnswerToStudent) =>
          patch({ showCorrectAnswerToStudent })
        }
      />
    </div>
  );
};
