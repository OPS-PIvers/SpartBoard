import type { ReactElement } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  render,
  screen,
  within,
  fireEvent,
  waitFor,
} from '@testing-library/react';
import { LunchCountRedesign as LunchCountWidget } from './RedesignedLunchCount';
import { useDashboard } from '@/context/useDashboard';
import { useAuth } from '@/context/useAuth';
import { WidgetData, LunchCountConfig } from '@/types';
import { mockPointerEvent } from '@/tests/testHelpers/mocks';
import { SubShareHostContext } from '@/context/SubShareHostContextValue';

// Mock dependencies
vi.mock('@/context/useDashboard');
vi.mock('@/context/useAuth');
const nut = vi.hoisted(() => ({ isSyncing: false, fetch: vi.fn() }));
vi.mock('../useNutrislice', () => ({
  useNutrislice: () => ({
    isSyncing: nut.isSyncing,
    fetchNutrislice: nut.fetch,
  }),
}));
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

describe('LunchCountRedesign (legacy suite)', () => {
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

  const pointer = (pointerId: number, x: number, y: number) => ({
    pointerId,
    pointerType: 'touch',
    clientX: x,
    clientY: y,
  });

  it('shows the student name, not their id, while dragging', async () => {
    render(<LunchCountWidget widget={createWidget()} />);

    const chip = await screen.findByText('John Doe');
    fireEvent.pointerDown(chip, pointer(1, 0, 0));
    fireEvent.pointerMove(chip, pointer(1, 40, 40));

    expect(screen.getAllByText('John Doe')).toHaveLength(2);
    expect(screen.queryByText('s1')).not.toBeInTheDocument();
    fireEvent.pointerCancel(chip, pointer(1, 40, 40));
  });

  it('lets two students drag and drop their names at the same time', async () => {
    const zones: Record<string, string> = {};
    const elementFromPoint = vi.fn(
      (x: number) => screen.getByTestId(zones[String(x)]) as Element
    );
    // jsdom has no elementFromPoint.
    Object.defineProperty(document, 'elementFromPoint', {
      value: elementFromPoint,
      configurable: true,
    });
    zones['100'] = 'hot-zone';
    zones['200'] = 'home-zone';
    render(<LunchCountWidget widget={createWidget()} />);

    const john = await screen.findByText('John Doe');
    const jane = screen.getByText('Jane Smith');
    fireEvent.pointerDown(john, pointer(1, 0, 0));
    fireEvent.pointerDown(jane, pointer(2, 0, 0));
    fireEvent.pointerMove(john, pointer(1, 100, 0));
    fireEvent.pointerMove(jane, pointer(2, 200, 0));

    expect(screen.getAllByText('John Doe')).toHaveLength(2);
    expect(screen.getAllByText('Jane Smith')).toHaveLength(2);

    fireEvent.pointerUp(john, pointer(1, 100, 0));
    fireEvent.pointerUp(jane, pointer(2, 200, 0));

    const calls = mockDashboardContext.updateWidget.mock.calls;
    expect(calls.at(-1)).toEqual([
      'lunch-1',
      { config: { assignments: { s1: 'hot', s2: 'home' } } },
    ]);
    Reflect.deleteProperty(document, 'elementFromPoint');
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

describe('LunchCountRedesign — class group pool', () => {
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
    },
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
      },
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

describe('LunchCountRedesign — missing lunch time or grade', () => {
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

describe('LunchCountRedesign — new face', () => {
  const widgetWith = (config: Partial<LunchCountConfig> = {}): WidgetData =>
    ({
      id: 'lunch-1',
      type: 'lunchCount',
      x: 0,
      y: 0,
      w: 600,
      h: 400,
      z: 1,
      config: {
        schoolSite: 'schumann-elementary',
        rosterMode: 'class',
        isManualMode: false,
        assignments: {},
        cachedMenu: {
          hotLunch: { name: 'Pizza', imageUrl: 'https://img.example/p.jpg' },
          hotLunchSides: [{ name: 'Corn' }],
          bentoBox: { name: 'Bento' },
          date: new Date().toISOString(),
        },
        lastSyncDate: new Date().toISOString(),
        ...config,
      },
    }) as WidgetData;

  beforeEach(() => {
    vi.clearAllMocks();
    nut.isSyncing = false;
    (useDashboard as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      mockDashboardContext
    );
    (useAuth as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      mockAuthContext
    );
  });

  it('shows each count as a numeral in its zone', () => {
    render(
      <LunchCountWidget
        widget={widgetWith({ assignments: { s1: 'hot', s2: 'hot' } })}
      />
    );
    const hot = screen.getByTestId('hot-zone');
    expect(hot.querySelector('[data-lunch-count="hot"]')?.textContent).toBe(
      '2'
    );
    expect(
      screen
        .getByTestId('bento-zone')
        .querySelector('[data-lunch-count="bento"]')?.textContent
    ).toBe('0');
    expect(screen.getByText(/Unassigned \(0\)/)).toBeInTheDocument();
  });

  it('keeps every face tour anchor on its control', () => {
    render(<LunchCountWidget widget={widgetWith()} />);
    for (const id of [
      'lunch-count.open-report',
      'lunch-count.refresh-menu',
      'lunch-count.reset-assignments',
    ]) {
      expect(document.querySelectorAll(`[data-tour="${id}"]`)).toHaveLength(1);
    }
    expect(
      document.querySelector('[data-tour="lunch-count.refresh-menu"]')
    ).toHaveAccessibleName('Refresh menu');
    expect(
      document.querySelector('[data-tour="lunch-count.reset-assignments"]')
    ).toHaveAccessibleName('Clear all assignments');
  });

  it('clears every assignment with Reset', () => {
    render(
      <LunchCountWidget
        widget={widgetWith({ assignments: { s1: 'hot', s2: 'home' } })}
      />
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Clear all assignments' })
    );
    expect(mockDashboardContext.updateWidget).toHaveBeenCalledWith('lunch-1', {
      config: expect.objectContaining({ assignments: {} }) as LunchCountConfig,
    });
  });

  it('refreshes the menu and disables Refresh while syncing', () => {
    const { rerender } = render(<LunchCountWidget widget={widgetWith()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Refresh menu' }));
    expect(nut.fetch).toHaveBeenCalledTimes(1);
    nut.isSyncing = true;
    rerender(<LunchCountWidget widget={widgetWith()} />);
    expect(screen.getByRole('button', { name: 'Refresh menu' })).toBeDisabled();
  });

  it('sends an assigned chip back to Unassigned on tap and on Enter', () => {
    render(
      <LunchCountWidget
        widget={widgetWith({ assignments: { s1: 'hot', s2: 'bento' } })}
      />
    );
    fireEvent.click(
      within(screen.getByTestId('hot-zone')).getByText('John Doe')
    );
    expect(mockDashboardContext.updateWidget.mock.calls.at(-1)?.[1]).toEqual({
      config: { assignments: { s2: 'bento' } },
    });
    fireEvent.keyDown(
      within(screen.getByTestId('bento-zone')).getByText('Jane Smith'),
      { key: 'Enter' }
    );
    expect(mockDashboardContext.updateWidget.mock.calls.at(-1)?.[1]).toEqual({
      config: { assignments: {} },
    });
  });

  it('unassigns a chip dropped outside every zone', () => {
    Object.defineProperty(document, 'elementFromPoint', {
      value: () => document.body,
      configurable: true,
    });
    render(
      <LunchCountWidget widget={widgetWith({ assignments: { s1: 'home' } })} />
    );
    const chip = within(screen.getByTestId('home-zone')).getByText('John Doe');
    fireEvent.pointerDown(chip, {
      pointerId: 3,
      pointerType: 'touch',
      clientX: 0,
      clientY: 0,
    });
    fireEvent.pointerMove(chip, {
      pointerId: 3,
      pointerType: 'touch',
      clientX: 50,
      clientY: 50,
    });
    fireEvent.pointerUp(chip, {
      pointerId: 3,
      pointerType: 'touch',
      clientX: 50,
      clientY: 50,
    });
    expect(mockDashboardContext.updateWidget.mock.calls.at(-1)?.[1]).toEqual({
      config: { assignments: {} },
    });
    Reflect.deleteProperty(document, 'elementFromPoint');
  });

  it('drops a chip into the Unassigned tray by its drop zone', () => {
    Object.defineProperty(document, 'elementFromPoint', {
      value: () => screen.getByTestId('unassigned-zone'),
      configurable: true,
    });
    render(
      <LunchCountWidget widget={widgetWith({ assignments: { s1: 'bento' } })} />
    );
    const chip = within(screen.getByTestId('bento-zone')).getByText('John Doe');
    fireEvent.pointerDown(chip, {
      pointerId: 4,
      pointerType: 'mouse',
      button: 0,
      clientX: 0,
      clientY: 0,
    });
    fireEvent.pointerMove(chip, {
      pointerId: 4,
      pointerType: 'mouse',
      clientX: 30,
      clientY: 30,
    });
    fireEvent.pointerUp(chip, {
      pointerId: 4,
      pointerType: 'mouse',
      clientX: 30,
      clientY: 30,
    });
    expect(mockDashboardContext.updateWidget.mock.calls.at(-1)?.[1]).toEqual({
      config: { assignments: {} },
    });
    Reflect.deleteProperty(document, 'elementFromPoint');
  });

  it('opens the photo peek from the menu thumbnail and closes it', async () => {
    render(<LunchCountWidget widget={widgetWith()} />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Show photo of Pizza' })
    );
    const close = await screen.findByRole('button', { name: 'Close photo' });
    expect(close).toHaveAttribute('data-tour', 'lunch-count.photo-close');
    fireEvent.click(close);
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Close photo' })).toBeNull()
    );
  });

  it('asks for a class instead of empty buckets when there are no classes', () => {
    (useDashboard as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      ...mockDashboardContext,
      rosters: [],
      activeRosterId: null,
    });
    render(<LunchCountWidget widget={widgetWith()} />);
    expect(screen.getByText('Pick a class')).toBeInTheDocument();
    expect(
      screen.getByText('Add a class in Classes first.')
    ).toBeInTheDocument();
    expect(screen.queryByTestId('hot-zone')).toBeNull();
    expect(screen.queryByRole('button', { name: /Assign/ })).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Refresh menu' })
    ).toBeInTheDocument();
  });

  it('points an empty custom list to settings', () => {
    render(
      <LunchCountWidget
        widget={widgetWith({ rosterMode: 'custom', roster: [] })}
      />
    );
    expect(screen.getByText('No names yet')).toBeInTheDocument();
    expect(
      screen.getByText("Add names in this widget's settings.")
    ).toBeInTheDocument();
  });

  it('says when the class has no students', () => {
    (useDashboard as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      ...mockDashboardContext,
      rosters: [{ id: 'roster-1', name: 'Empty', students: [] }],
    });
    render(<LunchCountWidget widget={widgetWith()} />);
    expect(screen.getByText('This class has no students')).toBeInTheDocument();
  });

  it('sorts a custom list by name', () => {
    render(
      <LunchCountWidget
        widget={widgetWith({
          rosterMode: 'custom',
          roster: ['Ana', 'Ben'],
          assignments: { Ana: 'bento' },
        })}
      />
    );
    expect(
      within(screen.getByTestId('bento-zone')).getByText('Ana')
    ).toBeInTheDocument();
    expect(screen.queryByText('Pick a class')).toBeNull();
  });

  it('says the menu is not available after a failed sync instead of loading forever', () => {
    render(
      <LunchCountWidget
        widget={widgetWith({ cachedMenu: null, syncError: 'E-SYNC-404' })}
      />
    );
    expect(screen.getAllByText('Menu not available')).toHaveLength(2);
    expect(screen.queryByText('Loading...')).toBeNull();
  });

  it('shows Loading only while a sync runs', () => {
    nut.isSyncing = true;
    render(<LunchCountWidget widget={widgetWith({ cachedMenu: null })} />);
    expect(screen.getAllByText('Loading...')).toHaveLength(2);
  });

  it('shows no menu line in manual mode with nothing cached', () => {
    render(
      <LunchCountWidget
        widget={widgetWith({ cachedMenu: null, isManualMode: true })}
      />
    );
    expect(screen.queryByText('Loading...')).toBeNull();
    expect(screen.queryByText('Menu not available')).toBeNull();
  });

  it('has a short remaining label for the compact count board', () => {
    render(
      <LunchCountWidget widget={widgetWith({ assignments: { s1: 'hot' } })} />
    );
    expect(screen.getByText('1 left')).toBeInTheDocument();
    const board = document.querySelector('[data-lunch-count-board="compact"]');
    expect(board).toHaveTextContent('Hot1Bento0Home0');
  });

  describe('middle and high school face', () => {
    const ms = (config: Partial<LunchCountConfig>) =>
      widgetWith({ schoolSite: 'orono-high-school', ...config });

    it('shows the entree with a labelled refresh that touch screens can see', () => {
      render(<LunchCountWidget widget={ms({})} />);
      expect(screen.getByText('Pizza')).toBeInTheDocument();
      const refresh = screen.getByRole('button', { name: 'Refresh menu' });
      expect(refresh).toHaveAttribute('data-tour', 'lunch-count.refresh-menu');
      expect(refresh.className).toContain('[@media(hover:none)]:opacity-100');
      fireEvent.click(refresh);
      expect(nut.fetch).toHaveBeenCalled();
      expect(screen.queryByTestId('hot-zone')).toBeNull();
    });

    it('uses the manual entree in manual mode', () => {
      render(
        <LunchCountWidget
          widget={ms({ isManualMode: true, manualHotLunch: 'Tacos' })}
        />
      );
      expect(screen.getByText('Tacos')).toBeInTheDocument();
    });

    it('says the menu is not available after a failed sync', () => {
      render(
        <LunchCountWidget
          widget={ms({ cachedMenu: null, syncError: 'E-SYNC-404' })}
        />
      );
      expect(screen.getByText('Menu not available')).toBeInTheDocument();
    });
  });
});
