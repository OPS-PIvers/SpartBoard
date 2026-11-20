import React, { useEffect, useId, useRef, useState } from 'react';
import {
  ChevronDown,
  Globe,
  Loader2,
  Pencil,
  Play,
  Radar,
  Share2,
  Wrench,
} from 'lucide-react';
import type { GuidedLearningSet } from '@/types';
import { tourFieldAttr } from '@/config/tourAnchors';
import { chromeMuted, focusRing } from '@/components/common/lightChrome';
import { usePublishedTour } from '@/components/tours/publishedTours';
import type { PublishedTour } from '@/components/tours/tourSnapshot';
import { usePublicLinkControls } from '@/components/tours/publicLink/usePublicLinkControls';
import { isWebTourSet } from '@/components/widgets/GuidedLearning/utils/liveTour';
import { logError } from '@/utils/logError';
import { buildTourUrl, webTourSite } from './tourLinks';
import { useCopyWebTourLink } from './useCopyWebTourLink';
import { countsText, useTourCounts, type TourCounts } from './useTourCounts';
import { webToursDevSeed } from './webToursDevSeed';
import {
  stepStatusRows,
  tourStatus,
  useWebTourField,
  type StepStatusRow,
  type TourStatus,
} from './webTourStatus';

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

export type PublishState = 'draft' | 'changed' | 'published';

/** What the page's search and filter read about each row. */
export interface RowFacts {
  publish: PublishState | null;
  status: TourStatus;
  publicOn: boolean;
}

export type Notice = { text: string; tone: 'success' | 'error' };

const stepName = (row: StepStatusRow) =>
  `${row.index + 1}. ${row.label || 'Untitled step'}`;

/** The tour's title as a button that turns into a text field; Enter or leaving saves, Escape cancels. */
const TitleField: React.FC<{
  setId: string;
  title: string;
  onRename: (title: string) => Promise<boolean>;
}> = ({ setId, title, onRename }) => {
  const [editing, setEditing] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const done = useRef(false);

  const save = async () => {
    if (editing === null || done.current) return;
    done.current = true;
    const next = editing.trim();
    if (!next || next === title) {
      setEditing(null);
      return;
    }
    setSaving(true);
    const ok = await onRename(next);
    setSaving(false);
    setEditing(ok ? null : editing);
    if (!ok) done.current = false;
  };

  if (editing !== null)
    return (
      <div className="flex min-w-0 items-center gap-2">
        <input
          autoFocus
          value={editing}
          disabled={saving}
          maxLength={200}
          onChange={(e) => setEditing(e.target.value)}
          onFocus={(e) => e.target.select()}
          onBlur={() => void save()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void save();
            if (e.key === 'Escape') {
              done.current = true;
              setEditing(null);
            }
          }}
          aria-label="Tour name"
          className={`min-h-8 w-full min-w-0 rounded-md border border-brand-blue-primary bg-white px-2 text-sm font-semibold text-slate-900 ${focusRing}`}
          {...tourFieldAttr('web-tours.title', 'web-tours', setId)}
        />
        {saving && (
          <Loader2
            className="h-4 w-4 shrink-0 animate-spin text-slate-400"
            aria-label="Saving"
          />
        )}
      </div>
    );
  return (
    <button
      type="button"
      onClick={() => {
        done.current = false;
        setEditing(title);
      }}
      title="Rename"
      aria-label={`Rename ${title}`}
      className={`group inline-flex max-w-full items-center gap-1.5 rounded-md px-1 text-left text-sm font-semibold text-slate-900 hover:bg-slate-100 ${focusRing}`}
      {...tourFieldAttr('web-tours.title', 'web-tours', setId)}
    >
      <span className="min-w-0 break-words">{title}</span>
      <Pencil
        className="h-3.5 w-3.5 shrink-0 text-slate-400 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 touch:opacity-100"
        aria-hidden="true"
      />
    </button>
  );
};

/** Share menu: Tour URL copies the staff link; Steps URL copies the public steps page, turning it on first. */
const ShareMenu: React.FC<{
  set: GuidedLearningSet;
  title: string;
  live: boolean;
  publicLink: ReturnType<typeof usePublicLinkControls>;
  copyLink: (setId: string, title: string) => Promise<boolean>;
  onNotice: (n: Notice) => void;
}> = ({ set, title, live, publicLink, copyLink, onNotice }) => {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const menuId = useId();
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (
        e instanceof KeyboardEvent
          ? e.key === 'Escape'
          : !box.current?.contains(e.target as Node)
      )
        setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  const copyText = async (text: string): Promise<boolean> => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      logError('WebTourList share copy', err, { setId: set.id });
      return false;
    }
  };

  const tourUrl = async () => {
    setOpen(false);
    setBusy(true);
    const ok = await copyLink(set.id, set.title);
    setBusy(false);
    onNotice(
      ok
        ? {
            tone: 'success',
            text: 'Tour URL copied. Share it with someone at Orono Schools.',
          }
        : { tone: 'error', text: "The link couldn't be copied." }
    );
  };

  const stepsCopied = (ok: boolean) =>
    onNotice(
      ok
        ? {
            tone: 'success',
            text: 'Steps URL copied. Anyone with it can see the steps.',
          }
        : { tone: 'error', text: "The link couldn't be copied." }
    );

  const stepsUrl = async () => {
    setOpen(false);
    if (publicLink.publicUrl) {
      stepsCopied(await copyText(publicLink.publicUrl));
      return;
    }
    publicLink.requestOn((url) => void copyText(url).then(stepsCopied));
  };

  const stepsReason = !live
    ? 'Publish the tour first.'
    : !publicLink.publicUrl && !publicLink.canTurnOn
      ? 'Only admins can make the steps public.'
      : null;

  const item = `flex w-full flex-col items-start gap-0.5 rounded-md px-3 py-2 text-left hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 ${focusRing}`;

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={busy}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={`Share ${title}`}
        className={rowBtn}
        {...tourFieldAttr('web-tours.copy-link', 'web-tours', set.id)}
      >
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <Share2 className="h-4 w-4" aria-hidden="true" />
        )}
        Share
        <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={`Share ${title}`}
          className="absolute right-0 top-full z-20 mt-1 w-64 rounded-xl border border-slate-200 bg-white p-1 shadow-lg"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => void tourUrl()}
            className={item}
            {...tourFieldAttr('web-tours.share-tour-url', 'web-tours', set.id)}
          >
            <span className="text-sm font-semibold text-slate-900">
              Tour URL
            </span>
            <span className="text-xs text-slate-600">
              Plays the tour in Chrome.
            </span>
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => void stepsUrl()}
            disabled={!!stepsReason}
            className={item}
            {...tourFieldAttr('web-tours.share-steps-url', 'web-tours', set.id)}
          >
            <span className="text-sm font-semibold text-slate-900">
              Steps URL
            </span>
            <span className="text-xs text-slate-600">
              {stepsReason ??
                (publicLink.publicUrl
                  ? 'A public page with every step.'
                  : 'Makes the steps public first.')}
            </span>
          </button>
        </div>
      )}
      {publicLink.dialog}
    </div>
  );
};

const statusBtn = `inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${focusRing}`;

const WebTourRow: React.FC<{
  set: GuidedLearningSet;
  onEdit: (set: GuidedLearningSet, stepId?: string) => void;
  onCheck: (set: GuidedLearningSet) => void;
  onRename: (set: GuidedLearningSet, title: string) => Promise<boolean>;
  copyLink: (setId: string, title: string) => Promise<boolean>;
  onNotice: (n: Notice) => void;
  onFacts: (setId: string, facts: RowFacts) => void;
  hidden: boolean;
}> = ({
  set,
  onEdit,
  onCheck,
  onRename,
  copyLink,
  onNotice,
  onFacts,
  hidden,
}) => {
  const seed = webToursDevSeed();
  const watched = usePublishedTour(set.id);
  const published: { loaded: boolean; tour: PublishedTour | null } = seed
    ? { loaded: true, tour: seed.published[set.id] ?? null }
    : watched;
  const live =
    published.tour && isWebTourSet(published.tour.set) ? published.tour : null;
  const publicLink = usePublicLinkControls({
    setId: set.id,
    menuCopies: true,
    published: published.loaded ? (live?.set ?? null) : undefined,
  });
  const watchedCounts = useTourCounts(set.id, !!live && !seed);
  const counts: TourCounts | null = seed
    ? live
      ? (seed.counts[set.id] ?? null)
      : null
    : watchedCounts;
  const field = useWebTourField(set.id, live?.publishedAt ?? null);
  const rows = stepStatusRows(set, field);
  const status = tourStatus(set, rows);
  const problems = rows.filter((r) => r.problem);

  const publish: PublishState | null = !published.loaded
    ? null
    : !live
      ? 'draft'
      : (set.updatedAt ?? 0) > live.publishedAt
        ? 'changed'
        : 'published';
  const publicOn = publicLink.status.kind === 'on';
  const report = React.useEffectEvent(() =>
    onFacts(set.id, { publish, status, publicOn })
  );
  useEffect(() => report(), [publish, status, publicOn]);

  const title = set.title.trim() || 'Untitled web tour';
  const site = webTourSite(set);
  const stepCount = set.steps.length;

  const statusControl =
    status === 'passed' ? (
      <Badge tone="success">Check passed</Badge>
    ) : status === 'issues' ? (
      <button
        type="button"
        onClick={() => onEdit(set, problems[0]?.stepId)}
        title={problems.map(stepName).join('\n')}
        className={`${statusBtn} bg-amber-100 text-amber-900 hover:bg-amber-200`}
        {...tourFieldAttr('web-tours.status', 'web-tours', set.id)}
      >
        <Wrench className="h-3.5 w-3.5" aria-hidden="true" />
        Fix issues
      </button>
    ) : null;

  return (
    <li
      data-testid="web-tour-row"
      hidden={hidden}
      className="flex flex-col gap-3 border-b border-slate-200 px-4 py-3 last:border-b-0 sm:flex-row sm:items-center"
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <Globe
          className="mt-1 h-5 w-5 shrink-0 text-slate-400"
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 sm:flex-nowrap">
            <div className="-ml-1 min-w-0 shrink">
              <TitleField
                setId={set.id}
                title={title}
                onRename={(next) => onRename(set, next)}
              />
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              {publish && (
                <Badge tone={publish === 'draft' ? 'neutral' : 'success'}>
                  {publish === 'draft' ? 'Draft' : 'Published'}
                </Badge>
              )}
              {publicOn && <Badge tone="info">Public link on</Badge>}
              {statusControl}
            </div>
          </div>
          <p className={`mt-0.5 text-xs ${chromeMuted}`}>
            {stepCount} step{stepCount === 1 ? '' : 's'}
            {site ? ` · ${site}` : ''}
            {counts && (
              <span
                data-testid="web-tour-counts"
                title="Views count each time someone starts the tour in the Chrome extension. Link-only views count opens of the public link page."
              >
                {` · ${countsText(counts, publicOn)}`}
              </span>
            )}
          </p>
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
          aria-label={
            publish === 'changed'
              ? `Check ${title}, changed since publish`
              : `Check ${title}`
          }
          title={
            publish === 'changed'
              ? 'You changed this tour after publishing. Check it, then publish again.'
              : 'Opens the editor to play the tour on its website and check every step'
          }
          data-changed={publish === 'changed' || undefined}
          className={
            publish === 'changed'
              ? `${rowBtn} bg-amber-50 text-amber-900 ring-1 ring-inset ring-amber-300 hover:bg-amber-100`
              : rowBtn
          }
          {...tourFieldAttr('web-tours.check', 'web-tours', set.id)}
        >
          <Radar className="h-4 w-4" aria-hidden="true" />
          Check tour
        </button>
        <button
          type="button"
          onClick={() =>
            window.open(buildTourUrl(set.id), '_blank', 'noopener,noreferrer')
          }
          disabled={!live}
          aria-label={`Play ${title}`}
          title={live ? undefined : 'Publish the tour to play it'}
          className={rowBtn}
          {...tourFieldAttr('web-tours.play', 'web-tours', set.id)}
        >
          <Play className="h-4 w-4" aria-hidden="true" />
          Play
        </button>
        <ShareMenu
          set={set}
          title={title}
          live={!!live}
          publicLink={publicLink}
          copyLink={copyLink}
          onNotice={onNotice}
        />
      </div>
    </li>
  );
};

const byNewest = (a: GuidedLearningSet, b: GuidedLearningSet) =>
  (b.updatedAt ?? 0) - (a.updatedAt ?? 0) || a.title.localeCompare(b.title);

/** The building's web tour drafts, newest first, with their publish and check state. */
export const WebTourList: React.FC<{
  tours: readonly GuidedLearningSet[];
  /** Ids to hide; rows stay mounted so their facts keep reporting. */
  hiddenIds?: ReadonlySet<string>;
  onEdit: (set: GuidedLearningSet, stepId?: string) => void;
  onCheck: (set: GuidedLearningSet) => void;
  onRename: (set: GuidedLearningSet, title: string) => Promise<boolean>;
  onNotice: (n: Notice) => void;
  onFacts?: (setId: string, facts: RowFacts) => void;
}> = ({
  tours,
  hiddenIds,
  onEdit,
  onCheck,
  onRename,
  onNotice,
  onFacts = () => undefined,
}) => {
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
    <ul className="rounded-xl border border-slate-200 bg-white">
      {[...tours].sort(byNewest).map((set) => (
        <WebTourRow
          key={set.id}
          set={set}
          hidden={!!hiddenIds?.has(set.id)}
          onEdit={onEdit}
          onCheck={onCheck}
          onRename={onRename}
          copyLink={copyLink}
          onNotice={onNotice}
          onFacts={onFacts}
        />
      ))}
    </ul>
  );
};
