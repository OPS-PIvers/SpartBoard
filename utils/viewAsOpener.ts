// Admin-side half of the View as handoff (docs/plans/ADMIN_VIEW_AS.md D4): opens the tab, mints, posts the token.
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/config/firebase';
import type {
  StartViewAsSessionRequest,
  StartViewAsSessionResponse,
  UpdateViewAsSessionRequest,
  UpdateViewAsSessionResponse,
} from '@/types/viewAs';
import {
  VIEW_AS_ENDED,
  VIEW_AS_HANDOFF,
  VIEW_AS_PARAM,
  VIEW_AS_READY,
} from '@/utils/viewAsTab';

interface OpenTab {
  win: Window;
  ready: boolean;
  delivered: boolean;
  session: StartViewAsSessionResponse | null;
}

const CLOSED_POLL_MS = 1500;
const tabs = new Set<OpenTab>();
let pollTimer: ReturnType<typeof setInterval> | null = null;
let listening = false;

function endSession(sid: string): void {
  const call = httpsCallable<
    UpdateViewAsSessionRequest,
    UpdateViewAsSessionResponse
  >(functions, 'updateViewAsSessionV1');
  void call({ action: 'end', sid }).catch((err: unknown) =>
    console.error('[viewAs] end failed', err)
  );
}

function forget(tab: OpenTab): void {
  tabs.delete(tab);
  if (tabs.size === 0 && pollTimer !== null) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

function deliver(tab: OpenTab): void {
  if (!tab.ready || !tab.session || tab.delivered) return;
  tab.delivered = true;
  tab.win.postMessage(
    { type: VIEW_AS_HANDOFF, session: tab.session },
    window.location.origin
  );
}

function onMessage(event: MessageEvent): void {
  if (event.origin !== window.location.origin) return;
  const data = event.data as { type?: unknown } | null;
  if (!data || data.type !== VIEW_AS_READY) return;
  const tab = Array.from(tabs).find((t) => t.win === event.source);
  if (!tab) return;
  if (tab.delivered) {
    // A second ready means the tab reloaded and lost its in-memory sign-in.
    if (tab.session) endSession(tab.session.sid);
    tab.win.postMessage({ type: VIEW_AS_ENDED }, window.location.origin);
    forget(tab);
    return;
  }
  tab.ready = true;
  deliver(tab);
}

function pollClosed(): void {
  for (const tab of Array.from(tabs)) {
    if (!tab.win.closed) continue;
    if (tab.session) endSession(tab.session.sid);
    forget(tab);
  }
}

/** Opens the tab synchronously (keeps the click's pop-up allowance), then mints the session for it. */
export async function openViewAsTab(targetEmail: string): Promise<void> {
  const win = window.open(`/?${VIEW_AS_PARAM}=1`, '_blank');
  if (!win) throw new Error('Allow pop-ups for SpartBoard to use View as.');
  if (!listening) {
    window.addEventListener('message', onMessage);
    listening = true;
  }
  const tab: OpenTab = { win, ready: false, delivered: false, session: null };
  tabs.add(tab);
  pollTimer ??= setInterval(pollClosed, CLOSED_POLL_MS);

  try {
    const start = httpsCallable<
      StartViewAsSessionRequest,
      StartViewAsSessionResponse
    >(functions, 'startViewAsSessionV1');
    const res = await start({ targetEmail });
    tab.session = res.data;
  } catch (err) {
    forget(tab);
    win.close();
    throw err;
  }
  if (win.closed) {
    endSession(tab.session.sid);
    forget(tab);
    return;
  }
  deliver(tab);
}
