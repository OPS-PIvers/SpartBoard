// The student's focus page (docs/plans/CHROME_EXTENSION.md F10); its wording waits on Paul's OK (G5).
import React, { useEffect, useState } from 'react';
import { chromeMuted, focusRing } from '@/components/common/lightChrome';
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

export const FocusView: React.FC<{
  state: FocusLocalState | null;
  now: number;
}> = ({ state, now }) => {
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
      <h1 className="text-2xl font-bold text-slate-900">Focus time</h1>
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

  return (
    <div className="h-screen [height:100dvh] overflow-y-auto bg-white font-sans">
      {state !== undefined && <FocusView state={state} now={now} />}
    </div>
  );
};
