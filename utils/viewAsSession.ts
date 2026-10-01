// View as tab session: token handoff, custom-token sign-in, renew/unlock/end (docs/plans/ADMIN_VIEW_AS.md D4).
import { signInWithCustomToken, signOut } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { auth, functions } from '@/config/firebase';
import type {
  UpdateViewAsSessionRequest,
  UpdateViewAsSessionResponse,
} from '@/types/viewAs';
import {
  VIEW_AS_ENDED,
  VIEW_AS_HANDOFF,
  VIEW_AS_READY,
  getViewAsTabState,
  updateViewAsTabState,
  viewAsStorageIsolated,
  type ViewAsHandoff,
} from '@/utils/viewAsTab';

const HANDOFF_TIMEOUT_MS = 60_000;

export const callUpdate = (req: UpdateViewAsSessionRequest) =>
  httpsCallable<UpdateViewAsSessionRequest, UpdateViewAsSessionResponse>(
    functions,
    'updateViewAsSessionV1'
  )(req).then((res) => res.data);

function isHandoff(value: unknown): value is ViewAsHandoff {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.sid === 'string' &&
    typeof v.token === 'string' &&
    typeof v.targetUid === 'string' &&
    typeof v.targetEmail === 'string' &&
    typeof v.adminTarget === 'boolean' &&
    typeof v.expiresAt === 'number'
  );
}

function awaitHandoff(): Promise<ViewAsHandoff | null> {
  return new Promise((resolve) => {
    const opener = window.opener as Window | null;
    if (!opener || !viewAsStorageIsolated) {
      resolve(null);
      return;
    }
    const finish = (value: ViewAsHandoff | null) => {
      clearTimeout(timer);
      window.removeEventListener('message', onMessage);
      resolve(value);
    };
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.source !== opener) return;
      const data = event.data as { type?: unknown; session?: unknown } | null;
      if (data?.type === VIEW_AS_ENDED) finish(null);
      if (data?.type === VIEW_AS_HANDOFF && isHandoff(data.session)) {
        finish(data.session);
      }
    };
    const timer = setTimeout(() => finish(null), HANDOFF_TIMEOUT_MS);
    window.addEventListener('message', onMessage);
    opener.postMessage({ type: VIEW_AS_READY }, window.location.origin);
  });
}

function endOnPageHide(): void {
  if (getViewAsTabState().ended) return;
  void callUpdate({ action: 'end' }).catch(() => undefined);
}

let bootPromise: Promise<void> | null = null;

/** Runs once per page load, so StrictMode's double effect never sends a second ready. */
export function bootViewAsTab(): Promise<void> {
  bootPromise ??= (async () => {
    const session = await awaitHandoff();
    if (!session) {
      updateViewAsTabState({ ended: true });
      return;
    }
    try {
      await signInWithCustomToken(auth, session.token);
    } catch (err) {
      console.error('[viewAs] sign-in failed', err);
      updateViewAsTabState({ ended: true });
      return;
    }
    window.addEventListener('pagehide', endOnPageHide);
    updateViewAsTabState({ session, unlocked: false });
  })();
  return bootPromise;
}

export async function finishSession(callServer: boolean): Promise<void> {
  if (getViewAsTabState().ended) return;
  // Unmount the app first so its listeners don't error on sign-out.
  updateViewAsTabState({ ended: true });
  window.removeEventListener('pagehide', endOnPageHide);
  if (callServer) {
    await callUpdate({ action: 'end' }).catch((err: unknown) =>
      console.error('[viewAs] end failed', err)
    );
  }
  await signOut(auth).catch(() => undefined);
}

/** Exit: ends the session server-side, signs the tab out and closes it. */
export async function endViewAsSession(): Promise<void> {
  await finishSession(true);
  window.close();
}

export async function applyToken(
  res: UpdateViewAsSessionResponse,
  current: ViewAsHandoff
): Promise<void> {
  if (!res.token) throw new Error('No token returned.');
  await signInWithCustomToken(auth, res.token);
  updateViewAsTabState({
    session: {
      ...current,
      token: res.token,
      expiresAt: res.expiresAt ?? current.expiresAt,
    },
    unlocked: res.unlocked === true,
  });
}
