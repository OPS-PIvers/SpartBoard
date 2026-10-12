import React, { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ImagePlus, ImageUp, Loader2, Trash2 } from 'lucide-react';
import {
  Field,
  hintClass,
  inputClass,
  quietButtonClass,
} from './panelControls';
import type { GuidedLearningEditorController } from '../useGuidedLearningEditorState';
import { tourAttr } from '@/config/tourAnchors';

type WelcomeState = Pick<
  GuidedLearningEditorController,
  | 'welcomeEnabled'
  | 'setWelcomeEnabled'
  | 'welcomeMessage'
  | 'setWelcomeMessage'
  | 'welcomeImageUrl'
  | 'welcomeImageAlt'
  | 'setWelcomeImageAlt'
  | 'setWelcomeImageFromFile'
  | 'removeWelcomeImage'
  | 'welcomeImageUploading'
  | 'imageError'
>;

/** Right column while the pinned Welcome card is selected. */
export const StudioWelcomePanel: React.FC<{ state: WelcomeState }> = ({
  state,
}) => {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const {
    welcomeEnabled,
    setWelcomeEnabled,
    welcomeMessage,
    setWelcomeMessage,
    welcomeImageUrl,
    welcomeImageAlt,
    setWelcomeImageAlt,
    setWelcomeImageFromFile,
    removeWelcomeImage,
    welcomeImageUploading,
    imageError,
  } = state;
  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) void setWelcomeImageFromFile(file);
  };
  return (
    <section
      aria-labelledby="gl-studio-welcome-heading"
      data-testid="gl-studio-welcome-section"
      className="flex flex-col gap-6 p-4"
    >
      <h2
        id="gl-studio-welcome-heading"
        className="text-lg font-bold text-slate-900"
      >
        {t('glStudio.welcomeScreen')}
      </h2>
      <label className="flex items-start gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          {...tourAttr('studio.props-welcome-enabled')}
          checked={welcomeEnabled}
          onChange={(e) => setWelcomeEnabled(e.target.checked)}
          className="mt-0.5 h-4 w-4 accent-brand-blue-primary"
        />
        <span className="flex flex-col gap-0.5">
          <span className="text-xs font-bold">
            {t('glStudio.welcomeToggle')}
          </span>
          <span className={hintClass}>{t('glStudio.welcomeHint')}</span>
        </span>
      </label>
      <div className="flex flex-col gap-2">
        <span className="text-xs font-bold text-slate-600">
          {t('glStudio.welcomeImage')}
        </span>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          data-testid="gl-studio-welcome-image-input"
          onChange={onFile}
        />
        {welcomeImageUrl ? (
          <img
            src={welcomeImageUrl}
            alt=""
            draggable={false}
            className="aspect-video w-full rounded-lg border border-slate-200 bg-slate-100 object-cover"
          />
        ) : null}
        <div className="flex flex-wrap items-center gap-1">
          <button
            type="button"
            {...tourAttr('studio.props-welcome-image')}
            onClick={() => inputRef.current?.click()}
            disabled={welcomeImageUploading}
            className={quietButtonClass}
          >
            {welcomeImageUploading ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : welcomeImageUrl ? (
              <ImageUp className="h-4 w-4" aria-hidden="true" />
            ) : (
              <ImagePlus className="h-4 w-4" aria-hidden="true" />
            )}
            {welcomeImageUploading
              ? t('glStudio.welcomeImageUploading')
              : welcomeImageUrl
                ? t('glStudio.replaceImage')
                : t('glStudio.welcomeAddImage')}
          </button>
          {welcomeImageUrl && !welcomeImageUploading && (
            <button
              type="button"
              {...tourAttr('studio.props-welcome-image-remove')}
              onClick={removeWelcomeImage}
              className={`${quietButtonClass} hover:text-red-700`}
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              {t('glStudio.welcomeRemoveImage')}
            </button>
          )}
        </div>
        {imageError && (
          <p role="alert" className="text-xs text-red-700">
            {imageError}
          </p>
        )}
      </div>
      {welcomeImageUrl && (
        <Field label={t('glStudio.welcomeImageAlt')}>
          <input
            type="text"
            value={welcomeImageAlt}
            maxLength={200}
            onChange={(e) => setWelcomeImageAlt(e.target.value)}
            {...tourAttr('studio.props-welcome-image-alt')}
            placeholder={t('glStudio.welcomeImageAltPlaceholder')}
            className={inputClass}
          />
        </Field>
      )}
      <Field label={t('glStudio.welcomeMessage')}>
        <textarea
          value={welcomeMessage}
          onChange={(e) => setWelcomeMessage(e.target.value)}
          rows={4}
          {...tourAttr('studio.props-welcome-message')}
          placeholder={t('glStudio.welcomePlaceholder')}
          className={`${inputClass} resize-none`}
        />
      </Field>
    </section>
  );
};
