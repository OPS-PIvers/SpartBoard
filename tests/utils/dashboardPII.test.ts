import { describe, it, expect } from 'vitest';
import {
  scrubDashboardPII,
  extractDashboardPII,
  mergeDashboardPII,
  dashboardHasPII,
  lunchNotesBehindKey,
  boardLacksLunchNotes,
  keepDriveLunchNotes,
  DashboardPiiSupplement,
} from '@/utils/dashboardPII';
import { Dashboard } from '@/types';
import {
  getCentralDayKey,
  submittedMarker,
} from '@/components/widgets/LunchCount/redesign/lunchCountFormat';

describe('dashboardPII utilities', () => {
  const mockDashboard = {
    id: 'test-dash',
    name: 'Test Dashboard',
    isShared: false,
    widgets: [
      {
        id: 'widget-1',
        type: 'random',
        position: { x: 0, y: 0 },
        config: {
          firstNames: 'Alice\nBob',
          lastNames: 'Smith\nJones',
          otherConfig: 'safe-value',
        },
      },
      {
        id: 'widget-2',
        type: 'text',
        position: { x: 10, y: 10 },
        config: {
          text: 'Hello world',
        },
      },
      {
        id: 'widget-3',
        type: 'seating-chart',
        position: { x: 20, y: 20 },
        config: {
          names: ['Charlie', 'Dave'],
          layout: 'grid',
        },
      },
    ],
  } as unknown as Dashboard;

  describe('dashboardHasPII', () => {
    it('returns true if any widget contains PII fields', () => {
      expect(dashboardHasPII(mockDashboard)).toBe(true);
    });

    it('returns false if no widget contains PII fields', () => {
      const safeDashboard = {
        ...mockDashboard,
        widgets: [
          {
            id: 'safe-widget',
            type: 'text',
            position: { x: 0, y: 0 },
            config: { text: 'No PII here' },
          },
        ],
      } as unknown as Dashboard;
      expect(dashboardHasPII(safeDashboard)).toBe(false);
    });
  });

  describe('extractDashboardPII', () => {
    it('extracts only PII fields and groups them by widget ID', () => {
      const supplement = extractDashboardPII(mockDashboard);

      expect(supplement).toEqual({
        'widget-1': {
          firstNames: 'Alice\nBob',
          lastNames: 'Smith\nJones',
        },
        'widget-3': {
          names: ['Charlie', 'Dave'],
        },
      });

      // Ensure safe widgets are not included
      expect(supplement['widget-2']).toBeUndefined();
    });
  });

  describe('scrubDashboardPII', () => {
    it('removes PII fields from widget configs without modifying other fields', () => {
      const scrubbed = scrubDashboardPII(mockDashboard);

      expect(scrubbed.widgets[0].config).toEqual({
        otherConfig: 'safe-value',
      });

      expect(scrubbed.widgets[1].config).toEqual({
        text: 'Hello world',
      });

      expect(scrubbed.widgets[2].config).toEqual({
        layout: 'grid',
      });

      // Original should remain unchanged
      expect(mockDashboard.widgets[0].config).toHaveProperty('firstNames');
    });
  });

  describe('RandomWidget lastResult (picked names) is treated as PII', () => {
    // lastResult holds the picked name / shuffle order / groups — the same
    // roster names as `remainingStudents` (both are written together from one
    // roster partition), so it must be scrubbed from Firestore alongside it.
    const randomDashboard = {
      id: 'rand-dash',
      name: 'Random Dashboard',
      isShared: false,
      widgets: [
        {
          id: 'random-1',
          type: 'random',
          position: { x: 0, y: 0 },
          config: {
            rosterMode: 'custom',
            firstNames: 'Alice\nBob',
            lastNames: '',
            mode: 'groups',
            remainingStudents: ['Alice'],
            lastResult: [{ id: 'g1', names: ['Alice', 'Bob'] }],
            soundEnabled: true,
          },
        },
      ],
    } as unknown as Dashboard;

    it('scrubDashboardPII removes lastResult so picked names never reach Firestore', () => {
      const scrubbed = scrubDashboardPII(randomDashboard);
      expect(scrubbed.widgets[0].config).not.toHaveProperty('lastResult');
      expect(scrubbed.widgets[0].config).not.toHaveProperty(
        'remainingStudents'
      );
      expect(scrubbed.widgets[0].config).toEqual({
        rosterMode: 'custom',
        mode: 'groups',
        soundEnabled: true,
      });
    });

    it('extractDashboardPII pulls lastResult into the Drive supplement', () => {
      const supplement = extractDashboardPII(randomDashboard);
      expect(supplement['random-1']).toMatchObject({
        lastResult: [{ id: 'g1', names: ['Alice', 'Bob'] }],
      });
    });

    it('lastResult round-trips through scrub + merge', () => {
      const scrubbed = scrubDashboardPII(randomDashboard);
      const supplement = extractDashboardPII(randomDashboard);
      const merged = mergeDashboardPII(scrubbed, supplement);
      expect(merged.widgets[0].config).toHaveProperty('lastResult', [
        { id: 'g1', names: ['Alice', 'Bob'] },
      ]);
    });
  });

  describe('mergeDashboardPII', () => {
    it('merges PII fields back into the appropriate widget configs', () => {
      const scrubbed = scrubDashboardPII(mockDashboard);
      const supplement: DashboardPiiSupplement = {
        'widget-1': {
          firstNames: 'Alice\nBob',
          lastNames: 'Smith\nJones',
        },
        'widget-3': {
          names: ['Charlie', 'Dave'],
        },
      };

      const merged = mergeDashboardPII(scrubbed, supplement);

      expect(merged.widgets[0].config).toEqual({
        otherConfig: 'safe-value',
        firstNames: 'Alice\nBob',
        lastNames: 'Smith\nJones',
      });

      expect(merged.widgets[1].config).toEqual({
        text: 'Hello world',
      });

      expect(merged.widgets[2].config).toEqual({
        layout: 'grid',
        names: ['Charlie', 'Dave'],
      });
    });

    it('handles widgets that exist in dashboard but not in supplement', () => {
      const supplement: DashboardPiiSupplement = {
        'widget-1': {
          firstNames: 'Alice\nBob',
        },
      };

      const merged = mergeDashboardPII(mockDashboard, supplement);
      expect(merged.widgets[1].config).toEqual(mockDashboard.widgets[1].config);
    });
  });

  describe('empty PII defaults are not PII content', () => {
    const emptyDefaults = {
      id: 'empty-dash',
      name: 'Empty Dashboard',
      isShared: false,
      widgets: [
        {
          id: 'random-empty',
          type: 'random',
          position: { x: 0, y: 0 },
          config: { firstNames: '', lastNames: '', remainingStudents: [] },
        },
        {
          id: 'checklist-empty',
          type: 'checklist',
          position: { x: 0, y: 0 },
          config: { firstNames: '', lastNames: '', completedNames: [] },
        },
      ],
    } as unknown as Dashboard;

    it('dashboardHasPII is false for shipped empty-string/array defaults', () => {
      expect(dashboardHasPII(emptyDefaults)).toBe(false);
    });

    it('extractDashboardPII omits widgets whose PII fields are empty', () => {
      expect(extractDashboardPII(emptyDefaults)).toEqual({});
    });

    it('dashboardHasPII is true once a name is typed', () => {
      const withNames = {
        ...emptyDefaults,
        widgets: [
          {
            ...emptyDefaults.widgets[0],
            config: { firstNames: 'Alice', lastNames: '' },
          },
          emptyDefaults.widgets[1],
        ],
      };
      expect(dashboardHasPII(withNames)).toBe(true);
      expect(extractDashboardPII(withNames)).toEqual({
        'random-empty': { firstNames: 'Alice' },
      });
    });

    it('empty custom-mode assignments are not PII', () => {
      const emptyAssignments = {
        ...emptyDefaults,
        widgets: [
          {
            id: 'stations-1',
            type: 'stations',
            position: { x: 0, y: 0 },
            config: { rosterMode: 'custom', assignments: {}, customRoster: [] },
          },
        ],
      } as unknown as Dashboard;
      expect(dashboardHasPII(emptyAssignments)).toBe(false);
    });
  });
});

describe('lunch report notes', () => {
  const today = getCentralDayKey();
  const lunch = (lastSubmittedDate: string): Dashboard =>
    ({
      id: 'b1',
      name: 'Board',
      background: 'bg-slate-800',
      createdAt: 1,
      widgets: [
        {
          id: 'w1',
          type: 'lunchCount',
          x: 0,
          y: 0,
          w: 1,
          h: 1,
          z: 1,
          flipped: false,
          config: {
            lastSubmittedDate,
            lastSubmittedWidgetId: 'w1',
            lastSubmittedClasses: ['11:00|1st'],
            lastSubmittedDetails: {
              '11:00|1st': { notes: 'Sam: gluten free', extraPizza: 1 },
            },
            lastSubmittedPizza: { '11:00|1st': 1 },
          },
        },
      ],
    }) as unknown as Dashboard;

  it('scrubs the notes from what reaches Firestore and shares', () => {
    const scrubbed = scrubDashboardPII(lunch(today));
    const config = scrubbed.widgets[0].config as Record<string, unknown>;
    expect(config.lastSubmittedDetails).toBeUndefined();
    expect(config.lastSubmittedDate).toBe(today);
    expect(JSON.stringify(scrubbed)).not.toContain('gluten');
  });

  it("keeps today's notes in the Drive supplement so Review and Resend prefills", () => {
    expect(extractDashboardPII(lunch(today))).toEqual({
      w1: {
        lastSubmittedDetails: {
          '11:00|1st': { notes: 'Sam: gluten free', extraPizza: 1 },
        },
      },
    });
  });

  it('keeps the extra pizza count in the Firestore copy so it syncs', () => {
    const config = scrubDashboardPII(lunch(today)).widgets[0].config as Record<
      string,
      unknown
    >;
    expect(config.lastSubmittedPizza).toEqual({ '11:00|1st': 1 });
  });

  it("merges a Drive copy per class instead of replacing this device's", () => {
    const local = lunch(today);
    const merged = mergeDashboardPII(local, {
      w1: {
        lastSubmittedDetails: {
          '12:00|2nd': { notes: 'from the laptop', extraPizza: 0 },
        },
      },
    });
    const details = (merged.widgets[0].config as Record<string, unknown>)
      .lastSubmittedDetails as Record<string, { notes: string }>;
    expect(Object.keys(details).sort()).toEqual(['11:00|1st', '12:00|2nd']);
  });

  it('flags a send whose notes are only on another device, once per marker', () => {
    const board = lunch(today);
    const server = board.widgets[0];
    const scrubbed = scrubDashboardPII(board).widgets[0];
    expect(lunchNotesBehindKey(scrubbed, undefined)).toBe(
      `w1|${today}|11:00|1st`
    );
    expect(lunchNotesBehindKey(scrubbed, server)).toBeNull();
    expect(lunchNotesBehindKey(server, undefined)).toBeNull();
  });

  it("drops an earlier day's notes instead of carrying them", () => {
    expect(extractDashboardPII(lunch('2020-01-01'))).toEqual({});
  });

  it('never blocks a save without Drive', () => {
    expect(dashboardHasPII(lunch(today))).toBe(true);
    expect(dashboardHasPII(lunch(today), { includeScoreboard: false })).toBe(
      false
    );
  });

  const withConfig = (config: Record<string, unknown>): Dashboard => ({
    ...lunch(today),
    widgets: [{ ...lunch(today).widgets[0], config }],
  });
  const configOf = (board: Dashboard) =>
    board.widgets[0].config as Record<string, unknown> & {
      lastSubmittedDetails?: Record<string, { notes: string }>;
    };

  it("lets Drive's copy of a class win on restore, even over a fast clock's stamp", () => {
    const local = withConfig({
      ...lunch(today).widgets[0].config,
      lastSubmittedDetails: {
        '11:00|1st': {
          notes: 'old',
          extraPizza: 0,
          sentAt: 9_999_999_999_999,
        },
      },
    });
    const merged = mergeDashboardPII(local, {
      w1: {
        lastSubmittedDetails: {
          '11:00|1st': { notes: 'new', extraPizza: 0, sentAt: 5 },
        },
      },
    });
    expect(configOf(merged).lastSubmittedDetails?.['11:00|1st'].notes).toBe(
      'new'
    );
  });

  it('keeps blank sends out of Drive once the board syncs that they were blank', () => {
    const blank = submittedMarker({}, 'w1', today, '11:00|1st', {
      notes: '',
      extraPizza: 0,
    });
    const board = withConfig({ ...blank });
    expect(extractDashboardPII(board)).toEqual({});
    expect(dashboardHasPII(board)).toBe(false);
    const legacyBlank = withConfig({
      ...blank,
      lastSubmittedSends: undefined,
    });
    expect(Object.keys(extractDashboardPII(legacyBlank))).toEqual(['w1']);
  });

  it('flags a new send of the same class again', () => {
    const first = submittedMarker({}, 'w1', today, '11:00|1st', {
      notes: 'a',
      extraPizza: 0,
    });
    const widget = (config: Record<string, unknown>) =>
      scrubDashboardPII(withConfig(config)).widgets[0];
    const key1 = lunchNotesBehindKey(widget({ ...first }), undefined);
    const again = {
      ...first,
      lastSubmittedSends: {
        '11:00|1st': { sentAt: 123, notesBlank: false },
      },
    };
    const key2 = lunchNotesBehindKey(widget(again), undefined);
    expect(key1).not.toBeNull();
    expect(key2).not.toBeNull();
    expect(key2).not.toBe(key1);
  });

  it("keeps Drive's notes for a sent class this copy never loaded", () => {
    const fromLaptop = submittedMarker({}, 'w1', today, '11:00|1st', {
      notes: 'laptop notes',
      extraPizza: 0,
    });
    const both = submittedMarker(fromLaptop, 'w1', today, '12:00|2nd', {
      notes: 'board notes',
      extraPizza: 0,
    });
    // This device never loaded the laptop's notes.
    const local = withConfig({
      ...both,
      lastSubmittedDetails: {
        '12:00|2nd': both.lastSubmittedDetails?.['12:00|2nd'],
      },
    });
    expect(boardLacksLunchNotes(local)).toBe(true);
    const kept = keepDriveLunchNotes(local, {
      w1: { lastSubmittedDetails: fromLaptop.lastSubmittedDetails },
    });
    expect(boardLacksLunchNotes(kept)).toBe(false);
    const supplement = extractDashboardPII(kept).w1 as {
      lastSubmittedDetails: Record<string, { notes: string }>;
    };
    expect(supplement.lastSubmittedDetails['11:00|1st'].notes).toBe(
      'laptop notes'
    );
    expect(supplement.lastSubmittedDetails['12:00|2nd'].notes).toBe(
      'board notes'
    );
    expect(boardLacksLunchNotes(withConfig({ ...both }))).toBe(false);
  });
});
