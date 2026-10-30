import React from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowRight, BookOpen } from 'lucide-react';
import { GuidedLearningWelcomeImage } from '@/components/guidedLearning/GuidedLearningWelcomeImage';

interface StudioWelcomePreviewProps {
  title: string;
  enabled: boolean;
  message: string;
  imageUrl: string;
  imageAlt: string;
}

/** The student start screen as the welcome settings will show it. */
export const StudioWelcomePreview: React.FC<StudioWelcomePreviewProps> = ({
  title,
  enabled,
  message,
  imageUrl,
  imageAlt,
}) => {
  const { t } = useTranslation();
  const text = message.trim();
  return (
    <div
      data-testid="gl-studio-welcome-preview"
      className="relative flex h-full items-center justify-center overflow-y-auto rounded-xl bg-slate-950 p-6 custom-scrollbar"
    >
      {!enabled && (
        <span className="absolute left-3 top-3 rounded-full bg-white/90 px-2.5 py-1 text-xs font-bold text-slate-700">
          {t('glStudio.welcomeOff')}
        </span>
      )}
      <div
        inert
        className={`w-full max-w-md rounded-2xl border border-white/10 bg-slate-900 p-8 text-center shadow-2xl ${
          enabled ? '' : 'opacity-50'
        }`}
      >
        {imageUrl ? (
          <GuidedLearningWelcomeImage
            url={imageUrl}
            alt={imageAlt}
            className="mb-4"
          />
        ) : (
          <BookOpen
            className="mx-auto mb-3 h-10 w-10 text-indigo-400"
            aria-hidden="true"
          />
        )}
        <p className="mb-1 text-xl font-bold text-white">
          {title.trim() || t('glStudio.untitled')}
        </p>
        {text ? (
          <div className="mb-6 mt-3 rounded-xl border border-white/10 bg-white/3 px-4 py-3 text-left">
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-200">
              {text}
            </p>
          </div>
        ) : (
          <div className="mb-6" />
        )}
        <div className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3 font-semibold text-white">
          {t('glStudent.start.getStarted')}
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </div>
      </div>
    </div>
  );
};
