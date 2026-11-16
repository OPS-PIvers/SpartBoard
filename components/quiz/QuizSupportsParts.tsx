// The student's Supports button and panel: teacher-provided text, links and Drive files.
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ChevronLeft,
  ExternalLink,
  FileText,
  HardDrive,
  LifeBuoy,
  Link2,
  X,
} from 'lucide-react';
import type { QuizSupport } from '@/types';

const KIND_ICON = { text: FileText, link: Link2, drive: HardDrive } as const;

const driveSupportPreviewUrl = (fileId: string): string =>
  `https://drive.google.com/file/d/${encodeURIComponent(fileId)}/preview`;

export const SupportsButton: React.FC<{
  light: boolean;
  onOpen: () => void;
}> = ({ light, onOpen }) => {
  const { t } = useTranslation();
  return (
    <button
      // no-tour-anchor: student quiz screen; tours walk teachers
      type="button"
      onClick={onOpen}
      className={`inline-flex h-11 items-center gap-1.5 rounded-lg px-2.5 text-sm font-bold ${
        light
          ? 'text-brand-blue-primary hover:bg-slate-100'
          : 'text-slate-200 hover:bg-slate-800'
      }`}
    >
      <LifeBuoy className="h-4 w-4" aria-hidden />
      {t('quizSupports.button', 'Supports')}
    </button>
  );
};

const SupportBody: React.FC<{ support: QuizSupport; light: boolean }> = ({
  support,
  light,
}) => {
  const { t } = useTranslation();
  if (support.kind === 'text')
    return (
      <p className="whitespace-pre-line leading-relaxed">{support.text}</p>
    );
  if (support.kind === 'drive')
    return (
      <iframe
        title={support.title}
        src={driveSupportPreviewUrl(support.fileId)}
        className="h-[60vh] w-full rounded-lg border border-slate-200 bg-white"
        allow="autoplay"
      />
    );
  if (!support.url.startsWith('https://')) return null;
  return (
    <a
      // no-tour-anchor: student quiz screen; tours walk teachers
      href={support.url}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-1.5 font-bold underline ${
        light ? 'text-brand-blue-primary' : 'text-sky-300'
      }`}
    >
      {t('quizSupports.openLink', 'Open link')}
      <ExternalLink className="h-4 w-4" aria-hidden />
    </a>
  );
};

/** One support opens straight away; several show a list first. */
export const SupportsDialog: React.FC<{
  supports: QuizSupport[];
  light: boolean;
  onClose: () => void;
}> = ({ supports, light, onClose }) => {
  const { t } = useTranslation();
  const [picked, setPicked] = useState<number | null>(
    supports.length === 1 ? 0 : null
  );
  const current = picked === null ? null : supports[picked];
  const muted = light ? 'text-slate-500' : 'text-slate-300';
  const rowHover = light ? 'hover:bg-slate-50' : 'hover:bg-slate-700';
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="quiz-supports-title"
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
    >
      <div
        className={`flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl shadow-xl ${
          light ? 'bg-white text-slate-800' : 'bg-slate-800 text-slate-100'
        }`}
      >
        <div className="flex items-center gap-2 px-4 pt-3">
          {current && supports.length > 1 && (
            <button
              // no-tour-anchor: student quiz screen; tours walk teachers
              type="button"
              onClick={() => setPicked(null)}
              aria-label={t('quizSupports.back', 'Back')}
              className={`inline-flex h-11 w-11 items-center justify-center rounded-lg ${rowHover}`}
            >
              <ChevronLeft className="h-5 w-5" aria-hidden />
            </button>
          )}
          <h2
            id="quiz-supports-title"
            className="min-w-0 flex-1 truncate text-lg font-bold"
          >
            {current ? current.title : t('quizSupports.title', 'Supports')}
          </h2>
          <button
            // no-tour-anchor: student quiz screen; tours walk teachers
            type="button"
            onClick={onClose}
            autoFocus
            aria-label={t('quizSupports.close', 'Close')}
            className={`inline-flex h-11 w-11 items-center justify-center rounded-lg ${rowHover}`}
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
        <div className="custom-scrollbar overflow-y-auto px-4 pb-5 pt-2">
          {current ? (
            <SupportBody support={current} light={light} />
          ) : (
            <ul className="divide-y divide-slate-200/70">
              {supports.map((s, i) => {
                const Icon = KIND_ICON[s.kind];
                return (
                  <li key={`${s.kind}-${i}`}>
                    <button
                      // no-tour-anchor: student quiz screen; tours walk teachers
                      type="button"
                      onClick={() => setPicked(i)}
                      className={`flex min-h-12 w-full items-center gap-3 rounded-lg px-2 text-left ${rowHover}`}
                    >
                      <Icon
                        className={`h-5 w-5 shrink-0 ${muted}`}
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1 truncate font-semibold">
                        {s.title}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};
