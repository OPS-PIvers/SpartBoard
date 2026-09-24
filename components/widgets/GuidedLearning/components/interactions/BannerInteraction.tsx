import React from 'react';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { GuidedLearningPublicStep } from '@/types';
import { renderStepText } from '../../utils/richText';

export const BannerInteraction: React.FC<{
  step: GuidedLearningPublicStep;
  onClose?: () => void;
  /** Edge the banner sits on; the stage flips it to keep the target clear. */
  position?: 'top' | 'bottom';
  /** Studio inline editor shown in place of the label and text. */
  editor?: React.ReactNode;
}> = ({ step, onClose, position = 'top', editor }) => {
  const { t } = useTranslation();
  if (!step.text && !editor) return null;
  const tone = step.bannerTone ?? 'blue';
  const toneStyles: Record<typeof tone, string> = {
    blue: 'linear-gradient(135deg, #1d2a5d 0%, #2d3f89 50%, #4356a0 100%)',
    red: 'linear-gradient(135deg, #7a1718 0%, #ad2122 50%, #c13435 100%)',
    neutral:
      'linear-gradient(135deg, rgba(15, 23, 42, 0.9) 0%, rgba(30, 41, 59, 0.85) 100%)',
  };

  return (
    <div
      data-gl-callout={step.id}
      data-position={position}
      className={`absolute left-0 right-0 z-30 pointer-events-none animate-in duration-500 motion-reduce:animate-none ${
        position === 'bottom'
          ? 'bottom-0 slide-in-from-bottom-4'
          : 'top-0 slide-in-from-top-4'
      }`}
      style={{ padding: 'min(8px, 2.2cqmin)' }}
    >
      <div
        className="relative w-full text-white rounded-xl shadow-2xl border border-white/15"
        style={{
          background: toneStyles[tone],
          boxShadow: '0 10px 25px rgba(2, 6, 23, 0.45)',
          paddingInline: 'clamp(14px, 3.8cqmin, 40px)',
          paddingBlock: 'clamp(12px, 3cqmin, 24px)',
        }}
      >
        {onClose && (
          <button
            onClick={onClose}
            className="pointer-events-auto absolute text-white/80 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 rounded"
            style={{
              top: 'clamp(6px, 1.8cqmin, 12px)',
              right: 'clamp(6px, 1.8cqmin, 12px)',
            }}
            aria-label={t('glPlayer.closeOverlay')}
          >
            <X
              style={{
                width: 'clamp(16px, 4.5cqmin, 24px)',
                height: 'clamp(16px, 4.5cqmin, 24px)',
              }}
            />
          </button>
        )}
        {editor ?? (
          <>
            {step.label && (
              <div
                className="font-black uppercase tracking-tight pr-8"
                style={{
                  fontSize: 'clamp(20px, 6cqmin, 40px)',
                  marginBottom: 'min(4px, 1cqmin)',
                }}
              >
                {renderStepText(step.label)}
              </div>
            )}
            <div
              className="whitespace-pre-wrap font-medium leading-snug"
              style={{ fontSize: 'clamp(16px, 5cqmin, 32px)' }}
            >
              {renderStepText(step.text)}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
