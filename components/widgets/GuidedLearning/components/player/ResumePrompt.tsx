import React, { useEffect, useId, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  chromeSurface,
  primaryBtn,
  secondaryBtn,
} from '@/components/common/lightChrome';
import { tourAttr } from '@/config/tourAnchors';

interface Props {
  stepNumber: number;
  onResume: () => void;
  onStartOver: () => void;
}

/** "Resume at step N?" card shown over the stage when a saved place exists. */
export const ResumePrompt: React.FC<Props> = ({
  stepNumber,
  onResume,
  onStartOver,
}) => {
  const { t } = useTranslation();
  const titleId = useId();
  const resumeRef = useRef<HTMLButtonElement>(null);

  // Keyboard users land on the main choice.
  useEffect(() => {
    resumeRef.current?.focus({ preventScroll: true });
  }, []);

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-950/60">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`rounded-2xl text-center ${chromeSurface}`}
        style={{
          padding: 'min(20px, 5cqmin)',
          width: 'min(340px, 86cqw)',
        }}
      >
        <p
          id={titleId}
          className="text-slate-900 font-bold"
          style={{ fontSize: 'min(16px, 4.5cqmin)' }}
        >
          {t('glPlayer.resume.question', { n: stepNumber })}
        </p>
        <div
          className="flex justify-center"
          style={{ gap: 'min(10px, 2.5cqmin)', marginTop: 'min(16px, 4cqmin)' }}
        >
          <button
            type="button"
            {...tourAttr('gl-player.resume-start-over')}
            onClick={onStartOver}
            className={`${secondaryBtn} border border-slate-200`}
            style={{
              padding: 'min(8px, 2cqmin) min(16px, 4cqmin)',
              fontSize: 'min(14px, 3.6cqmin)',
            }}
          >
            {t('glPlayer.resume.startOver')}
          </button>
          <button
            ref={resumeRef}
            type="button"
            {...tourAttr('gl-player.resume')}
            onClick={onResume}
            className={`${primaryBtn} font-bold`}
            style={{
              padding: 'min(8px, 2cqmin) min(16px, 4cqmin)',
              fontSize: 'min(14px, 3.6cqmin)',
            }}
          >
            {t('glPlayer.resume.resume')}
          </button>
        </div>
      </div>
    </div>
  );
};
