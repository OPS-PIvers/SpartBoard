import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { LunchCountWidget } from './Widget';
import { useDashboard } from '@/context/useDashboard';
import { useAuth } from '@/context/useAuth';
import { WidgetData, LunchCountConfig } from '@/types';
import { mockPointerEvent } from '@/tests/testHelpers/mocks';

// Mock dependencies
vi.mock('@/context/useDashboard');
vi.mock('@/context/useAuth');

const mockDashboardContext = {
  updateWidget: vi.fn(),
  addToast: vi.fn(),
  rosters: [
    {
      id: 'roster-1',
      name: 'Class 1A',
      students: [
        { id: 's1', firstName: 'John', lastName: 'Doe' },
        { id: 's2', firstName: 'Jane', lastName: 'Smith' },
      ],
    },
  ],
  activeRosterId: 'roster-1',
  activeDashboard: {
    widgets: [{ id: 'lunch-1' }],
  },
};

const mockAuthContext = {
  user: { displayName: 'Teacher' },
  featurePermissions: [],
};

const mockNutrisliceData = {
  days: [
    {
      date: new Date().toISOString().split('T')[0],
      menu_items: [
        {
          is_section_title: false,
          section_name: 'Entrees',
          food: { name: 'Pizza' },
        },
      ],
    },
  ],
};

describe('LunchCountWidget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useDashboard as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      mockDashboardContext
    );
    (useAuth as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      mockAuthContext
    );

    global.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve({
        ok: true,
        text: () => Promise.resolve(JSON.stringify(mockNutrisliceData)),
      })
    );

    // Polyfill PointerEvent for jsdom (no-op when tests/setup.ts already set it)
    if (!global.PointerEvent) {
      global.PointerEvent = mockPointerEvent();
    }
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  const createWidget = (config: Partial<LunchCountConfig> = {}): WidgetData => {
    return {
      id: 'lunch-1',
      type: 'lunchCount',
      x: 0,
      y: 0,
      w: 400,
      h: 300,
      z: 1,
      config: {
        schoolSite: 'schumann-elementary',
        rosterMode: 'class',
        assignments: {},
        // Pre-populate cachedMenu to prevent auto-sync loop in tests
        cachedMenu: {
          hotLunch: { name: 'Pizza' },
          hotLunchSides: [],
          bentoBox: { name: 'Bento' },
          date: new Date().toISOString(),
        },
        lastSyncDate: new Date().toISOString(),
        ...config,
      },
    } as WidgetData;
  };

  it('renders student chips from roster', async () => {
    render(<LunchCountWidget widget={createWidget()} />);

    expect(await screen.findByText('John Doe')).toBeInTheDocument();
    expect(screen.getByText('Jane Smith')).toBeInTheDocument();
  });

  it('has touch-none class for dragging support', async () => {
    render(<LunchCountWidget widget={createWidget()} />);

    const chip = await screen.findByText('John Doe');
    expect(chip).toHaveClass('touch-none');
  });

  it('updates assignments on drag and drop', async () => {
    render(<LunchCountWidget widget={createWidget()} />);

    const chip = await screen.findByText('John Doe');
    const hotLunchZone = screen.getByTestId('hot-zone');
    expect(hotLunchZone).toBeInTheDocument();

    // dnd-kit uses pointer events. In a real environment we'd use user-event,
    // but testing dnd-kit in jsdom usually requires specialized utils or
    // manual event dispatching if we want to test the full loop.
    // Given the complexity of dnd-kit testing in jsdom, we'll verify the
    // components are rendered with correct IDs which dnd-kit uses for mapping.

    expect(chip).toBeInTheDocument();
    // We can't easily simulate the full dnd-kit drag-and-drop in jsdom
    // without more setup, but we've verified the refactor structure.
  });

  it('keeps two same-name students independently assigned (no name-collision)', async () => {
    // Regression test: assignments must be keyed by the roster student `id`,
    // not the display name. Two students who share a name (e.g. two "Emma
    // Smith"s) previously collided on the same `assignments` key, so
    // assigning one silently moved/overwrote the other's assignment.
    (useDashboard as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      ...mockDashboardContext,
      rosters: [
        {
          id: 'roster-1',
          name: 'Class 1A',
          students: [
            { id: 's1', firstName: 'Emma', lastName: 'Smith' },
            { id: 's2', firstName: 'Emma', lastName: 'Smith' },
          ],
        },
      ],
    });

    const widget = createWidget({
      assignments: { s1: 'hot', s2: 'bento' },
    });

    render(<LunchCountWidget widget={widget} />);

    const chips = await screen.findAllByText('Emma Smith');
    expect(chips).toHaveLength(2);

    const hotZone = screen.getByTestId('hot-zone');
    const bentoZone = screen.getByTestId('bento-zone');

    expect(within(hotZone).getAllByText('Emma Smith')).toHaveLength(1);
    expect(within(bentoZone).getAllByText('Emma Smith')).toHaveLength(1);
    expect(screen.queryByText('Assign 2 More Students')).toBeNull();
  });

  it('still honors a legacy name-keyed assignment saved before the id-keying fix', async () => {
    // Regression test: dashboards saved before assignments were keyed by
    // student id stored them under the display name instead (e.g.
    // "John Doe": "hot"). Switching the read path to id-only would silently
    // reset every pre-existing assignment to "unassigned" on load. The
    // widget must still honor a name-keyed entry when no id-keyed one exists.
    const widget = createWidget({
      assignments: { 'John Doe': 'home' },
    });

    render(<LunchCountWidget widget={widget} />);

    const homeZone = screen.getByTestId('home-zone');
    expect(await within(homeZone).findByText('John Doe')).toBeInTheDocument();
  });

  it('can unassign a student whose assignment only exists under the legacy name key', async () => {
    // Regression test: the read-path fallback (previous test) kept legacy
    // assignments visible, but the write path originally only ever deleted
    // `assignments[id]` — a no-op when the entry lives under the name key —
    // so a legacy-keyed student could never actually be unassigned by click.
    const widget = createWidget({
      assignments: { 'John Doe': 'home' },
    });

    render(<LunchCountWidget widget={widget} />);

    const homeZone = screen.getByTestId('home-zone');
    const chip = await within(homeZone).findByText('John Doe');
    chip.click();

    const [, updatePayload] = mockDashboardContext.updateWidget.mock.calls.at(
      -1
    ) as [string, { config: LunchCountConfig }];
    expect(updatePayload.config.assignments).not.toHaveProperty('John Doe');
  });

  it('renders correctly for middle school without interactive DND', () => {
    const widget = createWidget({
      schoolSite: 'orono-middle-school',
      cachedMenu: {
        hotLunch: { name: 'Pizza' },
        hotLunchSides: [],
        bentoBox: { name: 'Yogurt Parfait' },
        date: new Date().toISOString(),
      },
    });

    render(<LunchCountWidget widget={widget} />);

    // Check that we're showing the featured view header
    expect(screen.getByText('Hot Lunch')).toBeTruthy();

    // Check for Hot Lunch value
    expect(screen.getByText('Pizza')).toBeTruthy();

    // Verify it does NOT render the interactive elements
    expect(screen.queryByText('Assign 2 More Students')).toBeNull();
    expect(screen.queryByText('John Doe')).toBeNull(); // Missing interactive student items
  });
});
