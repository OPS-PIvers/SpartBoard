/**
 * Unit tests for AnnouncementOverlay and its pure helper logic.
 *
 * Strategy: the pure helper functions (isDismissed, isScheduledTimeReached,
 * isScheduledDismissalPast, building filter) live inside the module and are
 * not exported. We exercise them indirectly by controlling the Firestore
 * snapshot, localStorage, and the clock, then asserting what the overlay
 * renders (or doesn't).
 */
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AnnouncementOverlay } from '@/components/announcements/AnnouncementOverlay';
import { Announcement } from '@/types';
import { where } from 'firebase/firestore';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

// Firebase – onSnapshot returns an unsubscribe no-op by default; individual
// tests call the captured callback to inject announcement data.
let firestoreCallback:
  | ((snap: { forEach: (fn: (d: unknown) => void) => void }) => void)
  | null = null;

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  query: vi.fn((_col: unknown, ..._constraints: unknown[]) => _col),
  where: vi.fn(),
  onSnapshot: vi.fn((_ref: unknown, cb: typeof firestoreCallback) => {
    firestoreCallback = cb;
    return vi.fn(); // unsubscribe no-op
  }),
}));

vi.mock('@/config/firebase', () => ({
  db: {},
  isAuthBypass: false,
}));

vi.mock('@/context/useAuth', () => ({
  useAuth: vi.fn(),
}));

// Lazy widget registry – we just need to avoid a real dynamic import in tests
vi.mock('@/components/widgets/WidgetRegistry', () => ({
  WIDGET_COMPONENTS: {},
}));

import { useAuth } from '@/context/useAuth';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MOCK_USER = { uid: 'user-1', email: 'test@example.com' };

function mockAuth(
  selectedBuildings: string[] = [],
  opts: { userTier?: 'internal' | 'org' | 'free'; orgId?: string | null } = {}
) {
  vi.mocked(useAuth).mockReturnValue({
    user: MOCK_USER,
    selectedBuildings,
    isAdmin: false,
    loading: false,
    // Default to 'internal' so existing behavior-tests subscribe (Orono path).
    userTier: opts.userTier ?? 'internal',
    orgId: opts.orgId ?? null,
  } as ReturnType<typeof useAuth>);
}

const BASE_ANNOUNCEMENT: Announcement = {
  id: 'ann-1',
  name: 'Test Announcement',
  widgetType: 'clock',
  widgetConfig: {},
  widgetSize: { w: 300, h: 200 },
  maximized: false,
  activationType: 'manual',
  isActive: true,
  activatedAt: 1000000,
  dismissalType: 'admin',
  targetBuildings: [],
  targetUsers: [],
  createdAt: 900000,
  updatedAt: 900000,
  createdBy: 'admin@example.com',
};

function emitAnnouncements(announcements: Announcement[]) {
  act(() => {
    firestoreCallback?.({
      forEach: (fn) =>
        announcements.forEach((a) => fn({ id: a.id, data: () => ({ ...a }) })),
    });
  });
}

// ---------------------------------------------------------------------------
// localStorage helpers
// ---------------------------------------------------------------------------

const DISMISSALS_KEY = 'spart_announcement_dismissals';

function clearDismissals() {
  localStorage.removeItem(DISMISSALS_KEY);
}

function storeDismissal(id: string, activatedAt: number | null) {
  const key = `${id}_${activatedAt}`;
  const record: Record<string, number> = {};
  record[key] = Date.now();
  localStorage.setItem(DISMISSALS_KEY, JSON.stringify(record));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AnnouncementOverlay', () => {
  beforeEach(() => {
    clearDismissals();
    firestoreCallback = null;
    mockAuth();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // Rendering
  // -------------------------------------------------------------------------

  it('renders nothing when there are no announcements', () => {
    const { container } = render(<AnnouncementOverlay />);
    emitAnnouncements([]);
    expect(container.firstChild).toBeNull();
  });

  it('renders an active manual announcement', () => {
    render(<AnnouncementOverlay />);
    emitAnnouncements([BASE_ANNOUNCEMENT]);
    expect(screen.getByText('Test Announcement')).toBeInTheDocument();
  });

  it('renders nothing when isActive is false (manual activation)', () => {
    render(<AnnouncementOverlay />);
    emitAnnouncements([{ ...BASE_ANNOUNCEMENT, isActive: false }]);
    expect(screen.queryByText('Test Announcement')).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Dismissal logic (localStorage)
  // -------------------------------------------------------------------------

  it('hides an announcement that has already been dismissed in this epoch', () => {
    storeDismissal(BASE_ANNOUNCEMENT.id, BASE_ANNOUNCEMENT.activatedAt);
    render(<AnnouncementOverlay />);
    emitAnnouncements([BASE_ANNOUNCEMENT]);
    expect(screen.queryByText('Test Announcement')).not.toBeInTheDocument();
  });

  it('shows an announcement again when activatedAt changes (new push epoch)', () => {
    // Dismiss with old activatedAt
    storeDismissal(BASE_ANNOUNCEMENT.id, BASE_ANNOUNCEMENT.activatedAt);
    render(<AnnouncementOverlay />);
    // New push: bumped activatedAt
    emitAnnouncements([{ ...BASE_ANNOUNCEMENT, activatedAt: 2000000 }]);
    expect(screen.getByText('Test Announcement')).toBeInTheDocument();
  });

  it('hides announcement after user clicks Dismiss', async () => {
    const user = userEvent.setup();
    render(<AnnouncementOverlay />);
    emitAnnouncements([{ ...BASE_ANNOUNCEMENT, dismissalType: 'user' }]);
    const btn = screen.getByRole('button', { name: /Dismiss announcement/i });
    await user.click(btn);
    expect(screen.queryByText('Test Announcement')).not.toBeInTheDocument();
  });

  it('persists dismissal to localStorage after clicking Dismiss', async () => {
    const user = userEvent.setup();
    render(<AnnouncementOverlay />);
    emitAnnouncements([{ ...BASE_ANNOUNCEMENT, dismissalType: 'user' }]);
    await user.click(
      screen.getByRole('button', { name: /Dismiss announcement/i })
    );
    const stored = JSON.parse(
      localStorage.getItem(DISMISSALS_KEY) ?? '{}'
    ) as Record<string, number>;
    const expectedKey = `${BASE_ANNOUNCEMENT.id}_${BASE_ANNOUNCEMENT.activatedAt}`;
    expect(stored[expectedKey]).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // Scheduled activation
  // -------------------------------------------------------------------------

  describe('scheduled activation', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('hides a scheduled announcement whose activation time has not yet passed', () => {
      // Set clock to 08:00, activation at 09:00
      vi.setSystemTime(new Date('2024-01-01T08:00:00'));
      render(<AnnouncementOverlay />);
      emitAnnouncements([
        {
          ...BASE_ANNOUNCEMENT,
          activationType: 'scheduled',
          scheduledActivationTime: '09:00',
          isActive: true,
        },
      ]);
      expect(screen.queryByText('Test Announcement')).not.toBeInTheDocument();
    });

    it('shows a scheduled announcement whose activation time has passed', () => {
      // Set clock to 10:00, activation at 09:00
      vi.setSystemTime(new Date('2024-01-01T10:00:00'));
      render(<AnnouncementOverlay />);
      emitAnnouncements([
        {
          ...BASE_ANNOUNCEMENT,
          activationType: 'scheduled',
          scheduledActivationTime: '09:00',
          isActive: true,
        },
      ]);
      expect(screen.getByText('Test Announcement')).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Date-bounded activation window
  // -------------------------------------------------------------------------

  describe('date window (auto-deactivate)', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('hides a scheduled announcement before its start date+time', () => {
      // Clock: May 5, 7:30 AM. Window starts May 5, 8:00 AM.
      vi.setSystemTime(new Date(2026, 4, 5, 7, 30));
      render(<AnnouncementOverlay />);
      emitAnnouncements([
        {
          ...BASE_ANNOUNCEMENT,
          activationType: 'scheduled',
          scheduledActivationDate: '2026-05-05',
          scheduledActivationTime: '08:00',
          isActive: true,
        },
      ]);
      expect(screen.queryByText('Test Announcement')).not.toBeInTheDocument();
    });

    it('shows a scheduled announcement during its window', () => {
      // Clock: May 5, 9:00 AM. Window: May 5 08:00 → May 5 17:00.
      vi.setSystemTime(new Date(2026, 4, 5, 9, 0));
      render(<AnnouncementOverlay />);
      emitAnnouncements([
        {
          ...BASE_ANNOUNCEMENT,
          activationType: 'scheduled',
          scheduledActivationDate: '2026-05-05',
          scheduledActivationTime: '08:00',
          scheduledEndDate: '2026-05-05',
          scheduledEndTime: '17:00',
          isActive: true,
        },
      ]);
      expect(screen.getByText('Test Announcement')).toBeInTheDocument();
    });

    it('hides a scheduled announcement after its end date+time', () => {
      // Clock: May 5, 18:00. Window ended at 17:00.
      vi.setSystemTime(new Date(2026, 4, 5, 18, 0));
      render(<AnnouncementOverlay />);
      emitAnnouncements([
        {
          ...BASE_ANNOUNCEMENT,
          activationType: 'scheduled',
          scheduledActivationDate: '2026-05-05',
          scheduledActivationTime: '08:00',
          scheduledEndDate: '2026-05-05',
          scheduledEndTime: '17:00',
          isActive: true,
        },
      ]);
      expect(screen.queryByText('Test Announcement')).not.toBeInTheDocument();
    });

    it('shows a manual announcement with end window before the end moment', () => {
      // Clock: May 5, 14:00. Manual + end May 5 17:00.
      vi.setSystemTime(new Date(2026, 4, 5, 14, 0));
      render(<AnnouncementOverlay />);
      emitAnnouncements([
        {
          ...BASE_ANNOUNCEMENT,
          activationType: 'manual',
          scheduledEndDate: '2026-05-05',
          scheduledEndTime: '17:00',
          isActive: true,
        },
      ]);
      expect(screen.getByText('Test Announcement')).toBeInTheDocument();
    });

    it('hides a manual announcement after its end window', () => {
      // Clock: May 5, 18:00. Manual + end May 5 17:00.
      vi.setSystemTime(new Date(2026, 4, 5, 18, 0));
      render(<AnnouncementOverlay />);
      emitAnnouncements([
        {
          ...BASE_ANNOUNCEMENT,
          activationType: 'manual',
          scheduledEndDate: '2026-05-05',
          scheduledEndTime: '17:00',
          isActive: true,
        },
      ]);
      expect(screen.queryByText('Test Announcement')).not.toBeInTheDocument();
    });

    it('shows a multi-day windowed announcement after midnight crossing', () => {
      // Clock: May 6, 02:00 (crossed midnight from May 5).
      // Window: May 5 14:00 → May 6 08:00. 02:00 < 08:00 so still within window.
      vi.setSystemTime(new Date(2026, 4, 6, 2, 0));
      render(<AnnouncementOverlay />);
      emitAnnouncements([
        {
          ...BASE_ANNOUNCEMENT,
          activationType: 'scheduled',
          scheduledActivationDate: '2026-05-05',
          scheduledActivationTime: '14:00',
          scheduledEndDate: '2026-05-06',
          scheduledEndTime: '08:00',
          isActive: true,
        },
      ]);
      expect(screen.getByText('Test Announcement')).toBeInTheDocument();
    });

    it('hides a multi-day windowed announcement after the next morning end', () => {
      // Clock: May 6, 09:00. Window ended at May 6 08:00.
      vi.setSystemTime(new Date(2026, 4, 6, 9, 0));
      render(<AnnouncementOverlay />);
      emitAnnouncements([
        {
          ...BASE_ANNOUNCEMENT,
          activationType: 'scheduled',
          scheduledActivationDate: '2026-05-05',
          scheduledActivationTime: '14:00',
          scheduledEndDate: '2026-05-06',
          scheduledEndTime: '08:00',
          isActive: true,
        },
      ]);
      expect(screen.queryByText('Test Announcement')).not.toBeInTheDocument();
    });

    it('falls back to time-only comparison for legacy announcements without a start date', () => {
      // Clock: 10:00. Legacy schedule: time only at 09:00, no date set.
      vi.setSystemTime(new Date(2026, 4, 5, 10, 0));
      render(<AnnouncementOverlay />);
      emitAnnouncements([
        {
          ...BASE_ANNOUNCEMENT,
          activationType: 'scheduled',
          scheduledActivationTime: '09:00',
          // no scheduledActivationDate — legacy data
          isActive: true,
        },
      ]);
      expect(screen.getByText('Test Announcement')).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Building targeting
  // -------------------------------------------------------------------------

  it('shows an announcement with no building targeting to any user', () => {
    mockAuth(['BuildingA']);
    render(<AnnouncementOverlay />);
    emitAnnouncements([{ ...BASE_ANNOUNCEMENT, targetBuildings: [] }]);
    expect(screen.getByText('Test Announcement')).toBeInTheDocument();
  });

  it('shows a targeted announcement to a user in the target building', () => {
    mockAuth(['BuildingA']);
    render(<AnnouncementOverlay />);
    emitAnnouncements([
      { ...BASE_ANNOUNCEMENT, targetBuildings: ['BuildingA'] },
    ]);
    expect(screen.getByText('Test Announcement')).toBeInTheDocument();
  });

  it('hides a targeted announcement from a user in a different building', () => {
    mockAuth(['BuildingB']);
    render(<AnnouncementOverlay />);
    emitAnnouncements([
      { ...BASE_ANNOUNCEMENT, targetBuildings: ['BuildingA'] },
    ]);
    expect(screen.queryByText('Test Announcement')).not.toBeInTheDocument();
  });

  it('shows only untargeted announcements to a user with no building set', () => {
    mockAuth([]); // no buildings
    render(<AnnouncementOverlay />);
    const targeted: Announcement = {
      ...BASE_ANNOUNCEMENT,
      id: 'ann-targeted',
      targetBuildings: ['BuildingA'],
    };
    const untargeted: Announcement = {
      ...BASE_ANNOUNCEMENT,
      id: 'ann-untargeted',
      name: 'Untargeted',
      targetBuildings: [],
    };
    emitAnnouncements([targeted, untargeted]);
    expect(screen.queryByText('Test Announcement')).not.toBeInTheDocument();
    expect(screen.getByText('Untargeted')).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // User email targeting
  // -------------------------------------------------------------------------

  it('shows an announcement targeted to the current user email', () => {
    mockAuth([]);
    render(<AnnouncementOverlay />);
    emitAnnouncements([
      { ...BASE_ANNOUNCEMENT, targetUsers: ['test@example.com'] },
    ]);
    expect(screen.getByText('Test Announcement')).toBeInTheDocument();
  });

  it('hides an announcement targeted to a different email', () => {
    mockAuth([]);
    render(<AnnouncementOverlay />);
    emitAnnouncements([
      { ...BASE_ANNOUNCEMENT, targetUsers: ['other@example.com'] },
    ]);
    expect(screen.queryByText('Test Announcement')).not.toBeInTheDocument();
  });

  it('email targeting is case-insensitive', () => {
    mockAuth([]);
    render(<AnnouncementOverlay />);
    emitAnnouncements([
      { ...BASE_ANNOUNCEMENT, targetUsers: ['TEST@EXAMPLE.COM'] },
    ]);
    expect(screen.getByText('Test Announcement')).toBeInTheDocument();
  });

  it('shows announcement when user matches email but not building (OR logic)', () => {
    mockAuth(['BuildingB']); // user is in BuildingB
    render(<AnnouncementOverlay />);
    emitAnnouncements([
      {
        ...BASE_ANNOUNCEMENT,
        targetBuildings: ['BuildingA'], // user not in BuildingA
        targetUsers: ['test@example.com'], // but user email matches
      },
    ]);
    expect(screen.getByText('Test Announcement')).toBeInTheDocument();
  });

  it('shows announcement when user matches building but not email (OR logic)', () => {
    mockAuth(['BuildingA']);
    render(<AnnouncementOverlay />);
    emitAnnouncements([
      {
        ...BASE_ANNOUNCEMENT,
        targetBuildings: ['BuildingA'],
        targetUsers: ['other@example.com'],
      },
    ]);
    expect(screen.getByText('Test Announcement')).toBeInTheDocument();
  });

  it('hides announcement when user matches neither building nor email', () => {
    mockAuth(['BuildingB']);
    render(<AnnouncementOverlay />);
    emitAnnouncements([
      {
        ...BASE_ANNOUNCEMENT,
        targetBuildings: ['BuildingA'],
        targetUsers: ['other@example.com'],
      },
    ]);
    expect(screen.queryByText('Test Announcement')).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // ARIA accessibility
  // -------------------------------------------------------------------------

  it('renders windowed announcement as a dialog', () => {
    render(<AnnouncementOverlay />);
    emitAnnouncements([BASE_ANNOUNCEMENT]);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
  });

  it('renders maximized announcement with aria-modal', () => {
    render(<AnnouncementOverlay />);
    emitAnnouncements([{ ...BASE_ANNOUNCEMENT, maximized: true }]);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });

  it('dismiss button has a descriptive aria-label', () => {
    render(<AnnouncementOverlay />);
    emitAnnouncements([{ ...BASE_ANNOUNCEMENT, dismissalType: 'user' }]);
    expect(
      screen.getByRole('button', {
        name: /Dismiss announcement: Test Announcement/i,
      })
    ).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Dismissal type UI
  // -------------------------------------------------------------------------

  it('shows countdown chip for duration dismissal', () => {
    render(<AnnouncementOverlay />);
    emitAnnouncements([
      {
        ...BASE_ANNOUNCEMENT,
        dismissalType: 'duration',
        dismissalDurationSeconds: 30,
      },
    ]);
    // Should start at full 30 s
    expect(screen.getByLabelText(/Closes in 30 seconds/i)).toBeInTheDocument();
  });

  it('shows "Admin only" badge for admin dismissal type', () => {
    render(<AnnouncementOverlay />);
    emitAnnouncements([{ ...BASE_ANNOUNCEMENT, dismissalType: 'admin' }]);
    expect(screen.getByText(/Admin only/i)).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Multi-tenant org isolation (work item W6 — the CRITICAL leak)
  // -------------------------------------------------------------------------

  describe('org isolation', () => {
    it('never subscribes to the announcements collection for free-tier users', () => {
      // A no-org ("free") teacher must NOT open the global listener at all.
      // firestoreCallback stays null because the onSnapshot effect early-returns.
      mockAuth([], { userTier: 'free', orgId: null });
      const { container } = render(<AnnouncementOverlay />);
      expect(firestoreCallback).toBeNull();
      expect(container.firstChild).toBeNull();
    });

    it('subscribes for org/internal users (Orono path unchanged)', () => {
      mockAuth([], { userTier: 'internal', orgId: 'orono' });
      render(<AnnouncementOverlay />);
      // The listener opened — callback captured — and legacy (no orgId) docs render.
      emitAnnouncements([BASE_ANNOUNCEMENT]);
      expect(screen.getByText('Test Announcement')).toBeInTheDocument();
    });

    it('shows a legacy (no orgId) announcement to an org user — Orono zero-change', () => {
      mockAuth([], { userTier: 'internal', orgId: 'orono' });
      render(<AnnouncementOverlay />);
      // BASE_ANNOUNCEMENT has no orgId field (legacy / pre-isolation).
      emitAnnouncements([BASE_ANNOUNCEMENT]);
      expect(screen.getByText('Test Announcement')).toBeInTheDocument();
    });

    it('shows an announcement whose orgId matches the user org', () => {
      mockAuth([], { userTier: 'internal', orgId: 'orono' });
      render(<AnnouncementOverlay />);
      emitAnnouncements([{ ...BASE_ANNOUNCEMENT, orgId: 'orono' }]);
      expect(screen.getByText('Test Announcement')).toBeInTheDocument();
    });

    it('does NOT hide an org-stamped announcement while orgId is still resolving (Orono no-flicker)', () => {
      // userTier resolves to 'internal' from the email domain immediately, so
      // the listener is open and streams Orono's orgId:'orono' docs — but the
      // membership snapshot hasn't landed yet, so useAuth().orgId is still null.
      // The client filter must NOT hide the doc during this window, otherwise
      // post-backfill an Orono user sees their announcement flicker off then on.
      mockAuth([], { userTier: 'internal', orgId: null });
      render(<AnnouncementOverlay />);
      emitAnnouncements([{ ...BASE_ANNOUNCEMENT, orgId: 'orono' }]);
      expect(screen.getByText('Test Announcement')).toBeInTheDocument();
    });

    it('hides an announcement whose orgId belongs to a different org', () => {
      mockAuth([], { userTier: 'org', orgId: 'orono' });
      render(<AnnouncementOverlay />);
      emitAnnouncements([{ ...BASE_ANNOUNCEMENT, orgId: 'other-district' }]);
      expect(screen.queryByText('Test Announcement')).not.toBeInTheDocument();
    });

    it('shows legacy docs but hides foreign-org docs in the same snapshot', () => {
      mockAuth([], { userTier: 'internal', orgId: 'orono' });
      render(<AnnouncementOverlay />);
      const legacy: Announcement = {
        ...BASE_ANNOUNCEMENT,
        id: 'ann-legacy',
        name: 'Legacy Broadcast',
      };
      const foreign: Announcement = {
        ...BASE_ANNOUNCEMENT,
        id: 'ann-foreign',
        name: 'Foreign Org',
        orgId: 'other-district',
      };
      emitAnnouncements([legacy, foreign]);
      expect(screen.getByText('Legacy Broadcast')).toBeInTheDocument();
      expect(screen.queryByText('Foreign Org')).not.toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Server-side org query scoping (W6 — PATH A / PATH B query branch)
  // -------------------------------------------------------------------------

  describe('server-side org query scoping', () => {
    beforeEach(() => {
      vi.mocked(where).mockClear();
    });

    it('PATH A: builds where("orgId","==",orgId) when orgId is set', () => {
      // When orgId is a resolved non-null string the listener must be scoped
      // to the user's org using a single-field equality filter — no composite
      // index required.
      mockAuth([], { userTier: 'internal', orgId: 'orono' });
      render(<AnnouncementOverlay />);
      expect(vi.mocked(where)).toHaveBeenCalledWith('orgId', '==', 'orono');
    });

    it('PATH A: does NOT use where("isActive",...) as a server constraint when orgId is set', () => {
      // isActive is checked client-side on PATH A to avoid needing a composite
      // index (orgId + isActive would require one).
      mockAuth([], { userTier: 'internal', orgId: 'orono' });
      render(<AnnouncementOverlay />);
      const isActiveCalls = vi
        .mocked(where)
        .mock.calls.filter((args) => args[0] === 'isActive');
      expect(isActiveCalls).toHaveLength(0);
    });

    it('PATH A: filters out inactive docs client-side when orgId is set', () => {
      // The server query returns all of the org's docs regardless of isActive.
      // The useMemo / isWithinActiveWindow check must still suppress inactive ones.
      mockAuth([], { userTier: 'internal', orgId: 'orono' });
      render(<AnnouncementOverlay />);
      emitAnnouncements([
        { ...BASE_ANNOUNCEMENT, orgId: 'orono', isActive: true },
        {
          ...BASE_ANNOUNCEMENT,
          id: 'ann-inactive',
          name: 'Inactive',
          orgId: 'orono',
          isActive: false,
        },
      ]);
      expect(screen.getByText('Test Announcement')).toBeInTheDocument();
      expect(screen.queryByText('Inactive')).not.toBeInTheDocument();
    });

    it('PATH B: builds where("isActive","==",true) when orgId is null', () => {
      // Legacy / org-loading path: no org scoping, isActive still filtered
      // server-side exactly as before.
      mockAuth([], { userTier: 'internal', orgId: null });
      render(<AnnouncementOverlay />);
      expect(vi.mocked(where)).toHaveBeenCalledWith('isActive', '==', true);
    });

    it('PATH B: does NOT use where("orgId",...) when orgId is null', () => {
      mockAuth([], { userTier: 'internal', orgId: null });
      render(<AnnouncementOverlay />);
      const orgIdCalls = vi
        .mocked(where)
        .mock.calls.filter((args) => args[0] === 'orgId');
      expect(orgIdCalls).toHaveLength(0);
    });

    it('re-subscribes with org-scoped query when orgId resolves from null to a string', () => {
      // Simulates the membership snapshot landing: orgId starts null (PATH B),
      // then resolves to 'orono' (PATH A). The effect must clean up the old
      // listener and open a new org-scoped one.
      const { rerender } = render(<AnnouncementOverlay />);

      // Initial render: orgId null → PATH B
      mockAuth([], { userTier: 'internal', orgId: null });
      rerender(<AnnouncementOverlay />);
      // orgId-equality calls should still be zero
      expect(
        vi.mocked(where).mock.calls.filter((args) => args[0] === 'orgId')
      ).toHaveLength(0);

      vi.mocked(where).mockClear();

      // orgId resolves → PATH A
      mockAuth([], { userTier: 'internal', orgId: 'orono' });
      rerender(<AnnouncementOverlay />);
      expect(vi.mocked(where)).toHaveBeenCalledWith('orgId', '==', 'orono');
    });

    it("PATH A: an org user cannot see another org's announcement (cross-org isolation)", () => {
      // Even if somehow a foreign-org doc arrived in the snapshot (e.g., during
      // the PATH B→PATH A transition window), the client-side org filter must
      // suppress it. Defense-in-depth on top of the server query scoping.
      mockAuth([], { userTier: 'org', orgId: 'orono' });
      render(<AnnouncementOverlay />);
      emitAnnouncements([
        { ...BASE_ANNOUNCEMENT, orgId: 'orono' },
        {
          ...BASE_ANNOUNCEMENT,
          id: 'ann-other',
          name: 'Other Org Announcement',
          orgId: 'rival-district',
        },
      ]);
      expect(screen.getByText('Test Announcement')).toBeInTheDocument();
      expect(
        screen.queryByText('Other Org Announcement')
      ).not.toBeInTheDocument();
    });
  });
});
