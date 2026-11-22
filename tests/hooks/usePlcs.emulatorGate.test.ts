import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { onSnapshot } from 'firebase/firestore';
import { usePlcs } from '@/hooks/usePlcs';

// Under auth bypass usePlcs stays empty unless the browser-test emulators are on.
const flags = vi.hoisted(() => ({
  isAuthBypass: false,
  isEmulatorBackend: false,
}));

vi.mock('@/config/firebase', () => ({
  db: {},
  get isAuthBypass() {
    return flags.isAuthBypass;
  },
  get isEmulatorBackend() {
    return flags.isEmulatorBackend;
  },
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => 'plcs'),
  query: vi.fn(() => 'q'),
  where: vi.fn(),
  limit: vi.fn(),
  onSnapshot: vi.fn(() => () => undefined),
  doc: vi.fn(),
  setDoc: vi.fn(),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  writeBatch: vi.fn(),
  runTransaction: vi.fn(),
  serverTimestamp: vi.fn(),
  updateDoc: vi.fn(),
  deleteField: vi.fn(),
}));

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ user: { uid: 'mock-user-id' } }),
}));

describe('usePlcs auth-bypass gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    { bypass: true, emulators: false, listens: false },
    { bypass: true, emulators: true, listens: true },
    { bypass: false, emulators: false, listens: true },
  ])(
    'bypass=$bypass emulators=$emulators listens=$listens',
    async ({ bypass, emulators, listens }) => {
      flags.isAuthBypass = bypass;
      flags.isEmulatorBackend = emulators;
      const { result } = renderHook(() => usePlcs());
      await waitFor(() => expect(result.current.loading).toBe(listens));
      expect(vi.mocked(onSnapshot).mock.calls.length > 0).toBe(listens);
    }
  );
});

describe('isEmulatorBackend in config/firebase', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('VITE_FIREBASE_API_KEY', '');
    vi.stubEnv('VITE_AUTH_BYPASS', 'true');
    vi.stubEnv('VITE_FIREBASE_EMULATORS', 'true');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const load = async (): Promise<boolean> =>
    (
      await vi.importActual<typeof import('@/config/firebase')>(
        '@/config/firebase'
      )
    ).isEmulatorBackend;

  it('is on for a localhost dev server with bypass and emulators', async () => {
    expect(window.location.hostname).toBe('localhost');
    expect(await load()).toBe(true);
  });

  it('is off in a production build', async () => {
    vi.stubEnv('PROD', true);
    expect(await load()).toBe(false);
  });

  it('is off for the plain bypass harness', async () => {
    vi.stubEnv('VITE_FIREBASE_EMULATORS', '');
    expect(await load()).toBe(false);
  });

  it('is off without auth bypass', async () => {
    vi.stubEnv('VITE_AUTH_BYPASS', '');
    expect(await load()).toBe(false);
  });
});
