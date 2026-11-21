import React from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowRight } from 'lucide-react';
import {
  AUTH_CARD,
  AUTH_PAGE_BG,
  AUTH_PAGE_DOTS,
} from '@/components/auth/authShellStyles';
import {
  GL_PRIMARY_BUTTON,
  GuidedLearningWelcomeHeader,
  GuidedLearningWelcomeMessage,
} from '@/components/guidedLearning/GuidedLearningScreenShell';

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
      className={`relative h-full overflow-y-auto rounded-xl custom-scrollbar ${AUTH_PAGE_BG}`}
    >
      <div className={AUTH_PAGE_DOTS} aria-hidden="true" />
      {!enabled && (
        <span className="absolute left-3 top-3 z-10 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-700">
          {t('glStudio.welcomeOff')}
        </span>
      )}
      <div className="relative flex min-h-full items-center justify-center p-6">
        <div
          inert
          className={`max-w-md ${AUTH_CARD} ${enabled ? '' : 'opacity-50'}`}
        >
          <GuidedLearningWelcomeHeader
            title={title.trim() || t('glStudio.untitled')}
            imageUrl={imageUrl}
            imageAlt={imageAlt}
            titleAs="p"
          >
            {text ? <GuidedLearningWelcomeMessage text={text} /> : null}
          </GuidedLearningWelcomeHeader>
          <div className={`mt-7 ${GL_PRIMARY_BUTTON}`}>
            {t('glStudent.start.getStarted')}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </div>
        </div>
      </div>
    </div>
  );
};
