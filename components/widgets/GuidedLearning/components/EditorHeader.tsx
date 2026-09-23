import React from 'react';
import { useTranslation } from 'react-i18next';
import { Sparkles, X } from 'lucide-react';
import { AutosaveIndicator } from '@/components/common/EditorModalShell';
import type { AutosaveStatus } from '@/hooks/useAutosave';

interface EditorHeaderProps {
  title: string;
  onTitleChange: (next: string) => void;
  titlePlaceholder: string;
  subtitle?: React.ReactNode;
  autosaveStatus: AutosaveStatus;
  onRetrySave: () => void;
  /** Shown only when AI drafting is available (admin + gemini-functions). */
  onDraftWithAi?: () => void;
  /** Folder picker, device switcher and other header controls. */
  extras?: React.ReactNode;
  onOpenClassic?: () => void;
  onClose: () => void;
}

/** Studio header: editable title, save state, AI drafting and close. */
export const EditorHeader: React.FC<EditorHeaderProps> = ({
  title,
  onTitleChange,
  titlePlaceholder,
  subtitle,
  autosaveStatus,
  onRetrySave,
  onDraftWithAi,
  extras,
  onOpenClassic,
  onClose,
}) => {
  const { t } = useTranslation();
  return (
    <header className="flex shrink-0 items-center gap-4 border-b border-slate-200 bg-white px-5 py-3">
      <div className="flex min-w-0 flex-1 flex-col">
        <input
          type="text"
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder={titlePlaceholder}
          aria-label={t('glStudio.titleLabel')}
          className="w-full truncate border-0 bg-transparent p-0 text-lg font-black text-slate-800 placeholder:font-bold placeholder:text-slate-400 focus:outline-none focus:ring-0"
        />
        {subtitle && (
          <div className="truncate text-xs font-medium text-slate-500">
            {subtitle}
          </div>
        )}
      </div>
      <AutosaveIndicator status={autosaveStatus} onRetry={onRetrySave} />
      {extras}
      {onDraftWithAi && (
        <button
          type="button"
          onClick={onDraftWithAi}
          className="flex h-9 items-center gap-2 rounded-xl bg-brand-blue-primary px-3 text-xs font-bold uppercase tracking-wider text-white shadow-sm transition-colors hover:bg-brand-blue-dark"
        >
          <Sparkles className="h-4 w-4" aria-hidden="true" />
          {t('glStudio.draftWithAi')}
        </button>
      )}
      {onOpenClassic && (
        <button
          type="button"
          onClick={onOpenClassic}
          className="text-xs font-bold text-slate-500 underline-offset-2 hover:text-slate-800 hover:underline"
        >
          {t('glStudio.openClassicEditor')}
        </button>
      )}
      <button
        type="button"
        onClick={onClose}
        aria-label={t('glStudio.close')}
        title={t('glStudio.close')}
        className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
      >
        <X className="h-5 w-5" aria-hidden="true" />
      </button>
    </header>
  );
};
