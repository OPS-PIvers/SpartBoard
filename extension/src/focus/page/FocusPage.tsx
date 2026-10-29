// The student's focus page (docs/plans/CHROME_EXTENSION.md F10); its wording waits on Paul's OK (G5).
import React, { useEffect, useState } from 'react';
import {
  chromeMuted,
  focusRing,
  primaryBtn,
} from '@/components/common/lightChrome';
import { FOCUS_FULLSCREEN_MESSAGE, NOTICE_TEXT } from '../pageNotice';
import { parkedOriginal } from '../enforce';
import {
  FOCUS_ENDED_KEY,
  FOCUS_STATE_KEY,
  isEnforcing,
  minutesLeft,
  siteUrl,
  type FocusLocalState,
} from '../focusState';

const siteLabel = (site: { host: string; path: string }) =>
  `${site.host}${site.path}`;

export const PARKED_TITLE = 'Paused for focus time';
export const PARKED_TEXT = 'This tab comes back when focus time ends.';

/** What the page's own address says: a parked tab (F10) or a blocked site sent here (F2). */
export function pageMode(search: string): 'parked' | 'notice' | 'plain' {
  const params = new URLSearchParams(search);
  if (params.has('parked')) return 'parked';
  return params.get('notice') === 'blocked' ? 'notice' : 'plain';
}

export const FocusView: React.FC<{
  state: FocusLocalState | null;
  now: number;
  mode?: 'parked' | 'notice' | 'plain';
  /** Lock outside fullscreen: offer the way back (F2). */
  needsFullscreen?: boolean;
  onFullscreen?: () => void;
}> = ({ state, now, mode = 'plain', needsFullscreen, onFullscreen }) => {
  if (!state || !isEnforcing(state, now)) {
    return (
      <main className="mx-auto max-w-xl px-6 py-16 text-center">
        <h1 className="text-2xl font-bold text-slate-900">
          {state?.session.released
            ? 'Your teacher released you from focus time.'
            : 'Focus time is over.'}
        </h1>
        <p className={`mt-2 ${chromeMuted}`}>You can close this tab.</p>
      </main>
    );
  }
  const { session } = state;
  const minutes = minutesLeft(state, now);
  return (
    <main className="mx-auto max-w-xl px-6 py-16">
      {needsFullscreen && session.level === 'lock' && (
        <div className="mb-8 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
          <p className="font-semibold text-slate-900">
            Focus time needs fullscreen.
          </p>
          <button type="button" onClick={onFullscreen} className={primaryBtn}>
            Return to fullscreen
          </button>
        </div>
      )}
      {mode === 'notice' && (
        <p role="status" className="mb-6 font-semibold text-slate-900">
          {NOTICE_TEXT}
        </p>
      )}
      <h1 className="text-2xl font-bold text-slate-900">
        {mode === 'parked' ? PARKED_TITLE : 'Focus time'}
      </h1>
      {mode === 'parked' && (
        <p className="mt-1 text-slate-600">{PARKED_TEXT}</p>
      )}
      <p className="mt-1 text-slate-600">
        {session.teacherName
          ? `${session.teacherName} started focus time.`
          : 'Your teacher started focus time.'}{' '}
        {minutes === 1 ? '1 minute left.' : `${minutes} minutes left.`}
      </p>
      {session.showLiveSite && (
        <p className="mt-1 text-slate-600">
          Your teacher can see which site you&apos;re on.
        </p>
      )}
      <h2 className="mt-8 font-semibold text-slate-900">Your sites</h2>
      {session.sites.length === 0 ? (
        <p className={`mt-2 ${chromeMuted}`}>
          Your teacher hasn&apos;t added any sites.
        </p>
      ) : (
        <ul className="mt-2 divide-y divide-slate-200 border-y border-slate-200">
          {session.sites.map((site) => (
            <li key={siteLabel(site)}>
              <a
                href={siteUrl(site)}
                target="_blank"
                rel="noreferrer"
                className={`block truncate px-2 py-4 text-lg font-semibold text-brand-blue-primary hover:bg-brand-blue-lighter ${focusRing}`}
              >
                {siteLabel(site)}
              </a>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
};

/** Follows the worker's session state and redraws the minutes on the device clock. */
export const FocusPage: React.FC = () => {
  // Undefined until known, so the page never flashes "over" while loading.
  const [state, setState] = useState<FocusLocalState | null | undefined>();
  const [now, setNow] = useState(() => Date.now());
  const [needsFullscreen, setNeedsFullscreen] = useState(false);
  const mode = pageMode(window.location.search);
  const over = state === null || (!!state && !isEnforcing(state, now));

  // A parked tab Chrome never loaded is invisible to the worker, so the page restores itself once focus time is over (F10).
  useEffect(() => {
    if (!over || mode !== 'parked') return;
    const here = window.location.href;
    const original = parkedOriginal(here, here.slice(0, here.indexOf('?')));
    if (!original) return;
    // A moment's wait, so Lock's rules are gone before the page leaves.
    const timer = setTimeout(() => window.location.replace(original), 2_000);
    return () => clearTimeout(timer);
  }, [over, mode]);

  useEffect(() => {
    let live = true;
    let changed = false;
    // No state and no ended marker means not checked yet (after a restart): show nothing.
    const fromStore = (s: unknown, ended: unknown) =>
      (s as FocusLocalState | undefined) ?? (ended ? null : undefined);
    const onChanged = (
      changes: Record<string, chrome.storage.StorageChange>,
      area: string
    ) => {
      if (area !== 'session' || !(FOCUS_STATE_KEY in changes)) return;
      changed = true;
      setState(fromStore(changes[FOCUS_STATE_KEY].newValue, true));
      setNow(Date.now());
    };
    chrome.storage.onChanged.addListener(onChanged);
    void chrome.storage.session
      .get([FOCUS_STATE_KEY, FOCUS_ENDED_KEY])
      .then((got) => {
        if (live && !changed)
          setState(fromStore(got[FOCUS_STATE_KEY], got[FOCUS_ENDED_KEY]));
      });
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => {
      live = false;
      chrome.storage.onChanged.removeListener(onChanged);
      clearInterval(timer);
    };
  }, []);

  // Fullscreen changes resize the page, so a resize is the cue to ask the window again.
  useEffect(() => {
    let live = true;
    const read = () =>
      void chrome.windows.getCurrent().then(
        (win) => {
          if (live)
            setNeedsFullscreen(
              win.state !== chrome.windows.WindowState.FULLSCREEN
            );
        },
        () => undefined
      );
    read();
    window.addEventListener('resize', read);
    return () => {
      live = false;
      window.removeEventListener('resize', read);
    };
  }, []);

  return (
    <div className="h-screen [height:100dvh] overflow-y-auto bg-white font-sans">
      {state !== undefined && (
        <FocusView
          state={state}
          now={now}
          mode={mode}
          needsFullscreen={needsFullscreen}
          onFullscreen={() =>
            void chrome.runtime
              .sendMessage({ type: FOCUS_FULLSCREEN_MESSAGE })
              .catch(() => undefined)
          }
        />
      )}
    </div>
  );
};
