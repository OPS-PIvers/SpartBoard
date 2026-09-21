/**
 * Strand tagging chips for a single annotation — shared by the text popover
 * (`AnnotatedResponseView`) and the audio timestamp notes
 * (`AudioAnnotatedResponseView`).
 *
 * The `name` on each tag is snapshotted when the tag is added, because the
 * student review reads the question's base `rubricSnapshot` and can't resolve
 * a criterion id that came from a per-student override rubric. The live name
 * wins whenever the id is still in the effective rubric. Tag mutation lives in
 * `utils/rubricStrandTags.ts`.
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import type { Rubric } from '@/types';
import {
  orphanedStrandTags,
  strandLabel,
  type RubricStrandTag,
} from '@/utils/rubricStrandTags';

const CHIP_BASE =
  'max-w-[9rem] truncate rounded-full border px-2 py-0.5 text-[11px] font-semibold leading-tight transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1';

interface ChipsProps {
  /** Effective rubric for this response; no chips render without one. */
  rubric: Rubric | undefined;
  value: RubricStrandTag[] | undefined;
  onToggle: (criterionId: string) => void;
  disabled?: boolean;
}

export const RubricStrandChips: React.FC<ChipsProps> = ({
  rubric,
  value,
  onToggle,
  disabled = false,
}) => {
  const { t } = useTranslation();
  const tagged = value ?? [];
  if (!rubric || rubric.criteria.length === 0) return null;
  const orphans = orphanedStrandTags(tagged, rubric);
  return (
    <div
      role="group"
      aria-label={t('quizMediaResponse.grading.rubricTags.label')}
      className="flex flex-wrap items-center gap-1"
    >
      {rubric.criteria.map((c) => {
        const on = tagged.some((tg) => tg.criterionId === c.id);
        return (
          <button
            key={c.id}
            type="button"
            aria-pressed={on}
            disabled={disabled}
            title={c.name}
            aria-label={t(
              on
                ? 'quizMediaResponse.grading.rubricTags.remove'
                : 'quizMediaResponse.grading.rubricTags.add',
              { name: c.name }
            )}
            onClick={() => onToggle(c.id)}
            className={`${CHIP_BASE} disabled:cursor-not-allowed disabled:opacity-50 ${
              on
                ? 'border-violet-600 bg-violet-600 text-white'
                : 'border-slate-300 bg-white text-slate-600 hover:border-violet-400 hover:text-violet-700'
            }`}
          >
            {c.name}
          </button>
        );
      })}
      {/* A strand that left the rubric (edited, or a per-student override
          swapped the rubric out) keeps its snapshot so the tag is still
          removable, but it can't be added back. */}
      {orphans.map((tg) => (
        <button
          key={tg.criterionId}
          type="button"
          aria-pressed
          disabled={disabled}
          title={tg.name}
          aria-label={t('quizMediaResponse.grading.rubricTags.remove', {
            name: tg.name,
          })}
          onClick={() => onToggle(tg.criterionId)}
          className={`${CHIP_BASE} border-slate-300 bg-slate-200 text-slate-500 line-through disabled:cursor-not-allowed disabled:opacity-50`}
        >
          {tg.name}
        </button>
      ))}
    </div>
  );
};

interface PillsProps {
  tags: RubricStrandTag[] | undefined;
  /** Supplied on the teacher side so a renamed strand shows its live name. */
  rubric?: Rubric;
  className?: string;
  tone?: 'light' | 'dark';
}

/** Read-only rendering of the same tags, for lists and the student review. */
export const RubricStrandPills: React.FC<PillsProps> = ({
  tags,
  rubric,
  className = '',
  tone = 'light',
}) => {
  const { t } = useTranslation();
  if (!tags || tags.length === 0) return null;
  const pillCls =
    tone === 'dark'
      ? 'border-violet-400/50 bg-violet-500/15 text-violet-200'
      : 'border-violet-200 bg-violet-50 text-violet-700';
  // Deliberately not a list role: these render inside a <button> in the
  // grader's highlights rail, where list semantics are dropped anyway. A
  // visually-hidden prefix carries the meaning instead.
  return (
    <span className={`flex flex-wrap gap-1 ${className}`}>
      <span className="sr-only">
        {t('quizMediaResponse.grading.rubricTags.evidenceFor')}:{' '}
      </span>
      {tags.map((tag) => (
        <span
          key={tag.criterionId}
          className={`rounded-full border px-1.5 py-0.5 text-[10px] font-bold leading-tight ${pillCls}`}
        >
          {strandLabel(tag, rubric)}
        </span>
      ))}
    </span>
  );
};

export default RubricStrandChips;
