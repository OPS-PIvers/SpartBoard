/**
 * Contract tests for the PLC data-layer (Decision 1.4):
 *   - context/PlcContext.tsx (PlcProvider — single-listener-per-subcollection)
 *   - context/usePlcContext.ts (selector hooks with Object.is bailout)
 *   - hooks/usePlcContributions.ts (error-contract change: string → Error)
 *
 * Pins the three guarantees this task ships:
 *   1. Listener dedup — N consumers of the SAME subcollection produce exactly
 *      ONE onSnapshot subscription under one provider.
 *   2. Selector bailout — a consumer re-renders only when ITS selected slice
 *      changes; an unrelated subcollection update leaves it untouched.
 *   3. Contributions error contract is `Error | null` (not `string`).
 *
 * Firestore is mocked: onSnapshot captures one callback per collection PATH so
 * a test can drive snapshots + count subscriptions per subcollection.
 */

import React, { useEffect } from 'react';
import { render, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { collection, onSnapshot } from 'firebase/firestore';

import { PlcProvider } from '@/context/PlcContext';
import {
  usePlcRootDoc,
  usePlcMembers,
  usePlcRole,
  usePlcTodosData,
  usePlcDocsData,
  usePlcPresence,
  usePlcActivity,
  usePlcActions,
} from '@/context/usePlcContext';
import { usePlcContributions } from '@/hooks/usePlcContributions';
import { usePlcDocs } from '@/hooks/usePlcDocs';
import type { Plc } from '@/types';
import type { PlcSectionId } from '@/components/plc/sections';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  doc: vi.fn(),
  onSnapshot: vi.fn(),
  orderBy: vi.fn((field: string, dir: string) => ({ __orderBy: [field, dir] })),
  query: vi.fn((ref: unknown, ...constraints: unknown[]) => ({
    __query: ref,
    constraints,
  })),
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

// usePlcs is mounted by the provider only for its membership mutators. Mock it
// to no-op resolvers — none of these tests exercise membership writes.
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
const mockOnSnapshot = onSnapshot as Mock;

// ---------------------------------------------------------------------------
// Firestore listener registry — one captured callback per collection path
// ---------------------------------------------------------------------------

interface CapturedListener {
  path: string;
  onNext: (snap: unknown) => void;
  onError: (err: Error) => void;
}

let listeners: CapturedListener[] = [];

/**
 * Per-probe render counter. A module-level Map (method calls, not outer-var
 * reassignment) so incrementing it in a probe's render body doesn't trip
 * `react-hooks/immutability` — mirrors `dashboardCanvasStore.test.tsx`.
 */
const renderCounts = new Map<string, number>();
function bumpRender(id: string): void {
  renderCounts.set(id, (renderCounts.get(id) ?? 0) + 1);
}
function renderCount(id: string): number {
  return renderCounts.get(id) ?? 0;
}

/** Count of active onSnapshot subscriptions whose path ends with `subcol`. */
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

function fakeSnap(
  docs: Array<{ id: string; data: Record<string, unknown> }>
): unknown {
  return {
    forEach: (fn: (d: { id: string; data: () => unknown }) => void) => {
      for (const d of docs) fn({ id: d.id, data: () => d.data });
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  listeners = [];
  renderCounts.clear();
  // collection(db, ...segments) → a path-bearing ref so onSnapshot can record
  // which subcollection each subscription targets.
  mockCollection.mockImplementation((_db: unknown, ...segs: string[]) => ({
    __path: segs.join('/'),
  }));
  // query(ref, ...) in the mock wraps the ref under `__query`; resolve back to
  // the path so onSnapshot sees it regardless of ordering constraints.
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

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const PLC_ID = 'plc-1';

function makePlc(overrides: Partial<Plc> = {}): Plc {
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
      'u-mate': {
        uid: 'u-mate',
        email: 'mate@x.edu',
        displayName: 'Mate',
        role: 'member',
        joinedAt: 2,
        status: 'active',
      },
    },
    leadUid: 'u-self',
    memberUids: ['u-self', 'u-mate'],
    memberEmails: { 'u-self': 'self@x.edu', 'u-mate': 'mate@x.edu' },
    sharedSheetUrl: null,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function wrapper(
  plc: Plc | null,
  section: PlcSectionId
): React.FC<{ children: React.ReactNode }> {
  const Wrapper: React.FC<{ children: React.ReactNode }> = function Wrapper({
    children,
  }) {
    return (
      <PlcProvider plcId={PLC_ID} plc={plc} activeSection={section}>
        {children}
      </PlcProvider>
    );
  };
  return Wrapper;
}

// ---------------------------------------------------------------------------
// 1. Listener dedup
// ---------------------------------------------------------------------------

describe('PlcProvider — listener dedup', () => {
  it('opens exactly ONE todos listener for many consumers under one provider', () => {
    const Consumer: React.FC = () => {
      usePlcTodosData();
      return null;
    };
    render(
      <PlcProvider plcId={PLC_ID} plc={makePlc()} activeSection="todos">
        <Consumer />
        <Consumer />
        <Consumer />
      </PlcProvider>
    );
    expect(subscriptionCount('todos')).toBe(1);
  });

  it('does NOT open a listener for a subcollection whose section is inactive', () => {
    render(
      <PlcProvider plcId={PLC_ID} plc={makePlc()} activeSection="members">
        <div />
      </PlcProvider>
    );
    // Members section needs no heavy listener — root+members ride the prop.
    expect(subscriptionCount('todos')).toBe(0);
    expect(subscriptionCount('notes')).toBe(0);
    expect(subscriptionCount('docs')).toBe(0);
    expect(subscriptionCount('contributions')).toBe(0);
    expect(subscriptionCount('quizzes')).toBe(0);
    expect(subscriptionCount('video_activities')).toBe(0);
  });

  it('gates contributions on the sharedData section', () => {
    const { rerender } = render(
      <PlcProvider plcId={PLC_ID} plc={makePlc()} activeSection="home">
        <div />
      </PlcProvider>
    );
    expect(subscriptionCount('contributions')).toBe(0);

    rerender(
      <PlcProvider plcId={PLC_ID} plc={makePlc()} activeSection="sharedData">
        <div />
      </PlcProvider>
    );
    expect(subscriptionCount('contributions')).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 2. Selector bailout
// ---------------------------------------------------------------------------

describe('usePlc* selectors — Object.is bailout', () => {
  it('re-renders a todos consumer on a todos update but NOT a docs consumer', () => {
    const TodosProbe: React.FC = function TodosProbe() {
      usePlcTodosData();
      bumpRender('todos');
      return null;
    };
    const DocsProbe: React.FC = function DocsProbe() {
      usePlcDocsData();
      bumpRender('docs');
      return null;
    };

    render(
      <PlcProvider plcId={PLC_ID} plc={makePlc()} activeSection="docs">
        <TodosProbe />
        <DocsProbe />
      </PlcProvider>
    );

    // 'docs' section gates both notes + docs ON, todos OFF. Both probes have
    // rendered at least once; record the baseline then push a DOCS snapshot.
    const todosBaseline = renderCount('todos');
    const docsBaseline = renderCount('docs');

    emit('docs', [
      {
        id: 'd1',
        data: {
          title: 'Plan',
          url: 'https://docs.google.com/x',
          createdBy: 'u-self',
          createdByName: 'Self',
          createdAt: 1,
          updatedAt: 1,
        },
      },
    ]);

    // Docs probe re-rendered (its slice changed); todos probe did not (its
    // slice — a settled empty slice — kept reference identity, Object.is bail).
    expect(renderCount('docs')).toBeGreaterThan(docsBaseline);
    expect(renderCount('todos')).toBe(todosBaseline);
  });

  it('usePlcRole derives the caller role off the root doc', () => {
    const cap: {
      self?: string | null;
      mate?: string | null;
      none?: string | null;
    } = {};
    const Probe: React.FC = () => {
      const self = usePlcRole('u-self');
      const mate = usePlcRole('u-mate');
      const none = usePlcRole('u-nobody');
      useEffect(() => {
        cap.self = self;
        cap.mate = mate;
        cap.none = none;
      });
      return null;
    };
    render(
      <PlcProvider plcId={PLC_ID} plc={makePlc()} activeSection="members">
        <Probe />
      </PlcProvider>
    );
    expect(cap.self).toBe('lead');
    expect(cap.mate).toBe('member');
    expect(cap.none).toBeNull();
  });

  it('usePlcRootDoc + usePlcMembers expose the root + active members', () => {
    const cap: { rootId?: string; memberUids?: string[] } = {};
    const Probe: React.FC = () => {
      const root = usePlcRootDoc();
      const uids = usePlcMembers().map((m) => m.uid);
      useEffect(() => {
        cap.rootId = root?.id;
        cap.memberUids = uids;
      });
      return null;
    };
    render(
      <PlcProvider plcId={PLC_ID} plc={makePlc()} activeSection="home">
        <Probe />
      </PlcProvider>
    );
    expect(cap.rootId).toBe(PLC_ID);
    expect([...(cap.memberUids ?? [])].sort()).toEqual(['u-mate', 'u-self']);
  });
});

// ---------------------------------------------------------------------------
// 3. Stub selectors
// ---------------------------------------------------------------------------

describe('presence/activity stub selectors', () => {
  it('return empty arrays this wave', () => {
    const cap: { presence?: unknown[]; activity?: unknown[] } = {};
    const Probe: React.FC = () => {
      const presence = usePlcPresence();
      const activity = usePlcActivity();
      useEffect(() => {
        cap.presence = presence;
        cap.activity = activity;
      });
      return null;
    };
    render(
      <PlcProvider plcId={PLC_ID} plc={makePlc()} activeSection="home">
        <Probe />
      </PlcProvider>
    );
    expect(cap.presence).toEqual([]);
    expect(cap.activity).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 4. Actions surface identity
// ---------------------------------------------------------------------------

describe('usePlcActions — mount-stable identity', () => {
  it('returns the same actions object across re-renders', () => {
    const captured: ReturnType<typeof usePlcActions>[] = [];
    const Probe: React.FC = () => {
      captured.push(usePlcActions());
      return null;
    };
    const { rerender } = render(
      <PlcProvider plcId={PLC_ID} plc={makePlc()} activeSection="home">
        <Probe />
      </PlcProvider>
    );
    rerender(
      <PlcProvider
        plcId={PLC_ID}
        plc={makePlc({ updatedAt: 2 })}
        activeSection="home"
      >
        <Probe />
      </PlcProvider>
    );
    const first = captured[0];
    expect(first).toBeDefined();
    for (const a of captured) expect(a).toBe(first);
  });

  it('exposes the membership + subcollection mutators', () => {
    const captured: ReturnType<typeof usePlcActions>[] = [];
    const Probe: React.FC = () => {
      captured.push(usePlcActions());
      return null;
    };
    render(
      <PlcProvider plcId={PLC_ID} plc={makePlc()} activeSection="home">
        <Probe />
      </PlcProvider>
    );
    const actions = captured[captured.length - 1];
    expect(actions).toBeDefined();
    if (!actions) return;
    expect(typeof actions.setMemberRole).toBe('function');
    expect(typeof actions.transferLead).toBe('function');
    expect(typeof actions.createNote).toBe('function');
    expect(typeof actions.createTodo).toBe('function');
    expect(typeof actions.createDoc).toBe('function');
  });

  it('throws when used outside a PlcProvider', () => {
    const Probe: React.FC = () => {
      usePlcActions();
      return null;
    };
    // Silence the expected error boundary console output.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => render(<Probe />)).toThrow(/PlcProvider/);
    spy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// 5. Standalone hook reads through the provider (dedup at the call site)
// ---------------------------------------------------------------------------

describe('usePlcContributions via the provider', () => {
  it('reads the provider slice without opening a second listener', () => {
    const Wrapper = wrapper(makePlc(), 'sharedData');
    const captured: ReturnType<typeof usePlcContributions>[] = [];
    const Probe: React.FC = () => {
      captured.push(usePlcContributions(PLC_ID));
      return null;
    };
    render(
      <Wrapper>
        <Probe />
      </Wrapper>
    );
    // Provider opened exactly one contributions listener; the standalone hook
    // did not add a second.
    expect(subscriptionCount('contributions')).toBe(1);

    emit('contributions', [
      {
        id: 'quiz-a_u-self',
        data: {
          schemaVersion: 1,
          quizId: 'quiz-a',
          syncGroupId: 'g1',
          teacherUid: 'u-self',
          teacherName: 'Self',
          updatedAt: 5,
          questionsSnapshot: [],
          responses: [],
        },
      },
    ]);
    const result = captured[captured.length - 1];
    expect(result?.contributions).toHaveLength(1);
    expect(result?.error).toBeNull();
    expect(subscriptionCount('contributions')).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 5b. Gated-off slices fall through to the standalone listener (Home cards)
// ---------------------------------------------------------------------------

describe('standalone hooks read through their own listener on gated-off sections', () => {
  // The provider is mounted on the Home section (PlcRouteHost → PlcProvider →
  // PlcHome), where `docs` and `contributions` are gated OFF (SLICE_SECTIONS).
  // The back-compat bridge must hand those cards `null` so they open their own
  // onSnapshot — otherwise RecentDocsCard / AttentionCard render an empty state
  // even when docs/contributions exist (Wave-1 exit criterion regression).

  it('usePlcDocs opens its own docs listener and emits real data when docs are gated off', () => {
    const Wrapper = wrapper(makePlc(), 'home');
    const captured: ReturnType<typeof usePlcDocs>[] = [];
    const Probe: React.FC = () => {
      captured.push(usePlcDocs(PLC_ID));
      return null;
    };
    render(
      <Wrapper>
        <Probe />
      </Wrapper>
    );

    // Provider did NOT open a docs listener (Home gates docs off); the
    // standalone hook opened exactly one.
    expect(subscriptionCount('docs')).toBe(1);

    emit('docs', [
      {
        id: 'd1',
        data: {
          title: 'Plan',
          url: 'https://docs.google.com/x',
          createdBy: 'u-self',
          createdByName: 'Self',
          createdAt: 1,
          updatedAt: 1,
        },
      },
    ]);

    const result = captured[captured.length - 1];
    expect(result?.docs).toHaveLength(1);
    expect(result?.docs[0]?.title).toBe('Plan');
    expect(result?.loading).toBe(false);
    expect(result?.error).toBeNull();
  });

  it('usePlcContributions opens its own listener and emits real data when contributions are gated off', () => {
    const Wrapper = wrapper(makePlc(), 'home');
    const captured: ReturnType<typeof usePlcContributions>[] = [];
    const Probe: React.FC = () => {
      captured.push(usePlcContributions(PLC_ID));
      return null;
    };
    render(
      <Wrapper>
        <Probe />
      </Wrapper>
    );

    // Home gates contributions off — the standalone hook owns the only listener.
    expect(subscriptionCount('contributions')).toBe(1);

    emit('contributions', [
      {
        id: 'quiz-a_u-self',
        data: {
          schemaVersion: 1,
          quizId: 'quiz-a',
          syncGroupId: 'g1',
          teacherUid: 'u-self',
          teacherName: 'Self',
          updatedAt: 5,
          questionsSnapshot: [],
          responses: [],
        },
      },
    ]);

    const result = captured[captured.length - 1];
    expect(result?.contributions).toHaveLength(1);
    expect(result?.loading).toBe(false);
    expect(result?.error).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 6. Contributions error contract — Error | null (standalone, no provider)
// ---------------------------------------------------------------------------

describe('usePlcContributions — error contract is Error | null', () => {
  it('surfaces the snapshot error as an Error instance (not a string)', () => {
    const captured: ReturnType<typeof usePlcContributions>[] = [];
    const Probe: React.FC = () => {
      captured.push(usePlcContributions(PLC_ID));
      return null;
    };
    // No provider mounted → standalone subscription.
    render(<Probe />);
    const listener = listeners.find((l) => l.path.endsWith('/contributions'));
    expect(listener).toBeDefined();
    if (!listener) return;

    act(() =>
      listener.onError(new Error('Missing or insufficient permissions.'))
    );

    const result = captured[captured.length - 1];
    expect(result?.error).toBeInstanceOf(Error);
    expect(result?.error?.message).toBe('Missing or insufficient permissions.');
  });

  it('clears the error to null on a subsequent successful snapshot', () => {
    const captured: ReturnType<typeof usePlcContributions>[] = [];
    const Probe: React.FC = () => {
      captured.push(usePlcContributions(PLC_ID));
      return null;
    };
    render(<Probe />);
    const listener = listeners.find((l) => l.path.endsWith('/contributions'));
    expect(listener).toBeDefined();
    if (!listener) return;

    act(() => listener.onError(new Error('blip')));
    expect(captured[captured.length - 1]?.error).toBeInstanceOf(Error);

    act(() => listener.onNext(fakeSnap([])));
    expect(captured[captured.length - 1]?.error).toBeNull();
  });
});
