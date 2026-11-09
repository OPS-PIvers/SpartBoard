import React from 'react';
import { MapPin, Trash2, TriangleAlert } from 'lucide-react';
import type {
  WebTourAction,
  WebTourCheckResult,
  WebTourSuggestion,
} from '@/types';
import { tourAttr } from '@/config/tourAnchors';
import type { NameMatcher } from '@/components/widgets/GuidedLearning/components/recorder/redaction';
import { secondaryBtn } from '@/components/common/lightChrome';
import { TourStepCard } from '@/components/tours/editor/shell/TourStepCard';
import {
  cardInput,
  cardLabel,
} from '@/components/tours/editor/shell/stepCardParts';
import { isHardHit } from './studentData';
import {
  hideHits,
  needsFixOnSite,
  reviewEntries,
  setReviewField,
  type ReviewField,
} from './webStepReview';
import { Highlighted, SuggestedFix } from './webEditorParts';
import {
  ACTION_LABEL,
  CHECK_LABEL,
  NEEDS_NEWER_EXTENSION,
  fieldLabel,
  webTargetLabel,
  type WebStep,
} from './webEditorModel';
import { WebClaudeNote, WebClaudeQuestion } from './WebTourWriting';

// Clues playback can do without; the address, title and tip stay.
const REMOVABLE: ReadonlySet<ReviewField> = new Set([
  'role',
  'name',
  'pageText',
  'css',
  'heading',
  'pageTitle',
  'attr:testId',
  'attr:ariaLabel',
  'attr:name',
  'attr:href',
]);

const TARGET_FIELDS: readonly ReviewField[] = [
  'name',
  'pageText',
  'attr:ariaLabel',
];

const CHECK_TONE: Record<WebTourCheckResult, string> = {
  found: 'bg-emerald-100 text-emerald-800',
  weak: 'bg-amber-100 text-amber-800',
  ambiguous: 'bg-amber-100 text-amber-800',
  none: 'bg-red-100 text-red-800',
};

/** The selected web step: Title, Tip, Type and its target; recorded clues and the note for Claude under More. */
export const WebStepCard: React.FC<{
  step: WebStep;
  matcher: NameMatcher | null;
  canFix: boolean;
  fix: WebTourSuggestion | null;
  result: WebTourCheckResult | null;
  onChange: (step: WebStep, field?: string) => void;
  onDelete: () => void;
  onFix: () => void;
  onUseFix: () => void;
  onDismissFix: () => void;
}> = ({
  step,
  matcher,
  canFix,
  fix,
  result,
  onChange,
  onDelete,
  onFix,
  onUseFix,
  onDismissFix,
}) => {
  const entries = reviewEntries(step, matcher);
  const blocked = entries.some((e) => e.hits.some(isHardHit));
  const edit = (field: ReviewField, value: string | undefined) =>
    onChange(setReviewField(step, field, value), field);
  const clues = entries.filter(
    (e) => e.field !== 'label' && e.field !== 'text'
  );
  const weak = needsFixOnSite(step);
  // The target's name, highlighted like its clue when it holds student data.
  const targetEntry = TARGET_FIELDS.map((f) =>
    clues.find((e) => e.field === f && e.value.trim())
  ).find(Boolean);
  const type = (
    <>
      {step.web && (
        <label className={cardLabel}>
          Step type
          {/* no-tour-anchor: per-step controls repeat on every step */}
          <select
            className={cardInput}
            value={step.web.action}
            onChange={(e) =>
              step.web &&
              onChange({
                ...step,
                web: { ...step.web, action: e.target.value as WebTourAction },
              })
            }
          >
            {(Object.keys(ACTION_LABEL) as WebTourAction[]).map((a) => (
              <option key={a} value={a}>
                {ACTION_LABEL[a]}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className={cardLabel}>
        Target
        <div className="flex items-start gap-2">
          <span className="flex min-w-0 flex-1 flex-col gap-1 pt-1 text-sm font-normal text-slate-900">
            <span className="wrap-break-word" data-testid="web-step-target">
              {targetEntry ? (
                <Highlighted entry={targetEntry} />
              ) : (
                webTargetLabel(step.web?.locator)
              )}
            </span>
            {result && (
              <span
                className={`w-fit rounded-full px-1.5 text-[11px] font-semibold ${CHECK_TONE[result]}`}
              >
                {CHECK_LABEL[result]}
              </span>
            )}
          </span>
          {/* no-tour-anchor: per-step controls repeat on every step */}
          <button
            type="button"
            className={`${secondaryBtn} flex shrink-0 items-center gap-1.5 px-2 text-xs disabled:cursor-not-allowed disabled:opacity-50`}
            disabled={!canFix}
            title={canFix ? undefined : NEEDS_NEWER_EXTENSION}
            onClick={onFix}
          >
            <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
            Fix on site
          </button>
        </div>
        {weak && (
          <span className="flex items-start gap-1.5 text-xs font-semibold text-amber-800">
            <TriangleAlert
              className="mt-px h-3.5 w-3.5 shrink-0"
              aria-hidden="true"
            />
            This step may not find its target on the site.
          </span>
        )}
        {!canFix && (
          <span className="text-xs font-normal text-slate-500">
            {NEEDS_NEWER_EXTENSION}
          </span>
        )}
      </div>
      {fix && step.web && (
        <SuggestedFix
          before={step.web.locator}
          fix={fix}
          canFix={canFix}
          onUse={onUseFix}
          onDismiss={onDismissFix}
          onFix={onFix}
        />
      )}
      <WebClaudeQuestion step={step} onChange={(s) => onChange(s)} />
      {blocked && (
        <p className="text-xs font-semibold text-red-800">
          Publish hides the highlighted student data.
        </p>
      )}
    </>
  );
  const more = (
    <>
      {clues.length > 0 && (
        <section
          aria-label="How the step finds its target"
          className="flex flex-col gap-1"
        >
          <h4 className="text-xs font-semibold text-slate-600">
            How the step finds its target
          </h4>
          <dl className="flex flex-col divide-y divide-slate-200 text-xs">
            {clues.map((entry) => (
              <div key={entry.field} className="flex items-start gap-2 py-1.5">
                <dt className="w-24 shrink-0 text-slate-500">
                  {fieldLabel(entry.field)}
                </dt>
                <dd className="min-w-0 flex-1 text-slate-800">
                  <Highlighted entry={entry} />
                </dd>
                {entry.hits.length > 0 && (
                  // no-tour-anchor: per-field controls repeat on every step
                  <button
                    type="button"
                    className="shrink-0 font-semibold text-brand-blue-primary hover:underline"
                    onClick={() => edit(entry.field, hideHits(entry))}
                  >
                    Hide highlighted
                  </button>
                )}
                {REMOVABLE.has(entry.field) && (
                  // no-tour-anchor: per-field controls repeat on every step
                  <button
                    type="button"
                    className="shrink-0 font-semibold text-brand-blue-primary hover:underline"
                    onClick={() => edit(entry.field, undefined)}
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
          </dl>
        </section>
      )}
      <WebClaudeNote step={step} onChange={(s) => onChange(s, 'note')} />
    </>
  );
  return (
    <TourStepCard
      stepId={step.id}
      title={step.label ?? ''}
      tip={step.text ?? ''}
      onTitle={(value) => edit('label', value)}
      onTip={(value) => edit('text', value)}
      type={type}
      more={more}
      moreAnchor={tourAttr('web-tour-editor.step-more')}
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
};
