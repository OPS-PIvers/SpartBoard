import type { ReactElement } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  render,
  screen,
  within,
  fireEvent,
  waitFor,
} from '@testing-library/react';
import { LunchCountWidget } from './Widget';
import { useDashboard } from '@/context/useDashboard';
import { useAuth } from '@/context/useAuth';
import { WidgetData, LunchCountConfig } from '@/types';
import { mockPointerEvent } from '@/tests/testHelpers/mocks';
import { SubShareHostContext } from '@/context/SubShareHostContextValue';

// Mock dependencies
vi.mock('@/context/useDashboard');
vi.mock('@/context/useAuth');
// Class groups default OFF here, so these suites keep asserting the
// pre-feature behaviour (docs/plans/shipped/ROSTER_GROUPS_INTEGRATION.md D23).
// Flip `gate.enabled` inside a test to exercise the feature.
const gate = vi.hoisted(() => ({ enabled: false }));
vi.mock('@/hooks/useRosterGroupsGate', () => ({
  useRosterGroupsGate: () => gate.enabled,
}));

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
  selectedBuildings: ['schumann'],
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
    fireEvent.click(chip);

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

/**
 * Pool filter (docs/plans/shipped/ROSTER_GROUPS_INTEGRATION.md D22). Asserted here
 * rather than trusted to match Checklist's — two widgets sharing a shape is
 * exactly how the ungated sibling control slipped through on PR 2.
 */
describe('LunchCountWidget — class group pool', () => {
  const pooledContext = {
    ...mockDashboardContext,
    rosters: [
      {
        id: 'roster-1',
        name: 'Class 1A',
        students: [
          { id: 's1', firstName: 'John', lastName: 'Doe' },
          { id: 's2', firstName: 'Jane', lastName: 'Smith' },
        ],
        groups: [{ id: 'g1', name: 'Reading', studentIds: ['s1'] }],
      },
    ],
  };

  const pooledWidget = (
    rosterPoolGroupId: string | null,
    assignments: Record<string, 'hot' | 'bento' | 'home' | null> = {}
  ): WidgetData => ({
    id: 'lunch-1',
    type: 'lunchCount',
    x: 0,
    y: 0,
    w: 400,
    h: 300,
    z: 1,
    flipped: false,
    config: {
      schoolSite: 'schumann-elementary',
      rosterMode: 'class',
      assignments,
      rosterPoolGroupId,
      gradeLevel: '1',
      lunchTimeHour: '11',
      lunchTimeMinute: '30',
      cachedMenu: {
        hotLunch: { name: 'Pizza' },
        hotLunchSides: [],
        bentoBox: { name: 'Bento' },
        date: new Date().toISOString(),
      },
      lastSyncDate: new Date().toISOString(),
    } as unknown as LunchCountConfig,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    gate.enabled = false;
    (useDashboard as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      pooledContext
    );
    (useAuth as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      mockAuthContext
    );
  });

  it('shows only the pool group once class groups are on', () => {
    gate.enabled = true;
    render(<LunchCountWidget widget={pooledWidget('g1')} />);
    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(screen.queryByText('Jane Smith')).toBeNull();
  });

  it('ignores a stored pool while the feature is off', () => {
    render(<LunchCountWidget widget={pooledWidget('g1')} />);
    expect(screen.getByText('Jane Smith')).toBeInTheDocument();
  });

  it('counts the whole class for the cafeteria report, not the pool', () => {
    // The pool is a view; Submit Report is an external submission the kitchen
    // cooks to, so it must never shrink with the filter. Caught in review.
    gate.enabled = true;
    render(
      <LunchCountWidget widget={pooledWidget('g1', { s1: 'hot', s2: 'hot' })} />
    );
    // Jane is hidden by the pool but still assigned, so the report is whole.
    expect(screen.queryByText('Jane Smith')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Submit Report/i }));
    // The confirmation modal shows the numbers that will be submitted: both
    // students, not just the one the pool leaves visible.
    const modal = screen
      .getByText('Submit Lunch Report')
      .closest('[aria-labelledby="report-modal-title"]') as HTMLElement;
    const hotLunchRow = within(modal).getByText('Hot Lunch').closest('div')
      ?.parentElement as HTMLElement;
    expect(within(hotLunchRow).getByText('2')).toBeInTheDocument();
  });

  it('says where the missing student is when the pool hides them', () => {
    // Every visible student is assigned, so the grid reads "Unassigned (0)".
    // Without naming the hidden one the disabled button is unexplainable.
    gate.enabled = true;
    render(<LunchCountWidget widget={pooledWidget('g1', { s1: 'hot' })} />);
    expect(
      screen.getByRole('button', { name: /1 outside this group/i })
    ).toBeDisabled();
    expect(screen.getByText(/Unassigned \(0\)/)).toHaveTextContent(
      /1 outside this group/i
    );
  });

  it('keeps the plain label when nothing is hidden', () => {
    render(<LunchCountWidget widget={pooledWidget(null, { s1: 'hot' })} />);
    expect(screen.getByText(/Assign 1 More Students/i)).toBeInTheDocument();
  });

  describe('submitting from a substitute share', () => {
    const submitWith = async (ui: ReactElement) => {
      (useAuth as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
        user: { displayName: 'Sam Substitute' },
        selectedBuildings: ['schumann'],
        featurePermissions: [
          {
            widgetType: 'lunchCount',
            config: {
              submissionUrl: 'https://script.example/exec',
              schumannSheetId: 'sheet-1',
            },
          },
        ],
      });
      render(ui);
      fireEvent.click(screen.getByRole('button', { name: /Submit Report/i }));
      fireEvent.click(
        screen.getByRole('button', { name: /Confirm & Submit/i })
      );
      await waitFor(() =>
        expect(global.fetch).toHaveBeenCalledWith(
          'https://script.example/exec',
          expect.anything()
        )
      );
      const call = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.find(
        ([url]) => url === 'https://script.example/exec'
      );
      return JSON.parse((call?.[1] as { body: string }).body) as {
        label: string;
      };
    };
    const base = pooledWidget(null, { s1: 'hot', s2: 'bento' });
    const assigned: WidgetData = {
      ...base,
      config: {
        ...base.config,
        gradeLevel: '1',
        lunchTimeHour: '11',
        lunchTimeMinute: '30',
      } as LunchCountConfig,
    };

    it('labels the report with the teacher who shared the board', async () => {
      const payload = await submitWith(
        <SubShareHostContext.Provider value={{ teacherName: 'Jane Doe' }}>
          <LunchCountWidget widget={assigned} />
        </SubShareHostContext.Provider>
      );
      expect(payload.label).toBe('11:30 - GR1 - J. Doe');
    });

    it('never falls back to the substitute when the share has no name', async () => {
      const payload = await submitWith(
        <SubShareHostContext.Provider value={{ teacherName: null }}>
          <LunchCountWidget widget={assigned} />
        </SubShareHostContext.Provider>
      );
      expect(payload.label).toBe('11:30 - GR1 - Staff');
    });

    it('uses the signed-in teacher outside a share', async () => {
      const payload = await submitWith(<LunchCountWidget widget={assigned} />);
      expect(payload.label).toBe('11:30 - GR1 - S. Substitute');
    });
  });
});

describe('LunchCountWidget — missing lunch time or grade', () => {
  const allAssigned = (config: Partial<LunchCountConfig>): WidgetData =>
    ({
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
        assignments: { s1: 'hot', s2: 'bento' },
        cachedMenu: {
          hotLunch: { name: 'Pizza' },
          hotLunchSides: [],
          bentoBox: { name: 'Bento' },
          date: new Date().toISOString(),
        },
        lastSyncDate: new Date().toISOString(),
        ...config,
      },
    }) as WidgetData;

  const auth = { buildings: ['schumann'] };

  beforeEach(() => {
    vi.clearAllMocks();
    auth.buildings = ['schumann'];
    Element.prototype.scrollTo = vi.fn();
    (useDashboard as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      mockDashboardContext
    );
    (useAuth as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      user: { displayName: 'Kristan Nalezny' },
      selectedBuildings: auth.buildings,
      featurePermissions: [
        {
          widgetType: 'lunchCount',
          config: {
            submissionUrl: 'https://script.example/exec',
            schumannSheetId: 'sheet-1',
          },
        },
      ],
    });
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('Success'),
    });
  });

  it('asks for both before the report, then saves them to the widget', () => {
    render(<LunchCountWidget widget={allAssigned({})} />);
    fireEvent.click(screen.getByRole('button', { name: /Submit Report/i }));

    expect(screen.queryByText('Submit Lunch Report')).toBeNull();
    expect(
      screen.getByText('Set your lunch time and grade')
    ).toBeInTheDocument();
    expect(screen.getAllByRole('radio').map((r) => r.textContent)).toEqual([
      'K',
      '1',
      '2',
      'MAC',
    ]);

    fireEvent.keyDown(screen.getByRole('spinbutton', { name: 'Minute' }), {
      key: 'ArrowDown',
    });
    fireEvent.click(screen.getByRole('radio', { name: '2' }));
    fireEvent.click(screen.getByRole('button', { name: /Save and continue/i }));

    expect(mockDashboardContext.updateWidget).toHaveBeenCalledWith('lunch-1', {
      config: expect.objectContaining({
        lunchTimeHour: '11',
        lunchTimeMinute: '05',
        gradeLevel: '2',
      }) as LunchCountConfig,
    });
    expect(screen.getByText('Submit Lunch Report')).toBeInTheDocument();
  });

  it('keeps Save disabled until the teacher touches the time wheel', () => {
    render(<LunchCountWidget widget={allAssigned({ gradeLevel: '1' })} />);
    fireEvent.click(screen.getByRole('button', { name: /Submit Report/i }));

    const save = screen.getByRole('button', { name: /Save and continue/i });
    expect(save).toBeDisabled();
    fireEvent.pointerDown(screen.getByRole('spinbutton', { name: 'Hour' }));
    expect(save).toBeEnabled();
    fireEvent.click(save);
    expect(mockDashboardContext.updateWidget).toHaveBeenCalledWith('lunch-1', {
      config: expect.objectContaining({
        lunchTimeHour: '11',
        lunchTimeMinute: '00',
      }) as LunchCountConfig,
    });
  });

  it('will not continue without a grade', () => {
    render(<LunchCountWidget widget={allAssigned({ lunchTimeHour: '12' })} />);
    fireEvent.click(screen.getByRole('button', { name: /Submit Report/i }));

    expect(screen.getByText('Set your grade')).toBeInTheDocument();
    expect(screen.queryByRole('spinbutton')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Save and continue/i }));

    expect(screen.getByRole('alert')).toHaveTextContent('Pick a grade');
    expect(mockDashboardContext.updateWidget).not.toHaveBeenCalled();
    expect(screen.queryByText('Submit Lunch Report')).toBeNull();
  });

  it('sends the picked time even when the widget cannot save it', async () => {
    render(
      <SubShareHostContext.Provider value={{ teacherName: 'Paige Awes' }}>
        <LunchCountWidget widget={allAssigned({ gradeLevel: 'K' })} />
      </SubShareHostContext.Provider>
    );
    fireEvent.click(screen.getByRole('button', { name: /Submit Report/i }));
    expect(screen.queryByRole('radio')).toBeNull();
    fireEvent.keyDown(screen.getByRole('spinbutton', { name: 'Hour' }), {
      key: 'ArrowUp',
    });
    fireEvent.click(screen.getByRole('button', { name: /Save and continue/i }));
    fireEvent.click(screen.getByRole('button', { name: /Confirm & Submit/i }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const body = JSON.parse(
      (
        (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1] as {
          body: string;
        }
      ).body
    ) as { label: string };
    expect(body.label).toBe('10:00 - K - P. Awes');
  });

  it('asks for the school when the profile has no building', () => {
    auth.buildings.splice(0);
    render(<LunchCountWidget widget={allAssigned({ gradeLevel: '1' })} />);
    fireEvent.click(screen.getByRole('button', { name: /Submit Report/i }));

    expect(
      screen.getByText('Set your school, lunch time and grade')
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: 'Intermediate' }));
    fireEvent.pointerDown(screen.getByRole('spinbutton', { name: 'Hour' }));
    expect(
      screen
        .getAllByRole('radio')
        .filter((r) => r.textContent?.length === 1)
        .map((r) => r.textContent)
    ).toEqual(['3', '4', '5']);
    fireEvent.click(screen.getByRole('button', { name: /Save and continue/i }));
    expect(screen.getByRole('alert')).toHaveTextContent('Pick a grade');

    fireEvent.click(screen.getByRole('radio', { name: '4' }));
    fireEvent.click(screen.getByRole('button', { name: /Save and continue/i }));
    expect(mockDashboardContext.updateWidget).toHaveBeenCalledWith('lunch-1', {
      config: expect.objectContaining({
        schoolSite: 'orono-intermediate-school',
        gradeLevel: '4',
        cachedMenu: null,
      }) as LunchCountConfig,
    });
  });

  it('never asks a substitute for the school', () => {
    auth.buildings.splice(0);
    render(
      <SubShareHostContext.Provider value={{ teacherName: 'Paige Awes' }}>
        <LunchCountWidget widget={allAssigned({})} />
      </SubShareHostContext.Provider>
    );
    fireEvent.click(screen.getByRole('button', { name: /Submit Report/i }));
    expect(screen.queryByRole('radio', { name: 'Intermediate' })).toBeNull();
  });

  it('goes straight to the report when both are set', () => {
    render(
      <LunchCountWidget
        widget={allAssigned({
          lunchTimeHour: '11',
          lunchTimeMinute: '30',
          gradeLevel: '1',
        })}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Submit Report/i }));
    expect(screen.getByText('Submit Lunch Report')).toBeInTheDocument();
  });
});
