import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertCircle, Loader2, Upload } from 'lucide-react';
import type {
  GuidedLearningInteractionType,
  GuidedLearningOverlayType,
  GuidedLearningStep,
} from '@/types';
import { useAuth } from '@/context/useAuth';
import { useStorage } from '@/hooks/useStorage';
import { GL_MAX_VIDEO_BYTES } from '@/utils/guidedLearningMedia';
import { StudioQuestionFields } from './StudioQuestionFields';
import { INTERACTION_ORDER } from './studioOptions';
import {
  ChoiceGroup,
  Field,
  hintClass,
  inputClass,
  quietButtonClass,
} from './panelControls';

type StepChange = (next: GuidedLearningStep, field?: string | false) => void;

const OVERLAYS: readonly GuidedLearningOverlayType[] = [
  'none',
  'popover',
  'tooltip',
  'banner',
];
const BANNER_TONES = ['blue', 'red', 'neutral'] as const;
const FOCUS_TYPES: readonly GuidedLearningInteractionType[] = [
  'pan-zoom',
  'spotlight',
  'pan-zoom-spotlight',
];

const selectClass = inputClass;

/** What the step shows and how it behaves: interaction, slide, text, media and question. */
export const StudioStepFields: React.FC<{
  step: GuidedLearningStep;
  slideCount: number;
  onChange: StepChange;
}> = ({ step, slideCount, onChange }) => {
  const { t } = useTranslation();
  const type = step.interactionType;
  const update = (patch: Partial<GuidedLearningStep>, field?: string | false) =>
    onChange({ ...step, ...patch }, field);
  const usesFocus = FOCUS_TYPES.includes(type);
  const overlay = step.showOverlay ?? 'none';
  const showsText =
    type === 'text-popover' ||
    type === 'tooltip' ||
    (usesFocus && overlay !== 'none');

  return (
    <div className="flex flex-col gap-4" data-testid="gl-studio-step-fields">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3">
        <Field label={t('glStudio.interaction')}>
          <select
            value={type}
            onChange={(e) =>
              update(
                {
                  interactionType: e.target
                    .value as GuidedLearningInteractionType,
                },
                false
              )
            }
            className={selectClass}
          >
            {INTERACTION_ORDER.map((value) => (
              <option key={value} value={value}>
                {t(`glStudio.interaction_${value}`)}
              </option>
            ))}
          </select>
        </Field>
        {slideCount >= 2 && (
          <Field label={t('glStudio.onSlide')}>
            <select
              value={step.imageIndex}
              onChange={(e) =>
                update({ imageIndex: Number(e.target.value) || 0 }, false)
              }
              className={selectClass}
            >
              {Array.from({ length: slideCount }, (_, i) => (
                <option key={i} value={i}>
                  {t('glStudio.slideN', { n: i + 1 })}
                </option>
              ))}
            </select>
          </Field>
        )}
      </div>

      <Field label={t('glStudio.stepTitle')}>
        <input
          type="text"
          value={step.label ?? ''}
          onChange={(e) => update({ label: e.target.value }, 'label')}
          placeholder={t('glStudio.inlineLabelPlaceholder')}
          className={inputClass}
        />
      </Field>

      {usesFocus && (
        <ChoiceGroup
          legend={t('glStudio.overlay')}
          value={overlay}
          options={OVERLAYS.map((value) => ({
            value,
            label: t(`glStudio.overlay_${value}`),
          }))}
          onChange={(showOverlay) => update({ showOverlay }, false)}
        />
      )}

      {showsText && (
        <Field label={t('glStudio.stepText')}>
          <textarea
            value={step.text ?? ''}
            onChange={(e) => update({ text: e.target.value }, 'text')}
            rows={4}
            placeholder={t('glStudio.inlineTextPlaceholder')}
            className={`${inputClass} resize-none`}
          />
        </Field>
      )}

      {usesFocus && overlay === 'banner' && (
        <ChoiceGroup
          legend={t('glStudio.bannerTone')}
          value={step.bannerTone ?? 'blue'}
          options={BANNER_TONES.map((value) => ({
            value,
            label: t(`glStudio.tone_${value}`),
          }))}
          onChange={(bannerTone) => update({ bannerTone }, false)}
        />
      )}

      {(type === 'pan-zoom' || type === 'pan-zoom-spotlight') && (
        <RangeField
          label={t('glStudio.zoomLevel')}
          display={t('glStudio.zoomValue', { n: step.panZoomScale ?? 2.5 })}
          min={1.5}
          max={6}
          step={0.5}
          value={step.panZoomScale ?? 2.5}
          onChange={(panZoomScale) => update({ panZoomScale }, 'zoom')}
        />
      )}
      {(type === 'spotlight' || type === 'pan-zoom-spotlight') && (
        <RangeField
          label={t('glStudio.spotlightSize')}
          display={`${step.spotlightRadius ?? 25}%`}
          min={5}
          max={50}
          step={1}
          value={step.spotlightRadius ?? 25}
          onChange={(spotlightRadius) =>
            update({ spotlightRadius }, 'spotlight')
          }
        />
      )}

      {type === 'audio' && (
        <MediaField
          label={t('glStudio.audio')}
          url={step.audioUrl ?? ''}
          placeholder={t('glStudio.audioUrlPlaceholder')}
          accept="audio/*"
          uploadLabel={t('glStudio.uploadAudio')}
          onUrl={(audioUrl) =>
            update({ audioUrl, audioStoragePath: undefined }, 'audio')
          }
          onUploaded={(audioUrl, audioStoragePath) =>
            update({ audioUrl, audioStoragePath }, false)
          }
        />
      )}
      {type === 'video' && (
        <MediaField
          label={t('glStudio.video')}
          url={step.videoUrl ?? ''}
          placeholder={t('glStudio.videoUrlPlaceholder')}
          accept="video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov"
          uploadLabel={t('glStudio.uploadVideo')}
          onUrl={(videoUrl) =>
            update({ videoUrl, videoStoragePath: undefined }, 'video')
          }
          onUploaded={(videoUrl, videoStoragePath) =>
            update({ videoUrl, videoStoragePath }, false)
          }
        />
      )}

      {type === 'question' && (
        <StudioQuestionFields step={step} onChange={onChange} />
      )}
    </div>
  );
};

/** When the step moves on and whether its marker shows. */
export const StudioStepPlayback: React.FC<{
  step: GuidedLearningStep;
  onChange: StepChange;
}> = ({ step, onChange }) => {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-4">
      <Field
        label={t('glStudio.autoAdvance')}
        hint={t('glStudio.autoAdvanceHint')}
      >
        <input
          type="number"
          min={0}
          max={120}
          value={step.autoAdvanceDuration ?? ''}
          placeholder={t('glStudio.autoAdvanceAuto')}
          onChange={(e) => {
            const next = { ...step };
            if (e.target.value === '') delete next.autoAdvanceDuration;
            else
              next.autoAdvanceDuration = Math.max(
                0,
                Math.min(120, parseInt(e.target.value, 10) || 0)
              );
            onChange(next, 'autoAdvance');
          }}
          className={`${inputClass} w-24`}
        />
      </Field>
      <label className="flex items-start gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={Boolean(step.hotspotAlwaysHidden ?? step.hideStepNumber)}
          onChange={(e) =>
            onChange({ ...step, hotspotAlwaysHidden: e.target.checked }, false)
          }
          className="mt-0.5 h-4 w-4 accent-brand-blue-primary"
        />
        <span className="flex flex-col gap-0.5">
          <span className="text-xs font-bold">{t('glStudio.hideMarker')}</span>
          <span className={hintClass}>{t('glStudio.hideMarkerHint')}</span>
        </span>
      </label>
    </div>
  );
};

const RangeField: React.FC<{
  label: string;
  display: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (next: number) => void;
}> = ({ label, display, min, max, step, value, onChange }) => (
  <Field
    label={
      <span className="flex justify-between">
        {label}
        <span className="font-normal tabular-nums text-slate-600">
          {display}
        </span>
      </span>
    }
  >
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="accent-brand-blue-primary"
    />
  </Field>
);

/** A step's audio or video: a pasted link or an uploaded file. */
const MediaField: React.FC<{
  label: string;
  url: string;
  placeholder: string;
  accept: string;
  uploadLabel: string;
  onUrl: (url: string) => void;
  onUploaded: (url: string, storagePath: string) => void;
}> = ({ label, url, placeholder, accept, uploadLabel, onUrl, onUploaded }) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { uploadGuidedLearningMedia } = useStorage();
  const inputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState('');

  const handleFile = async (file: File) => {
    if (!user) return;
    if (file.size > GL_MAX_VIDEO_BYTES) {
      setError(
        t('glStudio.mediaTooLarge', {
          name: file.name,
          max: Math.round(GL_MAX_VIDEO_BYTES / 1024 / 1024),
        })
      );
      return;
    }
    setError('');
    setProgress(0);
    try {
      const uploaded = await uploadGuidedLearningMedia(
        user.uid,
        file,
        file.name.replace(/[^\w.-]+/g, '_'),
        setProgress
      );
      onUploaded(uploaded.url, uploaded.storagePath);
    } catch {
      setError(t('glStudio.uploadFailed', { name: file.name }));
    } finally {
      setProgress(null);
    }
  };

  return (
    <div className="flex flex-col gap-1.5">
      <Field label={label}>
        <input
          type="url"
          value={url}
          onChange={(e) => onUrl(e.target.value)}
          placeholder={placeholder}
          className={inputClass}
        />
      </Field>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        data-testid="gl-studio-step-media-input"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
          e.target.value = '';
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={progress !== null}
        className={quietButtonClass}
      >
        {progress !== null ? (
          <>
            <Loader2
              className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none"
              aria-hidden="true"
            />
            {t('glStudio.uploadingPercent', { percent: progress })}
          </>
        ) : (
          <>
            <Upload className="h-3.5 w-3.5" aria-hidden="true" />
            {uploadLabel}
          </>
        )}
      </button>
      {error && (
        <p
          role="alert"
          className="flex items-center gap-1.5 text-xs font-bold text-red-700"
        >
          <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}
    </div>
  );
};
