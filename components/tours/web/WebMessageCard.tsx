import React from 'react';
import { Trash2 } from 'lucide-react';
import { TourStepCard } from '@/components/tours/editor/shell/TourStepCard';
import type { GuidedLearningStep } from '@/types';

/** The selected Message step: a title and words, with no picture, target or conditions. */
export const WebMessageCard: React.FC<{
  step: GuidedLearningStep;
  onChange: (step: GuidedLearningStep, field?: string) => void;
  onDelete: () => void;
}> = ({ step, onChange, onDelete }) => (
  <TourStepCard
    stepId={step.id}
    title={step.label ?? ''}
    tip={step.text ?? ''}
    onTitle={(label) => onChange({ ...step, label }, 'label')}
    onTip={(text) => onChange({ ...step, text }, 'text')}
    type={null}
    footer={
      <div className="flex justify-end">
        {/* no-tour-anchor: per-step controls repeat on every step */}
        <button
          type="button"
          onClick={onDelete}
          className="flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2 py-1.5 text-xs font-semibold text-brand-red-primary hover:bg-red-50 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-red-primary/40"
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
          Delete step
        </button>
      </div>
    }
  />
);
