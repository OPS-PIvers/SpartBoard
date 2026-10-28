import { describe, expect, it } from 'vitest';
import type { WidgetData } from '@/types';
import { PII_WIDGET_FIELDS, scrubWidgetsPII } from '@/utils/dashboardPII';
import * as server from '@/functions/src/mcp/boardShare';

const widget = (config: Record<string, unknown>): WidgetData =>
  ({
    id: 'w',
    type: 'random',
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
      widget({}),
    ];
    expect(
      server.scrubWidgetsPII(fixtures as unknown as Record<string, unknown>[])
    ).toEqual(scrubWidgetsPII(fixtures));
  });
});
