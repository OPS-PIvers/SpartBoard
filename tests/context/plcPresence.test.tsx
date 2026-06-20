/**
 * Unit coverage for PLC presence (Decision 2.1, §3.3, §6.3):
 *   - hooks/usePlcPresence.ts: parsePresence + the ~90s freshness filter.
 *   - context/PlcContext.tsx: the always-on presence listener mirrors docs into
 *     the store; the heartbeat writes the caller's own doc on mount + ~45s and
 *     best-effort deletes it on unmount.
 *   - context/usePlcContext.ts: usePlcWhoIsHere() excludes docs older than ~90s.
 *
 * Firestore is mocked: onSnapshot captures one callback per collection path so a
 * test can drive presence snapshots; setDoc/deleteDoc are spies the heartbeat
 * assertions read. Mirrors the harness in plcContext.test.tsx.
 */

import React, { useEffect } from 'react';
import { render, act } from '@testing-library/react';
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type Mock,
} from 'vitest';
import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  deleteDoc,
} from 'firebase/firestore';

import { PlcProvider } from '@/context/PlcContext';
import { usePlcPresence, usePlcWhoIsHere } from '@/context/usePlcContext';
import {
  parsePresence,
  filterWhoIsHere,
  PRESENCE_FRESH_WINDOW_MS,
  type PlcPresenceEntry,
} from '@/hooks/usePlcPresence';
import type { Plc } from '@/types';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  doc: vi.fn(),
  onSnapshot: vi.fn(),
  limit: vi.fn((n: number) => ({ __limit: n })),
  orderBy: vi.fn((field: string, dir: string) => ({ __orderBy: [field, dir] })),
  query: vi.fn((ref: unknown, ...constraints: unknown[]) => ({
    __query: ref,
    constraints,
  })),
  runTransaction: vi.fn(),
  serverTimestamp: vi.fn(() => ({ __serverTimestamp: true })),
  setDoc: vi.fn().mockResolvedValue(undefined),
  updateDoc: vi.fn().mockResolvedValue(undefined),
  deleteDoc: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/config/firebase', () => ({
  db: { __mock: 'db' },
  isAuthBypass: false,
}));

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    user: { uid: 'u-self', displayName: 'Self', email: 'self@x.edu' },
  }),
}));

vi.mock('@/hooks/usePlcs', () => ({
  usePlcs: () => ({
    setMemberRole: vi.fn().mockResolvedValue(undefined),
    transferLead: vi.fn().mockResolvedValue(undefined),
    removeMember: vi.fn().mockResolvedValue(undefined),
    leavePlc: vi.fn().mockResolvedValue(undefined),
    renamePlc: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock('@/utils/logError', () => ({ logError: vi.fn() }));

const mockCollection = collection as Mock;
const mockDoc = doc as Mock;
const mockOnSnapshot = onSnapshot as Mock;
const mockSetDoc = setDoc as Mock;
const mockDeleteDoc = deleteDoc as Mock;

// ---------------------------------------------------------------------------
// Firestore listener registry
// ---------------------------------------------------------------------------

interface CapturedListener {
  path: string;
  onNext: (snap: unknown) => void;
  onError: (err: Error) => void;
}

let listeners: CapturedListener[] = [];

function subscriptionCount(subcol: string): number {
  return listeners.filter((l) => l.path.endsWith(`/${subcol}`)).length;
}

function emit(
  subcol: string,
  docs: Array<{ id: string; data: Record<string, unknown> }>
): void {
  const target = listeners.find((l) => l.path.endsWith(`/${subcol}`));
  if (!target) throw new Error(`no listener for ${subcol}`);
  act(() => {
    target.onNext({
      forEach: (fn: (d: { id: string; data: () => unknown }) => void) => {
        for (const d of docs) fn({ id: d.id, data: () => d.data });
      },
    });
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  listeners = [];
  mockCollection.mockImplementation((_db: unknown, ...segs: string[]) => ({
    __path: segs.join('/'),
  }));
  mockDoc.mockImplementation((_db: unknown, ...segs: string[]) => ({
    __docPath: segs.join('/'),
  }));
  mockOnSnapshot.mockImplementation(
    (
      refOrQuery: { __path?: string; __query?: { __path?: string } },
      onNext: (snap: unknown) => void,
      onError: (err: Error) => void
    ) => {
      const path = refOrQuery.__path ?? refOrQuery.__query?.__path ?? 'unknown';
      listeners.push({ path, onNext, onError });
      return () => {
        listeners = listeners.filter((l) => l.onNext !== onNext);
      };
    }
  );
});

afterEach(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const PLC_ID = 'plc-1';

function makePlc(): Plc {
  return {
    id: PLC_ID,
    name: 'Team Alpha',
    orgId: null,
    buildingId: null,
    members: {
      'u-self': {
        uid: 'u-self',
        email: 'self@x.edu',
        displayName: 'Self',
        role: 'lead',
        joinedAt: 1,
        status: 'active',
      },
    },
    leadUid: 'u-self',
    memberUids: ['u-self'],
    memberEmails: { 'u-self': 'self@x.edu' },
    sharedSheetUrl: null,
    createdAt: 1,
    updatedAt: 1,
  };
}

function presenceDoc(
  uid: string,
  lastActiveAt: number,
  section = 'home'
): { id: string; data: Record<string, unknown> } {
  return {
    id: uid,
    data: { uid, displayName: `Name ${uid}`, section, lastActiveAt },
  };
}

// ---------------------------------------------------------------------------
// parsePresence
// ---------------------------------------------------------------------------

describe('parsePresence', () => {
  it('parses a well-formed doc, keying uid off the docId', () => {
    const parsed = parsePresence('u-x', {
      uid: 'u-x',
      displayName: 'Xavier',
      section: 'todos',
      lastActiveAt: 1234,
    });
    expect(parsed).toEqual<PlcPresenceEntry>({
      uid: 'u-x',
      displayName: 'Xavier',
      section: 'todos',
      lastActiveAt: 1234,
    });
  });

  it('resolves a Timestamp-like lastActiveAt via tsToMillis', () => {
    const parsed = parsePresence('u-x', {
      uid: 'u-x',
      displayName: 'Xavier',
      section: 'home',
      lastActiveAt: { toMillis: () => 9999 },
    });
    expect(parsed?.lastActiveAt).toBe(9999);
  });

  it('yields lastActiveAt 0 for an unresolved server-timestamp sentinel', () => {
    const parsed = parsePresence('u-x', {
      uid: 'u-x',
      displayName: 'Xavier',
      section: 'home',
      lastActiveAt: { __serverTimestamp: true },
    });
    expect(parsed?.lastActiveAt).toBe(0);
  });

  it('returns null for a malformed doc (missing displayName)', () => {
    expect(
      parsePresence('u-x', { uid: 'u-x', section: 'home', lastActiveAt: 1 })
    ).toBeNull();
  });

  it('rewrites a legacy quizzes/videoActivities section to assessments', () => {
    // A pre-Wave-4 client could still report the old section ids; the unified
    // IA (Decision 4.5) collapses both onto `assessments`.
    expect(
      parsePresence('u-x', {
        uid: 'u-x',
        displayName: 'Xavier',
        section: 'quizzes',
        lastActiveAt: 1,
      })?.section
    ).toBe('assessments');
    expect(
      parsePresence('u-y', {
        uid: 'u-y',
        displayName: 'Yara',
        section: 'videoActivities',
        lastActiveAt: 1,
      })?.section
    ).toBe('assessments');
  });

  it('falls back to home for an unrecognised section id', () => {
    expect(
      parsePresence('u-z', {
        uid: 'u-z',
        displayName: 'Zoe',
        section: 'not-a-real-section',
        lastActiveAt: 1,
      })?.section
    ).toBe('home');
  });
});

// ---------------------------------------------------------------------------
// filterWhoIsHere — the ~90s freshness window
// ---------------------------------------------------------------------------

describe('filterWhoIsHere (90s window)', () => {
  const NOW = 1_000_000;
  const fresh: PlcPresenceEntry = {
    uid: 'fresh',
    displayName: 'Fresh',
    section: 'home',
    lastActiveAt: NOW - 10_000, // 10s ago
  };
  const edge: PlcPresenceEntry = {
    uid: 'edge',
    displayName: 'Edge',
    section: 'home',
    lastActiveAt: NOW - PRESENCE_FRESH_WINDOW_MS, // exactly at the boundary
  };
  const stale: PlcPresenceEntry = {
    uid: 'stale',
    displayName: 'Stale',
    section: 'home',
    lastActiveAt: NOW - (PRESENCE_FRESH_WINDOW_MS + 1), // 1ms past the window
  };

  it('keeps entries within the window (inclusive of the boundary)', () => {
    const kept = filterWhoIsHere([fresh, edge], NOW).map((e) => e.uid);
    expect(kept).toEqual(['fresh', 'edge']);
  });

  it('excludes entries older than the window', () => {
    const kept = filterWhoIsHere([fresh, stale], NOW).map((e) => e.uid);
    expect(kept).toEqual(['fresh']);
  });

  it('defaults the clock to Date.now() when no `now` is passed', () => {
    const now = Date.now();
    const recent: PlcPresenceEntry = { ...fresh, lastActiveAt: now - 1000 };
    const old: PlcPresenceEntry = {
      ...stale,
      lastActiveAt: now - 5 * 60_000,
    };
    const kept = filterWhoIsHere([recent, old]).map((e) => e.uid);
    expect(kept).toEqual(['fresh']);
  });
});

// ---------------------------------------------------------------------------
// Provider listener + usePlcWhoIsHere selector
// ---------------------------------------------------------------------------

describe('PlcProvider presence listener + usePlcWhoIsHere selector', () => {
  it('opens exactly ONE always-on presence listener regardless of section', () => {
    render(
      <PlcProvider plcId={PLC_ID} plc={makePlc()} activeSection="members">
        <div />
      </PlcProvider>
    );
    // Presence is NOT section-gated — it is live even on a section that mounts
    // no heavy subcollection listener.
    expect(subscriptionCount('presence')).toBe(1);
  });

  it('mirrors parsed presence into the store and the who-is-here selector filters stale docs', () => {
    vi.useFakeTimers();
    const base = 2_000_000;
    vi.setSystemTime(base);

    const cap: { all?: PlcPresenceEntry[]; here?: PlcPresenceEntry[] } = {};
    const Probe: React.FC = () => {
      const all = usePlcPresence();
      const here = usePlcWhoIsHere();
      useEffect(() => {
        cap.all = all;
        cap.here = here;
      });
      return null;
    };

    render(
      <PlcProvider plcId={PLC_ID} plc={makePlc()} activeSection="home">
        <Probe />
      </PlcProvider>
    );

    // One fresh, one stale (>90s old) teammate.
    emit('presence', [
      presenceDoc('u-fresh', base - 5_000, 'todos'),
      presenceDoc('u-stale', base - (PRESENCE_FRESH_WINDOW_MS + 5_000)),
    ]);

    // Raw list carries both docs…
    expect((cap.all ?? []).map((e) => e.uid).sort()).toEqual([
      'u-fresh',
      'u-stale',
    ]);
    // …but the who's-here view drops the stale one.
    expect((cap.here ?? []).map((e) => e.uid)).toEqual(['u-fresh']);
  });
});

// ---------------------------------------------------------------------------
// Heartbeat writer
// ---------------------------------------------------------------------------

describe('PlcProvider presence heartbeat', () => {
  function ownPresenceWrites(): Array<[unknown, Record<string, unknown>]> {
    return mockSetDoc.mock.calls.filter(
      (c) =>
        (c[0] as { __docPath?: string })?.__docPath ===
        `plcs/${PLC_ID}/presence/u-self`
    ) as Array<[unknown, Record<string, unknown>]>;
  }

  it('writes the caller own presence doc on mount with the active section', () => {
    render(
      <PlcProvider plcId={PLC_ID} plc={makePlc()} activeSection="todos">
        <div />
      </PlcProvider>
    );
    const writes = ownPresenceWrites();
    expect(writes.length).toBeGreaterThanOrEqual(1);
    const payload = writes[writes.length - 1][1];
    expect(payload.uid).toBe('u-self');
    expect(payload.displayName).toBe('Self');
    expect(payload.section).toBe('todos');
    // serverTimestamp() sentinel from the mock.
    expect(payload.lastActiveAt).toEqual({ __serverTimestamp: true });
  });

  it('re-stamps the doc when the active section changes', () => {
    const { rerender } = render(
      <PlcProvider plcId={PLC_ID} plc={makePlc()} activeSection="home">
        <div />
      </PlcProvider>
    );
    const before = ownPresenceWrites().length;
    rerender(
      <PlcProvider plcId={PLC_ID} plc={makePlc()} activeSection="docs">
        <div />
      </PlcProvider>
    );
    const after = ownPresenceWrites();
    expect(after.length).toBeGreaterThan(before);
    const payload = after[after.length - 1][1];
    expect(payload.section).toBe('docs');
  });

  it('heartbeats on the ~45s cadence', () => {
    vi.useFakeTimers();
    render(
      <PlcProvider plcId={PLC_ID} plc={makePlc()} activeSection="home">
        <div />
      </PlcProvider>
    );
    const initial = ownPresenceWrites().length;
    act(() => {
      vi.advanceTimersByTime(45_000);
    });
    expect(ownPresenceWrites().length).toBeGreaterThan(initial);
  });

  it('best-effort deletes the caller doc on unmount', () => {
    const { unmount } = render(
      <PlcProvider plcId={PLC_ID} plc={makePlc()} activeSection="home">
        <div />
      </PlcProvider>
    );
    expect(mockDeleteDoc).not.toHaveBeenCalled();
    unmount();
    const deleted = mockDeleteDoc.mock.calls.some(
      (c) =>
        (c[0] as { __docPath?: string })?.__docPath ===
        `plcs/${PLC_ID}/presence/u-self`
    );
    expect(deleted).toBe(true);
  });

  it('clears presence on pagehide', () => {
    render(
      <PlcProvider plcId={PLC_ID} plc={makePlc()} activeSection="home">
        <div />
      </PlcProvider>
    );
    act(() => {
      window.dispatchEvent(new Event('pagehide'));
    });
    const deleted = mockDeleteDoc.mock.calls.some(
      (c) =>
        (c[0] as { __docPath?: string })?.__docPath ===
        `plcs/${PLC_ID}/presence/u-self`
    );
    expect(deleted).toBe(true);
  });
});
