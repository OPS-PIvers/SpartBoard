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
import { AnnouncementOverlay } from '../../../components/announcements/AnnouncementOverlay';
import { Announcement } from '../../../types';

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

vi.mock('../../../config/firebase', () => ({
  db: {},
  isAuthBypass: false,
}));

vi.mock('../../../context/useAuth', () => ({
  useAuth: vi.fn(),
}));

// Lazy widget registry – we just need to avoid a real dynamic import in tests
vi.mock('../../../components/widgets/WidgetRegistry', () => ({
  WIDGET_COMPONENTS: {},
}));

import { useAuth } from '../../../context/useAuth';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MOCK_USER = { uid: 'user-1', email: 'test@example.com' };

function mockAuth(selectedBuildings: string[] = []) {
  vi.mocked(useAuth).mockReturnValue({
    user: MOCK_USER,
    selectedBuildings,
    isAdmin: false,
    loading: false,
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
});
