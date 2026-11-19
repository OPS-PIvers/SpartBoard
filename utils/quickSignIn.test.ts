import { describe, expect, it } from 'vitest';
import {
  QUICK_SIGN_IN_KEY,
  QUICK_SIGN_IN_INACTIVITY_TIMEOUT_MS,
  LEGACY_INACTIVITY_TIMEOUT_MS,
  inactivityTimeoutMs,
  readQuickSignIn,
  writeQuickSignIn,
} from './quickSignIn';

const memoryStore = () => {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    map,
  };
};

const throwingStore = {
  getItem: () => {
    throw new Error('blocked');
  },
  setItem: () => {
    throw new Error('blocked');
  },
  removeItem: () => {
    throw new Error('blocked');
  },
};

describe('quickSignIn', () => {
  it('is off until the flag is remembered on this device', () => {
    const store = memoryStore();
    expect(readQuickSignIn(store)).toBe(false);
    writeQuickSignIn(store, true);
    expect(store.map.get(QUICK_SIGN_IN_KEY)).toBe('1');
    expect(readQuickSignIn(store)).toBe(true);
    writeQuickSignIn(store, false);
    expect(store.map.has(QUICK_SIGN_IN_KEY)).toBe(false);
    expect(readQuickSignIn(store)).toBe(false);
  });

  it('ignores any value other than "1"', () => {
    const store = memoryStore();
    store.setItem(QUICK_SIGN_IN_KEY, 'true');
    expect(readQuickSignIn(store)).toBe(false);
  });

  it('falls back to the legacy behavior when storage is missing or blocked', () => {
    expect(readQuickSignIn(undefined)).toBe(false);
    expect(readQuickSignIn(throwingStore)).toBe(false);
    expect(() => writeQuickSignIn(throwingStore, true)).not.toThrow();
  });

  it('signs out after 30 idle days with the flag and 7 without', () => {
    expect(inactivityTimeoutMs(true)).toBe(QUICK_SIGN_IN_INACTIVITY_TIMEOUT_MS);
    expect(QUICK_SIGN_IN_INACTIVITY_TIMEOUT_MS).toBe(30 * 24 * 60 * 60 * 1000);
    expect(inactivityTimeoutMs(false)).toBe(LEGACY_INACTIVITY_TIMEOUT_MS);
    expect(LEGACY_INACTIVITY_TIMEOUT_MS).toBe(7 * 24 * 60 * 60 * 1000);
  });
});
