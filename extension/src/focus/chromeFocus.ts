// Chrome's side of the focus client: storage, alarms, badge, push and tabs.
import type { FocusPushSubscription } from '@/utils/focus/contract';
import { FOCUS_CHECK_MINUTES } from '@/utils/focus/contract';
import type { FocusClientDeps, PushSent } from './focusClient';
import { FOCUS_STATE_KEY, type FocusLocalState } from './focusState';

export const FOCUS_CHECK_ALARM = 'focus-check';
export const FOCUS_TICK_ALARM = 'focus-tick';
export const FOCUS_PAGE_PATH = 'focus/index.html';
const PUSH_SENT_KEY = 'focusPushSent';

/** The parts of `ServiceWorkerGlobalScope` the client uses; the extension's lib is DOM, not WebWorker. */
export interface PushScope {
  registration: {
    pushManager: {
      getSubscription(): Promise<PushSubscription | null>;
      subscribe(
        options: PushSubscriptionOptionsInit
      ): Promise<PushSubscription>;
    };
  };
}

const asFocusSubscription = (
  sub: PushSubscription
): FocusPushSubscription | null => {
  const { endpoint, keys } = sub.toJSON();
  return endpoint && keys?.p256dh && keys.auth
    ? { endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } }
    : null;
};

/** Subscribes with this listing's VAPID key; a key change (FS5 rotation) needs the old subscription dropped first. */
export async function chromePushSubscription(
  scope: PushScope,
  vapidKey: string
): Promise<FocusPushSubscription | null> {
  if (!vapidKey) return null;
  const { pushManager } = scope.registration;
  const options = { userVisibleOnly: false, applicationServerKey: vapidKey };
  try {
    try {
      return asFocusSubscription(await pushManager.subscribe(options));
    } catch {
      await (await pushManager.getSubscription())?.unsubscribe();
      return asFocusSubscription(await pushManager.subscribe(options));
    }
  } catch {
    // Below Chrome 121 an extension can't push without showing a notification; the alarm still checks.
    return null;
  }
}

export const chromeFocusDeps: Pick<
  FocusClientDeps,
  | 'load'
  | 'save'
  | 'loadPushSent'
  | 'savePushSent'
  | 'activeUrl'
  | 'openFocusPage'
  | 'setBadge'
  | 'setTicking'
  | 'now'
> = {
  load: async () =>
    (await chrome.storage.session.get(FOCUS_STATE_KEY))[FOCUS_STATE_KEY] as
      FocusLocalState | undefined,
  save: (state) =>
    state
      ? chrome.storage.session.set({ [FOCUS_STATE_KEY]: state })
      : chrome.storage.session.remove(FOCUS_STATE_KEY),
  loadPushSent: async () =>
    (await chrome.storage.local.get(PUSH_SENT_KEY))[PUSH_SENT_KEY] as
      PushSent | undefined,
  savePushSent: (sent) => chrome.storage.local.set({ [PUSH_SENT_KEY]: sent }),
  activeUrl: async () => {
    const [tab] = await chrome.tabs.query({
      active: true,
      lastFocusedWindow: true,
    });
    return tab?.url || tab?.pendingUrl;
  },
  openFocusPage: async () => {
    const url = chrome.runtime.getURL(FOCUS_PAGE_PATH);
    const open = (await chrome.tabs.query({})).find((t) => t.url === url);
    if (open?.id !== undefined) {
      await chrome.tabs.update(open.id, { active: true });
      if (open.windowId !== undefined)
        await chrome.windows.update(open.windowId, { focused: true });
      return;
    }
    await chrome.tabs.create({ url, active: true });
  },
  setBadge: (text) => chrome.action.setBadgeText({ text }),
  setTicking: async (on) => {
    const alarm = await chrome.alarms.get(FOCUS_TICK_ALARM);
    if (on && !alarm)
      await chrome.alarms.create(FOCUS_TICK_ALARM, {
        delayInMinutes: 1,
        periodInMinutes: 1,
      });
    else if (!on && alarm) await chrome.alarms.clear(FOCUS_TICK_ALARM);
  },
  now: () => Date.now(),
};

/** The 5-minute fallback check (F5), created once and kept across worker restarts. */
export async function ensureFocusCheckAlarm() {
  if (await chrome.alarms.get(FOCUS_CHECK_ALARM)) return;
  await chrome.alarms.create(FOCUS_CHECK_ALARM, {
    delayInMinutes: FOCUS_CHECK_MINUTES,
    periodInMinutes: FOCUS_CHECK_MINUTES,
  });
}
