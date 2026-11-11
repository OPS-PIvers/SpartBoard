// The side panel's help center (docs/plans/shipped/WEB_TOURS_HELP_PANEL.md H5, H9).
import React, { useEffect, useState } from 'react';
import { ListOrdered, Play, RefreshCw, Search } from 'lucide-react';
import {
  chromeMuted,
  focusRing,
  inputLight,
  primaryBtn,
  secondaryBtn,
} from '@/components/common/lightChrome';
import {
  pageHost,
  toursForPanel,
  type ListedTour,
  type TourListReply,
  type TourStartReply,
} from '../tourList';
import { FAILURE_TEXT } from './failureText';
import { TourStepsPane } from './TourStepsPane';

const send = <T,>(msg: object): Promise<T> => chrome.runtime.sendMessage(msg);

const card = 'rounded-2xl border border-slate-200 bg-white shadow-xs';
const disabledLook = 'disabled:cursor-not-allowed disabled:opacity-50';

/** The active tab in this panel's window, kept current as the person moves between tabs and pages. */
export function useActiveTab(): chrome.tabs.Tab | null {
  const [tab, setTab] = useState<chrome.tabs.Tab | null>(null);
  useEffect(() => {
    const read = () =>
      void chrome.tabs.query({ active: true, currentWindow: true }).then(
        ([t]) => setTab(t ?? null),
        () => setTab(null)
      );
    read();
    const onUpdated = (
      _id: number,
      change: { url?: string; status?: string },
      t: chrome.tabs.Tab
    ) => {
      if (t.active && (change.url !== undefined || change.status)) read();
    };
    chrome.tabs.onActivated.addListener(read);
    chrome.tabs.onUpdated.addListener(onUpdated);
    return () => {
      chrome.tabs.onActivated.removeListener(read);
      chrome.tabs.onUpdated.removeListener(onUpdated);
    };
  }, []);
  return tab;
}

const TourRow: React.FC<{
  tour: ListedTour;
  showHost: boolean;
  busy: boolean;
  disabled: boolean;
  onStart: () => void;
  onView: () => void;
}> = ({ tour, showHost, busy, disabled, onStart, onView }) => (
  <li className={`flex flex-col gap-3 p-3 ${card}`}>
    <span className="min-w-0">
      <span className="block font-semibold wrap-anywhere">
        {tour.title || 'Untitled tour'}
      </span>
      <span className={`block truncate text-xs ${chromeMuted}`}>
        {showHost ? `${tour.host} · ` : ''}
        {tour.steps === 1 ? '1 step' : `${tour.steps} steps`}
      </span>
    </span>
    <span className="flex flex-wrap gap-2">
      <button
        type="button"
        className={`${primaryBtn} inline-flex items-center gap-1.5 ${disabledLook}`}
        disabled={disabled}
        aria-label={`Start ${tour.title || 'Untitled tour'}`}
        onClick={onStart}
      >
        <Play className="h-4 w-4 fill-current" aria-hidden="true" />
        {busy ? 'Starting...' : 'Start'}
      </button>
      <button
        type="button"
        className={`${secondaryBtn} inline-flex items-center gap-1.5 border border-slate-200`}
        aria-label={`View steps of ${tour.title || 'Untitled tour'}`}
        onClick={onView}
      >
        <ListOrdered className="h-4 w-4" aria-hidden="true" />
        View steps
      </button>
    </span>
  </li>
);

export const ToursTab: React.FC<{
  reply: TourListReply | null;
  onRetry: () => void;
  /** The tour whose steps are open; kept by the shell so it survives tab changes. */
  viewing: string | null;
  onView: (setId: string | null) => void;
}> = ({ reply, onRetry, viewing, onView }) => {
  const tab = useActiveTab();
  const [query, setQuery] = useState('');
  const [starting, setStarting] = useState<string | null>(null);
  const [error, setError] = useState('');

  if (!reply) {
    return (
      <p className={chromeMuted} aria-live="polite">
        Loading tours...
      </p>
    );
  }
  if (!reply.ok) {
    return (
      <div className="flex flex-col items-start gap-2">
        <p className="text-slate-700">{FAILURE_TEXT[reply.why]}</p>
        {reply.why === 'offline' && (
          <button
            type="button"
            className={`${secondaryBtn} inline-flex items-center gap-1.5`}
            onClick={onRetry}
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Try again
          </button>
        )}
      </div>
    );
  }

  const host = pageHost(tab?.url);
  const { here, others } = toursForPanel(reply.list.tours, host, query);

  const start = async (setId: string) => {
    setStarting(setId);
    setError('');
    try {
      const out = await send<TourStartReply>({
        type: 'tours/start',
        setId,
        tabId: tab?.id ?? null,
      });
      if (!out.ok) setError(FAILURE_TEXT[out.why]);
    } catch {
      setError(FAILURE_TEXT.offline);
    } finally {
      setStarting(null);
    }
  };

  const viewed = viewing
    ? reply.list.tours.find((t) => t.id === viewing)
    : undefined;
  if (viewed) {
    return (
      <div className="flex flex-col gap-3">
        {error && (
          <p role="alert" className="text-brand-red-primary">
            {error}
          </p>
        )}
        <TourStepsPane
          tour={viewed}
          onBack={() => onView(null)}
          onStart={() => void start(viewed.id)}
          starting={starting === viewed.id}
          disabled={starting !== null}
          admin={reply.list.admin}
        />
      </div>
    );
  }

  const rows = (list: ListedTour[], showHost: boolean) => (
    <ul className="flex flex-col gap-2">
      {list.map((t) => (
        <TourRow
          key={t.id}
          tour={t}
          showHost={showHost}
          busy={starting === t.id}
          disabled={starting !== null}
          onStart={() => void start(t.id)}
          onView={() => onView(t.id)}
        />
      ))}
    </ul>
  );

  return (
    <div className="flex flex-col gap-4">
      <label className="relative block">
        <span className="sr-only">Search tours</span>
        <Search
          className={`pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 ${chromeMuted}`}
          aria-hidden="true"
        />
        <input
          type="search"
          className={`${inputLight} w-full pl-8 ${focusRing}`}
          placeholder="Search all tours"
          value={query}
          maxLength={100}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      {error && (
        <p role="alert" className="text-brand-red-primary">
          {error}
        </p>
      )}
      <section className="flex flex-col gap-2" aria-labelledby="tours-here">
        <h2 id="tours-here" className="text-sm font-semibold">
          {host ? `Tours for ${host}` : 'Tours for this page'}
        </h2>
        {here.length > 0 ? (
          rows(here, false)
        ) : (
          <p className={chromeMuted}>
            {query
              ? 'No tours for this site match your search.'
              : 'No tours for this site yet.'}
          </p>
        )}
      </section>
      {others.length > 0 && (
        <section className="flex flex-col gap-2" aria-labelledby="tours-other">
          <h2 id="tours-other" className="text-sm font-semibold">
            Other sites
          </h2>
          {rows(others, true)}
        </section>
      )}
    </div>
  );
};
