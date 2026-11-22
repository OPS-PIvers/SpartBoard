// Device memory of the 'quick-sign-in' preview flag, read before sign-in when permissions aren't loaded yet.
export const QUICK_SIGN_IN_KEY = 'spart_quick_sign_in';

const DAY_MS = 24 * 60 * 60 * 1000;
export const LEGACY_INACTIVITY_TIMEOUT_MS = 7 * DAY_MS;
export const QUICK_SIGN_IN_INACTIVITY_TIMEOUT_MS = 30 * DAY_MS;

type KeyStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export const readQuickSignIn = (store: KeyStore | undefined): boolean => {
  try {
    return store?.getItem(QUICK_SIGN_IN_KEY) === '1';
  } catch {
    return false;
  }
};

export const writeQuickSignIn = (
  store: KeyStore | undefined,
  enabled: boolean
): void => {
  try {
    if (enabled) store?.setItem(QUICK_SIGN_IN_KEY, '1');
    else store?.removeItem(QUICK_SIGN_IN_KEY);
  } catch {
    // Storage blocked (private mode); the legacy sign-in still works.
  }
};

export const inactivityTimeoutMs = (quickSignIn: boolean): number =>
  quickSignIn
    ? QUICK_SIGN_IN_INACTIVITY_TIMEOUT_MS
    : LEGACY_INACTIVITY_TIMEOUT_MS;
