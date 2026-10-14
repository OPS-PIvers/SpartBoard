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
import {
  AttemptLimitRow,
  ToggleRow,
} from '@/components/common/library/AssignmentSettingsToggleGroup';
import { tourTypeAttr } from '@/config/tourAnchors';
import { labelClass, inputClass } from './quizEditorFieldStyles';
import { DraftNumberInput } from './DraftNumberInput';
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

const EXPIRY_KEYS: Record<RecordingPrepExpiry, { label: string }> = {
  armed: { label: 'expiryArmed' },
  'auto-start': { label: 'expiryAutoStart' },
  'auto-advance': { label: 'expiryAutoAdvance' },
  unanswered: { label: 'expiryUnanswered' },
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
  /** Overrides how the preview loads the image; the dev harness has no Drive file. */
  resolveWhiteboardImageUrl?: (driveFileId: string) => string;
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
  resolveWhiteboardImageUrl,
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
        <div>
          <span className={labelClass}>{tk('whiteboard.captureLabel')}</span>
          <SegmentedControl
            value={recording.explainAloud !== false ? 'audio' : 'screen'}
            onChange={(v) => patch({ explainAloud: v === 'audio' })}
            options={[
              { value: 'screen', label: tk('whiteboard.screenOnly') },
              { value: 'audio', label: tk('whiteboard.screenAndAudio') },
            ]}
            ariaLabel={tk('whiteboard.captureLabel')}
            role="radiogroup"
            anchor={tourTypeAttr(
              'quiz-editor.whiteboard-explain-aloud',
              'quiz'
            )}
          />
        </div>
      )}
      <div className="flex flex-wrap items-start gap-3">
        <div className="w-32 shrink-0">
          <label
            className={`${labelClass} whitespace-nowrap`}
            htmlFor="recording-prep-seconds"
          >
            {tk('prepLabel')}
          </label>
          <DraftNumberInput
            id="recording-prep-seconds"
            integer
            min={0}
            max={PREP_SECONDS_MAX}
            value={recording.prepSeconds}
            onCommit={(prepSeconds) => patch({ prepSeconds })}
            unit={tk('secondsUnit')}
            title={tk('prepHint')}
            anchor={tourTypeAttr('quiz-editor.recording-prep', 'quiz')}
          />
        </div>

        <div className="w-48 shrink-0">
          <label
            className={`${labelClass} whitespace-nowrap`}
            htmlFor="recording-prep-expiry"
          >
            {tk('expiryLabel')}
          </label>
          <select
            id="recording-prep-expiry"
            value={recording.prepExpiry}
            onChange={(e) =>
              patch({ prepExpiry: e.target.value as RecordingPrepExpiry })
            }
            className={`${inputClass} appearance-none`}
            {...tourTypeAttr('quiz-editor.recording-expiry', 'quiz')}
          >
            {EXPIRY_ORDER.map((value) => (
              <option key={value} value={value}>
                {tk(EXPIRY_KEYS[value].label)}
              </option>
            ))}
          </select>
        </div>
        <div className="w-32 shrink-0">
          <label
            className={`${labelClass} whitespace-nowrap`}
            htmlFor="recording-limit-seconds"
          >
            {tk('limitLabel')}
          </label>
          <DraftNumberInput
            id="recording-limit-seconds"
            integer
            min={AUDIO_LIMIT_SECONDS_MIN}
            max={ceiling.seconds}
            value={limitValue}
            readOnly={clamped}
            onCommit={(limitSeconds) => patch({ limitSeconds })}
            unit={tk('secondsUnit')}
            title={tk('limitHint', { max: ceiling.seconds })}
            aria-describedby={clamped ? 'recording-limit-hint' : undefined}
            className={clamped ? 'bg-slate-100 text-slate-600' : ''}
            anchor={tourTypeAttr('quiz-editor.recording-limit', 'quiz')}
          />
        </div>
      </div>

      {clamped && (
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
      )}

      <AttemptLimitRow
        value={recording.takeLimit ?? null}
        onChange={(takeLimit) => patch({ takeLimit })}
        label={tk('takeLimitLabel')}
        ariaLabel={tk('takeLimitLabel')}
        unlimitedLabel={tk('takeLimitUnlimited')}
        info={tk('takeLimitHint')}
        infoAnchor={tourTypeAttr('quiz-editor.recording-attempts-info', 'quiz')}
      />

      <ToggleRow
        label={tk('reviewLabel')}
        checked={recording.review !== false}
        onChange={(review) => patch({ review })}
        anchor={tourTypeAttr('quiz-editor.recording-review', 'quiz')}
      />

      {whiteboard && onUploadWhiteboardImage && (
        <WhiteboardStartingPagePicker
          value={recording.startingPage}
          onChange={(startingPage) => patch({ startingPage })}
          onUploadImage={onUploadWhiteboardImage}
          resolveImageUrl={resolveWhiteboardImageUrl}
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
