import { describe, it, expect } from 'vitest';
import type { WidgetData, WidgetType } from '@/types';
import { strandedMinimizedTypes } from './strandedMinimized';

const w = (id: string, type: WidgetType) =>
  ({ id, type, minimized: true }) as unknown as WidgetData;

describe('strandedMinimizedTypes', () => {
  const byType = {
    'time-tool': [w('t1', 'time-tool')],
    music: [w('m1', 'music')],
    'custom-widget': [w('c1', 'custom-widget')],
  } as unknown as Record<WidgetType, WidgetData[]>;

  it('returns minimized types with no dock button, in board order', () => {
    expect(
      strandedMinimizedTypes(byType, new Set(['time-tool']), () => true)
    ).toEqual(['music']);
  });

  it('skips custom widgets, which have their own restore buttons', () => {
    expect(strandedMinimizedTypes(byType, new Set(), () => true)).toEqual([
      'time-tool',
      'music',
    ]);
  });

  it('skips types the teacher cannot access', () => {
    expect(
      strandedMinimizedTypes(byType, new Set(), (type) => type !== 'music')
    ).toEqual(['time-tool']);
  });

  it('skips unknown types and empty lists', () => {
    const odd = {
      'not-a-widget': [w('x', 'not-a-widget' as WidgetType)],
      music: [],
    } as unknown as Record<WidgetType, WidgetData[]>;
    expect(strandedMinimizedTypes(odd, new Set(), () => true)).toEqual([]);
  });
});
