import React, { useEffect, useRef, useState } from 'react';
import { Check, Globe, Link2, Loader2, Pencil, Radar } from 'lucide-react';
import type { GuidedLearningSet } from '@/types';
import { tourFieldAttr } from '@/config/tourAnchors';
import { chromeMuted, focusRing } from '@/components/common/lightChrome';
import { usePublishedTour } from '@/components/tours/publishedTours';
import { usePublicLinkControls } from '@/components/tours/publicLink/usePublicLinkControls';
import { isWebTourSet } from '@/components/widgets/GuidedLearning/utils/liveTour';
import { logError } from '@/utils/logError';
import { webTourSite } from './tourLinks';
import { useCopyWebTourLink } from './useCopyWebTourLink';
import { checkPasses, currentCheckResults } from './webStepReview';

const rowBtn = `inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm font-semibold text-brand-blue-primary hover:bg-brand-blue-lighter disabled:opacity-50 ${focusRing}`;

type Tone = 'neutral' | 'success' | 'warn' | 'info';
const TONE: Record<Tone, string> = {
  neutral: 'bg-slate-100 text-slate-700',
  success: 'bg-emerald-50 text-emerald-800',
  warn: 'bg-amber-50 text-amber-800',
  info: 'bg-brand-blue-lighter text-brand-blue-dark',
};

const Badge: React.FC<{ tone: Tone; children: React.ReactNode }> = ({
  tone,
  children,
}) => (
  <span
    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${TONE[tone]}`}
  >
    {children}
  </span>
);

const checkBadge = (set: GuidedLearningSet): [Tone, string] | null => {
  if (checkPasses(set)) return ['success', 'Check passed'];
  if (currentCheckResults(set)) return ['warn', 'Check found problems'];
  return null;
};

const WebTourRow: React.FC<{
  set: GuidedLearningSet;
  onEdit: (set: GuidedLearningSet) => void;
  onCheck: (set: GuidedLearningSet) => void;
  copyLink: (setId: string, title: string) => Promise<boolean>;
  onCopyFailed: () => void;
}> = ({ set, onEdit, onCheck, copyLink, onCopyFailed }) => {
  const published = usePublishedTour(set.id);
  const live =
    published.tour && isWebTourSet(published.tour.set) ? published.tour : null;
  const publicLink = usePublicLinkControls({
    setId: set.id,
    menuCopies: true,
    published: published.loaded ? (live?.set ?? null) : undefined,
  });
  const [copy, setCopy] = useState<'idle' | 'working' | 'done'>('idle');
  const timer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    []
  );

  // Same order as the editor's Copy link: the public link while it's on, else the staff link.
  const copyNow = async () => {
    if (copy === 'working') return;
    setCopy('working');
    let ok = false;
    if (publicLink.publicUrl) {
      try {
        await navigator.clipboard.writeText(publicLink.publicUrl);
        ok = true;
      } catch (err) {
        logError('WebTourList public link copy', err, { setId: set.id });
      }
    } else {
      ok = await copyLink(set.id, set.title);
    }
    if (!ok) {
      setCopy('idle');
      onCopyFailed();
      return;
    }
    setCopy('done');
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopy('idle'), 1500);
  };

  const title = set.title.trim() || 'Untitled web tour';
  const site = webTourSite(set);
  const stepCount = set.steps.length;
  const check = checkBadge(set);

  return (
    <li
      data-testid="web-tour-row"
      className="flex flex-col gap-3 border-b border-slate-200 px-4 py-3 last:border-b-0 sm:flex-row sm:items-center"
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <Globe
          className="mt-0.5 h-5 w-5 shrink-0 text-slate-400"
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-900">
            {title}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <span className={`text-xs ${chromeMuted}`}>
              {stepCount} step{stepCount === 1 ? '' : 's'}
              {site ? ` · ${site}` : ''}
            </span>
            {published.loaded && (
              <Badge
                tone={
                  !live
                    ? 'neutral'
                    : (set.updatedAt ?? 0) > live.publishedAt
                      ? 'warn'
                      : 'success'
                }
              >
                {!live
                  ? 'Draft'
                  : (set.updatedAt ?? 0) > live.publishedAt
                    ? 'Changed since publish'
                    : 'Published'}
              </Badge>
            )}
            {publicLink.status.kind === 'on' && (
              <Badge tone="info">Public link on</Badge>
            )}
            {check && <Badge tone={check[0]}>{check[1]}</Badge>}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1 pl-8 sm:pl-0">
        <button
          type="button"
          onClick={() => onEdit(set)}
          aria-label={`Edit ${title}`}
          className={rowBtn}
          {...tourFieldAttr('web-tours.edit', 'web-tours', set.id)}
        >
          <Pencil className="h-4 w-4" aria-hidden="true" />
          Edit
        </button>
        <button
          type="button"
          onClick={() => onCheck(set)}
          aria-label={`Check ${title}`}
          title="Opens the editor to play the tour on its website and check every step"
          className={rowBtn}
          {...tourFieldAttr('web-tours.check', 'web-tours', set.id)}
        >
          <Radar className="h-4 w-4" aria-hidden="true" />
          Check tour
        </button>
        <button
          type="button"
          onClick={() => void copyNow()}
          disabled={copy === 'working'}
          aria-label={`Copy link for ${title}`}
          className={rowBtn}
          {...tourFieldAttr('web-tours.copy-link', 'web-tours', set.id)}
        >
          {copy === 'working' ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : copy === 'done' ? (
            <Check className="h-4 w-4 text-emerald-600" aria-hidden="true" />
          ) : (
            <Link2 className="h-4 w-4" aria-hidden="true" />
          )}
          {copy === 'done' ? 'Link copied' : 'Copy link'}
        </button>
      </div>
    </li>
  );
};

const byNewest = (a: GuidedLearningSet, b: GuidedLearningSet) =>
  (b.updatedAt ?? 0) - (a.updatedAt ?? 0) || a.title.localeCompare(b.title);

/** The building's web tour drafts, newest first, with their publish and check state. */
export const WebTourList: React.FC<{
  tours: readonly GuidedLearningSet[];
  onEdit: (set: GuidedLearningSet) => void;
  onCheck: (set: GuidedLearningSet) => void;
  onCopyFailed: () => void;
}> = ({ tours, onEdit, onCheck, onCopyFailed }) => {
  const copyLink = useCopyWebTourLink();
  if (tours.length === 0)
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center">
        <p className="text-sm font-semibold text-slate-900">No web tours yet</p>
        <p className={`mt-1 text-sm ${chromeMuted}`}>
          Select New web tour to record one.
        </p>
      </div>
    );
  return (
    <ul className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      {[...tours].sort(byNewest).map((set) => (
        <WebTourRow
          key={set.id}
          set={set}
          onEdit={onEdit}
          onCheck={onCheck}
          copyLink={copyLink}
          onCopyFailed={onCopyFailed}
        />
      ))}
    </ul>
  );
};
