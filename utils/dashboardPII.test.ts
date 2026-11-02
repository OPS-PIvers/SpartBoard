import { describe, it, expect } from 'vitest';
import {
  scrubDashboardPII,
  extractDashboardPII,
  mergeDashboardPII,
  dashboardHasPII,
} from './dashboardPII';
import { Dashboard } from '@/types';

describe('dashboardPII', () => {
  const mockDashboardNoPii: Dashboard = {
    id: 'dashboard-1',
    name: 'Test Dashboard',
    createdAt: 1234567890,
    background: 'bg',
    widgets: [
      {
        id: 'widget-1',
        type: 'clock',
        x: 0,
        y: 0,
        w: 2,
        h: 2,
        z: 1,
        flipped: false,
        config: {
          style: 'analog',
        },
      },
    ],
  };

  const mockDashboardWithPii: Dashboard = {
    id: 'dashboard-2',
    name: 'Test Dashboard PII',
    createdAt: 1234567890,
    background: 'bg',
    widgets: [
      {
        id: 'widget-1',
        type: 'random',
        x: 0,
        y: 0,
        w: 2,
        h: 2,
        z: 1,
        flipped: false,
        config: {
          mode: 'wheel',
          firstNames: 'Alice\nBob',
          lastNames: 'Smith\nJones',
          remainingStudents: ['Alice', 'Bob'],
        },
      },
      {
        id: 'widget-2',
        type: 'seating-chart',
        x: 1,
        y: 1,
        w: 2,
        h: 2,
        z: 1,
        flipped: false,
        config: {
          layout: 'grid',
          names: ['Alice Smith', 'Bob Jones'],
        },
      },
      {
        id: 'widget-3',
        type: 'clock',
        x: 2,
        y: 2,
        w: 2,
        h: 2,
        z: 1,
        flipped: false,
        config: {
          style: 'digital',
        },
      },
      {
        id: 'widget-4',
        type: 'random',
        x: 3,
        y: 3,
        w: 2,
        h: 2,
        z: 1,
        flipped: false,
        config: {
          mode: 'shuffle',
          // Jigsaw/manual-edit name lists — same "raw student name" shape as
          // firstNames/lastNames/remainingStudents above, just added later.
          lockedNames: ['Alice Smith'],
          unassignedNames: ['Bob Jones'],
          doneNames: ['Carol Lee'],
          // Jigsaw mode groups — RandomGroup[] whose `names` arrays are raw
          // student names, same PII shape as the flat lists above.
          jigsawHomeGroups: [{ id: 'g1', names: ['Alice Smith'] }],
          jigsawExpertGroups: [{ id: 'g2', names: ['Bob Jones'] }],
        },
      },
      {
        id: 'widget-5',
        type: 'stations',
        x: 4,
        y: 4,
        w: 2,
        h: 2,
        z: 1,
        flipped: false,
        config: {
          stations: [],
          // Custom-list mode: keys are the raw student names typed into the
          // roster, not roster ids — see Stations/Widget.tsx "custom-list
          // mode: id IS the name".
          assignments: { 'Dana White': 'station-1' },
          rosterMode: 'custom',
          customRoster: ['Dana White'],
        },
      },
      {
        id: 'widget-6',
        type: 'lunchCount',
        x: 5,
        y: 5,
        w: 2,
        h: 2,
        z: 1,
        flipped: false,
        config: {
          roster: ['Eve Adams'],
          assignments: { 'Eve Adams': 'hot' },
          rosterMode: 'custom',
        },
      },
      {
        id: 'widget-7',
        type: 'stations',
        x: 6,
        y: 6,
        w: 2,
        h: 2,
        z: 1,
        flipped: false,
        config: {
          stations: [],
          // Class-roster mode: keys are opaque roster student ids, not PII —
          // this field must NOT be scrubbed/extracted.
          assignments: { 'roster-student-id-123': 'station-1' },
          rosterMode: 'class',
        },
      },
    ],
  };

  describe('scrubDashboardPII', () => {
    it('returns an identical dashboard if there are no PII fields', () => {
      const scrubbed = scrubDashboardPII(mockDashboardNoPii);
      expect(scrubbed).toEqual(mockDashboardNoPii);
      expect(scrubbed).not.toBe(mockDashboardNoPii); // Ensure deep copy
    });

    it('removes PII fields from widget configs', () => {
      const scrubbed = scrubDashboardPII(mockDashboardWithPii);

      expect(scrubbed.widgets[0].config).toEqual({ mode: 'wheel' });
      expect(scrubbed.widgets[1].config).toEqual({ layout: 'grid' });
      expect(scrubbed.widgets[2].config).toEqual({ style: 'digital' });
    });

    it('removes Random jigsaw/manual-edit name lists and jigsaw group name arrays', () => {
      const scrubbed = scrubDashboardPII(mockDashboardWithPii);
      expect(scrubbed.widgets[3].config).toEqual({ mode: 'shuffle' });
    });

    it('removes Stations custom roster names AND the name-keyed assignments map', () => {
      const scrubbed = scrubDashboardPII(mockDashboardWithPii);
      expect(scrubbed.widgets[4].config).toEqual({
        stations: [],
        rosterMode: 'custom',
      });
    });

    it('removes LunchCount custom roster names AND the name-keyed assignments map', () => {
      const scrubbed = scrubDashboardPII(mockDashboardWithPii);
      expect(scrubbed.widgets[5].config).toEqual({
        rosterMode: 'custom',
      });
    });

    it('keeps class-roster-mode assignments (keyed by roster id, not PII)', () => {
      const scrubbed = scrubDashboardPII(mockDashboardWithPii);
      expect(scrubbed.widgets[6].config).toEqual({
        stations: [],
        assignments: { 'roster-student-id-123': 'station-1' },
        rosterMode: 'class',
      });
    });

    it('does not mutate the original dashboard', () => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const originalCopy: Dashboard = JSON.parse(
        JSON.stringify(mockDashboardWithPii)
      );
      scrubDashboardPII(mockDashboardWithPii);
      expect(mockDashboardWithPii).toEqual(originalCopy);
    });
  });

  describe('extractDashboardPII', () => {
    it('returns an empty object if there are no PII fields', () => {
      const supplement = extractDashboardPII(mockDashboardNoPii);
      expect(supplement).toEqual({});
    });

    it('extracts only PII fields and maps them by widget ID', () => {
      const supplement = extractDashboardPII(mockDashboardWithPii);

      expect(supplement).toEqual({
        'widget-1': {
          firstNames: 'Alice\nBob',
          lastNames: 'Smith\nJones',
          remainingStudents: ['Alice', 'Bob'],
        },
        'widget-2': {
          names: ['Alice Smith', 'Bob Jones'],
        },
        'widget-4': {
          lockedNames: ['Alice Smith'],
          unassignedNames: ['Bob Jones'],
          doneNames: ['Carol Lee'],
          jigsawHomeGroups: [{ id: 'g1', names: ['Alice Smith'] }],
          jigsawExpertGroups: [{ id: 'g2', names: ['Bob Jones'] }],
        },
        'widget-5': {
          customRoster: ['Dana White'],
          assignments: { 'Dana White': 'station-1' },
        },
        'widget-6': {
          roster: ['Eve Adams'],
          assignments: { 'Eve Adams': 'hot' },
        },
      });
      // widget-3 has no PII, so it should be omitted
      expect(supplement['widget-3']).toBeUndefined();
      // widget-7 is class-roster mode — its assignments are non-PII ids, so
      // it must never appear in the Drive-only supplement.
      expect(supplement['widget-7']).toBeUndefined();
    });
  });

  describe('mergeDashboardPII', () => {
    it('returns an identical dashboard if the supplement is empty', () => {
      const merged = mergeDashboardPII(mockDashboardNoPii, {});
      expect(merged).toEqual(mockDashboardNoPii);
      expect(merged).not.toBe(mockDashboardNoPii); // Ensure deep copy
    });

    it('merges PII fields back into widget configs', () => {
      const scrubbed = scrubDashboardPII(mockDashboardWithPii);
      const supplement = extractDashboardPII(mockDashboardWithPii);

      const merged = mergeDashboardPII(scrubbed, supplement);

      expect(merged).toEqual(mockDashboardWithPii);
    });

    it('retains non-PII fields during merge', () => {
      const scrubbed = scrubDashboardPII(mockDashboardWithPii);
      const supplement = extractDashboardPII(mockDashboardWithPii);

      const merged = mergeDashboardPII(scrubbed, supplement);

      expect(merged.widgets[0].config).toHaveProperty('mode', 'wheel');
      expect(merged.widgets[1].config).toHaveProperty('layout', 'grid');
      expect(merged.widgets[2].config).toHaveProperty('style', 'digital');
    });
  });

  describe('dashboardHasPII', () => {
    it('returns false if there are no PII fields', () => {
      expect(dashboardHasPII(mockDashboardNoPii)).toBe(false);
    });

    it('returns true if there are PII fields', () => {
      expect(dashboardHasPII(mockDashboardWithPii)).toBe(true);
    });
  });

  describe('quiz Scoreboard teams, name-keyed assignments and legacy poll keys', () => {
    const w = (
      id: string,
      type: string,
      config: Record<string, unknown>
    ): Dashboard['widgets'][number] =>
      ({
        id,
        type,
        x: 0,
        y: 0,
        w: 1,
        h: 1,
        z: 1,
        flipped: false,
        config,
      }) as unknown as Dashboard['widgets'][number];
    const uuid = '3f2b8c1e-9a4d-4e7b-8c2a-1d5e6f7a8b9c';
    const board = (widgets: Dashboard['widgets']): Dashboard => ({
      ...mockDashboardNoPii,
      widgets,
    });

    it('moves quiz-built Scoreboard teams and their history to Drive', () => {
      const teams = [
        { id: 'pin-0042', name: 'Ada Lovelace', score: 9 },
        { id: 'uid-abc', name: 'Bo Diddley', score: 7 },
      ];
      const history = [
        { id: 'h1', at: 1, changes: [{ teamId: 'pin-0042', from: 8, to: 9 }] },
      ];
      const d = board([
        w('sb', 'scoreboard', { teams, history, liveQuizWidgetId: 'q' }),
      ]);
      const scrubbed = scrubDashboardPII(d).widgets[0].config;
      expect(scrubbed).toEqual({ teams: [], liveQuizWidgetId: 'q' });
      expect(JSON.stringify(scrubbed)).not.toMatch(/Ada|pin-|uid-/);
      expect(extractDashboardPII(d)).toEqual({ sb: { teams, history } });
      expect(dashboardHasPII(d)).toBe(true);
      expect(
        mergeDashboardPII(scrubDashboardPII(d), extractDashboardPII(d))
      ).toEqual(d);
    });

    it('keeps hand-made Scoreboard teams in Firestore', () => {
      const teams = [{ id: uuid, name: 'Team A', score: 2 }];
      const d = board([w('sb', 'scoreboard', { teams })]);
      expect(scrubDashboardPII(d).widgets[0].config).toEqual({ teams });
      expect(dashboardHasPII(d)).toBe(false);
    });

    it.each(['stations', 'lunchCount', 'seating-chart'])(
      'moves %s class-mode assignments with a name key to Drive',
      (type) => {
        const assignments = { [uuid]: 'a', 'Emma Smith': 'b' };
        const d = board([w('x', type, { rosterMode: 'class', assignments })]);
        expect(scrubDashboardPII(d).widgets[0].config).toEqual({
          rosterMode: 'class',
        });
        expect(extractDashboardPII(d)).toEqual({ x: { assignments } });
      }
    );

    it('keeps class-mode assignments keyed only by roster ids', () => {
      const assignments = { [uuid]: 'a', 'roster-student-id-123': 'b' };
      const d = board([
        w('x', 'stations', { rosterMode: 'class', assignments }),
      ]);
      expect(scrubDashboardPII(d).widgets[0].config).toEqual({
        rosterMode: 'class',
        assignments,
      });
      expect(dashboardHasPII(d)).toBe(false);
    });

    it('moves Seating Chart saved plans keyed by names to Drive', () => {
      const savedPlans = [
        { id: 'p', name: 'Plan', assignments: { Ada: 'f1' } },
      ];
      const d = board([
        w('sc', 'seating-chart', { rosterMode: 'class', savedPlans }),
      ]);
      expect(scrubDashboardPII(d).widgets[0].config).toEqual({
        rosterMode: 'class',
      });
      expect(extractDashboardPII(d)).toEqual({ sc: { savedPlans } });
    });

    it('drops legacy hashed hidden poll words but keeps answer hides', () => {
      const d = board([
        w('p', 'poll', {
          hiddenResponses: ['q1:0_u1', 'q1#1x2y3z', 'q2#rude'],
        }),
      ]);
      expect(scrubDashboardPII(d).widgets[0].config).toEqual({
        hiddenResponses: ['q1:0_u1'],
      });
    });
  });
});
