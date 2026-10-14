/**
 * ResponseFormatControl (Typed / Spoken, mounted in the Type cell) and
 * SpokenResponseSettings (the inline recording settings under the row);
 * ResponseFormatSection composes both for the dev harness and tests.
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
  WhiteboardStartingImage,
} from '@/types';
import { SegmentedControl } from '@/components/common/SegmentedControl';
import { Toggle } from '@/components/common/Toggle';
import { AttemptLimitRow } from '@/components/common/library/AssignmentSettingsToggleGroup';
import { tourFieldAttr, tourTypeAttr } from '@/config/tourAnchors';
import { labelClass, inputClass } from './quizEditorFieldStyles';
import {
  DEFAULT_RECORDING_CONFIG,
  DEFAULT_LIMIT_SECONDS,
  WHITEBOARD_DEFAULT_LIMIT_SECONDS,
  isWhiteboardRecording,
  PREP_SECONDS_MAX,
  AUDIO_LIMIT_SECONDS_MIN,
} from '@/config/quizRecordingDefaults';
import { WhiteboardStartingPagePicker } from './WhiteboardStartingPagePicker';
import { BLANK_STARTING_PAGE } from './whiteboardStartingPageSpec';
import {
  recordingLimitCeiling,
  recordingModesForQuestion,
  RECORDING_MODE_LABEL_KEYS,
} from '@/utils/quizRecordingModes';

const hintClass = 'text-xs text-slate-600 mt-1';

/** "Student's choice" is out of scope (D1, C5). */
type ResponseFormat = 'typed' | 'spoken' | 'whiteboard';


/** Drops the whiteboard-only fields so a block reads as plain audio again. */
function toSpokenBlock(block: RecordingConfig): RecordingConfig {
  const {
    mode: _mode,
    explainAloud: _explainAloud,
    startingPage: _startingPage,
    ...rest
  } = block;
  return block.mode === 'whiteboard' &&
    block.limitSeconds === WHITEBOARD_DEFAULT_LIMIT_SECONDS
    ? { ...rest, limitSeconds: DEFAULT_LIMIT_SECONDS }
    : rest;
}

function toWhiteboardBlock(block: RecordingConfig): RecordingConfig {
  return {
    ...block,
    mode: 'whiteboard',
    explainAloud: block.explainAloud ?? true,
    startingPage: block.startingPage ?? BLANK_STARTING_PAGE,
    limitSeconds:
      block.mode !== 'whiteboard' &&
      block.limitSeconds === DEFAULT_LIMIT_SECONDS
        ? WHITEBOARD_DEFAULT_LIMIT_SECONDS
        : block.limitSeconds,
  };
}

const EXPIRY_ORDER: RecordingPrepExpiry[] = [
  'armed',
  'auto-start',
  'auto-advance',
  'unanswered',
];

const EXPIRY_KEYS: Record<
  RecordingPrepExpiry,
  { label: string; hint?: string }
> = {
  armed: { label: 'expiryArmed' },
  'auto-start': { label: 'expiryAutoStart' },
  'auto-advance': { label: 'expiryAutoAdvance' },
  unanswered: { label: 'expiryUnanswered', hint: 'expiryUnansweredHint' },
};

export interface ResponseFormatSectionProps {
  question: QuizQuestion;
  /** The editor's existing per-question writer. */
  onChange: (updates: Partial<QuizQuestion>) => void;
  /** `canAccessQuizWhiteboardResponse()`, read by the editor; off renders today's control. */
  whiteboardAllowed?: boolean;
  /** Starting-page image upload; required for the image control to show. */
  onUploadWhiteboardImage?: (
    file: File
  ) => Promise<WhiteboardStartingImage | null>;
}

const useAuthoringT = () => {
  const { t } = useTranslation();
  return (key: string, params?: Record<string, unknown>) =>
    t(`quizMediaResponse.authoring.${key}`, params);
};

export const ResponseFormatControl: React.FC<ResponseFormatSectionProps> = ({
  question,
  onChange,
  whiteboardAllowed = false,
}) => {
  const tk = useAuthoringT();
  const recording = question.recording;
  const format: ResponseFormat = !recording
    ? 'typed'
    : whiteboardAllowed && isWhiteboardRecording(recording)
      ? 'whiteboard'
      : 'spoken';

  // Remembers the block last set to Typed so Spoken restores it; cleared whenever a non-FRQ question is selected.
  const lastDisabledRef = React.useRef<Map<string, RecordingConfig>>(new Map());

  const setFormat = (next: ResponseFormat) => {
    if (next === format) return;
    if (next !== 'typed' && recording) {
      onChange({
        recording:
          next === 'whiteboard'
            ? toWhiteboardBlock(recording)
            : toSpokenBlock(recording),
      });
    } else if (next !== 'typed') {
      // Speed bonus and the recording timer cannot both own the clock
      // (RR-A1 sub-decision 3), so the editor writes the zero it implies and
      // stashes the clock it replaced.
      const prior = question.timeLimit;
      const base =
        lastDisabledRef.current.get(question.id) ?? DEFAULT_RECORDING_CONFIG;
      onChange({
        recording: {
          ...(next === 'whiteboard'
            ? toWhiteboardBlock(base)
            : toSpokenBlock(base)),
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

  const formatOptions: { value: ResponseFormat; label: string }[] = [
    { value: 'typed', label: tk('formatTyped') },
    { value: 'spoken', label: tk('formatSpoken') },
  ];

  // Three options outgrow the Type cell as a segmented row, so the flagged control is a select.
  if (whiteboardAllowed) {
    return (
      <div>
        <label className={labelClass} htmlFor="response-format">
          {tk('formatLabel')}
        </label>
        <select
          id="response-format"
          value={format}
          onChange={(e) => setFormat(e.target.value as ResponseFormat)}
          className={`${inputClass} appearance-none`}
          {...tourTypeAttr('quiz-editor.response-format', 'quiz')}
        >
          {formatOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
          <option value="whiteboard">{tk('formatWhiteboard')}</option>
        </select>
      </div>
    );
  }

  return (
    <div title={recording ? tk('advisory.deviceBlocked') : undefined}>
      <span className={labelClass}>{tk('formatLabel')}</span>
      <SegmentedControl
        value={format}
        onChange={setFormat}
        options={formatOptions}
        ariaLabel={tk('formatLabel')}
        role="radiogroup"
      />
    </div>
  );
};

export const SpokenResponseSettings: React.FC<ResponseFormatSectionProps> = ({
  question,
  onChange,
  whiteboardAllowed = false,
  onUploadWhiteboardImage,
}) => {
  const tk = useAuthoringT();
  const recording = question.recording;
  const ceiling = recordingLimitCeiling(recordingModesForQuestion(question));

  const patch = (updates: Partial<RecordingConfig>) => {
    if (!recording) return;
    onChange({ recording: { ...recording, ...updates } });
  };

  const clamped = !!recording && recording.limitSeconds > ceiling.seconds;
  const limitValue = clamped ? ceiling.seconds : (recording?.limitSeconds ?? 0);

  if (!recording) return null;
  const whiteboard = whiteboardAllowed && isWhiteboardRecording(recording);

  return (
    <div className="space-y-3">
      {whiteboard && (
        <label className="flex items-center justify-between gap-3">
          <span className="text-sm font-bold text-brand-blue-dark">
            {tk('whiteboard.explainAloudLabel')}
          </span>
          <Toggle
            checked={recording.explainAloud !== false}
            onChange={(explainAloud) => patch({ explainAloud })}
            label={tk('whiteboard.explainAloudLabel')}
            size="sm"
            anchor={tourTypeAttr(
              'quiz-editor.whiteboard-explain-aloud',
              'quiz'
            )}
          />
        </label>
      )}
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
              {...tourTypeAttr('quiz-editor.recording-prep', 'quiz')}
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 font-bold text-xxs uppercase tracking-wider">
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
              {...tourTypeAttr('quiz-editor.recording-limit', 'quiz')}
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 font-bold text-xxs uppercase tracking-wider">
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
                {...tourTypeAttr('quiz-editor.recording-limit-clamp', 'quiz')}
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
            const hintKey = EXPIRY_KEYS[value].hint;
            return (
              <button
                key={value}
                type="button"
                aria-pressed={active}
                onClick={() => patch({ prepExpiry: value })}
                {...tourFieldAttr(
                  'quiz-editor.recording-expiry',
                  'quiz',
                  value
                )}
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
                {hintKey && (
                  <span className="block text-xxs text-slate-500">
                    {tk(hintKey)}
                  </span>
                )}
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
        tooltip={tk('takeLimitHint')}
      />

      {whiteboard && onUploadWhiteboardImage && (
        <WhiteboardStartingPagePicker
          value={recording.startingPage}
          onChange={(startingPage) => patch({ startingPage })}
          onUploadImage={onUploadWhiteboardImage}
        />
      )}
    </div>
  );
};

export const ResponseFormatSection: React.FC<ResponseFormatSectionProps> = (
  props
) => (
  <div className="space-y-3">
    <ResponseFormatControl {...props} />
    <SpokenResponseSettings {...props} />
  </div>
);
