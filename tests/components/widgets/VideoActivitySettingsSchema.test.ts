import { describe, it, expect } from 'vitest';
import schema from '@/components/widgets/VideoActivityWidget/settings.schema';
import {
  isFieldVisible,
  type FieldCtx,
} from '@/components/settings/schema/types';
import type { WidgetData } from '@/types';

const ctx = (flagOn: boolean): FieldCtx => ({
  config: {},
  widget: { id: 'w', type: 'videoActivity' } as unknown as WidgetData,
  isAdmin: false,
  canAccessFeature: (id) => flagOn && id === 'va-quiz-alignment',
  t: (key) => key,
});

const visibleKeys = (flagOn: boolean) =>
  schema.groups
    .flatMap((g) => g.fields)
    .filter((f) => isFieldVisible(f, ctx(flagOn)))
    .map((f) => f.key);

describe('Video Activity drawer rules', () => {
  it('keeps the player rules in the drawer with the flag off', () => {
    expect(visibleKeys(false)).toEqual([
      'autoPlay',
      'requireCorrectAnswer',
      'allowSkipping',
    ]);
  });

  it('moves them to the assignment with va-quiz-alignment on', () => {
    expect(visibleKeys(true)).toEqual([]);
  });
});
