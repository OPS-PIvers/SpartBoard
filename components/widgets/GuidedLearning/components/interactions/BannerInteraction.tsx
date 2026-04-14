import React from 'react';
import { X } from 'lucide-react';
import { GuidedLearningPublicStep } from '@/types';

export const BannerInteraction: React.FC<{
  step: GuidedLearningPublicStep;
  onClose?: () => void;
}> = ({ step, onClose }) => {
  if (!step.text) return null;
  const tone = step.bannerTone ?? 'blue';
  const toneStyles: Record<typeof tone, string> = {
    blue: 'linear-gradient(135deg, #1d2a5d 0%, #2d3f89 50%, #4356a0 100%)',
    red: 'linear-gradient(135deg, #7a1718 0%, #ad2122 50%, #c13435 100%)',
    neutral:
      'linear-gradient(135deg, rgba(15, 23, 42, 0.9) 0%, rgba(30, 41, 59, 0.85) 100%)',
  };

  return (
    <div
      className="absolute top-0 left-0 right-0 z-30 pointer-events-none animate-in slide-in-from-top-4 duration-500 motion-reduce:animate-none"
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
            style={{ top: 'min(8px, 2cqmin)', right: 'min(8px, 2cqmin)' }}
            aria-label="Close overlay"
          >
            <X
              style={{
                width: 'min(18px, 4.5cqmin)',
                height: 'min(18px, 4.5cqmin)',
              }}
            />
          </button>
        )}
        {step.label && (
          <div
            className="font-black uppercase tracking-tight pr-8"
            style={{
              fontSize: 'clamp(20px, 6cqmin, 40px)',
              marginBottom: 'min(4px, 1cqmin)',
            }}
          >
            {step.label}
          </div>
        )}
        <div
          className="whitespace-pre-wrap font-medium leading-snug"
          style={{ fontSize: 'clamp(16px, 5cqmin, 32px)' }}
        >
          {step.text}
        </div>
      </div>
    </div>
  );
};
