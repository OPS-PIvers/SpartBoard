import React from 'react';
import {
  DEFAULT_TAB_WARNING_THRESHOLD,
  TAB_WARNING_THRESHOLD_MAX,
  TAB_WARNING_THRESHOLD_MIN,
} from '@/utils/tabWarningThreshold';
import {
  DEFAULT_TAB_AWAY_LIMIT_SECONDS,
  TAB_AWAY_LIMIT_MAX_SECONDS,
  TAB_AWAY_LIMIT_MIN_SECONDS,
  clampTabAwaySeconds,
} from '@/utils/tabAwayLimit';
import type { QuizRuleStepProps } from './QuizAttemptsStep';
import { useQuizRuleGates } from './QuizRuleStepGates';
import { patchQuizSessionOptions } from './QuizRuleStepValues';
import {
  StepNumberField,
  StepRow,
  StepSubRows,
  StepToggleRow,
} from './QuizStepRows';
import { tourFieldAttr } from '@/config/tourAnchors';

/** "Quiz integrity": focus mode with its sub-settings, block copy and paste (D8). */
export const QuizIntegrityStep: React.FC<QuizRuleStepProps> = ({
  value,
  onChange,
}) => {
  const { tabAwayTimerOn } = useQuizRuleGates();
  const o = value.sessionOptions;
  const focus = o.tabWarningsEnabled ?? true;
  const threshold = o.tabWarningThreshold ?? DEFAULT_TAB_WARNING_THRESHOLD;
  const awaySeconds = clampTabAwaySeconds(
    o.tabAwayLimitSeconds ?? DEFAULT_TAB_AWAY_LIMIT_SECONDS
  );
  const awayOn = o.tabAwayAutoSubmit === true;
  const patch = (next: Parameters<typeof patchQuizSessionOptions>[1]) =>
    onChange(patchQuizSessionOptions(value, next));

  return (
    <div className="space-y-1.5">
      <StepToggleRow
        label="Focus mode"
        anchor={tourFieldAttr('assign-rule.toggle', 'assign', 'focus-mode')}
        checked={focus}
        onChange={(tabWarningsEnabled) => patch({ tabWarningsEnabled })}
      />
      {focus && (
        <StepSubRows>
          <StepToggleRow
            sub
            label="Auto-submit after repeated tab switches"
            anchor={tourFieldAttr(
              'assign-rule.toggle',
              'assign',
              'tab-switch-auto-submit'
            )}
            checked={threshold !== 'off'}
            onChange={(on) =>
              patch({
                tabWarningThreshold: on ? DEFAULT_TAB_WARNING_THRESHOLD : 'off',
              })
            }
          />
          {threshold !== 'off' && (
            <StepRow sub label="Warnings before auto-submit">
              <StepNumberField
                value={threshold}
                min={TAB_WARNING_THRESHOLD_MIN}
                max={TAB_WARNING_THRESHOLD_MAX}
                widthClass="w-14"
                ariaLabel="Warnings before auto-submit"
                anchor={tourFieldAttr(
                  'assign-rule.number',
                  'assign',
                  'tab-switch-threshold'
                )}
                onCommit={(tabWarningThreshold) =>
                  patch({ tabWarningThreshold })
                }
              />
            </StepRow>
          )}
          {tabAwayTimerOn && (
            <StepToggleRow
              sub
              label="Auto-submit if away too long"
              anchor={tourFieldAttr(
                'assign-rule.toggle',
                'assign',
                'away-auto-submit'
              )}
              checked={awayOn}
              onChange={(tabAwayAutoSubmit) =>
                patch({ tabAwayAutoSubmit, tabAwayLimitSeconds: awaySeconds })
              }
              field={
                awayOn && (
                  <StepNumberField
                    value={awaySeconds}
                    min={TAB_AWAY_LIMIT_MIN_SECONDS}
                    max={TAB_AWAY_LIMIT_MAX_SECONDS}
                    ariaLabel="Seconds away before auto-submit"
                    anchor={tourFieldAttr(
                      'assign-rule.number',
                      'assign',
                      'away-seconds'
                    )}
                    unit="sec"
                    onCommit={(tabAwayLimitSeconds) =>
                      patch({ tabAwayAutoSubmit: true, tabAwayLimitSeconds })
                    }
                  />
                )
              }
            />
          )}
        </StepSubRows>
      )}
      <StepToggleRow
        label="Block copy and paste"
        anchor={tourFieldAttr(
          'assign-rule.toggle',
          'assign',
          'block-copy-paste'
        )}
        checked={o.blockCopyPaste ?? false}
        onChange={(blockCopyPaste) => patch({ blockCopyPaste })}
      />
    </div>
  );
};
