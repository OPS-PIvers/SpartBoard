/**
 * Tests for PlcVideoSessionContent — the video-activity half of the PLC
 * assignment session modal (C5).
 *
 * Focus is the loading/error STATE MACHINE, mocked at the module boundaries:
 *   - `firebase/firestore` getDoc/doc — the up-front session fetch.
 *   - `useVideoActivitySessionTeacher` — live listener (responses/liveSession/error).
 *   - `useVideoActivityAssignments` — assignment lookup + control callbacks.
 *   - `useAuth` / `useDashboard` — trivial context.
 *   - `VideoActivityLiveMonitor` / `Results` — replaced with marker elements so
 *     we assert which branch renders, not their internals.
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  beforeAll,
  type Mock,
} from 'vitest';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import i18n from 'i18next';
import { getDoc } from 'firebase/firestore';
import { PlcVideoSessionContent } from '@/components/plc/assignments/PlcVideoSessionContent';
import type { VideoActivityAssignment } from '@/types';

// ---------------------------------------------------------------------------
// i18n stub — components read defaultValue strings, so an empty resource set
// resolves keys to their inline English defaults.
// ---------------------------------------------------------------------------
beforeAll(() => {
  void i18n.use(initReactI18next).init({
    lng: 'en',
    fallbackLng: 'en',
    resources: { en: { translation: {} } },
    interpolation: { escapeValue: false },
  });
});

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('@/config/firebase', () => ({
  db: { __mock: 'db' },
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db: unknown, ...segs: string[]) => segs.join('/')),
  getDoc: vi.fn(),
}));

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ user: { uid: 'teacher-1' } }),
}));

const addToast = vi.fn();
vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({ addToast }),
}));

vi.mock('@/utils/logError', () => ({
  logError: vi.fn(),
}));

// useVideoActivityAssignments — controllable per-test via the mutable holder.
let assignmentsState: {
  assignments: VideoActivityAssignment[];
  loading: boolean;
};
vi.mock('@/hooks/useVideoActivityAssignments', () => ({
  useVideoActivityAssignments: () => ({
    ...assignmentsState,
    pauseAssignment: vi.fn().mockResolvedValue(undefined),
    resumeAssignment: vi.fn().mockResolvedValue(undefined),
    deactivateAssignment: vi.fn().mockResolvedValue(undefined),
  }),
}));

// useVideoActivitySessionTeacher — controllable per-test.
let teacherSessionState: {
  responses: unknown[];
  liveSession: { id: string } | null;
  error: string | null;
};
const subscribeToSession = vi.fn();
const unsubscribeFromSession = vi.fn();
const unlockStudentAttempt = vi.fn();
vi.mock('@/hooks/useVideoActivitySession', () => ({
  useVideoActivitySessionTeacher: () => ({
    ...teacherSessionState,
    subscribeToSession,
    unsubscribeFromSession,
    unlockStudentAttempt,
  }),
}));

// Presentational components → simple markers.
vi.mock(
  '@/components/widgets/VideoActivityWidget/components/VideoActivityLiveMonitor',
  () => ({
    VideoActivityLiveMonitor: ({ session }: { session: { id: string } }) => (
      <div data-testid="live-monitor" data-session-id={session.id} />
    ),
  })
);
vi.mock('@/components/widgets/VideoActivityWidget/components/Results', () => ({
  Results: ({ session }: { session: { id: string } }) => (
    <div data-testid="results" data-session-id={session.id} />
  ),
}));

const mockGetDoc = getDoc as Mock;

// ---------------------------------------------------------------------------
// Fixtures + helpers
// ---------------------------------------------------------------------------

const ASSIGNMENT_ID = 'assign-1';

const assignment = {
  id: ASSIGNMENT_ID,
  plc: { id: 'plc-1' },
} as unknown as VideoActivityAssignment;

/** A getDoc snapshot that exists and yields the given session data. */
const existingSnap = (data: Record<string, unknown>) => ({
  exists: () => true,
  data: () => data,
});
/** A getDoc snapshot for a missing doc. */
const missingSnap = () => ({ exists: () => false, data: () => undefined });

/** A getDoc promise the test resolves manually (to drive the loading state). */
function deferredSnap<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const renderSubject = (
  props: Partial<React.ComponentProps<typeof PlcVideoSessionContent>> = {}
) =>
  render(
    <I18nextProvider i18n={i18n}>
      <PlcVideoSessionContent
        assignmentId={ASSIGNMENT_ID}
        view="monitor"
        onClose={() => undefined}
        {...props}
      />
    </I18nextProvider>
  );

beforeEach(() => {
  vi.clearAllMocks();
  assignmentsState = { assignments: [assignment], loading: false };
  teacherSessionState = { responses: [], liveSession: null, error: null };
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PlcVideoSessionContent state machine', () => {
  it('shows the loading spinner before getDoc resolves and with no live session', () => {
    const deferred = deferredSnap<ReturnType<typeof existingSnap>>();
    mockGetDoc.mockReturnValue(deferred.promise);

    renderSubject();

    // No terminal branch reached yet — the spinner copy is visible.
    expect(screen.getByText(/Loading/i)).toBeInTheDocument();
    expect(screen.queryByTestId('live-monitor')).not.toBeInTheDocument();
  });

  it('renders the "Assignment unavailable" branch when assignment is absent and session is missing', async () => {
    assignmentsState = { assignments: [], loading: false };
    mockGetDoc.mockResolvedValue(missingSnap());

    renderSubject();

    await waitFor(() => {
      expect(screen.getByText(/Assignment unavailable/i)).toBeInTheDocument();
    });
  });

  it('renders the "Session not available" branch when assignment exists but session doc is missing', async () => {
    // assignment present (default fixture), but getDoc resolves non-existent.
    mockGetDoc.mockResolvedValue(missingSnap());

    renderSubject();

    await waitFor(() => {
      expect(screen.getByText(/Session not available/i)).toBeInTheDocument();
    });
    // It must be a terminal branch, not a permanent spinner.
    expect(screen.queryByText(/Loading/i)).not.toBeInTheDocument();
  });

  it('renders the error branch (not the spinner) when the live listener reports an error', () => {
    teacherSessionState = {
      responses: [],
      liveSession: null,
      error: 'permission-denied',
    };
    // getDoc never resolves — the listener error must short-circuit anyway.
    mockGetDoc.mockReturnValue(deferredSnap().promise);

    renderSubject();

    expect(screen.getByText(/Could not load/i)).toBeInTheDocument();
    expect(screen.queryByText(/Loading/i)).not.toBeInTheDocument();
  });

  it('renders the monitor when the fetched session exists (view=monitor)', async () => {
    mockGetDoc.mockResolvedValue(existingSnap({ id: ASSIGNMENT_ID }));

    renderSubject({ view: 'monitor' });

    await waitFor(() => {
      expect(screen.getByTestId('live-monitor')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('results')).not.toBeInTheDocument();
  });

  it('renders Results when the fetched session exists (view=results)', async () => {
    mockGetDoc.mockResolvedValue(existingSnap({ id: ASSIGNMENT_ID }));

    renderSubject({ view: 'results' });

    await waitFor(() => {
      expect(screen.getByTestId('results')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('live-monitor')).not.toBeInTheDocument();
  });

  it('renders the monitor from a matching liveSession even before getDoc resolves', () => {
    // liveSession.id matches the open assignment → sessionForView prefers it,
    // so the monitor shows without waiting on the fetch.
    teacherSessionState = {
      responses: [],
      liveSession: { id: ASSIGNMENT_ID },
      error: null,
    };
    mockGetDoc.mockReturnValue(deferredSnap().promise);

    renderSubject({ view: 'monitor' });

    expect(screen.getByTestId('live-monitor')).toBeInTheDocument();
  });

  it('ignores a stale getDoc that resolves for a previous assignmentId (fetchAttemptRef guard)', async () => {
    // Both rows have an assignment doc so the missing-session path lands on the
    // "Session not available" branch (not "Assignment unavailable").
    assignmentsState = {
      assignments: [
        assignment,
        {
          id: 'assign-2',
          plc: { id: 'plc-1' },
        } as unknown as VideoActivityAssignment,
      ],
      loading: false,
    };
    // First render: getDoc for assign-1 is deferred (never resolves yet).
    const stale = deferredSnap<ReturnType<typeof existingSnap>>();
    // Second render (different id): resolves immediately to a missing session.
    mockGetDoc
      .mockReturnValueOnce(stale.promise)
      .mockResolvedValueOnce(missingSnap());

    const { rerender } = renderSubject({ assignmentId: 'assign-1' });

    // Switch to a different assignment row — bumps fetchAttemptRef.
    rerender(
      <I18nextProvider i18n={i18n}>
        <PlcVideoSessionContent
          assignmentId="assign-2"
          view="monitor"
          onClose={() => undefined}
        />
      </I18nextProvider>
    );

    // Late-resolve the stale fetch for assign-1 — its myAttempt is now behind
    // fetchAttemptRef.current, so it must NOT populate the session/monitor.
    stale.resolve(existingSnap({ id: 'assign-1' }));

    await waitFor(() => {
      expect(screen.getByText(/Session not available/i)).toBeInTheDocument();
    });
    expect(screen.queryByTestId('live-monitor')).not.toBeInTheDocument();
  });
});
