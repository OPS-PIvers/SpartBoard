// One student's or group's standing accommodations, laid out like the assign Modifications step.
import React, { useContext } from 'react';
import type { QuizSupport, StudentOverride } from '@/types';
import { AuthContext } from '@/context/AuthContextValue';
import { SegmentedControl } from '@/components/common/SegmentedControl';
import { Toggle } from '@/components/common/Toggle';
import { tourAttr } from '@/config/tourAnchors';
import { QUIZ_TRANSLATION_LANGUAGES } from '@/config/quizTranslation';
import { useQuizTranslationSettings } from '@/hooks/useQuizTranslationSettings';
import { languageDisplayLabel } from '@/utils/languageDisplayLabel';
import { dictationLocaleFor } from '@/utils/speechToText/languages';
import { PAGE_PROTECTIONS_FEATURE } from '@/utils/pageProtections';
import {
  DEFAULT_TAB_AWAY_LIMIT_SECONDS,
  TAB_AWAY_LIMIT_MAX_SECONDS,
  TAB_AWAY_LIMIT_MIN_SECONDS,
} from '@/utils/tabAwayLimit';
import { ModificationRow } from '@/components/common/library/assignStepper/ModificationGroupsStep';
import { SupportsEditor } from '@/components/common/library/assignStepper/SupportsEditor';
import { StepNumberField } from '@/components/common/library/assignStepper/QuizStepRows';

export interface StandingAccommodationRulesProps {
  override: StudentOverride;
  /** Takes an updater, so a slow Drive share applies to the latest settings. */
  onUpdate: (fn: (prev: StudentOverride) => StudentOverride) => void;
  readAloudAvailable: boolean;
  speechToTextAvailable: boolean;
  onSharingChange?: (sharing: boolean) => void;
}

const DEFAULT_TAB_WARNINGS = 3;
const TAB_WARNINGS_MAX = 20;

type AnswerChoices = 'all' | '3' | '2';
type TimeChoice = 'class' | '1.5' | '2' | 'unlimited';
type ClassOrSet = 'class' | 'off' | 'set';

const Heading: React.FC<{ text: string }> = ({ text }) => (
  <div className="pb-0.5 pt-1 text-xxs font-bold uppercase tracking-widest text-slate-400">
    {text}
  </div>
);

export const StandingAccommodationRules: React.FC<
  StandingAccommodationRulesProps
> = ({
  override,
  onUpdate,
  readAloudAvailable,
  speechToTextAvailable,
  onSharingChange,
}) => {
  const auth = useContext(AuthContext);
  const translationOn = auth?.canAccessFeature?.('quiz-translation') === true;
  const tabAwayTimerOn = auth?.canAccessFeature?.('tab-away-timer') === true;
  const pageProtectionsOn =
    auth?.canAccessFeature?.(PAGE_PROTECTIONS_FEATURE) === true;
  const { languages } = useQuizTranslationSettings(translationOn);
  const languageOptions = QUIZ_TRANSLATION_LANGUAGES.filter(
    (l) =>
      languages.some((e) => e.code === l.code) || l.code === override.language
  );
  const patch = (next: Partial<StudentOverride>) =>
    onUpdate((prev) => ({ ...prev, ...next }));

  const tabWarnings = override.tabWarningThreshold;
  const tabAway = override.tabAwayLimit;
  const classOrSet = (v: number | 'off' | undefined): ClassOrSet =>
    v === undefined ? 'class' : v === 'off' ? 'off' : 'set';

  const blocks: Array<{ heading: string; rows: React.ReactNode[] }> = [
    {
      heading: 'Questions',
      rows: [
        <ModificationRow key="answers" label="Answer choices">
          <SegmentedControl<AnswerChoices>
            role="radiogroup"
            ariaLabel="Answer choices"
            value={
              override.answerChoices === 3
                ? '3'
                : override.answerChoices === 2
                  ? '2'
                  : 'all'
            }
            onChange={(v) =>
              patch({
                answerChoices: v === '3' ? 3 : v === '2' ? 2 : undefined,
              })
            }
            anchor={tourAttr('roster-editor.accommodations-answer-choices')}
            options={[
              { value: 'all', label: 'All' },
              { value: '3', label: 'Remove 1 wrong' },
              { value: '2', label: '2 choices' },
            ]}
          />
        </ModificationRow>,
        <ModificationRow key="modified" label="Modified questions">
          <Toggle
            size="sm"
            checked={override.modifiedQuestions === true}
            onChange={(on) => patch({ modifiedQuestions: on || undefined })}
            label="Modified questions"
            anchor={tourAttr('roster-editor.accommodations-modified-questions')}
          />
        </ModificationRow>,
      ],
    },
    {
      heading: 'Time',
      rows: [
        <ModificationRow key="time" label="Time limit">
          <SegmentedControl<TimeChoice>
            role="radiogroup"
            ariaLabel="Time limit"
            value={
              override.timeMultiplier === undefined
                ? 'class'
                : override.timeMultiplier === 'unlimited'
                  ? 'unlimited'
                  : (String(override.timeMultiplier) as TimeChoice)
            }
            onChange={(v) =>
              patch({
                timeMultiplier:
                  v === 'class'
                    ? undefined
                    : v === 'unlimited'
                      ? 'unlimited'
                      : v === '2'
                        ? 2
                        : 1.5,
              })
            }
            anchor={tourAttr('override-row.extended-time')}
            options={[
              { value: 'class', label: 'Same as class' },
              { value: '1.5', label: '1.5x' },
              { value: '2', label: '2x' },
              { value: 'unlimited', label: 'None' },
            ]}
          />
        </ModificationRow>,
      ],
    },
    {
      heading: 'Help',
      rows: [
        readAloudAvailable && (
          <ModificationRow key="read" label="Read aloud">
            <Toggle
              size="sm"
              checked={override.readAloud === true}
              onChange={(on) => patch({ readAloud: on || undefined })}
              label="Read aloud"
              anchor={tourAttr('override-row.read-aloud')}
            />
          </ModificationRow>
        ),
        speechToTextAvailable && (
          <React.Fragment key="stt">
            <ModificationRow label="Speech to text">
              <Toggle
                size="sm"
                checked={override.speechToText === true}
                onChange={(on) => patch({ speechToText: on || undefined })}
                label="Speech to text"
                anchor={tourAttr('override-row.speech-to-text')}
              />
            </ModificationRow>
            {override.speechToText &&
              override.language &&
              !dictationLocaleFor(override.language) && (
                <p className="pb-1.5 text-xs text-slate-500">
                  Not available in {languageDisplayLabel(override.language)}.
                  Dictation will be in English.
                </p>
              )}
          </React.Fragment>
        ),
        translationOn && languageOptions.length > 0 && (
          <ModificationRow key="lang" label="Language">
            <select
              value={override.language ?? ''}
              onChange={(e) => patch({ language: e.target.value || undefined })}
              aria-label="Language"
              {...tourAttr('override-row.language')}
              className="h-8 w-44 rounded-lg border border-slate-300 bg-white px-2.5 text-sm text-slate-700 touch:h-11"
            >
              <option value="">English</option>
              {languageOptions.map((l) => (
                <option key={l.code} value={l.code}>
                  {languageDisplayLabel(l.code)}
                </option>
              ))}
            </select>
          </ModificationRow>
        ),
        <SupportsEditor
          key="supports"
          supports={override.supports ?? []}
          onChange={(update) =>
            onUpdate((prev) => {
              const next: QuizSupport[] = update(prev.supports ?? []);
              return { ...prev, supports: next.length > 0 ? next : undefined };
            })
          }
          onSharingChange={onSharingChange}
        />,
      ],
    },
    {
      heading: 'Focus',
      rows: [
        pageProtectionsOn && (
          <ModificationRow key="copy" label="Copy, paste and print">
            <SegmentedControl<'class' | 'block' | 'allow'>
              role="radiogroup"
              ariaLabel="Copy, paste and print"
              value={
                override.blockCopyPaste === true
                  ? 'block'
                  : override.blockCopyPaste === false
                    ? 'allow'
                    : 'class'
              }
              onChange={(v) =>
                patch({
                  blockCopyPaste:
                    v === 'block' ? true : v === 'allow' ? false : undefined,
                })
              }
              anchor={tourAttr('override-row.copy-paste-print')}
              options={[
                { value: 'class', label: 'Same as class' },
                { value: 'block', label: 'Block' },
                { value: 'allow', label: 'Allow' },
              ]}
            />
          </ModificationRow>
        ),
        <ModificationRow key="tabs" label="Auto-submit after tab switches">
          <span className="flex items-center gap-2">
            {typeof tabWarnings === 'number' && (
              <StepNumberField
                value={tabWarnings}
                min={1}
                max={TAB_WARNINGS_MAX}
                widthClass="w-14"
                ariaLabel="Tab switches before auto-submit"
                anchor={tourAttr('override-row.tab-warning')}
                onCommit={(n) => patch({ tabWarningThreshold: n })}
              />
            )}
            <SegmentedControl<ClassOrSet>
              role="radiogroup"
              ariaLabel="Auto-submit after tab switches"
              value={classOrSet(tabWarnings)}
              onChange={(v) =>
                patch({
                  tabWarningThreshold:
                    v === 'class'
                      ? undefined
                      : v === 'off'
                        ? 'off'
                        : DEFAULT_TAB_WARNINGS,
                })
              }
              anchor={tourAttr('override-row.tab-warning-off')}
              options={[
                { value: 'class', label: 'Same as class' },
                { value: 'off', label: 'Never' },
                { value: 'set', label: 'Set' },
              ]}
            />
          </span>
        </ModificationRow>,
        tabAwayTimerOn && (
          <ModificationRow key="away" label="Auto-submit if away too long">
            <span className="flex items-center gap-2">
              {typeof tabAway === 'number' && (
                <StepNumberField
                  value={tabAway}
                  min={TAB_AWAY_LIMIT_MIN_SECONDS}
                  max={TAB_AWAY_LIMIT_MAX_SECONDS}
                  unit="sec"
                  ariaLabel="Seconds away before auto-submit"
                  anchor={tourAttr('override-row.tab-away')}
                  onCommit={(n) => patch({ tabAwayLimit: n })}
                />
              )}
              <SegmentedControl<ClassOrSet>
                role="radiogroup"
                ariaLabel="Auto-submit if away too long"
                value={classOrSet(tabAway)}
                onChange={(v) =>
                  patch({
                    tabAwayLimit:
                      v === 'class'
                        ? undefined
                        : v === 'off'
                          ? 'off'
                          : DEFAULT_TAB_AWAY_LIMIT_SECONDS,
                  })
                }
                anchor={tourAttr('override-row.tab-away-off')}
                options={[
                  { value: 'class', label: 'Same as class' },
                  { value: 'off', label: 'Never' },
                  { value: 'set', label: 'Set' },
                ]}
              />
            </span>
          </ModificationRow>
        ),
      ],
    },
  ];

  return (
    <div>
      {blocks.map((block) => {
        const rows = block.rows.filter(Boolean);
        if (rows.length === 0) return null;
        return (
          <div key={block.heading} className="pt-2 first:pt-0">
            <Heading text={block.heading} />
            <div className="divide-y divide-slate-100">{rows}</div>
          </div>
        );
      })}
    </div>
  );
};
