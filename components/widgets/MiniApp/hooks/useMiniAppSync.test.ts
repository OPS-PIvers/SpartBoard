import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import * as firestore from 'firebase/firestore';
import { useMiniAppSync } from './useMiniAppSync';
import { useAuth } from '@/context/useAuth';
import { GlobalMiniAppItem } from '@/types';

vi.mock('firebase/firestore');
vi.mock('@/config/firebase', () => ({ db: {} }));
vi.mock('@/context/useAuth', () => ({
  useAuth: vi.fn(),
}));

const globalAppLegacyBuilding: GlobalMiniAppItem = {
  id: 'app-legacy',
  title: 'Legacy High School App',
  html: '<div />',
  createdAt: 1,
  // Stored with the pre-rename legacy long-form id, as an older/unresaved doc would have.
  buildings: ['orono-high-school'],
};

type QueryRef = { __path: string };
type PersonalSnapshotCallback = (snap: {
  docs: { id: string; data: () => unknown }[];
}) => void;

function setupMocks(
  selectedBuildings: string[],
  globalApps: GlobalMiniAppItem[]
) {
  (useAuth as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
    user: { uid: 'user-1' },
    selectedBuildings,
  });

  (
    firestore.collection as unknown as ReturnType<typeof vi.fn>
  ).mockImplementation((_db: unknown, ...pathParts: string[]) => ({
    __path: pathParts.join('/'),
  }));
  (firestore.query as unknown as ReturnType<typeof vi.fn>).mockImplementation(
    (ref: QueryRef) => ref
  );
  (firestore.orderBy as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
    {}
  );
  (firestore.doc as unknown as ReturnType<typeof vi.fn>).mockReturnValue({});

  (
    firestore.onSnapshot as unknown as ReturnType<typeof vi.fn>
  ).mockImplementation((ref: QueryRef, cb: PersonalSnapshotCallback) => {
    if (ref.__path === 'global_mini_apps') {
      cb({
        docs: globalApps.map((app) => ({
          id: app.id,
          data: () => app,
        })),
      });
    } else {
      // Personal apps: no docs, so the localStorage migration branch is a no-op.
      cb({ docs: [] });
    }
    return vi.fn(); // unsubscribe
  });
}

describe('useMiniAppSync – global library building filter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('matches a global app stored with a legacy long-form building id against the canonical selection', () => {
    setupMocks(['high'], [globalAppLegacyBuilding]);
    const addToast = vi.fn();
    const { result } = renderHook(() => useMiniAppSync(addToast));
    const ids = result.current.globalLibrary.map((a) => a.id);
    // 'orono-high-school' and 'high' are the same building; canonicalizing must match them.
    expect(ids).toContain('app-legacy');
  });
});
