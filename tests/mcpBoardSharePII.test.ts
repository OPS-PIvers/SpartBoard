import { describe, expect, it } from 'vitest';
import type { WidgetData } from '@/types';
import { PII_WIDGET_FIELDS, scrubWidgetsPII } from '@/utils/dashboardPII';
import * as server from '@/functions/src/mcp/boardShare';

const widget = (config: Record<string, unknown>, type = 'random'): WidgetData =>
  ({
    id: 'w',
    type,
    x: 0,
    y: 0,
    w: 1,
    h: 1,
    z: 1,
    config,
  }) as unknown as WidgetData;

describe('connector shared-board scrub', () => {
  it('drops the same student fields as the app', () => {
    expect([...server.PII_WIDGET_FIELDS]).toEqual([...PII_WIDGET_FIELDS]);
  });

  it('scrubs widgets exactly as scrubWidgetsPII does', () => {
    const everyField = Object.fromEntries(
      PII_WIDGET_FIELDS.map((key) => [key, `${key} value`])
    );
    const fixtures = [
      widget({ ...everyField, mode: 'single', fontSize: 18 }),
      widget({ rosterMode: 'custom', assignments: { Ada: 'A' }, names: [] }),
      widget({ rosterMode: 'class', assignments: { s1: 'A' } }),
      widget({ rosterMode: 'class', assignments: { Ada: 'A' } }, 'stations'),
      widget(
        {
          rosterMode: 'class',
          assignments: { '3f2b8c1e-9a4d-4e7b-8c2a-1d5e6f7a8b9c': 'A' },
        },
        'lunchCount'
      ),
      widget(
        { savedPlans: [{ id: 'p', assignments: { Ada: 'f' } }] },
        'seating-chart'
      ),
      widget(
        { teams: [{ id: 'pin-01', name: 'Ada', score: 1 }], history: [] },
        'scoreboard'
      ),
      widget(
        { teams: [{ id: 'team-a', name: 'Team A', score: 1 }] },
        'scoreboard'
      ),
      widget(
        {
          teams: [{ id: 'team-a', name: 'Team A', score: 1 }],
          history: [{ id: 'h', at: 1, changes: [{ teamId: 'pin-01' }] }],
        },
        'scoreboard'
      ),
      widget({ hiddenResponses: ['q:1', 'q#abc'] }, 'poll'),
      widget({}),
    ];
    const scrubbed = server.scrubWidgetsPII(
      fixtures as unknown as Record<string, unknown>[]
    );
    expect(scrubbed).toEqual(scrubWidgetsPII(fixtures));
    expect(JSON.stringify(scrubbed)).not.toMatch(/Ada|pin-|#abc/);
  });
});
