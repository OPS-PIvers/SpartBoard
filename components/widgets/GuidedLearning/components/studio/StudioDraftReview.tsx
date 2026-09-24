import React from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';
import type { GuidedLearningStep } from '@/types';
import { nextDraftIndex } from './aiDraftReview';

interface StudioDraftReviewProps {
  steps: readonly GuidedLearningStep[];
  selectedIndex: number;
  onSelect: (index: number) => void;
}

/** Header count of AI-drafted steps still to review, with previous and next. */
export const StudioDraftReview: React.FC<StudioDraftReviewProps> = ({
  steps,
  selectedIndex,
  onSelect,
}) => {
  const { t } = useTranslation();
  const count = steps.filter((s) => s.aiDraft).length;
  if (count === 0) return null;
  const go = (direction: 1 | -1) => {
    const from =
      selectedIndex < 0 ? (direction === 1 ? -1 : steps.length) : selectedIndex;
    const i = nextDraftIndex(steps, from, direction);
    if (i >= 0) onSelect(i);
  };
  return (
    <div
      role="group"
      aria-label={t('glStudio.aiDraftsToReview', { count })}
      data-testid="gl-studio-ai-drafts"
      className="flex items-center gap-0.5 rounded-lg bg-violet-50 py-0.5 pl-2 pr-0.5 text-violet-900"
    >
      <Sparkles className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span className="px-1 text-xs font-bold">
        {t('glStudio.aiDraftsToReview', { count })}
      </span>
      <button
        type="button"
        onClick={() => go(-1)}
        aria-label={t('glStudio.previousAiDraft')}
        title={t('glStudio.previousAiDraft')}
        className="rounded-md p-1 transition-colors hover:bg-violet-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-600/40"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={() => go(1)}
        aria-label={t('glStudio.nextAiDraft')}
        title={t('glStudio.nextAiDraft')}
        className="rounded-md p-1 transition-colors hover:bg-violet-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-600/40"
      >
        <ChevronRight className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
};
