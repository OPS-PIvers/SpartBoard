# Public Poll Participation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the Poll widget a public, anonymous, device-voting flow (scan a QR / open a link → vote from your phone → live tallies on the projected board), mirroring the Activity Wall participant pattern.

**Architecture:** A new anonymous `/poll/:pollId` route renders `PollVoteApp`, which decodes a base64 `?data=` payload, signs in anonymously, and writes one uid-keyed vote doc to `poll_sessions/{teacherUid}_{pollId}/votes/{participantUid}`. The teacher starts/stops a session from the widget settings or the phone remote; while a session is live the board (and remote) replace the manual ±/show-of-hands tally with live aggregated counts and display the join QR. Server-side, a session doc's `active` flag and Firestore rules enforce one-vote-per-device, in-range option indices, and start/stop.

**Tech Stack:** React 19 + TypeScript, Firebase (anonymous Auth + Firestore), Vitest + Testing Library (unit), `@firebase/rules-unit-testing` + Firestore emulator (rules), Tailwind. Spec: [docs/superpowers/specs/2026-06-14-public-poll-participation-design.md](../specs/2026-06-14-public-poll-participation-design.md).

---

## File Structure

**Create:**

- `components/poll/pollLink.ts` — payload type + `encodePollData` / `buildPublicPollLink` / `decodePollPayload` (the join-link codec, shared by widget, remote, and participant app).
- `components/poll/pollLink.test.ts` — round-trip + malformed-input tests.
- `components/poll/pollSession.ts` — `makePollSessionId`, `aggregateVotes`, `startPollSession`, `stopPollSession` (session orchestration + tally aggregation).
- `components/poll/pollSession.test.ts` — pure-helper + Firestore-write tests.
- `components/poll/PollVoteApp.tsx` — the anonymous participant voting app.
- `components/poll/PollVoteApp.test.tsx` — decode/vote/live-tally tests.
- `components/remote/controls/RemotePollControl.test.tsx` — new tests for the extended remote control.
- `tests/rules/pollVotesProtection.test.ts` — Firestore-rules tests for `poll_sessions`.

**Modify:**

- `types.ts:1165-1168` — extend `PollConfig` with `activePollSessionId` + `lastPollSessionId`.
- `App.tsx` (lazy imports ~`103`; route guards ~`407`; render branch ~`661`) — add the `/poll` route.
- `components/widgets/PollWidget/Widget.tsx` — session-backed live tally mode, replace-when-live, on-board join QR.
- `components/widgets/PollWidget/Settings.tsx` — "Live Device Voting" start/stop + Resume/Restart popover.
- `components/widgets/PollWidget/PollWidget.test.tsx` — add `useAuth` + `firebase/firestore` mocks; new live-mode + start tests.
- `components/remote/controls/RemotePollControl.tsx` — QR panel + start/stop + Resume/Restart popover + live tallies.
- `firestore.rules` (after the `activity_wall_sessions` block, ~`3289`) — `poll_sessions` + `votes` rules.

---

## Task 1: Extend `PollConfig` with session fields

**Files:**

- Modify: `types.ts:1165-1168`

- [ ] **Step 1: Add the two session fields to `PollConfig`**

Replace the existing block at `types.ts:1165-1168`:

```typescript
export interface PollConfig {
  question: string;
  options: PollOption[];
}
```

with:

```typescript
export interface PollConfig {
  question: string;
  options: PollOption[];
  /**
   * Public device-voting session id. When non-null, a public poll session
   * is LIVE: the board shows aggregated tallies from
   * `poll_sessions/{teacherUid}_{activePollSessionId}/votes` and manual ±
   * voting is disabled. This id is also the `:pollId` route segment of the
   * participant join link.
   */
  activePollSessionId?: string | null;
  /**
   * Most recent session id. Kept after a session stops so "Resume" can
   * reopen the same `poll_sessions` doc (and its prior votes); "Restart"
   * mints a fresh id instead.
   */
  lastPollSessionId?: string | null;
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `pnpm run type-check`
Expected: PASS (no errors). Both fields are optional, so existing `PollConfig` usages remain valid.

- [ ] **Step 3: Commit**

```bash
git add types.ts
git commit -m "[AI] Poll: add activePollSessionId + lastPollSessionId to PollConfig

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: `pollLink.ts` — join-link codec

**Files:**

- Create: `components/poll/pollLink.ts`
- Test: `components/poll/pollLink.test.ts`

- [ ] **Step 1: Write the failing test**

Create `components/poll/pollLink.test.ts`:

```typescript
import { describe, it, expect, afterEach } from 'vitest';
import {
  encodePollData,
  buildPublicPollLink,
  decodePollPayload,
  type PollVotePayload,
} from './pollLink';

const payload: PollVotePayload = {
  id: 'session-abc',
  question: 'Best season?',
  options: [
    { id: 'o1', label: 'Spring' },
    { id: 'o2', label: 'Fall' },
  ],
  teacherUid: 'teacher-1',
};

// decodePollPayload reads window.location.search; set it per-test.
const setSearch = (search: string) => {
  window.history.replaceState({}, '', `/poll/session-abc${search}`);
};

afterEach(() => {
  window.history.replaceState({}, '', '/');
});

describe('pollLink', () => {
  it('round-trips a payload through encode → decode', () => {
    const encoded = encodePollData(payload);
    setSearch(`?data=${encoded}`);
    expect(decodePollPayload()).toEqual(payload);
  });

  it('buildPublicPollLink embeds the pollId path and ?data= payload', () => {
    const link = buildPublicPollLink(payload);
    expect(link).toContain('/poll/session-abc?data=');
    const data = link.split('data=')[1];
    setSearch(`?data=${data}`);
    expect(decodePollPayload()?.question).toBe('Best season?');
  });

  it('returns null when there is no ?data= param', () => {
    setSearch('');
    expect(decodePollPayload()).toBeNull();
  });

  it('returns null for a malformed ?data= param', () => {
    setSearch('?data=not-valid-base64-%%%');
    expect(decodePollPayload()).toBeNull();
  });

  it('returns null when the decoded JSON is missing required fields', () => {
    const bad = encodeURIComponent(btoa(JSON.stringify({ id: 'x' })));
    setSearch(`?data=${bad}`);
    expect(decodePollPayload()).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run components/poll/pollLink.test.ts`
Expected: FAIL — `Failed to resolve import "./pollLink"`.

- [ ] **Step 3: Write the implementation**

Create `components/poll/pollLink.ts`:

```typescript
/**
 * Public-poll join-link codec. Mirrors the Activity Wall `?data=<base64>`
 * shape (`components/remote/controls/RemoteActivityWallControl.tsx` →
 * `encodeActivityData`, and `ActivityWallStudentApp.tsx` → `decodeBase64Utf8`)
 * so the participant app can render without a Firestore read of the poll
 * config. Centralised here (one module) rather than duplicated across the
 * widget, remote, and participant app the way Activity Wall duplicated its
 * encoder.
 */

export interface PollVotePayloadOption {
  id: string;
  label: string;
}

export interface PollVotePayload {
  /** The poll session id — the `:pollId` route segment. */
  id: string;
  question: string;
  options: PollVotePayloadOption[];
  /** Owning teacher uid; half of the `poll_sessions` doc key. */
  teacherUid: string;
}

const isPollVotePayload = (value: unknown): value is PollVotePayload => {
  if (typeof value !== 'object' || value === null) return false;
  const p = value as {
    id?: unknown;
    question?: unknown;
    options?: unknown;
    teacherUid?: unknown;
  };
  return (
    typeof p.id === 'string' &&
    p.id.length > 0 &&
    typeof p.question === 'string' &&
    typeof p.teacherUid === 'string' &&
    p.teacherUid.length > 0 &&
    Array.isArray(p.options) &&
    p.options.every(
      (o) =>
        typeof o === 'object' &&
        o !== null &&
        typeof (o as { id?: unknown }).id === 'string' &&
        typeof (o as { label?: unknown }).label === 'string'
    )
  );
};

export const encodePollData = (payload: PollVotePayload): string => {
  const json = JSON.stringify(payload);
  const bytes = new TextEncoder().encode(json);
  let binary = '';
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return encodeURIComponent(btoa(binary));
};

export const buildPublicPollLink = (payload: PollVotePayload): string => {
  const encoded = encodePollData(payload);
  return `${window.location.origin}/poll/${payload.id}?data=${encoded}`;
};

const decodeBase64Utf8 = (value: string): string | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const binary = atob(decodeURIComponent(trimmed));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
};

export const decodePollPayload = (): PollVotePayload | null => {
  const params = new URLSearchParams(window.location.search);
  const encoded = params.get('data');
  if (!encoded) return null;
  const json = decodeBase64Utf8(encoded);
  if (!json) return null;
  try {
    const parsed = JSON.parse(json) as unknown;
    return isPollVotePayload(parsed) ? parsed : null;
  } catch {
    return null;
  }
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run components/poll/pollLink.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add components/poll/pollLink.ts components/poll/pollLink.test.ts
git commit -m "[AI] Poll: add shared public-poll join-link codec (pollLink.ts)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: `pollSession.ts` — session id + tally + start/stop

**Files:**

- Create: `components/poll/pollSession.ts`
- Test: `components/poll/pollSession.test.ts`

- [ ] **Step 1: Write the failing test**

Create `components/poll/pollSession.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { PollConfig } from '@/types';

const { mockSetDoc, mockDoc } = vi.hoisted(() => ({
  mockSetDoc: vi.fn(),
  mockDoc: vi.fn((..._args: unknown[]) => ({
    __path: _args.slice(1).join('/'),
  })),
}));

vi.mock('@/config/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  doc: mockDoc,
  setDoc: mockSetDoc,
}));

import {
  makePollSessionId,
  aggregateVotes,
  startPollSession,
  stopPollSession,
} from './pollSession';

beforeEach(() => {
  vi.clearAllMocks();
  mockSetDoc.mockResolvedValue(undefined);
});

describe('makePollSessionId', () => {
  it('joins teacher uid and poll session id with an underscore', () => {
    expect(makePollSessionId('teacher-1', 'sess-9')).toBe('teacher-1_sess-9');
  });
});

describe('aggregateVotes', () => {
  it('counts votes per option index', () => {
    const votes = [{ optionIndex: 0 }, { optionIndex: 2 }, { optionIndex: 0 }];
    expect(aggregateVotes(votes, 3)).toEqual([2, 0, 1]);
  });

  it('ignores out-of-range / non-integer indices', () => {
    const votes = [
      { optionIndex: 0 },
      { optionIndex: 5 },
      { optionIndex: -1 },
      { optionIndex: 1.5 },
    ];
    expect(aggregateVotes(votes, 2)).toEqual([1, 0]);
  });
});

const baseConfig: PollConfig = {
  question: 'Q?',
  options: [
    { id: 'o1', label: 'A', votes: 0 },
    { id: 'o2', label: 'B', votes: 0 },
  ],
};

describe('startPollSession', () => {
  it('fresh: mints an id, writes an active session doc, returns updated config', async () => {
    const next = await startPollSession(baseConfig, 'teacher-1', 'fresh');
    expect(typeof next.activePollSessionId).toBe('string');
    expect(next.activePollSessionId).toBeTruthy();
    expect(mockSetDoc).toHaveBeenCalledTimes(1);
    const [, payload] = mockSetDoc.mock.calls[0];
    expect(payload).toMatchObject({
      teacherUid: 'teacher-1',
      optionCount: 2,
      active: true,
    });
  });

  it('resume: reuses lastPollSessionId', async () => {
    const next = await startPollSession(
      { ...baseConfig, lastPollSessionId: 'prev-1' },
      'teacher-1',
      'resume'
    );
    expect(next.activePollSessionId).toBe('prev-1');
    expect(mockDoc).toHaveBeenCalledWith(
      {},
      'poll_sessions',
      'teacher-1_prev-1'
    );
  });
});

describe('stopPollSession', () => {
  it('marks the session inactive and moves the id to lastPollSessionId', async () => {
    const next = await stopPollSession(
      { ...baseConfig, activePollSessionId: 'sess-7' },
      'teacher-1'
    );
    expect(next.activePollSessionId).toBeNull();
    expect(next.lastPollSessionId).toBe('sess-7');
    const [, payload] = mockSetDoc.mock.calls[0];
    expect(payload).toMatchObject({ active: false });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run components/poll/pollSession.test.ts`
Expected: FAIL — `Failed to resolve import "./pollSession"`.

- [ ] **Step 3: Write the implementation**

Create `components/poll/pollSession.ts`:

```typescript
/**
 * Public-poll session orchestration: deriving the `poll_sessions` doc key,
 * aggregating the live votes subcollection client-side, and starting/stopping
 * a session (the server-enforced `active` flag). Shared by the widget
 * (Settings + board) and the phone remote so all three drive the same state.
 */

import { doc, setDoc } from 'firebase/firestore';
import { db } from '@/config/firebase';
import type { PollConfig } from '@/types';

/** `poll_sessions` doc id: `{teacherUid}_{pollSessionId}`. */
export const makePollSessionId = (
  teacherUid: string,
  pollSessionId: string
): string => `${teacherUid}_${pollSessionId}`;

/** Tally raw vote docs into a count-per-option-index array. */
export const aggregateVotes = (
  votes: { optionIndex: number }[],
  optionCount: number
): number[] => {
  const tally = new Array<number>(optionCount).fill(0);
  for (const vote of votes) {
    const i = vote.optionIndex;
    if (Number.isInteger(i) && i >= 0 && i < optionCount) {
      tally[i] += 1;
    }
  }
  return tally;
};

/**
 * Open (or reopen) a public voting session. `mode: 'fresh'` mints a new id
 * (tallies start at zero); `mode: 'resume'` reuses `config.lastPollSessionId`
 * (prior votes persist). Writes/updates the session doc with `active: true`
 * and returns the config to persist via `updateWidget`.
 */
export const startPollSession = async (
  config: PollConfig,
  teacherUid: string,
  mode: 'fresh' | 'resume'
): Promise<PollConfig> => {
  const pollSessionId =
    mode === 'resume' && config.lastPollSessionId
      ? config.lastPollSessionId
      : crypto.randomUUID();
  await setDoc(
    doc(db, 'poll_sessions', makePollSessionId(teacherUid, pollSessionId)),
    {
      id: pollSessionId,
      teacherUid,
      optionCount: config.options.length,
      active: true,
      updatedAt: Date.now(),
    },
    { merge: true }
  );
  return { ...config, activePollSessionId: pollSessionId };
};

/**
 * Close the active session: flips the session doc to `active: false`
 * (blocking further votes server-side) and parks the id in
 * `lastPollSessionId` so it can be resumed.
 */
export const stopPollSession = async (
  config: PollConfig,
  teacherUid: string
): Promise<PollConfig> => {
  const active = config.activePollSessionId ?? null;
  if (active) {
    await setDoc(
      doc(db, 'poll_sessions', makePollSessionId(teacherUid, active)),
      { active: false, updatedAt: Date.now() },
      { merge: true }
    );
  }
  return {
    ...config,
    activePollSessionId: null,
    lastPollSessionId: active ?? config.lastPollSessionId ?? null,
  };
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run components/poll/pollSession.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add components/poll/pollSession.ts components/poll/pollSession.test.ts
git commit -m "[AI] Poll: add session helpers (id, tally aggregation, start/stop)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: `PollVoteApp.tsx` — anonymous participant app

**Files:**

- Create: `components/poll/PollVoteApp.tsx`
- Test: `components/poll/PollVoteApp.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `components/poll/PollVoteApp.test.tsx`:

```typescript
import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { encodePollData, type PollVotePayload } from './pollLink';

const { mockSignInAnonymously, mockSetDoc, mockOnSnapshot, mockCollection, mockDoc } =
  vi.hoisted(() => ({
    mockSignInAnonymously: vi.fn(),
    mockSetDoc: vi.fn(),
    mockOnSnapshot: vi.fn(),
    mockCollection: vi.fn(() => 'votes-col'),
    mockDoc: vi.fn((..._args: unknown[]) => ({ __path: _args.slice(1).join('/') })),
  }));

let snapshotDocs: Record<string, unknown>[] = [];

vi.mock('@/config/firebase', () => ({
  db: {},
  auth: { currentUser: { uid: 'voter-1' } },
}));
vi.mock('firebase/auth', () => ({ signInAnonymously: mockSignInAnonymously }));
vi.mock('firebase/firestore', () => ({
  collection: mockCollection,
  doc: mockDoc,
  onSnapshot: mockOnSnapshot,
  setDoc: mockSetDoc,
}));

import { PollVoteApp } from './PollVoteApp';

const payload: PollVotePayload = {
  id: 'sess-1',
  question: 'Favorite fruit?',
  options: [
    { id: 'o1', label: 'Apple' },
    { id: 'o2', label: 'Banana' },
  ],
  teacherUid: 'teacher-1',
};

const mountWith = (search: string) =>
  window.history.replaceState({}, '', `/poll/sess-1${search}`);

beforeEach(() => {
  vi.clearAllMocks();
  snapshotDocs = [];
  mockSignInAnonymously.mockResolvedValue(undefined);
  mockSetDoc.mockResolvedValue(undefined);
  mockOnSnapshot.mockImplementation(
    (_ref: unknown, cb: (snap: { docs: { data: () => Record<string, unknown> }[] }) => void) => {
      cb({ docs: snapshotDocs.map((d) => ({ data: () => d })) });
      return vi.fn();
    }
  );
});

afterEach(() => {
  window.history.replaceState({}, '', '/');
});

describe('PollVoteApp', () => {
  it('shows an error state when there is no payload', () => {
    mountWith('');
    render(<PollVoteApp />);
    expect(screen.getByText(/isn't available/i)).toBeInTheDocument();
  });

  it('renders the question and option buttons from the payload', () => {
    mountWith(`?data=${encodePollData(payload)}`);
    render(<PollVoteApp />);
    expect(screen.getByText('Favorite fruit?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Apple/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Banana/i })).toBeInTheDocument();
  });

  it('casts a vote to the uid-keyed doc and shows confirmation', async () => {
    mountWith(`?data=${encodePollData(payload)}`);
    render(<PollVoteApp />);

    await userEvent.click(screen.getByRole('button', { name: /Banana/i }));

    await waitFor(() => {
      expect(mockSetDoc).toHaveBeenCalledWith(
        { __path: 'poll_sessions/teacher-1_sess-1/votes/voter-1' },
        { optionIndex: 1, votedAt: expect.any(Number) }
      );
    });
    expect(await screen.findByText(/your vote is in/i)).toBeInTheDocument();
  });

  it('renders the live tally from the votes subscription', async () => {
    snapshotDocs = [{ optionIndex: 0 }, { optionIndex: 0 }, { optionIndex: 1 }];
    mountWith(`?data=${encodePollData(payload)}`);
    render(<PollVoteApp />);

    // Apple shows 2, Banana shows 1 once a vote is cast (tally is revealed
    // after voting). Vote, then assert.
    await userEvent.click(screen.getByRole('button', { name: /Apple/i }));
    expect(await screen.findByText(/your vote is in/i)).toBeInTheDocument();
    expect(screen.getByTestId('poll-tally-0')).toHaveTextContent('2');
    expect(screen.getByTestId('poll-tally-1')).toHaveTextContent('1');
  });

  it('shows a closed state when the vote write is rejected', async () => {
    mockSetDoc.mockRejectedValueOnce(new Error('permission-denied'));
    mountWith(`?data=${encodePollData(payload)}`);
    render(<PollVoteApp />);

    await userEvent.click(screen.getByRole('button', { name: /Apple/i }));
    expect(await screen.findByText(/voting is closed/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run components/poll/PollVoteApp.test.tsx`
Expected: FAIL — `Failed to resolve import "./PollVoteApp"`.

- [ ] **Step 3: Write the implementation**

Create `components/poll/PollVoteApp.tsx`:

```typescript
import React, { useEffect, useMemo, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { auth, db } from '@/config/firebase';
import { signInAnonymously } from 'firebase/auth';
import { collection, doc, onSnapshot, setDoc } from 'firebase/firestore';
import { decodePollPayload, type PollVotePayload } from './pollLink';
import { aggregateVotes, makePollSessionId } from './pollSession';

type State =
  | { kind: 'ready'; payload: PollVotePayload }
  | { kind: 'error' };

/**
 * Anonymous, audience-facing poll voting app served at `/poll/:pollId`.
 * The `?data=` payload is authoritative (no Firestore read needed to render);
 * the participant signs in anonymously, writes one uid-keyed vote doc, and
 * sees the live tally. Re-tapping a different option overwrites the prior
 * vote (one vote per device) until the teacher closes voting.
 */
export const PollVoteApp: React.FC = () => {
  // Parse synchronously at mount so URL launches render with no loading flash.
  const payload = useMemo(() => decodePollPayload(), []);
  const [state] = useState<State>(() =>
    payload ? { kind: 'ready', payload } : { kind: 'error' }
  );

  const ready = state.kind === 'ready' ? state.payload : null;
  const sessionId = useMemo(
    () => (ready ? makePollSessionId(ready.teacherUid, ready.id) : ''),
    [ready]
  );

  const [votedIndex, setVotedIndex] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [closed, setClosed] = useState(false);
  const [tally, setTally] = useState<number[]>([]);

  // Subscribe to the live votes subcollection (read is open to any authed
  // user — anonymous vote docs carry no PII). Sign in anonymously first so
  // the read is authorized. This is synchronisation with an external system,
  // which is what useEffect is for.
  useEffect(() => {
    if (!ready) return;
    let unsubscribe = () => {};
    let cancelled = false;
    void (async () => {
      try {
        if (!auth.currentUser) {
          await signInAnonymously(auth);
        }
      } catch {
        // If anonymous sign-in fails the listener simply won't attach;
        // the vote attempt below will surface the error.
      }
      if (cancelled) return;
      unsubscribe = onSnapshot(
        collection(db, 'poll_sessions', sessionId, 'votes'),
        (snap) => {
          const votes = snap.docs.map(
            (d) => d.data() as { optionIndex: number }
          );
          setTally(aggregateVotes(votes, ready.options.length));
        }
      );
    })();
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [ready, sessionId]);

  const castVote = async (index: number) => {
    if (!ready) return;
    setSubmitting(true);
    try {
      if (!auth.currentUser) {
        await signInAnonymously(auth);
      }
      const uid = auth.currentUser?.uid;
      if (!uid) throw new Error('no-auth');
      await setDoc(doc(db, 'poll_sessions', sessionId, 'votes', uid), {
        optionIndex: index,
        votedAt: Date.now(),
      });
      setVotedIndex(index);
      setClosed(false);
    } catch {
      // A rejected write means the session is inactive (closed) or the link
      // is no longer valid. Show the same clean closed state either way.
      setClosed(true);
    } finally {
      setSubmitting(false);
    }
  };

  if (!ready) {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center p-4 text-center">
        This poll isn&apos;t available right now. Ask your teacher for a new
        link.
      </div>
    );
  }

  const total = tally.reduce((sum, n) => sum + n, 0);
  const hasVoted = votedIndex !== null;

  return (
    <div className="h-screen overflow-y-auto bg-slate-100">
      <div className="min-h-full flex items-center justify-center p-4 sm:p-6">
        <div className="w-full max-w-xl bg-white rounded-2xl shadow-xl overflow-hidden">
          <div className="bg-brand-blue-primary text-white px-5 py-4">
            <p className="text-xs uppercase tracking-widest font-bold opacity-90">
              Poll
            </p>
            <h1 className="text-xl font-black">{ready.question}</h1>
          </div>

          <div className="p-5 space-y-3">
            {hasVoted && (
              <div className="flex items-center justify-center gap-2 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-2 text-emerald-700 text-sm font-bold">
                <Check className="w-4 h-4" />
                Your vote is in! Tap another option to change it.
              </div>
            )}

            {closed && (
              <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-2 text-amber-700 text-sm font-medium text-center">
                Voting is closed.
              </div>
            )}

            {ready.options.map((option, index) => {
              const count = tally[index] ?? 0;
              const percent = total === 0 ? 0 : Math.round((count / total) * 100);
              const isMine = votedIndex === index;
              return (
                <button
                  key={option.id}
                  type="button"
                  disabled={submitting}
                  onClick={() => {
                    void castVote(index);
                  }}
                  className={`w-full text-left rounded-xl border p-4 transition-all active:scale-[0.99] disabled:opacity-60 ${
                    isMine
                      ? 'border-emerald-400 bg-emerald-50'
                      : 'border-slate-300 bg-white hover:border-brand-blue-primary'
                  }`}
                  aria-pressed={isMine}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-bold text-slate-800">
                      {option.label}
                    </span>
                    {hasVoted && (
                      <span
                        className="font-mono text-sm text-slate-500 whitespace-nowrap"
                        data-testid={`poll-tally-${index}`}
                      >
                        {count} ({percent}%)
                      </span>
                    )}
                  </div>
                  {hasVoted && (
                    <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className={`h-full transition-all duration-500 ${
                          isMine ? 'bg-emerald-500' : 'bg-indigo-500'
                        }`}
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  )}
                </button>
              );
            })}

            {submitting && (
              <div className="flex items-center justify-center gap-2 text-slate-400 text-sm">
                <Loader2 className="w-4 h-4 animate-spin" />
                Sending your vote…
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run components/poll/PollVoteApp.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add components/poll/PollVoteApp.tsx components/poll/PollVoteApp.test.tsx
git commit -m "[AI] Poll: add anonymous PollVoteApp participant voting view

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Wire the `/poll` route in `App.tsx`

**Files:**

- Modify: `App.tsx` (lazy import block ~`103`; route-guard block ~`407`; render branch ~`661`)

This step has no isolated unit test (mounting `App` boots the full provider/route tree); it is verified by `pnpm run type-check`, `pnpm run build`, and the manual two-device check in Task 11. `PollVoteApp` itself is covered by Task 4.

- [ ] **Step 1: Add the lazy import**

In `App.tsx`, immediately after the `ActivityWallGalleryView` lazy definition (ends ~line 103), add:

```typescript
const PollVoteApp = lazy(() =>
  import('./components/poll/PollVoteApp').then((module) => ({
    default: module.PollVoteApp,
  }))
);
```

- [ ] **Step 2: Add the route guard**

In `App.tsx`, immediately after the `isActivityWallRoute` declaration (~line 407), add:

```typescript
const isPollVoteRoute = pathname === '/poll' || pathname.startsWith('/poll/');
```

- [ ] **Step 3: Add the render branch**

In `App.tsx`, immediately after the `if (isActivityWallRoute) { ... }` block closes (~line 661), add:

```typescript
  // Public poll voting route — anonymous entry, no teacher auth needed.
  // Mirrors the activity-wall branch: DialogProvider + StudentIdleTimeoutGuard
  // wrap a lazy participant app. The `?data=` payload carries everything the
  // app needs to render and route the vote.
  if (isPollVoteRoute) {
    return (
      <DialogProvider>
        <StudentIdleTimeoutGuard />
        <Suspense fallback={<FullPageLoader />}>
          <PollVoteApp />
        </Suspense>
        <DialogContainer />
      </DialogProvider>
    );
  }
```

- [ ] **Step 4: Verify build + types**

Run: `pnpm run type-check`
Expected: PASS.

Run: `pnpm run build`
Expected: build succeeds; output includes a `PollVoteApp` chunk.

- [ ] **Step 5: Commit**

```bash
git add App.tsx
git commit -m "[AI] Poll: add anonymous /poll/:pollId participant route

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Firestore rules for `poll_sessions`

**Files:**

- Test: `tests/rules/pollVotesProtection.test.ts`
- Modify: `firestore.rules` (insert after the `activity_wall_sessions` block, ~line 3289)

> Rules tests require the Firestore emulator. They are excluded from `pnpm test` and run via `pnpm run test:rules` (which wraps them in `firebase emulators:exec --only firestore`). That command runs ALL files under `tests/rules/`.

- [ ] **Step 1: Write the failing test**

Create `tests/rules/pollVotesProtection.test.ts`:

```typescript
// Firestore security-rules tests for public-poll voting
// (poll_sessions/{sessionId}/votes/{participantUid}).
//
// Contract under test:
//   - Session doc: any authed user reads; only a non-anonymous teacher whose
//     uid prefixes the sessionId (or an admin) creates/updates; no client delete.
//   - votes/{participantUid}: an authed (incl. anonymous) user may create/update
//     ONLY the doc whose id == their own uid, with exactly {optionIndex, votedAt},
//     optionIndex an int in [0, optionCount), and only while the session is
//     active. Reads are open to any authed user (anonymous tallies, no PII).
//     Delete (reset) is teacher/admin-only.
//
// Requires a running Firestore emulator. Invoke via: pnpm run test:rules

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { setDoc, getDoc, deleteDoc, doc } from 'firebase/firestore';

const PROJECT_ID = 'spartboard-poll-votes-protection-test';
const TEACHER_UID = 'teacher-poll';
const ACTIVE_POLL_ID = 'poll-active';
const CLOSED_POLL_ID = 'poll-closed';
const ACTIVE_SESSION_ID = `${TEACHER_UID}_${ACTIVE_POLL_ID}`;
const CLOSED_SESSION_ID = `${TEACHER_UID}_${CLOSED_POLL_ID}`;
const VOTER_UID = 'voter-anon';
const OTHER_UID = 'voter-other';

const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

const asAnonVoter = (uid = VOTER_UID) =>
  testEnv
    .authenticatedContext(uid, {
      email: '',
      firebase: { sign_in_provider: 'anonymous' },
    })
    .firestore();

const asTeacher = () =>
  testEnv
    .authenticatedContext(TEACHER_UID, {
      email: 'teacher@school.edu',
      firebase: { sign_in_provider: 'google.com' },
    })
    .firestore();

beforeAll(async () => {
  const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
  const [hostPart, portPart] = emulatorHost ? emulatorHost.split(':') : [];
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(RULES_PATH, 'utf8'),
      host: hostPart || '127.0.0.1',
      port: portPart ? Number(portPart) : 8080,
    },
  });
});

afterAll(async () => {
  await testEnv?.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, `poll_sessions/${ACTIVE_SESSION_ID}`), {
      id: ACTIVE_POLL_ID,
      teacherUid: TEACHER_UID,
      optionCount: 3,
      active: true,
      updatedAt: 1000,
    });
    await setDoc(doc(db, `poll_sessions/${CLOSED_SESSION_ID}`), {
      id: CLOSED_POLL_ID,
      teacherUid: TEACHER_UID,
      optionCount: 3,
      active: false,
      updatedAt: 1000,
    });
    // A pre-existing vote so read/delete tests have a target.
    await setDoc(
      doc(db, `poll_sessions/${ACTIVE_SESSION_ID}/votes/${OTHER_UID}`),
      { optionIndex: 0, votedAt: 1000 }
    );
  });
});

const voteRef = (
  db: ReturnType<typeof asAnonVoter>,
  uid: string,
  session = ACTIVE_SESSION_ID
) => doc(db, `poll_sessions/${session}/votes/${uid}`);

describe('poll votes — create/update', () => {
  it('control: anon voter writes their own vote with valid payload', async () => {
    await assertSucceeds(
      setDoc(voteRef(asAnonVoter(), VOTER_UID), {
        optionIndex: 1,
        votedAt: 2000,
      })
    );
  });

  it('rejects writing another participant’s vote doc', async () => {
    await assertFails(
      setDoc(voteRef(asAnonVoter(), OTHER_UID), {
        optionIndex: 1,
        votedAt: 2000,
      })
    );
  });

  it('rejects an out-of-range optionIndex', async () => {
    await assertFails(
      setDoc(voteRef(asAnonVoter(), VOTER_UID), {
        optionIndex: 3,
        votedAt: 2000,
      })
    );
  });

  it('rejects extra fields beyond optionIndex/votedAt', async () => {
    await assertFails(
      setDoc(voteRef(asAnonVoter(), VOTER_UID), {
        optionIndex: 1,
        votedAt: 2000,
        teacherUid: TEACHER_UID,
      })
    );
  });

  it('rejects a vote when the session is not active', async () => {
    await assertFails(
      setDoc(voteRef(asAnonVoter(), VOTER_UID, CLOSED_SESSION_ID), {
        optionIndex: 1,
        votedAt: 2000,
      })
    );
  });

  it('allows a voter to overwrite their own vote', async () => {
    await assertSucceeds(
      setDoc(voteRef(asAnonVoter(), VOTER_UID), {
        optionIndex: 0,
        votedAt: 2000,
      })
    );
    await assertSucceeds(
      setDoc(voteRef(asAnonVoter(), VOTER_UID), {
        optionIndex: 2,
        votedAt: 3000,
      })
    );
  });
});

describe('poll votes — read', () => {
  it('any authed user can read a vote doc (live tally)', async () => {
    await assertSucceeds(getDoc(voteRef(asAnonVoter(), OTHER_UID)));
  });
});

describe('poll votes — delete (reset)', () => {
  it('teacher can delete a vote', async () => {
    await assertSucceeds(deleteDoc(voteRef(asTeacher(), OTHER_UID)));
  });

  it('a participant cannot delete another participant’s vote', async () => {
    await assertFails(deleteDoc(voteRef(asAnonVoter(), OTHER_UID)));
  });
});

describe('poll session doc', () => {
  it('a non-anonymous teacher can create their own session doc', async () => {
    await assertSucceeds(
      setDoc(doc(asTeacher(), `poll_sessions/${TEACHER_UID}_new-poll`), {
        id: 'new-poll',
        teacherUid: TEACHER_UID,
        optionCount: 2,
        active: true,
        updatedAt: 4000,
      })
    );
  });

  it('an anonymous user cannot create a session doc', async () => {
    await assertFails(
      setDoc(doc(asAnonVoter(), `poll_sessions/${VOTER_UID}_x`), {
        id: 'x',
        teacherUid: VOTER_UID,
        optionCount: 2,
        active: true,
        updatedAt: 4000,
      })
    );
  });
});
```

- [ ] **Step 2: Run the rules tests to verify they fail**

Run: `pnpm run test:rules`
Expected: FAIL — the new `pollVotesProtection` tests fail because no `poll_sessions` rule exists yet, so the default deny-all rejects even the control "succeeds" cases. (Existing rules tests still pass.)

- [ ] **Step 3: Add the rules**

In `firestore.rules`, immediately after the `activity_wall_sessions` block's closing `}` (the line after `firestore.rules:3289`, before the `// === Video Activity assignments` comment), insert:

```
    // Poll Sessions — public, anonymous device-voting for the Poll widget.
    // sessionId is formatted as {teacherUid}_{pollSessionId}. The teacher owns
    // the session doc (UID prefix); participants write one uid-keyed vote each.
    match /poll_sessions/{sessionId} {
      // Reads are permissive for any authed caller (mirrors activity_wall_sessions).
      allow read: if request.auth != null;
      // Only a non-anonymous teacher whose uid prefixes the sessionId (or an
      // admin) may create/update the session doc itself.
      allow create, update: if request.auth != null &&
                            request.auth.token.firebase.sign_in_provider != 'anonymous' &&
                            (isAdmin() || sessionId.matches(request.auth.uid + '_.*'));
      allow delete: if false;

      match /votes/{participantUid} {
        function pollSession() {
          return get(/databases/$(database)/documents/poll_sessions/$(sessionId)).data;
        }

        // Any authed user (incl. anonymous) may create/update ONLY the vote
        // doc whose id equals their own uid. Exactly {optionIndex, votedAt};
        // optionIndex an int within [0, optionCount); only while the session
        // is active. Re-voting overwrites (one vote per device).
        allow create, update: if request.auth != null &&
          request.auth.uid == participantUid &&
          exists(/databases/$(database)/documents/poll_sessions/$(sessionId)) &&
          pollSession().get('active', false) == true &&
          request.resource.data.keys().hasOnly(['optionIndex', 'votedAt']) &&
          request.resource.data.optionIndex is int &&
          request.resource.data.optionIndex >= 0 &&
          request.resource.data.optionIndex < pollSession().get('optionCount', 0) &&
          request.resource.data.votedAt is int;

        // Reads open to any authed user — vote docs are anonymous tallies
        // (no PII), which is what powers the live results on phones + board.
        allow read: if request.auth != null;

        // Delete (reset) is teacher/admin-only.
        allow delete: if request.auth != null &&
          (isAdmin() || sessionId.matches(request.auth.uid + '_.*'));
      }
    }

```

- [ ] **Step 4: Validate rules syntax + run the rules tests**

Run: `pnpm run test:rules`
Expected: PASS — all `pollVotesProtection` tests pass (and all pre-existing rules tests stay green).

- [ ] **Step 5: Commit**

```bash
git add firestore.rules tests/rules/pollVotesProtection.test.ts
git commit -m "[AI] Poll: add poll_sessions Firestore rules + rules tests

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Widget board — live tally mode + on-board QR

**Files:**

- Modify: `components/widgets/PollWidget/Widget.tsx`
- Modify: `components/widgets/PollWidget/PollWidget.test.tsx`

- [ ] **Step 1: Add `useAuth` + `firebase/firestore` mocks to the test file (so existing tests survive the new imports), then write the failing live-mode tests**

At the TOP of `components/widgets/PollWidget/PollWidget.test.tsx`, the file already has `vi.mock('@/context/useAuth', () => ({ useAuth: vi.fn() }))`. Add a hoisted firestore mock block and a `firebase/firestore` mock immediately after the existing `vi.mock('@/context/useAuth', ...)` (around line 17):

```typescript
const { mockOnSnapshot, mockCollection, mockDoc, mockSetDoc } = vi.hoisted(
  () => ({
    mockOnSnapshot: vi.fn(),
    mockCollection: vi.fn(() => 'col'),
    mockDoc: vi.fn((..._args: unknown[]) => ({
      __path: _args.slice(1).join('/'),
    })),
    mockSetDoc: vi.fn(),
  })
);

let pollSnapshotDocs: Record<string, unknown>[] = [];

vi.mock('firebase/firestore', () => ({
  collection: mockCollection,
  doc: mockDoc,
  onSnapshot: mockOnSnapshot,
  setDoc: mockSetDoc,
  increment: (n: number) => ({ __increment: n }),
}));
```

In the `describe('PollWidget', ...)` `beforeEach` (currently lines 45-51), make it also configure `useAuth`, the firestore mocks, and reset the snapshot feed. Replace that `beforeEach` body with:

```typescript
beforeEach(() => {
  (useDashboard as Mock).mockReturnValue({
    updateWidget: mockUpdateWidget,
    activeDashboard: { globalStyle: { fontFamily: 'sans' } },
  });
  (useAuth as Mock).mockReturnValue({
    user: { uid: 'teacher-1' },
    canAccessFeature: vi.fn(() => true),
  });
  pollSnapshotDocs = [];
  mockSetDoc.mockResolvedValue(undefined);
  mockOnSnapshot.mockImplementation(
    (
      _ref: unknown,
      cb: (snap: { docs: { data: () => Record<string, unknown> }[] }) => void
    ) => {
      cb({ docs: pollSnapshotDocs.map((d) => ({ data: () => d })) });
      return vi.fn();
    }
  );
  vi.clearAllMocks();
});
```

> Note: `useAuth` is already imported at the top of this file (line 4) and mocked (lines 15-17). The existing manual-vote/reset tests don't set `activePollSessionId`, so the new live subscription effect stays dormant for them.

Add these new tests at the end of the `describe('PollWidget', ...)` block (after the existing reset test, before the block closes ~line 132):

```typescript
  it('shows live aggregated tallies from the session when voting is live', () => {
    pollSnapshotDocs = [
      { optionIndex: 0 },
      { optionIndex: 0 },
      { optionIndex: 1 },
    ];
    const widget: WidgetData = {
      id: 'poll-1',
      type: 'poll',
      w: 2,
      h: 2,
      x: 0,
      y: 0,
      z: 1,
      flipped: false,
      config: {
        question: 'Pick one',
        options: [
          { id: 'opt-1', label: 'Red', votes: 99 },
          { id: 'opt-2', label: 'Blue', votes: 99 },
        ],
        activePollSessionId: 'sess-1',
      },
    };

    render(<PollWidget widget={widget} />);

    // Live counts (2 / 1) replace the stale local config votes (99 / 99).
    expect(screen.getByText(/2 \(67%\)/)).toBeInTheDocument();
    expect(screen.getByText(/1 \(33%\)/)).toBeInTheDocument();
  });

  it('renders an on-board join QR + link when voting is live and anonymous-join is allowed', () => {
    const widget: WidgetData = {
      id: 'poll-1',
      type: 'poll',
      w: 2,
      h: 2,
      x: 0,
      y: 0,
      z: 1,
      flipped: false,
      config: {
        question: 'Pick one',
        options: [{ id: 'opt-1', label: 'Red', votes: 0 }],
        activePollSessionId: 'sess-1',
      },
    };

    render(<PollWidget widget={widget} />);

    const link = screen.getByTestId('poll-join-url');
    expect(link.textContent ?? '').toContain('/poll/sess-1');
    const qr = screen.getByAltText(/join qr/i);
    expect(qr.getAttribute('src') ?? '').toContain(
      'https://api.qrserver.com/v1/create-qr-code/'
    );
  });

  it('does not increment local votes when clicking an option while live', () => {
    const widget: WidgetData = {
      id: 'poll-1',
      type: 'poll',
      w: 2,
      h: 2,
      x: 0,
      y: 0,
      z: 1,
      flipped: false,
      config: {
        question: 'Pick one',
        options: [{ id: 'opt-1', label: 'Red', votes: 0 }],
        activePollSessionId: 'sess-1',
      },
    };

    render(<PollWidget widget={widget} />);
    fireEvent.click(screen.getByRole('button', { name: /Red/i }));
    expect(mockUpdateWidget).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run components/widgets/PollWidget/PollWidget.test.tsx`
Expected: FAIL — the three new tests fail (no live tally, no QR, manual vote still fires). Existing tests should still PASS.

- [ ] **Step 3: Implement the live mode in `Widget.tsx`**

Edit `components/widgets/PollWidget/Widget.tsx`.

(a) Update the imports at the top. Replace lines 1-15:

```typescript
import React, { useState, useEffect } from 'react';
import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  increment,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import { useDashboard } from '@/context/useDashboard';
import { WidgetData, PollConfig, DEFAULT_GLOBAL_STYLE } from '@/types';
import { RotateCcw } from 'lucide-react';

import { WidgetLayout } from '@/components/widgets/WidgetLayout';
import { useDialog } from '@/context/useDialog';
```

with:

```typescript
import React, { useState, useEffect } from 'react';
import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  increment,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import { useDashboard } from '@/context/useDashboard';
import { useAuth } from '@/context/useAuth';
import { WidgetData, PollConfig, DEFAULT_GLOBAL_STYLE } from '@/types';
import { RotateCcw, Radio } from 'lucide-react';

import { WidgetLayout } from '@/components/widgets/WidgetLayout';
import { useDialog } from '@/context/useDialog';
import { buildPublicPollLink } from '@/components/poll/pollLink';
import {
  aggregateVotes,
  makePollSessionId,
} from '@/components/poll/pollSession';
```

(b) Add auth + live-session state. After the existing `const options = ...` line (line 23) and before the announcement-votes state (line 28), add:

```typescript
const { user, canAccessFeature } = useAuth();
const activePollSessionId = config.activePollSessionId ?? null;
const isLive = !!activePollSessionId;

// Live device-voting tallies, aggregated from the votes subcollection.
const [sessionTally, setSessionTally] = useState<number[]>([]);
```

(c) Add the live-session subscription effect. Immediately after the existing announcement `useEffect` (which ends at line 47), add:

```typescript
// Subscribe to the public voting session's votes subcollection while a
// session is live. Aggregated counts replace the local/announcement tally
// on the board. Synchronisation with Firestore — the correct use of effect.
useEffect(() => {
  if (!activePollSessionId || !user) {
    setSessionTally([]);
    return;
  }
  const sessionId = makePollSessionId(user.uid, activePollSessionId);
  const unsub = onSnapshot(
    collection(db, 'poll_sessions', sessionId, 'votes'),
    (snap) => {
      const votes = snap.docs.map((d) => d.data() as { optionIndex: number });
      setSessionTally(aggregateVotes(votes, options.length));
    }
  );
  return unsub;
}, [activePollSessionId, user, options.length]);
```

(d) Guard the manual `vote()` against the live mode. Replace the start of `vote` (lines 49-59) — specifically add an early return at the top of the function body. Change:

```typescript
  const vote = (index: number) => {
    if (_announcementId) {
```

to:

```typescript
  const vote = (index: number) => {
    if (isLive) return; // Live device-voting: tallies come from participants.
    if (_announcementId) {
```

(e) Compute the live display options + join link. Replace the `displayOptions` block (lines 84-89):

```typescript
// Merge Firestore live counts with config option labels
const displayOptions = _announcementId
  ? options.map((o, i) => ({ ...o, votes: announcementVotes[i] ?? 0 }))
  : options;

const total = displayOptions.reduce((sum, o) => sum + o.votes, 0);
```

with:

```typescript
// Three tally modes: live public session > announcement > local config.
const displayOptions = isLive
  ? options.map((o, i) => ({ ...o, votes: sessionTally[i] ?? 0 }))
  : _announcementId
    ? options.map((o, i) => ({ ...o, votes: announcementVotes[i] ?? 0 }))
    : options;

const total = displayOptions.reduce((sum, o) => sum + o.votes, 0);

// On-board join link/QR for the live session (gated by anonymous-join).
const joinUrl =
  isLive && user && canAccessFeature('anonymous-join')
    ? buildPublicPollLink({
        id: activePollSessionId,
        question,
        options: options.map((o) => ({ id: o.id, label: o.label })),
        teacherUid: user.uid,
      })
    : '';
const qrUrl = joinUrl
  ? `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(
      joinUrl
    )}`
  : '';
```

(f) Disable the option buttons while live. In the option `<button>` (line 148), change:

```typescript
                disabled={_announcementId !== undefined && userVoted !== null}
```

to:

```typescript
                disabled={
                  isLive || (_announcementId !== undefined && userVoted !== null)
                }
```

(g) Swap the footer for a live join panel when a session is active. Replace the entire `footer={ ... }` prop (lines 172-200):

```typescript
      footer={
        !_announcementId ? (
          <div
            style={{
              paddingLeft: 'min(16px, 3cqmin)',
              paddingRight: 'min(16px, 3cqmin)',
              paddingBottom: 'min(8px, 1.5cqmin)',
            }}
          >
            <button
              onClick={handleReset}
              className="w-full flex items-center justify-center font-black uppercase text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
              style={{
                gap: 'min(8px, 2cqmin)',
                padding: 'min(8px, 1.5cqmin)',
                fontSize: 'min(14px, 4cqmin)',
              }}
            >
              <RotateCcw
                style={{
                  width: 'min(16px, 4cqmin)',
                  height: 'min(16px, 4cqmin)',
                }}
              />{' '}
              Reset Poll
            </button>
          </div>
        ) : null
      }
```

with:

```typescript
      footer={
        isLive ? (
          <div
            className="flex items-center justify-center"
            style={{
              gap: 'min(12px, 3cqmin)',
              paddingLeft: 'min(16px, 3cqmin)',
              paddingRight: 'min(16px, 3cqmin)',
              paddingBottom: 'min(8px, 1.5cqmin)',
            }}
          >
            {qrUrl ? (
              <>
                <img
                  src={qrUrl}
                  alt="Join QR code"
                  className="rounded bg-white"
                  style={{
                    width: 'min(72px, 22cqmin)',
                    height: 'min(72px, 22cqmin)',
                    padding: 'min(4px, 1cqmin)',
                  }}
                />
                <div className="flex flex-col min-w-0">
                  <span
                    className="flex items-center font-black uppercase text-emerald-600"
                    style={{
                      gap: 'min(4px, 1cqmin)',
                      fontSize: 'min(12px, 4cqmin)',
                    }}
                  >
                    <Radio
                      style={{
                        width: 'min(12px, 4cqmin)',
                        height: 'min(12px, 4cqmin)',
                      }}
                    />
                    Voting open
                  </span>
                  <code
                    data-testid="poll-join-url"
                    className="truncate text-indigo-500 font-mono"
                    style={{ fontSize: 'min(11px, 3.5cqmin)' }}
                  >
                    {joinUrl}
                  </code>
                </div>
              </>
            ) : (
              <span
                className="flex items-center font-black uppercase text-emerald-600"
                style={{ gap: 'min(4px, 1cqmin)', fontSize: 'min(12px, 4cqmin)' }}
              >
                <Radio
                  style={{
                    width: 'min(12px, 4cqmin)',
                    height: 'min(12px, 4cqmin)',
                  }}
                />
                Voting open
              </span>
            )}
          </div>
        ) : !_announcementId ? (
          <div
            style={{
              paddingLeft: 'min(16px, 3cqmin)',
              paddingRight: 'min(16px, 3cqmin)',
              paddingBottom: 'min(8px, 1.5cqmin)',
            }}
          >
            <button
              onClick={handleReset}
              className="w-full flex items-center justify-center font-black uppercase text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
              style={{
                gap: 'min(8px, 2cqmin)',
                padding: 'min(8px, 1.5cqmin)',
                fontSize: 'min(14px, 4cqmin)',
              }}
            >
              <RotateCcw
                style={{
                  width: 'min(16px, 4cqmin)',
                  height: 'min(16px, 4cqmin)',
                }}
              />{' '}
              Reset Poll
            </button>
          </div>
        ) : null
      }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run components/widgets/PollWidget/PollWidget.test.tsx`
Expected: PASS (all existing + 3 new tests).

- [ ] **Step 5: Commit**

```bash
git add components/widgets/PollWidget/Widget.tsx components/widgets/PollWidget/PollWidget.test.tsx
git commit -m "[AI] Poll widget: live session tally mode + on-board join QR

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Widget settings — start/stop + Resume/Restart popover

**Files:**

- Modify: `components/widgets/PollWidget/Settings.tsx`
- Modify: `components/widgets/PollWidget/PollWidget.test.tsx`

- [ ] **Step 1: Write the failing tests**

In `components/widgets/PollWidget/PollWidget.test.tsx`, the `describe('PollSettings', ...)` `beforeEach` (lines 140-151) mocks `useDashboard` + `useAuth`. Update the `useAuth` mock there to also return `user` and make `canAccessFeature` permit `anonymous-join`. Replace the `(useAuth as Mock).mockReturnValue({ canAccessFeature: mockCanAccessFeature });` line with:

```typescript
(useAuth as Mock).mockReturnValue({
  user: { uid: 'teacher-1' },
  canAccessFeature: mockCanAccessFeature,
});
```

Add these tests at the end of the `describe('PollSettings', ...)` block (before it closes ~line 389):

```typescript
  it('starts a fresh device-voting session when there is no prior session', async () => {
    const widget: WidgetData = {
      id: 'poll-1',
      type: 'poll',
      w: 2,
      h: 2,
      x: 0,
      y: 0,
      z: 1,
      flipped: false,
      config: {
        question: 'Pick one',
        options: [
          { id: 'opt-1', label: 'A', votes: 0 },
          { id: 'opt-2', label: 'B', votes: 0 },
        ],
      },
    };

    render(<PollSettings widget={widget} />);

    fireEvent.click(
      screen.getByRole('button', { name: /start device voting/i })
    );

    // Session doc is written active, then config gains an activePollSessionId.
    await waitFor(() => expect(mockSetDoc).toHaveBeenCalled());
    await waitFor(() => {
      const lastCall =
        mockUpdateWidget.mock.calls[mockUpdateWidget.mock.calls.length - 1];
      expect(lastCall[0]).toBe('poll-1');
      expect(typeof lastCall[1].config.activePollSessionId).toBe('string');
      expect(lastCall[1].config.activePollSessionId).toBeTruthy();
    });
  });

  it('offers Resume / Restart when a prior session exists', () => {
    const widget: WidgetData = {
      id: 'poll-1',
      type: 'poll',
      w: 2,
      h: 2,
      x: 0,
      y: 0,
      z: 1,
      flipped: false,
      config: {
        question: 'Pick one',
        options: [{ id: 'opt-1', label: 'A', votes: 0 }],
        lastPollSessionId: 'prev-1',
      },
    };

    render(<PollSettings widget={widget} />);

    fireEvent.click(
      screen.getByRole('button', { name: /start device voting/i })
    );

    expect(
      screen.getByRole('button', { name: /resume previous/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /start fresh/i })
    ).toBeInTheDocument();
  });

  it('stops a live session', async () => {
    const widget: WidgetData = {
      id: 'poll-1',
      type: 'poll',
      w: 2,
      h: 2,
      x: 0,
      y: 0,
      z: 1,
      flipped: false,
      config: {
        question: 'Pick one',
        options: [{ id: 'opt-1', label: 'A', votes: 0 }],
        activePollSessionId: 'sess-9',
      },
    };

    render(<PollSettings widget={widget} />);

    fireEvent.click(screen.getByRole('button', { name: /stop voting/i }));

    await waitFor(() => {
      const lastCall =
        mockUpdateWidget.mock.calls[mockUpdateWidget.mock.calls.length - 1];
      expect(lastCall[1].config.activePollSessionId).toBeNull();
      expect(lastCall[1].config.lastPollSessionId).toBe('sess-9');
    });
  });
```

> The `mockSetDoc` symbol comes from the hoisted block added in Task 7 (it lives at file scope, so it is visible to the `PollSettings` describe too). `fireEvent` and `waitFor` are already imported at the top of this test file (line 1).

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run components/widgets/PollWidget/PollWidget.test.tsx`
Expected: FAIL — the three new PollSettings tests fail (no "Start device voting" button yet).

- [ ] **Step 3: Implement the Live Voting section in `Settings.tsx`**

Edit `components/widgets/PollWidget/Settings.tsx`.

(a) Update imports. Replace lines 1-25:

```typescript
import React, { useState, useMemo } from 'react';
import { useDashboard } from '@/context/useDashboard';
import { useAuth } from '@/context/useAuth';
import { WidgetData, PollConfig } from '@/types';
import { useDialog } from '@/context/useDialog';
import {
  RotateCcw,
  Plus,
  Trash2,
  Download,
  Type,
  Users,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/common/Button';
import { MagicInput } from '@/components/common/MagicInput';
import {
  generatePoll,
  GeneratedPoll,
  buildPromptWithFileContext,
} from '@/utils/ai';
import { SettingsLabel } from '@/components/common/SettingsLabel';
import { DriveFileAttachment } from '@/components/common/DriveFileAttachment';

import { OptionInput } from './components/OptionInput';
```

with:

```typescript
import React, { useState, useMemo } from 'react';
import { useDashboard } from '@/context/useDashboard';
import { useAuth } from '@/context/useAuth';
import { WidgetData, PollConfig } from '@/types';
import { useDialog } from '@/context/useDialog';
import {
  RotateCcw,
  Plus,
  Trash2,
  Download,
  Type,
  Users,
  RefreshCw,
  Radio,
  Square,
} from 'lucide-react';
import { Button } from '@/components/common/Button';
import { MagicInput } from '@/components/common/MagicInput';
import {
  generatePoll,
  GeneratedPoll,
  buildPromptWithFileContext,
} from '@/utils/ai';
import { SettingsLabel } from '@/components/common/SettingsLabel';
import { DriveFileAttachment } from '@/components/common/DriveFileAttachment';
import {
  startPollSession,
  stopPollSession,
} from '@/components/poll/pollSession';

import { OptionInput } from './components/OptionInput';
```

(b) Pull `user` from auth + add popover state. Replace line 30:

```typescript
const { canAccessFeature } = useAuth();
```

with:

```typescript
const { canAccessFeature, user } = useAuth();
const [showResumePopover, setShowResumePopover] = useState(false);

const activePollSessionId = config.activePollSessionId ?? null;
const isLive = !!activePollSessionId;

const beginSession = async (mode: 'fresh' | 'resume') => {
  if (!user) return;
  setShowResumePopover(false);
  const next = await startPollSession(config, user.uid, mode);
  updateWidget(widget.id, { config: next });
};

const handleStartClick = () => {
  if (config.lastPollSessionId) {
    setShowResumePopover(true);
  } else {
    void beginSession('fresh');
  }
};

const handleStopClick = async () => {
  if (!user) return;
  const next = await stopPollSession(config, user.uid);
  updateWidget(widget.id, { config: next });
};
```

(c) Add the "Live Device Voting" section UI. Insert it just before the closing `</div>` of the root `return` (i.e. immediately after the `{/* Actions */}` block that ends at line 281, before line 282's `</div>`):

```typescript
      {/* Live Device Voting — gated by anonymous-join */}
      {canAccessFeature('anonymous-join') && (
        <div className="pt-4 border-t border-slate-100">
          <SettingsLabel icon={Radio}>Live Device Voting</SettingsLabel>
          <p className="text-xxs text-slate-400 font-medium mb-3">
            Let students vote from their own devices. The board shows live
            results and a join QR while voting is open.
          </p>

          {isLive ? (
            <Button
              variant="secondary"
              onClick={handleStopClick}
              icon={<Square className="w-3.5 h-3.5" />}
            >
              Stop voting
            </Button>
          ) : showResumePopover ? (
            <div className="flex flex-col gap-2 p-3 rounded-xl bg-slate-50 border border-slate-200">
              <p className="text-xs font-bold text-slate-600">
                A previous session exists. Resume it, or start fresh?
              </p>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="secondary" onClick={() => void beginSession('resume')}>
                  Resume previous
                </Button>
                <Button onClick={() => void beginSession('fresh')}>
                  Start fresh
                </Button>
              </div>
              <button
                onClick={() => setShowResumePopover(false)}
                className="text-xxs text-slate-400 hover:text-slate-600 font-semibold"
              >
                Cancel
              </button>
            </div>
          ) : (
            <Button
              onClick={handleStartClick}
              icon={<Radio className="w-3.5 h-3.5" />}
            >
              Start device voting
            </Button>
          )}
        </div>
      )}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run components/widgets/PollWidget/PollWidget.test.tsx`
Expected: PASS (all existing + 3 new PollSettings tests).

- [ ] **Step 5: Commit**

```bash
git add components/widgets/PollWidget/Settings.tsx components/widgets/PollWidget/PollWidget.test.tsx
git commit -m "[AI] Poll settings: start/stop live voting + Resume/Restart popover

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Remote control — QR panel + start/stop + live tallies

**Files:**

- Modify: `components/remote/controls/RemotePollControl.tsx`
- Create: `components/remote/controls/RemotePollControl.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `components/remote/controls/RemotePollControl.test.tsx`:

```typescript
import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RemotePollControl } from './RemotePollControl';
import { WidgetData } from '@/types';

const { mockOnSnapshot, mockSetDoc, mockCollection, mockDoc, mockUser, mockCanAccessFeature } =
  vi.hoisted(() => ({
    mockOnSnapshot: vi.fn(),
    mockSetDoc: vi.fn(),
    mockCollection: vi.fn(() => 'votes-col'),
    mockDoc: vi.fn((..._args: unknown[]) => ({ __path: _args.slice(1).join('/') })),
    mockUser: { uid: 'teacher-1' },
    mockCanAccessFeature: vi.fn(() => true),
  }));

let snapshotDocs: Record<string, unknown>[] = [];

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ user: mockUser, canAccessFeature: mockCanAccessFeature }),
}));
vi.mock('@/config/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  collection: mockCollection,
  doc: mockDoc,
  onSnapshot: mockOnSnapshot,
  setDoc: mockSetDoc,
}));

const idleWidget: WidgetData = {
  id: 'poll-1',
  type: 'poll',
  x: 0,
  y: 0,
  w: 3,
  h: 3,
  z: 1,
  flipped: false,
  config: {
    question: 'Pick one',
    options: [
      { id: 'o1', label: 'Red', votes: 2 },
      { id: 'o2', label: 'Blue', votes: 1 },
    ],
  },
} as WidgetData;

const liveWidget: WidgetData = {
  ...idleWidget,
  config: { ...idleWidget.config, activePollSessionId: 'sess-1' },
} as WidgetData;

beforeEach(() => {
  vi.clearAllMocks();
  snapshotDocs = [];
  mockCanAccessFeature.mockReturnValue(true);
  mockSetDoc.mockResolvedValue(undefined);
  mockOnSnapshot.mockImplementation(
    (_ref: unknown, cb: (snap: { docs: { data: () => Record<string, unknown> }[] }) => void) => {
      cb({ docs: snapshotDocs.map((d) => ({ data: () => d })) });
      return vi.fn();
    }
  );
});

describe('RemotePollControl', () => {
  it('shows manual +/- controls when no session is live', () => {
    render(<RemotePollControl widget={idleWidget} updateWidget={vi.fn()} />);
    expect(
      screen.getByRole('button', { name: /add vote to Red/i })
    ).toBeInTheDocument();
  });

  it('hides the QR affordance when anonymous-join is not permitted', async () => {
    mockCanAccessFeature.mockReturnValue(false);
    render(<RemotePollControl widget={liveWidget} updateWidget={vi.fn()} />);
    await waitFor(() => {
      expect(
        screen.queryByRole('button', { name: /join qr/i })
      ).not.toBeInTheDocument();
    });
    expect(mockCanAccessFeature).toHaveBeenCalledWith('anonymous-join');
  });

  it('renders a join QR + URL when live and toggled on', async () => {
    render(<RemotePollControl widget={liveWidget} updateWidget={vi.fn()} />);
    await userEvent.click(
      await screen.findByRole('button', { name: /show join qr/i })
    );
    const qr = await screen.findByAltText(/join qr/i);
    expect(qr.getAttribute('src') ?? '').toContain(
      'https://api.qrserver.com/v1/create-qr-code/'
    );
    expect(screen.getByTestId('poll-join-url').textContent ?? '').toContain(
      '/poll/sess-1'
    );
  });

  it('starts a fresh session and persists the active id', async () => {
    const updateWidget = vi.fn();
    render(<RemotePollControl widget={idleWidget} updateWidget={updateWidget} />);

    await userEvent.click(
      screen.getByRole('button', { name: /start voting/i })
    );

    await waitFor(() => expect(mockSetDoc).toHaveBeenCalled());
    await waitFor(() => {
      const lastCall = updateWidget.mock.calls[updateWidget.mock.calls.length - 1];
      expect(typeof lastCall[1].config.activePollSessionId).toBe('string');
      expect(lastCall[1].config.activePollSessionId).toBeTruthy();
    });
  });

  it('shows live tallies (not manual +/-) when a session is live', () => {
    snapshotDocs = [{ optionIndex: 0 }, { optionIndex: 0 }, { optionIndex: 1 }];
    render(<RemotePollControl widget={liveWidget} updateWidget={vi.fn()} />);
    // Manual +/- are gone while live.
    expect(
      screen.queryByRole('button', { name: /add vote to Red/i })
    ).not.toBeInTheDocument();
    // Live counts surface (Red 2, Blue 1).
    expect(screen.getByTestId('poll-remote-tally-0')).toHaveTextContent('2');
    expect(screen.getByTestId('poll-remote-tally-1')).toHaveTextContent('1');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run components/remote/controls/RemotePollControl.test.tsx`
Expected: FAIL — current `RemotePollControl` has no start/QR/live behavior (and doesn't call `useAuth`/firestore).

- [ ] **Step 3: Rewrite `RemotePollControl.tsx`**

Replace the entire contents of `components/remote/controls/RemotePollControl.tsx` with:

```typescript
import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Minus, QrCode, Radio, RotateCcw, Square } from 'lucide-react';
import { WidgetData, PollConfig, PollOption } from '@/types';
import { useAuth } from '@/context/useAuth';
import { db } from '@/config/firebase';
import { collection, doc, onSnapshot, setDoc } from 'firebase/firestore';
import { buildPublicPollLink } from '@/components/poll/pollLink';
import {
  aggregateVotes,
  makePollSessionId,
  startPollSession,
  stopPollSession,
} from '@/components/poll/pollSession';

interface RemotePollControlProps {
  widget: WidgetData;
  updateWidget: (id: string, updates: Partial<WidgetData>) => void;
}

const OPTION_COLORS = [
  'bg-blue-500/20 border-blue-400/40 text-blue-300',
  'bg-purple-500/20 border-purple-400/40 text-purple-300',
  'bg-green-500/20 border-green-400/40 text-green-300',
  'bg-orange-500/20 border-orange-400/40 text-orange-300',
  'bg-pink-500/20 border-pink-400/40 text-pink-300',
];

const BAR_COLORS = [
  'bg-blue-500',
  'bg-purple-500',
  'bg-green-500',
  'bg-orange-500',
  'bg-pink-500',
];

export const RemotePollControl: React.FC<RemotePollControlProps> = ({
  widget,
  updateWidget,
}) => {
  const { user, canAccessFeature } = useAuth();
  const config = widget.config as PollConfig;
  const options: PollOption[] = config.options ?? [];
  const canOfferAnonymousJoin = canAccessFeature('anonymous-join');

  const activePollSessionId = config.activePollSessionId ?? null;
  const isLive = !!activePollSessionId;

  const [showQr, setShowQr] = useState(false);
  const [showResumePopover, setShowResumePopover] = useState(false);
  const [sessionTally, setSessionTally] = useState<number[]>([]);

  // Subscribe to the live votes subcollection while a session is active.
  useEffect(() => {
    if (!activePollSessionId || !user) {
      setSessionTally([]);
      return;
    }
    const sessionId = makePollSessionId(user.uid, activePollSessionId);
    const unsub = onSnapshot(
      collection(db, 'poll_sessions', sessionId, 'votes'),
      (snap) => {
        const votes = snap.docs.map(
          (d) => d.data() as { optionIndex: number }
        );
        setSessionTally(aggregateVotes(votes, options.length));
      }
    );
    return unsub;
  }, [activePollSessionId, user, options.length]);

  const joinUrl = useMemo(() => {
    if (!isLive || !user || !canOfferAnonymousJoin || !activePollSessionId) {
      return '';
    }
    return buildPublicPollLink({
      id: activePollSessionId,
      question: config.question ?? 'Vote Now!',
      options: options.map((o) => ({ id: o.id, label: o.label })),
      teacherUid: user.uid,
    });
  }, [isLive, user, canOfferAnonymousJoin, activePollSessionId, config.question, options]);

  const qrUrl = joinUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(
        joinUrl
      )}`
    : '';

  const liveOptions = options.map((o, i) => ({
    ...o,
    votes: sessionTally[i] ?? 0,
  }));
  const liveTotal = liveOptions.reduce((s, o) => s + o.votes, 0);

  const adjustVote = (index: number, delta: number) => {
    const updated = options.map((opt, i) =>
      i === index ? { ...opt, votes: Math.max(0, (opt.votes ?? 0) + delta) } : opt
    );
    updateWidget(widget.id, { config: { ...config, options: updated } });
  };

  const resetVotes = () => {
    const updated = options.map((opt) => ({ ...opt, votes: 0 }));
    updateWidget(widget.id, { config: { ...config, options: updated } });
  };

  const beginSession = async (mode: 'fresh' | 'resume') => {
    if (!user) return;
    setShowResumePopover(false);
    const next = await startPollSession(config, user.uid, mode);
    updateWidget(widget.id, { config: next });
  };

  const handleStartClick = () => {
    if (config.lastPollSessionId) {
      setShowResumePopover(true);
    } else {
      void beginSession('fresh');
    }
  };

  const handleStopClick = async () => {
    if (!user) return;
    const next = await stopPollSession(config, user.uid);
    updateWidget(widget.id, { config: next });
  };

  const totalVotes = options.reduce((s, o) => s + (o.votes ?? 0), 0);

  return (
    <div className="flex flex-col h-full">
      {/* Question */}
      <div className="px-4 py-3 border-b border-white/10 shrink-0">
        <div className="text-white/60 text-xs uppercase tracking-widest font-bold mb-1">
          Poll
        </div>
        {config.question && (
          <p className="text-white font-semibold text-sm leading-snug line-clamp-2">
            {config.question}
          </p>
        )}
      </div>

      {/* Start / Stop live voting */}
      <div className="px-4 pt-3 shrink-0 flex flex-col gap-3">
        {isLive ? (
          <button
            onClick={() => void handleStopClick()}
            style={{ touchAction: 'manipulation' }}
            className="touch-manipulation flex items-center justify-center gap-3 px-8 py-4 rounded-2xl font-black text-lg shadow-lg transition-all active:scale-95 bg-red-500 hover:bg-red-600 text-white"
            aria-label="Stop voting"
          >
            <Square className="w-6 h-6" /> Stop Voting
          </button>
        ) : showResumePopover ? (
          <div className="flex flex-col gap-2 p-3 rounded-2xl bg-white/5 border border-white/10">
            <p className="text-white/70 text-sm font-semibold text-center">
              Resume the previous session or start fresh?
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => void beginSession('resume')}
                style={{ touchAction: 'manipulation' }}
                className="touch-manipulation py-3 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold transition-all active:scale-95"
              >
                Resume previous
              </button>
              <button
                onClick={() => void beginSession('fresh')}
                style={{ touchAction: 'manipulation' }}
                className="touch-manipulation py-3 rounded-xl bg-green-500 hover:bg-green-600 text-white font-bold transition-all active:scale-95"
              >
                Start fresh
              </button>
            </div>
            <button
              onClick={() => setShowResumePopover(false)}
              className="text-white/40 hover:text-white/70 text-xs font-semibold"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={handleStartClick}
            disabled={options.length === 0}
            style={{ touchAction: 'manipulation' }}
            className="touch-manipulation flex items-center justify-center gap-3 px-8 py-4 rounded-2xl font-black text-lg shadow-lg transition-all active:scale-95 disabled:opacity-40 bg-green-500 hover:bg-green-600 text-white"
            aria-label="Start voting"
          >
            <Radio className="w-6 h-6" /> Start Voting
          </button>
        )}

        {/* Join QR toggle — gated by anonymous-join, only meaningful while live */}
        {isLive && canOfferAnonymousJoin && (
          <button
            onClick={() => setShowQr((v) => !v)}
            style={{ touchAction: 'manipulation' }}
            className={`touch-manipulation flex items-center justify-center gap-2 px-6 py-3 rounded-xl border font-bold transition-all active:scale-95 ${
              showQr
                ? 'bg-blue-500/20 border-blue-400/60 text-blue-300'
                : 'bg-white/10 border-white/20 text-white/60 hover:bg-white/20'
            }`}
            aria-label={showQr ? 'Hide join QR' : 'Show join QR'}
            aria-pressed={showQr}
          >
            <QrCode className="w-5 h-5" />
            {showQr ? 'Hide Join QR' : 'Show Join QR'}
          </button>
        )}

        {isLive && canOfferAnonymousJoin && showQr && (
          <div className="flex flex-col items-center gap-3 p-4 rounded-2xl bg-white/5 border border-white/10">
            {joinUrl ? (
              <>
                <img
                  src={qrUrl}
                  alt="Join QR code"
                  width={220}
                  height={220}
                  className="rounded-xl bg-white p-2"
                />
                <p className="text-white/50 text-xs text-center">
                  Scan to vote, or open this link:
                </p>
                <code
                  data-testid="poll-join-url"
                  className="select-all break-all text-center text-blue-300 text-xs font-mono px-2"
                >
                  {joinUrl}
                </code>
              </>
            ) : (
              <p className="text-white/40 text-sm text-center">
                Start voting to generate a join link.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Tallies */}
      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3">
        {options.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-white/30 text-sm italic">
            No options — configure in widget settings.
          </div>
        ) : isLive ? (
          // Live mode: read-only aggregated tallies from participant devices.
          liveOptions.map((opt, i) => {
            const pct = liveTotal > 0 ? (opt.votes / liveTotal) * 100 : 0;
            return (
              <div
                key={opt.id}
                className={`rounded-2xl border p-3 ${OPTION_COLORS[i % OPTION_COLORS.length]}`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-sm flex-1 mr-2 truncate">
                    {opt.label}
                  </span>
                  <span
                    className="font-black text-lg tabular-nums shrink-0"
                    data-testid={`poll-remote-tally-${i}`}
                  >
                    {opt.votes}
                  </span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${BAR_COLORS[i % BAR_COLORS.length]}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })
        ) : (
          // Idle mode: manual +/- show-of-hands tally.
          options.map((opt, i) => {
            const pct =
              totalVotes > 0 ? ((opt.votes ?? 0) / totalVotes) * 100 : 0;
            return (
              <div
                key={opt.id}
                className={`rounded-2xl border p-3 ${OPTION_COLORS[i % OPTION_COLORS.length]}`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-sm flex-1 mr-2 truncate">
                    {opt.label}
                  </span>
                  <span className="font-black text-lg tabular-nums shrink-0">
                    {opt.votes ?? 0}
                  </span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-white/10 mb-3 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${BAR_COLORS[i % BAR_COLORS.length]}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => adjustVote(i, -1)}
                    disabled={(opt.votes ?? 0) <= 0}
                    className="touch-manipulation flex-1 py-2 rounded-xl bg-white/10 hover:bg-white/20 disabled:opacity-40 font-bold flex items-center justify-center transition-all active:scale-95 focus-visible:ring-2 focus-visible:ring-blue-400/60"
                    aria-label={`Remove vote from ${opt.label}`}
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => adjustVote(i, 1)}
                    className="touch-manipulation flex-1 py-2 rounded-xl bg-white/20 hover:bg-white/30 font-bold flex items-center justify-center transition-all active:scale-95 focus-visible:ring-2 focus-visible:ring-blue-400/60"
                    aria-label={`Add vote to ${opt.label}`}
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer Reset — manual mode only */}
      {options.length > 0 && !isLive && (
        <div className="px-4 pb-3 shrink-0">
          <button
            onClick={resetVotes}
            className="touch-manipulation w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-white/60 font-bold transition-all active:scale-95 focus-visible:ring-2 focus-visible:ring-blue-400/60"
          >
            <RotateCcw className="w-4 h-4" />
            Reset All Votes
          </button>
        </div>
      )}
    </div>
  );
};
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run components/remote/controls/RemotePollControl.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add components/remote/controls/RemotePollControl.tsx components/remote/controls/RemotePollControl.test.tsx
git commit -m "[AI] Poll remote: join QR + start/stop voting + live tallies

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: Full validation sweep

**Files:** none (verification only)

- [ ] **Step 1: Type-check**

Run: `pnpm run type-check`
Expected: PASS (0 errors).

- [ ] **Step 2: Lint (zero warnings allowed)**

Run: `pnpm run lint`
Expected: PASS (0 errors, 0 warnings). If anything fails, run `pnpm run lint:fix`, then re-run and fix any remainder by hand.

- [ ] **Step 3: Format check**

Run: `pnpm run format:check`
Expected: PASS. If it fails, run `pnpm run format` and re-check.

- [ ] **Step 4: Full unit test suite**

Run: `pnpm run test`
Expected: PASS — all suites green, including the new `components/poll/*` and `RemotePollControl` tests.

- [ ] **Step 5: Rules test suite (emulator)**

Run: `pnpm run test:rules`
Expected: PASS — including `pollVotesProtection`.

- [ ] **Step 6: Production build**

Run: `pnpm run build`
Expected: build succeeds.

- [ ] **Step 7: Commit (only if any auto-fix changed files)**

```bash
git add -A
git commit -m "[AI] Poll: lint/format fixups for public poll participation

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

If nothing changed, skip this commit.

---

## Task 11: Manual two-device verification + deploy

**Files:** none (manual verification)

Firestore rules deploy on merge to `main`. To exercise the full flow on the `dev-paul` preview, the `poll_sessions` rules must be live in the target Firebase project — deploy rules first if testing against real Firestore (`firebase deploy --only firestore:rules`), or use the Firestore emulator locally.

- [ ] **Step 1: Run the app**

Run: `pnpm run dev` (port 3000). Sign in as a teacher (or set `VITE_AUTH_BYPASS=true` for a mock admin — note the bypass does NOT bypass server rules, so for a real vote round-trip use a real sign-in against a project that has the rules deployed).

- [ ] **Step 2: Start voting**

Add a Poll widget, add 2-3 options. Flip to settings → "Start device voting" (the "Live Device Voting" section appears only if `anonymous-join` is permitted). Confirm the board footer switches to "Voting open" with a QR + `/poll/<id>?data=...` link.

- [ ] **Step 3: Vote from a phone**

Scan the board QR (or the remote's "Show Join QR") on a second device. Confirm the phone shows the question + option buttons, tapping one shows "Your vote is in" with a live tally, and the board's bars update live.

- [ ] **Step 4: Verify one-vote-per-device + change-vote**

On the phone, tap a different option — confirm the board total stays the same but the distribution shifts (overwrite, not a second vote).

- [ ] **Step 5: Stop + Resume/Restart**

Stop voting from settings or remote → board returns to the manual ± tally. Start again → confirm the Resume/Restart popover appears; "Resume previous" shows the prior votes, "Start fresh" zeroes them.

- [ ] **Step 6: Push the branch**

```bash
git push origin dev-paul
```

This updates the `dev-paul` preview deployment. Open the preview URL and repeat Steps 2-5 against it (with rules deployed).

- [ ] **Step 7: Open the PR to `main`**

Open a PR (`gh pr create`) from `dev-paul` → `main`. The PR description should note the new public `/poll` route and the `poll_sessions` Firestore rules deploy on merge. Wait for PR validation (type-check, lint, format, build, rules job) to pass.

---

## Self-Review (completed during planning)

- **Spec coverage:** §1 Session identity → Task 1 (config) + Task 3 (id helpers) + Tasks 7-9 (start/stop). §2 Participant route+app → Tasks 4-5. §3 Join link (centralized) → Task 2. §4 Vote storage + one-vote-per-device → Tasks 3, 4, 6. §5 Widget changes (replace-when-live, on-board QR) → Tasks 7-8. §6 Remote control → Task 9. §7 Firestore rules → Task 6. Testing section → tests in Tasks 2-4, 6-9 + Task 10/11. All locked decisions (replace-when-live, live results, Resume/Restart popover, centralized encoder, open votes read, server-enforced active flag) are implemented.
- **Type consistency:** `makePollSessionId(teacherUid, pollSessionId)`, `aggregateVotes(votes, optionCount)`, `startPollSession(config, teacherUid, mode)`, `stopPollSession(config, teacherUid)`, `PollVotePayload {id, question, options:[{id,label}], teacherUid}`, config fields `activePollSessionId`/`lastPollSessionId`, collection `poll_sessions/{teacherUid}_{pollId}/votes/{participantUid}` with `{optionIndex, votedAt}` — used identically across all tasks, the rules, and the rules tests.
- **No placeholders:** every code/test step contains complete code and exact commands with expected output.

```

```
