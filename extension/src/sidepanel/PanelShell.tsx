// The side panel's tabs: Tours for every staff profile, Record for admins (docs/plans/shipped/WEB_TOURS_HELP_PANEL.md H5).
import React, { useCallback, useEffect, useState } from 'react';
import { focusRing } from '@/components/common/lightChrome';
import type { TourListReply } from '../tourList';
import { isRecorderInternal, type RecorderStatus } from '../recorder/messages';
import { SidePanel } from './SidePanel';
import { ToursTab } from './ToursTab';

type PanelTab = 'tours' | 'record';

const send = <T,>(msg: object): Promise<T> => chrome.runtime.sendMessage(msg);

/** A recording or a fix SpartBoard asked for needs the Record tab, whoever is signed in. */
const recorderBusy = (s: RecorderStatus) =>
  s.recordingTabId !== null || s.pick !== null;

export const PanelShell: React.FC = () => {
  const [reply, setReply] = useState<TourListReply | null>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<PanelTab>('tours');

  const loadList = useCallback((refresh: boolean) => {
    void send<TourListReply>({ type: 'tours/list', refresh }).then(
      (r) => setReply(r ?? { ok: false, why: 'offline' }),
      () => setReply({ ok: false, why: 'offline' })
    );
  }, []);

  useEffect(() => {
    // The cached list shows at once; opening the panel also refreshes it (H6).
    void send<TourListReply>({ type: 'tours/list', refresh: false }).then(
      (r) => {
        if (r?.ok) setReply(r);
        loadList(true);
      },
      () => loadList(true)
    );
    const check = () =>
      void send<RecorderStatus>({ type: 'rec/status' }).then((s) => {
        if (!s || !recorderBusy(s)) return;
        setBusy(true);
        setTab('record');
      });
    check();
    const onMessage = (msg: unknown, sender: chrome.runtime.MessageSender) => {
      if (sender.id !== chrome.runtime.id || sender.tab) return;
      if (isRecorderInternal(msg, 'rec/changed')) check();
    };
    chrome.runtime.onMessage.addListener(onMessage);
    return () => chrome.runtime.onMessage.removeListener(onMessage);
  }, [loadList]);

  const showRecord = busy || (reply?.ok === true && reply.list.admin);
  const current: PanelTab = showRecord ? tab : 'tours';

  const tabButton = (id: PanelTab, label: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={current === id}
      className={`flex-1 rounded-md px-3 py-1.5 text-sm font-semibold ${focusRing} ${
        current === id
          ? 'bg-white text-slate-900 shadow-sm'
          : 'text-slate-600 hover:text-slate-900'
      }`}
      onClick={() => setTab(id)}
    >
      {label}
    </button>
  );

  return (
    <main className="flex min-h-screen flex-col bg-slate-50 font-sans text-sm text-slate-900 antialiased">
      {showRecord && (
        <div
          role="tablist"
          aria-label="Side panel"
          className="mx-4 mt-4 flex gap-1 rounded-lg bg-slate-200/70 p-1"
        >
          {tabButton('tours', 'Tours')}
          {tabButton('record', 'Record')}
        </div>
      )}
      {current === 'tours' && (
        <div className="flex flex-1 flex-col gap-3 p-4">
          <h1 className="text-base font-semibold">Tours</h1>
          <ToursTab
            reply={reply}
            onRetry={() => {
              setReply(null);
              loadList(true);
            }}
          />
        </div>
      )}
      {/* Kept mounted once shown, since closing its port stops a recording. */}
      {showRecord && (
        <div
          className={current === 'record' ? 'flex flex-1 flex-col' : 'hidden'}
        >
          <SidePanel />
        </div>
      )}
    </main>
  );
};
