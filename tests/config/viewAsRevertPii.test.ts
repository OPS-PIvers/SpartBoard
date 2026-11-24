import { describe, expect, it } from 'vitest';
import type { WidgetData } from '@/types';
import { scrubWidgetsPII, widgetPiiKeys } from '@/utils/dashboardPII';
import { stripPii } from '@/functions/src/viewAsRevert';

const configs: [string, Record<string, unknown>][] = [
  [
    'random',
    { firstNames: 'Ada', lastNames: 'L', roster: ['Ada'], fontSize: 2 },
  ],
  ['random', { rosterMode: 'custom', assignments: { Ada: 'A' }, title: 'x' }],
  ['stations', { rosterMode: 'class', assignments: { Ada: 'A' }, title: 'x' }],
  ['stations', { rosterMode: 'class', assignments: { 'id-1': 'A' } }],
  ['seating-chart', { savedPlans: [{ id: 'p', assignments: { Ada: 'f' } }] }],
  ['scoreboard', { teams: [{ id: 'pin-01', name: 'Ada' }], history: [], t: 1 }],
  [
    'scoreboard',
    {
      teams: [{ id: 'team-a', name: 'Team A' }],
      history: [{ id: 'h', at: 1, changes: [{ teamId: 'uid-9' }] }],
    },
  ],
  ['poll', { hiddenResponses: ['q:1', 'q#abc'], title: 'x' }],
];

// revertViewAsChangeV1 restores widget configs through stripPii; it must drop what the app keeps out of Firestore.
describe('revertViewAsChangeV1 PII scrub parity', () => {
  it.each(configs)(
    'drops the same config keys as the app for %s',
    (type, config) => {
      const dropped = new Set(widgetPiiKeys(type, config));
      const expected = Object.fromEntries(
        Object.entries(config).filter(([k]) => !dropped.has(k))
      );
      expect(stripPii('config', config, type)).toEqual(expected);
    }
  );

  it('leaves no key the app scrubs from a Firestore widget', () => {
    for (const [type, config] of configs) {
      const [scrubbed] = scrubWidgetsPII([
        { id: 'w', type, config } as unknown as WidgetData,
      ]);
      const server = stripPii('config', config, type) as Record<
        string,
        unknown
      >;
      for (const key of Object.keys(config)) {
        if (!(key in (scrubbed.config as object)))
          expect(server).not.toHaveProperty(key);
      }
    }
  });
});
