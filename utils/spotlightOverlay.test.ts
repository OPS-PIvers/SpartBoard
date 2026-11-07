import { describe, expect, it } from 'vitest';
import type { WidgetData } from '@/types';
import { isSpotlightLive } from './spotlightOverlay';

const w = (id: string, minimized = false) =>
  ({ id, minimized }) as unknown as WidgetData;

describe('isSpotlightLive', () => {
  it('is false with no spotlight id', () => {
    expect(isSpotlightLive({}, [w('a')])).toBe(false);
    expect(isSpotlightLive(undefined, [w('a')])).toBe(false);
  });
  it('is true for a present, visible widget', () => {
    expect(isSpotlightLive({ spotlightWidgetId: 'a' }, [w('a')])).toBe(true);
  });
  it('is false when the widget was deleted', () => {
    expect(isSpotlightLive({ spotlightWidgetId: 'gone' }, [w('a')])).toBe(
      false
    );
  });
  it('is false when the widget is minimized', () => {
    expect(isSpotlightLive({ spotlightWidgetId: 'a' }, [w('a', true)])).toBe(
      false
    );
  });
});
