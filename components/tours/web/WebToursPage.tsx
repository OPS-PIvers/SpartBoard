import React, {
  lazy,
  Suspense,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  CheckCircle2,
  AlertCircle,
  Loader2,
  Plus,
  Search,
  Settings,
  Users,
} from 'lucide-react';
import type { GuidedLearningSet } from '@/types';
import { tourAttr } from '@/config/tourAnchors';
import { focusRing, headerBar } from '@/components/common/lightChrome';
import {
  createWebTourDraft,
  loadWebTourDraft,
  saveWebTourDraft,
  watchWebTourDrafts,
} from '@/components/tours/webTours';
import { logError } from '@/utils/logError';
import { EDIT_WEB_TOUR_PARAM } from './tourLinks';
import { WebTourList, type Notice, type RowFacts } from './WebTourList';
import { webTourSite } from './tourLinks';
import { webToursDevSeed } from './webToursDevSeed';
import { useCanFreshservice } from './freshservice';
import { AuthContext } from '@/context/AuthContextValue';

const TourAuthorsDialog = lazy(() =>
  import('./TourAuthorsDialog').then((m) => ({
    default: m.TourAuthorsDialog,
  }))
);
const FreshserviceSettings = lazy(() =>
  import('./FreshserviceSettings').then((m) => ({
    default: m.FreshserviceSettings,
  }))
);

type Filter = 'all' | 'issues' | 'published' | 'changed' | 'draft' | 'public';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All tours' },
  { value: 'issues', label: 'Needs fixes' },
  { value: 'published', label: 'Published' },
  { value: 'changed', label: 'Changed since publish' },
  { value: 'draft', label: 'Drafts' },
  { value: 'public', label: 'Public link on' },
];

const matchesFilter = (filter: Filter, facts: RowFacts | undefined) => {
  if (filter === 'all') return true;
  if (!facts) return false;
  if (filter === 'issues') return facts.status === 'issues';
  if (filter === 'public') return facts.publicOn;
  return facts.publish === filter;
};

const WebTourEditor = lazy(() =>
  import('./WebTourEditor').then((m) => ({ default: m.WebTourEditor }))
);

const SET_ID = /^[A-Za-z0-9_-]{1,128}$/;

/** The standalone Web tours page at `/web-tours` (HELP_CENTER_HOME.md H9). */
export const WebToursPage: React.FC = () => {
  const [tours, setTours] = useState<GuidedLearningSet[] | null>(
    () => webToursDevSeed()?.tours ?? null
  );
  const [open, setOpen] = useState<{
    set: GuidedLearningSet;
    stepId?: string;
  } | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [facts, setFacts] = useState<Record<string, RowFacts>>({});
  const [notice, setNotice] = useState<Notice | null>(null);
  const noticeTimer = useRef<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [listFailed, setListFailed] = useState(false);
  const canFresh = useCanFreshservice();
  const [freshOpen, setFreshOpen] = useState(false);
  const auth = useContext(AuthContext);
  const adminEmail = auth?.isAdmin ? (auth.user?.email ?? null) : null;
  const [authorsOpen, setAuthorsOpen] = useState(false);
  // Read once, so an effect run twice still knows which tour to open.
  const [linkedId] = useState(() =>
    new URL(window.location.href).searchParams.get(EDIT_WEB_TOUR_PARAM)
  );

  useEffect(() => {
    if (webToursDevSeed()) return;
    return watchWebTourDrafts(
      (sets) => {
        setListFailed(false);
        setTours(sets);
      },
      () => setListFailed(true)
    );
  }, []);

  useEffect(
    () => () => {
      if (noticeTimer.current !== null)
        window.clearTimeout(noticeTimer.current);
    },
    []
  );

  const showNotice = (n: Notice) => {
    setNotice(n);
    if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(null), 4000);
  };

  const rename = async (set: GuidedLearningSet, title: string) => {
    if (webToursDevSeed()) {
      setTours((ts) =>
        (ts ?? []).map((t) => (t.id === set.id ? { ...t, title } : t))
      );
      return true;
    }
    try {
      // The stored draft, so an edit saved since the list loaded isn't overwritten; offline, the list copy.
      const fresh = await loadWebTourDraft(set.id).catch(() => set);
      if (!fresh) return true;
      await saveWebTourDraft({ ...fresh, title });
      return true;
    } catch (err) {
      logError('WebToursPage.rename', err, { setId: set.id });
      showNotice({ tone: 'error', text: "The name couldn't be saved." });
      return false;
    }
  };

  const reportFacts = (setId: string, next: RowFacts) =>
    setFacts((cur) => {
      const was = cur[setId];
      return was &&
        was.publish === next.publish &&
        was.status === next.status &&
        was.publicOn === next.publicOn
        ? cur
        : { ...cur, [setId]: next };
    });

  const q = query.trim().toLowerCase();
  const hiddenIds = new Set(
    (tours ?? [])
      .filter(
        (t) =>
          (q &&
            !`${t.title.trim() || 'Untitled web tour'} ${webTourSite(t) ?? ''}`
              .toLowerCase()
              .includes(q)) ||
          !matchesFilter(filter, facts[t.id])
      )
      .map((t) => t.id)
  );
  const shown = (tours?.length ?? 0) - hiddenIds.size;

  useEffect(() => {
    if (!linkedId) return;
    // Taken off the address so a reload doesn't reopen it.
    const url = new URL(window.location.href);
    url.searchParams.delete(EDIT_WEB_TOUR_PARAM);
    window.history.replaceState(window.history.state, '', url.toString());
    if (!SET_ID.test(linkedId)) return;
    let cancelled = false;
    loadWebTourDraft(linkedId).then(
      (set) => {
        if (cancelled) return;
        if (set) setOpen({ set });
        else setMessage("That web tour wasn't found.");
      },
      (err: unknown) => {
        logError('open web tour from link', err, { setId: linkedId });
        if (!cancelled) setMessage("That web tour couldn't be opened.");
      }
    );
    return () => {
      cancelled = true;
    };
  }, [linkedId]);

  const create = async () => {
    setCreating(true);
    setMessage(null);
    try {
      setOpen({ set: await createWebTourDraft() });
    } catch (err) {
      logError('WebToursPage.create', err);
      setMessage('The web tour could not be created.');
    } finally {
      setCreating(false);
    }
  };

  const edit = (set: GuidedLearningSet, stepId?: string) => {
    setMessage(null);
    setOpen({ set, stepId });
  };

  return (
    <main className="h-screen [height:100dvh] overflow-y-auto bg-slate-50 pb-16">
      <header className={headerBar}>
        <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <h1 className="shrink-0 text-lg font-bold">Web tours</h1>
          <div className="flex items-center gap-2">
            {adminEmail && (
              <button
                type="button"
                onClick={() => setAuthorsOpen(true)}
                className={`inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold text-white ring-1 ring-inset ring-white/40 hover:bg-white/10 ${focusRing}`}
                {...tourAttr('web-tours.authors')}
              >
                <Users className="h-4 w-4" aria-hidden="true" />
                <span className="sr-only sm:not-sr-only">Authors</span>
              </button>
            )}
            {canFresh && (
              <button
                type="button"
                onClick={() => setFreshOpen(true)}
                className={`inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold text-white ring-1 ring-inset ring-white/40 hover:bg-white/10 ${focusRing}`}
                {...tourAttr('web-tours.freshservice-settings')}
              >
                <Settings className="h-4 w-4" aria-hidden="true" />
                <span className="sr-only sm:not-sr-only">FreshService</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => void create()}
              disabled={creating}
              className={`inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-brand-blue-dark hover:bg-brand-blue-lighter disabled:opacity-60 ${focusRing}`}
              {...tourAttr('web-tours.new')}
            >
              {creating ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Plus className="h-4 w-4" aria-hidden="true" />
              )}
              New web tour
            </button>
          </div>
        </div>
      </header>
      {authorsOpen && adminEmail && (
        <Suspense fallback={null}>
          <TourAuthorsDialog
            adminEmail={adminEmail}
            onClose={() => setAuthorsOpen(false)}
          />
        </Suspense>
      )}
      {freshOpen && (
        <Suspense fallback={null}>
          <FreshserviceSettings
            onClose={() => setFreshOpen(false)}
            onSaved={() => {
              setFreshOpen(false);
              showNotice({ tone: 'success', text: 'FreshService saved.' });
            }}
          />
        </Suspense>
      )}
      <div className="mx-auto flex max-w-[1600px] flex-col gap-6 px-4 pt-6 sm:px-6">
        {message && (
          <p
            role="alert"
            className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-800"
          >
            {message}
          </p>
        )}
        {listFailed ? (
          <p
            role="alert"
            className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-800"
          >
            Web tours couldn&apos;t load.
          </p>
        ) : tours === null ? (
          <div className="flex justify-center py-10">
            <Loader2
              className="h-6 w-6 animate-spin text-slate-400"
              aria-label="Loading web tours"
            />
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {tours.length > 0 && (
              <div className="flex flex-col gap-2 sm:flex-row">
                <label className="relative min-w-0 flex-1">
                  <span className="sr-only">Search web tours</span>
                  <Search
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                    aria-hidden="true"
                  />
                  <input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search by name or website"
                    className={`min-h-10 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-500 ${focusRing}`}
                    {...tourAttr('web-tours.search')}
                  />
                </label>
                <label className="sm:w-56">
                  <span className="sr-only">Show</span>
                  <select
                    value={filter}
                    onChange={(e) => setFilter(e.target.value as Filter)}
                    className={`min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-900 ${focusRing}`}
                    {...tourAttr('web-tours.filter')}
                  >
                    {FILTERS.map((f) => (
                      <option key={f.value} value={f.value}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}
            <WebTourList
              tours={tours}
              hiddenIds={hiddenIds}
              onEdit={edit}
              onCheck={edit}
              onRename={rename}
              onNotice={showNotice}
              onFacts={reportFacts}
            />
            {tours.length > 0 && shown === 0 && (
              <p className={`py-6 text-center text-sm text-slate-600`}>
                No tours match.
              </p>
            )}
          </div>
        )}
      </div>
      {open && (
        <Suspense fallback={null}>
          <WebTourEditor
            initial={open.set}
            initialStepId={open.stepId}
            onClose={() => setOpen(null)}
          />
        </Suspense>
      )}
      {notice && (
        <div
          role={notice.tone === 'error' ? 'alert' : 'status'}
          className={`fixed bottom-6 left-1/2 z-50 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium shadow-lg ${
            notice.tone === 'error'
              ? 'border-red-200 bg-red-50 text-red-800'
              : 'border-emerald-200 bg-white text-slate-900'
          }`}
        >
          {notice.tone === 'error' ? (
            <AlertCircle
              className="h-5 w-5 shrink-0 text-red-600"
              aria-hidden="true"
            />
          ) : (
            <CheckCircle2
              className="h-5 w-5 shrink-0 text-emerald-600"
              aria-hidden="true"
            />
          )}
          {notice.text}
        </div>
      )}
    </main>
  );
};
