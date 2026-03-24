import React from 'react';
import { X } from 'lucide-react';
import { GuidedLearningPublicStep } from '@/types';

interface Props {
  step: GuidedLearningPublicStep;
  onClose: () => void;
}

export const TextPopoverInteraction: React.FC<Props> = ({ step, onClose }) => (
  <div className="w-full h-full flex items-center justify-center p-4">
    <div className="relative bg-slate-800/95 backdrop-blur-sm border border-white/20 rounded-2xl shadow-2xl max-w-sm w-full p-5">
      <button
        onClick={onClose}
        className="absolute top-3 right-3 text-slate-400 hover:text-white transition-colors"
        aria-label="Close"
      >
        <X className="w-4 h-4" />
      </button>
      {step.label && (
        <h3 className="text-white font-bold text-base mb-2 pr-6">
          {step.label}
        </h3>
      )}
      <p className="text-slate-200 text-sm leading-relaxed whitespace-pre-wrap">
        {step.text ?? ''}
      </p>
    </div>
  </div>
);
