// Drive in a super admin "View as" tab: the target's stored grant, or nothing (docs/plans/ADMIN_VIEW_AS.md D5).
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/config/firebase';
import { logError } from '@/utils/logError';
import {
  isViewAsTab,
  ViewAsReadOnlyError,
  viewAsBlocksWrite,
} from '@/utils/viewAsTab';

type ViewAsDriveTokenResponse =
  | { available: true; accessToken: string; expiresIn: number }
  | { available: false };

export type ViewAsDriveStatus = 'pending' | 'available' | 'unavailable';

let status: ViewAsDriveStatus = 'pending';
const listeners = new Set<() => void>();
let inFlight: Promise<{
  accessToken: string;
  expiresIn: number;
} | null> | null = null;

export function getViewAsDriveStatus(): ViewAsDriveStatus {
  return status;
}

export function subscribeViewAsDrive(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function setStatus(next: ViewAsDriveStatus): void {
  if (status === next) return;
  status = next;
  listeners.forEach((l) => l());
}

const RETRYABLE_CODES = new Set([
  'functions/internal',
  'functions/unavailable',
  'functions/deadline-exceeded',
]);

/** The target's Drive token, or null when they have no stored grant (then it never asks again). */
export function fetchViewAsDriveToken(): Promise<{
  accessToken: string;
  expiresIn: number;
} | null> {
  if (!isViewAsTab || status === 'unavailable') return Promise.resolve(null);
  inFlight ??= httpsCallable<void, ViewAsDriveTokenResponse>(
    functions,
    'getViewAsDriveTokenV1'
  )()
    .then(({ data }) => {
      if (!data.available) {
        setStatus('unavailable');
        return null;
      }
      setStatus('available');
      return { accessToken: data.accessToken, expiresIn: data.expiresIn };
    })
    .catch((err: unknown) => {
      const code = (err as { code?: unknown } | null)?.code;
      if (typeof code !== 'string' || !RETRYABLE_CODES.has(code)) {
        setStatus('unavailable');
      }
      logError('viewAsDrive.fetchToken', err);
      return null;
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

const GOOGLE_API_HOSTS = new Set([
  'www.googleapis.com',
  'content.googleapis.com',
  'sheets.googleapis.com',
  'docs.googleapis.com',
  'slides.googleapis.com',
  'classroom.googleapis.com',
]);
const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** True for a request that would change the target's Google files. */
export function isGoogleApiWrite(
  input: RequestInfo | URL,
  init?: RequestInit
): boolean {
  const method = (
    init?.method ?? (input instanceof Request ? input.method : 'GET')
  ).toUpperCase();
  if (READ_METHODS.has(method)) return false;
  const href =
    typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
  try {
    return GOOGLE_API_HOSTS.has(new URL(href, window.location.href).hostname);
  } catch {
    return false;
  }
}

/** Every Drive, Sheets and Classroom write in the tab passes the D7 guard, whichever service sends it. */
export function installViewAsDriveWriteGuard(target: Window = window): void {
  const original = target.fetch.bind(target);
  target.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    if (isGoogleApiWrite(input, init) && viewAsBlocksWrite()) {
      return Promise.reject(new ViewAsReadOnlyError());
    }
    return original(input, init);
  };
}

if (isViewAsTab && typeof window !== 'undefined') {
  installViewAsDriveWriteGuard();
}

export const VIEW_AS_DRIVE_UNAVAILABLE =
  "Drive content isn't available in view-as";

/** A no-Drive message, swapped for the View as wording inside a View as tab. */
export function noDriveMessage(fallback: string): string {
  return isViewAsTab ? VIEW_AS_DRIVE_UNAVAILABLE : fallback;
}
