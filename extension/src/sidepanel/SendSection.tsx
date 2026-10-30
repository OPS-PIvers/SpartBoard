// The side panel's Send to SpartBoard section (IMPORT D15): send the open page, and where the edge tab shows.
import React, { useCallback, useEffect, useState } from 'react';
import { Send } from 'lucide-react';
import { Toggle } from '@/components/common/Toggle';
import { chromeMuted, primaryBtn } from '@/components/common/lightChrome';
import type { PanelStateReply } from '../send/messages';
import { useActiveTab } from './ToursTab';

const send = <T,>(msg: object): Promise<T> => chrome.runtime.sendMessage(msg);

const isState = (v: unknown): v is PanelStateReply =>
  typeof v === 'object' && v !== null && 'showOnPages' in v;

export const SendSection: React.FC = () => {
  const tab = useActiveTab();
  const tabId = tab?.id ?? null;
  const [state, setState] = useState<PanelStateReply | null>(null);
  // Which tab the "can't read" message is about, so it clears on another tab.
  const [problemTab, setProblemTab] = useState<number | null>(null);
  const problem = problemTab !== null && problemTab === tabId;

  const load = useCallback(() => {
    void send<unknown>({ type: 'send/panel', action: 'state', tabId }).then(
      (r) => setState(isState(r) ? r : null),
      () => setState(null)
    );
  }, [tabId]);

  // The tab's address is part of the key, so moving to another site asks again.
  useEffect(load, [load, tab?.url]);

  if (!state?.enabled) return null;

  const set = (change: object) => {
    void send({ type: 'send/panel', action: 'set', tabId, ...change }).then(
      load
    );
  };

  const sendPage = () => {
    if (tabId === null) return;
    setProblemTab(null);
    void send<{ ok: boolean }>({
      type: 'send/panel',
      action: 'send',
      tabId,
    }).then(
      (r) => setProblemTab(r?.ok ? null : tabId),
      () => setProblemTab(tabId)
    );
  };

  return (
    <section
      aria-label="Send to SpartBoard"
      className="flex flex-col gap-3 border-b border-slate-200 px-4 pb-4 pt-4"
    >
      <button
        type="button"
        className={`${primaryBtn} inline-flex min-h-[2.5rem] items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-50`}
        disabled={state.host === null}
        onClick={sendPage}
      >
        <Send className="h-4 w-4" aria-hidden="true" />
        Send this page to SpartBoard
      </button>
      {problem && (
        <p className="text-xs text-brand-red-primary">
          SpartBoard can&apos;t read this page.
        </p>
      )}
      <div className="flex items-center justify-between gap-3">
        <span>Show Send button on pages</span>
        <Toggle
          size="sm"
          showLabels={false}
          checked={state.showOnPages}
          label="Show Send button on pages"
          onChange={(on) => set({ showOnPages: on })}
        />
      </div>
      {state.host && state.showOnPages && !state.blocked && (
        <div className="flex items-center justify-between gap-3">
          <span className="min-w-0">
            Hide on this site
            <span className={`block truncate text-xs ${chromeMuted}`}>
              {state.host}
            </span>
          </span>
          <Toggle
            size="sm"
            showLabels={false}
            checked={state.hiddenHere}
            label={`Hide on ${state.host}`}
            onChange={(hidden) => set({ host: state.host, hidden })}
          />
        </div>
      )}
      {state.blocked && (
        <p className={`text-xs ${chromeMuted}`}>
          Your district turned off sending from this page.
        </p>
      )}
    </section>
  );
};
