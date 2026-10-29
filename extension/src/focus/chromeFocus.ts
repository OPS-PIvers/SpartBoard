// Chrome's side of the focus client: storage, alarms, badge, push and tabs.
import type { FocusPushSubscription } from '@/utils/focus/contract';
import { FOCUS_CHECK_MINUTES } from '@/utils/focus/contract';
import type { FocusClientDeps, PushSent } from './focusClient';
import { ownPageUrls } from './chromeEnforce';
import {
  FOCUS_ENDED_KEY,
  FOCUS_STATE_KEY,
  type FocusLocalState,
} from './focusState';

export const FOCUS_CHECK_ALARM = 'focus-check';
export const FOCUS_TICK_ALARM = 'focus-tick';
export const FOCUS_PAGE_PATH = 'focus/index.html';
const PUSH_SENT_KEY = 'focusPushSent';

const keyBytes = (base64url: string) =>
  Uint8Array.from(atob(base64url.replace(/-/g, '+').replace(/_/g, '/')), (c) =>
    c.charCodeAt(0)
  );

const sameKey = (a: ArrayBuffer | null | undefined, key: string) => {
  if (!a) return false;
  const want = keyBytes(key);
  const got = new Uint8Array(a);
  return got.length === want.length && got.every((b, i) => b === want[i]);
};

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
    const existing = await pushManager.getSubscription();
    if (existing && !sameKey(existing.options.applicationServerKey, vapidKey))
      await existing.unsubscribe();
    return asFocusSubscription(await pushManager.subscribe(options));
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
  // The ended marker lets the focus page tell "over" from "not checked yet" after a restart.
  save: async (state) => {
    if (state) {
      await chrome.storage.session.set({ [FOCUS_STATE_KEY]: state });
      await chrome.storage.session.remove(FOCUS_ENDED_KEY);
    } else {
      await chrome.storage.session.set({ [FOCUS_ENDED_KEY]: true });
      await chrome.storage.session.remove(FOCUS_STATE_KEY);
    }
  },
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
    const open = [...(await ownPageUrls())].find(([, u]) => u === url);
    if (open) {
      const tab = await chrome.tabs.update(open[0], { active: true });
      if (tab?.windowId !== undefined)
        await chrome.windows.update(tab.windowId, { focused: true });
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
