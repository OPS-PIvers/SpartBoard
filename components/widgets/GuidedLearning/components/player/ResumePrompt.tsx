import React, { useEffect, useId, useRef } from 'react';
import { useTranslation } from 'react-i18next';

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
        className="bg-slate-900/95 backdrop-blur-md border border-white/15 rounded-2xl shadow-2xl text-center"
        style={{
          padding: 'min(20px, 5cqmin)',
          width: 'min(340px, 86cqw)',
        }}
      >
        <p
          id={titleId}
          className="text-white font-bold"
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
            onClick={onStartOver}
            className="rounded-full border border-white/20 bg-white/10 text-slate-100 font-semibold hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/90"
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
            onClick={onResume}
            className="rounded-full bg-white text-slate-900 font-bold hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/90 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
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
