// The side panel's Send to SpartBoard controls (IMPORT D15): send the open page, and where the edge tab shows.
import React, { useCallback, useEffect, useState } from 'react';
import { Send, Settings } from 'lucide-react';
import { Toggle } from '@/components/common/Toggle';
import {
  chromeMuted,
  iconBtn,
  primaryBtn,
} from '@/components/common/lightChrome';
import type { PanelStateReply } from '../send/messages';
import { useActiveTab } from './ToursTab';

const send = <T,>(msg: object): Promise<T> => chrome.runtime.sendMessage(msg);

const isState = (v: unknown): v is PanelStateReply =>
  typeof v === 'object' && v !== null && 'showOnPages' in v;

export interface SendPanel {
  state: PanelStateReply | null;
  problem: boolean;
  set: (change: object) => void;
  sendPage: () => void;
}

/** Send's state for the active tab, shared by the panel shell and the Send controls. */
export function useSendPanel(): SendPanel {
  const tab = useActiveTab();
  const tabId = tab?.id ?? null;
  const [state, setState] = useState<PanelStateReply | null>(null);
  // Which tab the "can't read" message is about, so it clears on another tab.
  const [problemTab, setProblemTab] = useState<number | null>(null);

  const load = useCallback(() => {
    void send<unknown>({ type: 'send/panel', action: 'state', tabId }).then(
      (r) => setState(isState(r) ? r : null),
      () => setState(null)
    );
  }, [tabId]);

  // The tab's address is part of the key, so moving to another site asks again.
  useEffect(load, [load, tab?.url]);

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

  return {
    state,
    problem: problemTab !== null && problemTab === tabId,
    set,
    sendPage,
  };
}

const row = 'flex min-h-[3rem] items-center justify-between gap-3 py-2';

const SendButton: React.FC<{ panel: SendPanel; className?: string }> = ({
  panel,
  className = '',
}) => (
  <button
    type="button"
    className={`${primaryBtn} inline-flex min-h-[2.5rem] items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    disabled={panel.state?.host === null}
    onClick={panel.sendPage}
  >
    <Send className="h-4 w-4" aria-hidden="true" />
    Send this page to SpartBoard
  </button>
);

const Problem: React.FC<{ panel: SendPanel }> = ({ panel }) =>
  panel.problem ? (
    <p className="text-xs text-brand-red-primary">
      SpartBoard can&apos;t read this page.
    </p>
  ) : null;

/** Where the Send button shows, as hairline rows. */
const SendSettings: React.FC<{
  state: PanelStateReply;
  set: SendPanel['set'];
}> = ({ state, set }) => (
  <div className="flex flex-col divide-y divide-slate-200 border-y border-slate-200">
    <div className={row}>
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
      <div className={row}>
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
      <p className={`py-3 text-xs ${chromeMuted}`}>
        Your district turned off sending from this page.
      </p>
    )}
  </div>
);

/** A bar pinned to the bottom of the Tours tab, settings behind the gear. */
export const SendBar: React.FC<{ panel: SendPanel }> = ({ panel }) => {
  const [open, setOpen] = useState(false);
  if (!panel.state?.enabled) return null;
  return (
    <section
      aria-label="Send to SpartBoard"
      className="sticky bottom-0 flex flex-col gap-2 border-t border-slate-200 bg-white px-4 pb-4 pt-3"
    >
      {open && (
        <div id="send-settings" className="pb-1">
          <h2 className="pb-1 text-sm font-semibold">Send settings</h2>
          <SendSettings state={panel.state} set={panel.set} />
        </div>
      )}
      <Problem panel={panel} />
      <div className="flex items-center gap-2">
        <SendButton panel={panel} className="flex-1" />
        <button
          type="button"
          className={`${iconBtn} border border-slate-200 p-2 ${open ? 'bg-slate-100 text-slate-900' : ''}`}
          aria-label="Send settings"
          title="Send settings"
          aria-expanded={open}
          aria-controls="send-settings"
          onClick={() => setOpen((o) => !o)}
        >
          <Settings className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
    </section>
  );
};
