import React, {
  Suspense,
  lazy,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import {
  Check,
  ChevronDown,
  Globe,
  Loader2,
  Pencil,
  Play,
  Radar,
  Share2,
  Trash2,
  Wrench,
  Upload,
} from 'lucide-react';
import type { GuidedLearningSet } from '@/types';
import { useDialog } from '@/context/useDialog';
import { deleteWebTourDraft } from '@/components/tours/webTours';
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
import { useStepsLabels } from '@/components/tours/steps/useStepsLabels';
import {
  downloadHtml,
  stepsFileName,
  webTourStepsHtml,
} from './stepsHtmlExport';
import { useCanFreshservice } from './freshservice';
import { useTourAuthor } from './useTourAuthor';
import {
  FRESH_LABEL,
  freshStateOf,
  type FreshArticle,
  type FreshState,
} from './freshserviceArticles';
import { AuthContext } from '@/context/AuthContextValue';
import {
  stepStatusRows,
  tourStatus,
  useWebTourField,
  type StepStatusRow,
  type TourStatus,
} from './webTourStatus';

const rowBtnBase = `inline-flex min-h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 text-sm font-semibold disabled:opacity-50 ${focusRing}`;
const rowBtn = `${rowBtnBase} text-brand-blue-primary hover:bg-brand-blue-lighter`;

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

// The list is one grid and each row a subgrid, so columns size to their content and still line up.
// Website and Author get their own columns from xl up; below that they sit under the title.
const LIST_GRID =
  'lg:grid lg:gap-x-6 lg:grid-cols-[minmax(12rem,1fr)_repeat(2,auto)] 2xl:grid-cols-[minmax(12rem,1fr)_repeat(4,auto)]';
const LIST_GRID_FRESH =
  'lg:grid lg:gap-x-6 lg:grid-cols-[minmax(12rem,1fr)_repeat(3,auto)] 2xl:grid-cols-[minmax(12rem,1fr)_repeat(5,auto)]';
const ROW_GRID =
  'lg:col-span-full lg:grid lg:grid-cols-subgrid lg:gap-x-[normal]';

/** What the page's search and filter read about each row. */
export interface RowFacts {
  publish: PublishState | null;
  status: TourStatus;
  publicOn: boolean;
  fresh: FreshState;
}

export type Notice = { text: string; tone: 'success' | 'error' };

const FreshserviceSendDialog = lazy(() =>
  import('./FreshserviceSendDialog').then((m) => ({
    default: m.FreshserviceSendDialog,
  }))
);

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

/** Share menu: Tour URL copies the staff link; Steps URL copies the public steps page, turning it on first; HTML file downloads the published steps. */
const ShareMenu: React.FC<{
  set: GuidedLearningSet;
  title: string;
  live: GuidedLearningSet | null;
  publicLink: ReturnType<typeof usePublicLinkControls>;
  copyLink: (setId: string, title: string) => Promise<boolean>;
  onNotice: (n: Notice) => void;
}> = ({ set, title, live, publicLink, copyLink, onNotice }) => {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const menuId = useId();
  const box = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  // Closing from the panel puts focus back on Share so keyboard users aren't dropped on the page.
  const closeMenu = () => {
    setOpen(false);
    trigger.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent) {
        if (e.key !== 'Escape') return;
        setOpen(false);
        trigger.current?.focus();
      } else if (!box.current?.contains(e.target as Node)) setOpen(false);
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
    closeMenu();
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
    closeMenu();
    if (publicLink.publicUrl) {
      stepsCopied(await copyText(publicLink.publicUrl));
      return;
    }
    publicLink.requestOn((url) => void copyText(url).then(stepsCopied));
  };

  const labels = useStepsLabels();
  const htmlFile = async () => {
    closeMenu();
    if (!live) return;
    setBusy(true);
    try {
      const { html, missing } = await webTourStepsHtml(
        set.id,
        live,
        (live.title ?? '').trim() || title,
        labels
      );
      downloadHtml(html, stepsFileName(title));
      onNotice(
        missing > 0
          ? {
              tone: 'error',
              text: `HTML file downloaded. ${missing} picture${missing === 1 ? '' : 's'} couldn't load.`,
            }
          : { tone: 'success', text: 'HTML file downloaded.' }
      );
    } catch (err) {
      logError('WebTourList html file', err, { setId: set.id });
      onNotice({ tone: 'error', text: "The HTML file couldn't be made." });
    } finally {
      setBusy(false);
    }
  };

  const canFresh = useCanFreshservice();
  const [freshOpen, setFreshOpen] = useState(false);
  const toFreshservice = () => {
    closeMenu();
    if (live) setFreshOpen(true);
  };

  const stepsReason = live ? null : 'Publish the tour first.';
  const stepsDisabled =
    !live || (!publicLink.publicUrl && !publicLink.canTurnOn);

  const item = `flex w-full flex-col items-start gap-0.5 rounded-md px-3 py-2 text-left hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 ${focusRing}`;

  return (
    <div ref={box} className="relative">
      <button
        ref={trigger}
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={busy}
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={`Share ${title}`}
        title="Share"
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
          role="group"
          aria-label={`Share ${title}`}
          className="absolute left-0 top-full z-20 mt-1 w-64 rounded-xl border lg:left-auto lg:right-0 border-slate-200 bg-white p-1 shadow-lg"
        >
          <button
            type="button"
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
            onClick={() => void stepsUrl()}
            disabled={stepsDisabled}
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
          <button
            type="button"
            onClick={() => void htmlFile()}
            disabled={!live}
            className={item}
            {...tourFieldAttr('web-tours.share-html-file', 'web-tours', set.id)}
          >
            <span className="text-sm font-semibold text-slate-900">
              HTML file
            </span>
            <span className="text-xs text-slate-600">
              {stepsReason ?? 'Steps and pictures for a help article.'}
            </span>
          </button>
          {canFresh && (
            <button
              type="button"
              onClick={toFreshservice}
              disabled={!live}
              className={item}
              {...tourFieldAttr(
                'web-tours.share-freshservice',
                'web-tours',
                set.id
              )}
            >
              <span className="text-sm font-semibold text-slate-900">
                FreshService
              </span>
              <span className="text-xs text-slate-600">
                {stepsReason ?? 'Sends its help article as a draft.'}
              </span>
            </button>
          )}
        </div>
      )}
      {publicLink.dialog}
      {freshOpen && live && (
        <Suspense fallback={null}>
          <FreshserviceSendDialog
            set={live}
            labels={labels}
            onClose={() => setFreshOpen(false)}
            onDone={(notice) => {
              setFreshOpen(false);
              onNotice(notice);
            }}
          />
        </Suspense>
      )}
    </div>
  );
};

const WebTourRow: React.FC<{
  set: GuidedLearningSet;
  onEdit: (set: GuidedLearningSet, stepId?: string) => void;
  onCheck: (set: GuidedLearningSet) => void;
  onRename: (set: GuidedLearningSet, title: string) => Promise<boolean>;
  copyLink: (setId: string, title: string) => Promise<boolean>;
  onNotice: (n: Notice) => void;
  onFacts: (setId: string, facts: RowFacts) => void;
  hidden: boolean;
  /** Undefined hides the FreshService column. */
  articles?: Record<string, FreshArticle>;
}> = ({
  set,
  onEdit,
  onCheck,
  onRename,
  copyLink,
  onNotice,
  onFacts,
  hidden,
  articles,
}) => {
  const seed = webToursDevSeed();
  const watched = usePublishedTour(set.id);
  const published: { loaded: boolean; tour: PublishedTour | null } = seed
    ? { loaded: true, tour: seed.published[set.id] ?? null }
    : watched;
  const live =
    published.tour && isWebTourSet(published.tour.set) ? published.tour : null;
  const access = useTourAuthor();
  const myUid = useContext(AuthContext)?.user?.uid ?? null;
  // An author deletes only a tour they made; the rule says the same.
  const canDelete = access.admin || (!!myUid && set.authorUid === myUid);
  const publicLink = usePublicLinkControls({
    setId: set.id,
    menuCopies: true,
    author: access.author,
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
  const article = articles?.[set.id];
  const fresh = freshStateOf(article, live?.publishedAt ?? null);
  const report = React.useEffectEvent(() =>
    onFacts(set.id, { publish, status, publicOn, fresh })
  );
  useEffect(() => report(), [publish, status, publicOn, fresh]);

  const title = set.title.trim() || 'Untitled web tour';
  const site = webTourSite(set);
  const stepCount = set.steps.length;

  const freshBadge = fresh !== 'none' && (
    <Badge
      tone={
        fresh === 'stale'
          ? 'warn'
          : fresh === 'published'
            ? 'success'
            : 'neutral'
      }
    >
      {FRESH_LABEL[fresh]}
    </Badge>
  );
  const freshMark =
    freshBadge && article?.url ? (
      // no-tour-anchor: opens the article in FreshService, outside SpartBoard
      <a
        href={article.url}
        target="_blank"
        rel="noreferrer"
        aria-label={`${FRESH_LABEL[fresh]} in FreshService: open the article for ${set.title.trim() || 'Untitled web tour'}`}
        title={
          fresh === 'stale'
            ? 'The tour was published after the last send. Open the article in FreshService.'
            : 'Open the article in FreshService'
        }
        className={`inline-flex rounded-full ${focusRing}`}
      >
        {freshBadge}
      </a>
    ) : (
      freshBadge
    );
  // One label says where the tour stands and is the button for its next step.
  const amber =
    'bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-300 hover:bg-amber-100';
  const check =
    status === 'issues'
      ? {
          state: 'issues',
          label: 'Fix issues',
          icon: Wrench,
          name: `Fix issues in ${title}`,
          hint: problems.map(stepName).join('\n'),
          tone: 'bg-red-50 text-red-800 ring-1 ring-inset ring-red-300 hover:bg-red-100',
          go: () => onEdit(set, problems[0]?.stepId),
          anchor: tourFieldAttr('web-tours.status', 'web-tours', set.id),
        }
      : publish === 'published'
        ? {
            state: 'published',
            label: 'Published',
            icon: Check,
            name: `${title} is published. Check it again`,
            hint: 'Published with no changes since. Opens the editor to check it again.',
            tone: 'bg-emerald-50 text-emerald-800 ring-1 ring-inset ring-emerald-300 hover:bg-emerald-100',
            go: () => onCheck(set),
            anchor: tourFieldAttr('web-tours.check', 'web-tours', set.id),
          }
        : status === 'passed'
          ? {
              state: 'ready',
              label: 'Ready to publish',
              icon: Upload,
              name: `${title} is ready to publish`,
              hint:
                publish === 'changed'
                  ? 'Your changes passed the check. Open the editor to publish them.'
                  : 'Every step passed the check. Open the editor to publish.',
              tone: 'bg-brand-blue-lighter text-brand-blue-dark ring-1 ring-inset ring-brand-blue-primary/30 hover:ring-brand-blue-primary/60',
              go: () => onCheck(set),
              anchor: tourFieldAttr('web-tours.check', 'web-tours', set.id),
            }
          : {
              state: 'check',
              label: 'Check tour',
              icon: Radar,
              name:
                publish === 'changed'
                  ? `Check ${title}, changed since publish`
                  : `Check ${title}`,
              hint:
                publish === 'changed'
                  ? 'You changed this tour after publishing. Check it, then publish again.'
                  : 'Opens the editor to play the tour on its website and check every step',
              tone: amber,
              go: () => onCheck(set),
              anchor: tourFieldAttr('web-tours.check', 'web-tours', set.id),
            };
  const CheckIcon = check.icon;
  const checkControl = (
    <button
      type="button"
      onClick={check.go}
      aria-label={check.name}
      title={check.hint}
      data-changed={publish === 'changed' || undefined}
      data-check={check.state}
      className={`inline-flex min-h-7 shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2.5 text-xs font-semibold touch-target-expand ${focusRing} ${check.tone}`}
      {...check.anchor}
    >
      <CheckIcon className="h-3.5 w-3.5" aria-hidden="true" />
      {check.label}
    </button>
  );

  const { showConfirm } = useDialog();
  const remove = async () => {
    const ok = await showConfirm(
      'This deletes the web tour, its pictures and its published copy. A FreshService article made from it stays in FreshService.',
      { title: `Delete ${title}`, variant: 'danger', confirmLabel: 'Delete' }
    );
    if (!ok) return;
    try {
      await deleteWebTourDraft(set.id);
      onNotice({ tone: 'success', text: 'Web tour deleted.' });
    } catch (err) {
      logError('WebTourList delete', err, { setId: set.id });
      onNotice({ tone: 'error', text: "The tour couldn't be deleted." });
    }
  };

  const meta = (
    <p className={`mt-0.5 text-xs ${chromeMuted}`}>
      {stepCount} step{stepCount === 1 ? '' : 's'}
      {site && <span className="2xl:hidden">{` · ${site}`}</span>}
      {set.authorName && (
        <span className="2xl:hidden">{` · by ${set.authorName}`}</span>
      )}
      {publicOn && ' · public link on'}
      {counts && (
        <span
          data-testid="web-tour-counts"
          title="Views count each time someone starts the tour in the Chrome extension. Link-only views count opens of the public link page."
        >
          {` · ${countsText(counts, publicOn)}`}
        </span>
      )}
    </p>
  );
  const name = (
    <div className="-ml-1 min-w-0">
      <TitleField
        setId={set.id}
        title={title}
        onRename={(next) => onRename(set, next)}
      />
    </div>
  );

  return (
    <li
      data-testid="web-tour-row"
      hidden={hidden}
      className={`flex flex-col gap-2 border-b border-slate-200 px-4 py-2 last:border-b-0 lg:items-center ${ROW_GRID}`}
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <Globe
          className="mt-1 h-5 w-5 shrink-0 text-slate-400"
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          {name}
          {meta}
        </div>
      </div>
      <div
        className={`hidden max-w-56 truncate text-sm 2xl:block ${chromeMuted}`}
        title={site ?? undefined}
      >
        {site}
      </div>
      <div
        className={`hidden max-w-56 truncate text-sm 2xl:block ${chromeMuted}`}
        title={set.authorName}
      >
        {set.authorName}
      </div>
      <div className="flex flex-wrap items-center gap-1.5 pl-8 lg:contents">
        <div className="lg:justify-self-center">{publish && checkControl}</div>
        {articles && (
          <div data-testid="web-tour-fresh" className="lg:justify-self-center">
            {freshMark}
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-0.5 pl-8 lg:flex-nowrap lg:justify-end lg:pl-0">
        <button
          type="button"
          onClick={() => onEdit(set)}
          aria-label={`Edit ${title}`}
          title="Edit"
          className={rowBtn}
          {...tourFieldAttr('web-tours.edit', 'web-tours', set.id)}
        >
          <Pencil className="h-4 w-4" aria-hidden="true" />
          Edit
        </button>
        <button
          type="button"
          onClick={() =>
            window.open(buildTourUrl(set.id), '_blank', 'noopener,noreferrer')
          }
          disabled={!live}
          aria-label={`Play ${title}`}
          title={live ? 'Play' : 'Publish the tour to play it'}
          className={rowBtn}
          {...tourFieldAttr('web-tours.play', 'web-tours', set.id)}
        >
          <Play className="h-4 w-4" aria-hidden="true" />
          Play
        </button>
        <ShareMenu
          set={set}
          title={title}
          live={live?.set ?? null}
          publicLink={publicLink}
          copyLink={copyLink}
          onNotice={onNotice}
        />
        {canDelete && (
          <button
            type="button"
            onClick={() => void remove()}
            aria-label={`Delete ${title}`}
            title="Delete"
            className={`${rowBtnBase} text-slate-500 hover:bg-red-50 hover:text-red-700`}
            {...tourFieldAttr('web-tours.delete', 'web-tours', set.id)}
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>
    </li>
  );
};

const byNewest = (a: GuidedLearningSet, b: GuidedLearningSet) =>
  (b.updatedAt ?? 0) - (a.updatedAt ?? 0) || a.title.localeCompare(b.title);

const byName = (a: GuidedLearningSet, b: GuidedLearningSet) =>
  a.title.localeCompare(b.title) || byNewest(a, b);

export type TourSort = 'newest' | 'name';

/** The building's web tour drafts, newest first unless sorted by name, with their publish and check state. */
export const WebTourList: React.FC<{
  tours: readonly GuidedLearningSet[];
  /** Ids to hide; rows stay mounted so their facts keep reporting. */
  hiddenIds?: ReadonlySet<string>;
  sort?: TourSort;
  onEdit: (set: GuidedLearningSet, stepId?: string) => void;
  onCheck: (set: GuidedLearningSet) => void;
  onRename: (set: GuidedLearningSet, title: string) => Promise<boolean>;
  onNotice: (n: Notice) => void;
  onFacts?: (setId: string, facts: RowFacts) => void;
  /** Each tour's FreshService article record; leave out to hide the column. */
  articles?: Record<string, FreshArticle>;
}> = ({
  tours,
  hiddenIds,
  sort = 'newest',
  articles,
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
    <ul
      className={`rounded-xl border border-slate-200 bg-white ${articles ? LIST_GRID_FRESH : LIST_GRID}`}
    >
      <li
        aria-hidden="true"
        className={`hidden border-b border-slate-200 px-4 py-2 text-xs font-semibold text-slate-500 ${ROW_GRID}`}
      >
        <span className="pl-8">Tour</span>
        <span className="hidden 2xl:block">Website</span>
        <span className="hidden 2xl:block">Author</span>
        <span className="text-center">Status</span>
        {articles && <span className="text-center">FreshService</span>}
        <span />
      </li>
      {[...tours].sort(sort === 'name' ? byName : byNewest).map((set) => (
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
          articles={articles}
        />
      ))}
    </ul>
  );
};
