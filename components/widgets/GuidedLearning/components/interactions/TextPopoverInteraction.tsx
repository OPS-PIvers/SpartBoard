import React from 'react';
import { X } from 'lucide-react';
import { GuidedLearningPublicStep } from '@/types';

interface Props {
  step: GuidedLearningPublicStep;
  onClose: () => void;
}

export const TextPopoverInteraction: React.FC<Props> = ({ step, onClose }) => (
  <div
    className="w-full h-full flex items-center justify-center"
    style={{ padding: 'min(16px, 4cqmin)' }}
  >
    <div
      className="relative bg-slate-800/95 backdrop-blur-sm border border-white/20 rounded-2xl shadow-2xl w-full"
      style={{
        maxWidth: 'min(380px, 90cqw)',
        padding: 'min(20px, 5cqmin)',
      }}
    >
      <button
        onClick={onClose}
        className="absolute text-slate-400 hover:text-white transition-colors"
        style={{
          top: 'min(12px, 3cqmin)',
          right: 'min(12px, 3cqmin)',
        }}
        aria-label="Close"
      >
        <X
          style={{
            width: 'min(16px, 4cqmin)',
            height: 'min(16px, 4cqmin)',
          }}
        />
      </button>
      {step.label && (
        <h3
          className="text-white font-bold mb-2 pr-6 leading-tight"
          style={{ fontSize: 'min(16px, 4.5cqmin)' }}
        >
          {step.label}
        </h3>
      )}
      <p
        className="text-slate-200 leading-relaxed whitespace-pre-wrap"
        style={{ fontSize: 'min(14px, 3.5cqmin)' }}
      >
        {step.text ?? ''}
      </p>
    </div>
  </div>
);
