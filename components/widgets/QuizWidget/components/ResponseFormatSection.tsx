/**
 * ResponseFormatSection — the Format control (Typed / Spoken) plus the
 * inline spoken-answer settings, mounted inside the quiz editor's question
 * detail pane directly under the Type/Time/Points row.
 *
 * Presentational on purpose: the fail-closed `canAccessQuizMediaResponse`
 * gate AND the written-type check both live one level up in
 * `QuizEditorDetailPane`, so this file only renders for a written question
 * with the media permission granted — the dev harness mounts it directly
 * with that already true.
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import type {
  QuizQuestion,
  RecordingConfig,
  RecordingPrepExpiry,
} from '@/types';
import { SegmentedControl } from '@/components/common/SegmentedControl';
import { AttemptLimitRow } from '@/components/common/library/AssignmentSettingsToggleGroup';
import { labelClass, inputClass } from './quizEditorFieldStyles';
import {
  DEFAULT_RECORDING_CONFIG,
  PREP_SECONDS_MAX,
  AUDIO_LIMIT_SECONDS_MIN,
} from '@/config/quizRecordingDefaults';
import {
  recordingLimitCeiling,
  recordingModesForQuestion,
  RECORDING_MODE_LABEL_KEYS,
} from '@/utils/quizRecordingModes';

const hintClass = 'text-xxs text-slate-500 mt-1';

/** The third "Student's choice" option is deferred; kept data-driven for it. */
type ResponseFormat = 'typed' | 'spoken';

const EXPIRY_ORDER: RecordingPrepExpiry[] = [
  'armed',
  'auto-start',
  'auto-advance',
  'unanswered',
];

const EXPIRY_KEYS: Record<
  RecordingPrepExpiry,
  { label: string; hint: string }
> = {
  armed: { label: 'expiryArmed', hint: 'expiryArmedHint' },
  'auto-start': { label: 'expiryAutoStart', hint: 'expiryAutoStartHint' },
  'auto-advance': {
    label: 'expiryAutoAdvance',
    hint: 'expiryAutoAdvanceHint',
  },
  unanswered: { label: 'expiryUnanswered', hint: 'expiryUnansweredHint' },
};

export interface ResponseFormatSectionProps {
  question: QuizQuestion;
  /** The editor's existing per-question writer. */
  onChange: (updates: Partial<QuizQuestion>) => void;
}

export const ResponseFormatSection: React.FC<ResponseFormatSectionProps> = ({
  question,
  onChange,
}) => {
  const { t } = useTranslation();
  const tk = (key: string, params?: Record<string, unknown>) =>
    t(`quizMediaResponse.authoring.${key}`, params);

  const recording = question.recording;
  const spoken: ResponseFormat = recording ? 'spoken' : 'typed';
  const ceiling = recordingLimitCeiling(recordingModesForQuestion(question));

  // Session-only memory of the block a question had when last set to Typed,
  // so switching back to Spoken in the same editing session restores it
  // instead of resetting to defaults. Keyed by question id; lost on remount.
  const lastDisabledRef = React.useRef<Map<string, RecordingConfig>>(new Map());

  const patch = (updates: Partial<RecordingConfig>) => {
    if (!recording) return;
    onChange({ recording: { ...recording, ...updates } });
  };

  const setFormat = (next: ResponseFormat) => {
    if (next === 'spoken') {
      // Speed bonus and the recording timer cannot both own the clock
      // (RR-A1 sub-decision 3), so the editor writes the zero it implies and
      // stashes the clock it replaced.
      const prior = question.timeLimit;
      const remembered = lastDisabledRef.current.get(question.id);
      onChange({
        recording: {
          ...(remembered ?? DEFAULT_RECORDING_CONFIG),
          ...(prior ? { priorTimeLimit: prior } : {}),
        },
        timeLimit: 0,
      });
    } else {
      if (recording) lastDisabledRef.current.set(question.id, recording);
      const prior = recording?.priorTimeLimit;
      onChange(
        prior === undefined
          ? { recording: undefined }
          : { recording: undefined, timeLimit: prior }
      );
    }
  };

  const clamped = !!recording && recording.limitSeconds > ceiling.seconds;
  const limitValue = clamped ? ceiling.seconds : (recording?.limitSeconds ?? 0);

  const formatOptions: { value: ResponseFormat; label: string }[] = [
    { value: 'typed', label: tk('formatTyped') },
    { value: 'spoken', label: tk('formatSpoken') },
  ];

  return (
    <div className="space-y-3">
      <div>
        <label className={labelClass}>{tk('formatLabel')}</label>
        <SegmentedControl
          value={spoken}
          onChange={setFormat}
          options={formatOptions}
          ariaLabel={tk('formatLabel')}
        />
      </div>

      {recording && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass} htmlFor="recording-prep-seconds">
                {tk('prepLabel')}
              </label>
              <div className="relative">
                <input
                  id="recording-prep-seconds"
                  type="number"
                  min={0}
                  max={PREP_SECONDS_MAX}
                  value={recording.prepSeconds}
                  aria-describedby="recording-prep-hint"
                  onChange={(e) => {
                    const raw = parseInt(e.target.value, 10);
                    patch({
                      prepSeconds: Math.min(
                        PREP_SECONDS_MAX,
                        Math.max(0, Number.isFinite(raw) ? raw : 0)
                      ),
                    });
                  }}
                  className={`${inputClass} pr-12`}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xxs uppercase tracking-wider">
                  {tk('secondsUnit')}
                </span>
              </div>
              <p id="recording-prep-hint" className={hintClass}>
                {tk('prepHint')}
              </p>
            </div>

            <div>
              <label className={labelClass} htmlFor="recording-limit-seconds">
                {tk('limitLabel')}
              </label>
              <div className="relative">
                <input
                  id="recording-limit-seconds"
                  type="number"
                  min={AUDIO_LIMIT_SECONDS_MIN}
                  max={ceiling.seconds}
                  value={limitValue}
                  readOnly={clamped}
                  aria-describedby="recording-limit-hint"
                  onChange={(e) => {
                    const raw = parseInt(e.target.value, 10);
                    patch({
                      limitSeconds: Math.min(
                        ceiling.seconds,
                        Math.max(
                          AUDIO_LIMIT_SECONDS_MIN,
                          Number.isFinite(raw) ? raw : AUDIO_LIMIT_SECONDS_MIN
                        )
                      ),
                    });
                  }}
                  className={`${inputClass} pr-12 ${
                    clamped ? 'bg-slate-100 text-slate-600' : ''
                  }`}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xxs uppercase tracking-wider">
                  {tk('secondsUnit')}
                </span>
              </div>
              {clamped ? (
                <p id="recording-limit-hint" className={hintClass}>
                  <span className="font-bold text-amber-700">
                    {tk('limitClamped', {
                      seconds: ceiling.seconds,
                      mode: tk(RECORDING_MODE_LABEL_KEYS[ceiling.mode]),
                    })}
                  </span>{' '}
                  <button
                    type="button"
                    onClick={() => patch({ limitSeconds: ceiling.seconds })}
                    className="underline font-bold text-brand-blue-primary"
                  >
                    {tk('limitClampedAction', { seconds: ceiling.seconds })}
                  </button>
                </p>
              ) : (
                <p id="recording-limit-hint" className={hintClass}>
                  {tk('limitHint', { max: ceiling.seconds })}
                </p>
              )}
            </div>
          </div>

          <div>
            <span className={labelClass}>{tk('expiryLabel')}</span>
            <div
              role="group"
              aria-label={tk('expiryLabel')}
              className="grid grid-cols-2 gap-1.5"
            >
              {EXPIRY_ORDER.map((value) => {
                const active = recording.prepExpiry === value;
                return (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={active}
                    onClick={() => patch({ prepExpiry: value })}
                    className={
                      'text-left px-2.5 py-1.5 rounded-lg border text-xs transition ' +
                      (active
                        ? 'border-brand-blue-primary bg-brand-blue-lighter/40 text-brand-blue-dark'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50')
                    }
                  >
                    <span className="block font-bold">
                      {tk(EXPIRY_KEYS[value].label)}
                    </span>
                    <span className="block text-xxs text-slate-500">
                      {tk(EXPIRY_KEYS[value].hint)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <AttemptLimitRow
            value={recording.takeLimit ?? null}
            onChange={(takeLimit) => patch({ takeLimit })}
            label={tk('takeLimitLabel')}
            ariaLabel={tk('takeLimitLabel')}
            unlimitedLabel={tk('takeLimitUnlimited')}
            hint={tk('takeLimitHint')}
          />
        </div>
      )}
    </div>
  );
};
