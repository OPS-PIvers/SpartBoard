import { describe, it, expect } from 'vitest';
import * as Icons from 'lucide-react';
import { COMMON_INSTRUCTIONAL_ICONS } from './instructionalIcons';

describe('COMMON_INSTRUCTIONAL_ICONS', () => {
  it('every entry resolves to a real lucide-react icon export', () => {
    // Every consumer (IconPicker, Stations' IconOrImageInput, and
    // renderCatalystIcon's fallback path) looks the name up as
    // `Icons[name]` at runtime — TypeScript can't catch a typo'd or
    // no-longer-existing icon name here because the list is a plain
    // `string[]`, not typed against `keyof typeof Icons`. A bad name
    // doesn't crash: both pickers silently `return null` for it, so the
    // option just vanishes from the picker grid with no error — this is
    // the only place that catches it.
    const invalid = COMMON_INSTRUCTIONAL_ICONS.filter(
      (name) =>
        (Icons as unknown as Record<string, unknown>)[name] === undefined
    );
    expect(invalid).toEqual([]);
  });

  it('has no duplicate icon names', () => {
    const seen = new Set(COMMON_INSTRUCTIONAL_ICONS);
    expect(seen.size).toBe(COMMON_INSTRUCTIONAL_ICONS.length);
  });
});
