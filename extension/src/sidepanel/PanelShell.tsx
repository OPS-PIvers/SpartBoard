// The side panel's tabs: Tours for every staff profile, Focus where SpartBoard allows it (CHROME_EXTENSION.md F12), Record for admins (H5).
import React, { useCallback, useEffect, useState } from 'react';
import { focusRing } from '@/components/common/lightChrome';
import type { TourListReply } from '../tourList';
import { isDefiniteNonAdmin } from './recordTab';
import { isRecorderInternal, type RecorderStatus } from '../recorder/messages';
import { SidePanel } from './SidePanel';
import { ToursTab } from './ToursTab';
import { FocusTab, sendFocus } from './FocusTab';
import {
  parseFocusPanelList,
  type FocusPanelReply,
} from '../focus/panelMessages';
import type { FocusPanelListReply } from '@/utils/focus/contract';

type PanelTab = 'tours' | 'focus' | 'record';

/** The Focus tab's list; `hidden` when SpartBoard says the tab isn't for this account. */
type FocusState =
  { kind: 'loading' | 'hidden' } | { kind: 'ready'; list: FocusPanelListReply };

const send = <T,>(msg: object): Promise<T> => chrome.runtime.sendMessage(msg);

/** A recording or a fix SpartBoard asked for needs the Record tab, whoever is signed in. */
const recorderBusy = (s: RecorderStatus) =>
  s.recordingTabId !== null || s.pick !== null;

export const PanelShell: React.FC = () => {
  const [reply, setReply] = useState<TourListReply | null>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<PanelTab>('tours');
  const [focus, setFocus] = useState<FocusState>({ kind: 'loading' });

  // A refusal hides the tab; a network failure keeps what was showing (reopening the panel tries again).
  const applyFocus = useCallback((reply: FocusPanelReply) => {
    const list = reply.ok ? parseFocusPanelList(reply.value) : null;
    setFocus((prev) => {
      if (list) return { kind: 'ready', list };
      if (!reply.ok && reply.why === 'offline' && prev.kind === 'ready')
        return prev;
      return { kind: 'hidden' };
    });
  }, []);
  const loadFocus = useCallback(
    () => sendFocus({ action: 'list' }).then(applyFocus),
    [applyFocus]
  );

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
    void sendFocus({ action: 'list' }).then(applyFocus);
    const onMessage = (msg: unknown, sender: chrome.runtime.MessageSender) => {
      if (sender.id !== chrome.runtime.id || sender.tab) return;
      if (isRecorderInternal(msg, 'rec/changed')) check();
    };
    chrome.runtime.onMessage.addListener(onMessage);
    return () => chrome.runtime.onMessage.removeListener(onMessage);
  }, [loadList, applyFocus]);

  const showRecord = busy || !isDefiniteNonAdmin(reply);
  const showFocus = focus.kind === 'ready';
  const current: PanelTab =
    (tab === 'record' && showRecord) || (tab === 'focus' && showFocus)
      ? tab
      : 'tours';

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
      {(showRecord || showFocus) && (
        <div
          role="tablist"
          aria-label="Side panel"
          className="mx-4 mt-4 flex gap-1 rounded-lg bg-slate-200/70 p-1"
        >
          {tabButton('tours', 'Tours')}
          {showFocus && tabButton('focus', 'Focus')}
          {showRecord && tabButton('record', 'Record')}
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
      {current === 'focus' && (
        <div className="flex flex-1 flex-col gap-3 p-4">
          <h1 className="text-base font-semibold">Focus</h1>
          {focus.kind === 'ready' && (
            <FocusTab list={focus.list} onReload={loadFocus} />
          )}
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
