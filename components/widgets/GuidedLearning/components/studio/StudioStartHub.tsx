import React, { useId, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CircleDot,
  ClipboardPaste,
  FileJson,
  Loader2,
  MonitorUp,
  Sparkles,
  Upload,
  type LucideIcon,
} from 'lucide-react';
import { GL_MEDIA_ACCEPT } from '@/utils/guidedLearningMedia';
import type { SlideUploadProgress } from '../useGuidedLearningEditorState';

export interface StudioStartHubProps {
  onFiles: (files: File[]) => void;
  onPaste: () => void;
  /** Why Paste can't run right now; null when it can. */
  pasteBlocked: string | null;
  /** Opens screen capture, which outlives the hub once the first slide lands. */
  onCapture: () => void;
  uploadProgress: SlideUploadProgress | null;
  /** Omitted when the author can't record tours. */
  onRecordTour?: () => void;
  /** Omitted when AI drafting isn't available. */
  onDraftWithAi?: () => void;
  /** Omitted when importing isn't available here. */
  onImport?: () => void;
}

interface TargetProps {
  id: string;
  icon: LucideIcon;
  label: string;
  description: string;
  onClick: () => void;
  disabled?: boolean;
  dashed?: boolean;
}

const Target: React.FC<TargetProps> = ({
  id,
  icon: Icon,
  label,
  description,
  onClick,
  disabled,
  dashed,
}) => {
  const descId = useId();
  return (
    <button
      type="button"
      data-testid={`gl-studio-hub-${id}`}
      onClick={onClick}
      disabled={disabled}
      aria-describedby={descId}
      className={`flex min-h-[112px] items-start gap-3 rounded-xl border bg-white p-4 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed ${
        dashed ? 'border-2 border-dashed' : ''
      } ${
        disabled
          ? 'border-slate-200 bg-slate-50'
          : 'border-slate-300 hover:border-slate-400 hover:shadow-sm'
      }`}
    >
      <span
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
          disabled
            ? 'bg-slate-100 text-slate-400'
            : 'bg-slate-100 text-brand-blue-primary'
        }`}
      >
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <span
          className={`block text-sm font-bold ${
            disabled ? 'text-slate-500' : 'text-slate-800'
          }`}
        >
          {label}
        </span>
        <span id={descId} className="mt-1 block text-xs text-slate-600">
          {description}
        </span>
      </span>
    </button>
  );
};

/** What an empty set's canvas shows: every way to get a first slide in. */
export const StudioStartHub: React.FC<StudioStartHubProps> = ({
  onFiles,
  onPaste,
  pasteBlocked,
  onCapture,
  uploadProgress,
  onRecordTour,
  onDraftWithAi,
  onImport,
}) => {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <section
      aria-labelledby="gl-studio-hub-title"
      data-testid="gl-studio-hub"
      className="flex h-full w-full items-center justify-center overflow-y-auto"
    >
      <div className="w-full max-w-3xl py-4">
        <h2
          id="gl-studio-hub-title"
          className="text-xl font-bold text-slate-800"
        >
          {t('glStudio.hubTitle')}
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          {t('glStudio.hubSubtitle')}
        </p>
        {uploadProgress && (
          <p
            role="status"
            className="mt-3 flex items-center gap-1.5 text-sm font-bold text-slate-700"
          >
            <Loader2
              className="h-4 w-4 shrink-0 animate-spin motion-reduce:animate-none"
              aria-hidden="true"
            />
            <span className="truncate">
              {t('glStudio.uploadingFile', {
                name: uploadProgress.fileName,
                current: uploadProgress.current,
                total: uploadProgress.total,
              })}
            </span>
          </p>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept={GL_MEDIA_ACCEPT}
          multiple
          className="hidden"
          data-testid="gl-studio-hub-file-input"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = '';
            if (files.length > 0) onFiles(files);
          }}
        />
        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <Target
            id="upload"
            icon={Upload}
            label={t('glStudio.hubUpload')}
            description={t('glStudio.hubUploadDesc')}
            onClick={() => fileInputRef.current?.click()}
            dashed
          />
          <Target
            id="paste"
            icon={ClipboardPaste}
            label={t('glStudio.hubPaste')}
            description={pasteBlocked ?? t('glStudio.hubPasteDesc')}
            onClick={onPaste}
            disabled={pasteBlocked !== null}
          />
          <Target
            id="capture"
            icon={MonitorUp}
            label={t('glStudio.hubCapture')}
            description={t('glStudio.hubCaptureDesc')}
            onClick={onCapture}
          />
          {onRecordTour && (
            <Target
              id="record"
              icon={CircleDot}
              label={t('glStudio.hubRecord')}
              description={t('glStudio.hubRecordDesc')}
              onClick={onRecordTour}
            />
          )}
          {onDraftWithAi && (
            <Target
              id="ai"
              icon={Sparkles}
              label={t('glStudio.hubAi')}
              description={t('glStudio.hubAiDesc')}
              onClick={onDraftWithAi}
            />
          )}
          {onImport && (
            <Target
              id="import"
              icon={FileJson}
              label={t('glStudio.hubImport')}
              description={t('glStudio.hubImportDesc')}
              onClick={onImport}
            />
          )}
        </div>
      </div>
    </section>
  );
};
