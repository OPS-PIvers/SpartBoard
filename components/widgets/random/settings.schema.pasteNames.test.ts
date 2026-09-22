import { describe, expect, it } from 'vitest';
import type { WidgetData } from '@/types';
import type {
  FieldCtx,
  TextareaField,
} from '@/components/settings/schema/types';
import schema from './settings.schema';

const firstNamesField = schema.groups
  .find((group) => group.id === 'content')
  ?.fields.find((field) => field.key === 'firstNames') as TextareaField<string>;

const ctx = (config: Record<string, unknown>): FieldCtx => ({
  config,
  widget: { id: 'w1', type: 'random' } as WidgetData,
  isAdmin: false,
  canAccessFeature: () => true,
  t: (key: string) => key,
});

describe('random first-names paste', () => {
  it('moves the last names into the last-names box', () => {
    expect(
      firstNamesField.pasteToPatch?.({
        pasted: 'Ada Lovelace\nGrace Hopper',
        value: '',
        selectionStart: 0,
        selectionEnd: 0,
        ctx: ctx({ firstNames: '', lastNames: '' }),
      })
    ).toEqual({ firstNames: 'Ada\nGrace', lastNames: 'Lovelace\nHopper' });
  });

  it('keeps the last names already in the box', () => {
    expect(
      firstNamesField.pasteToPatch?.({
        pasted: '\nGrace Hopper',
        value: 'Ada',
        selectionStart: 3,
        selectionEnd: 3,
        ctx: ctx({ firstNames: 'Ada', lastNames: 'Lovelace' }),
      })
    ).toEqual({ firstNames: 'Ada\nGrace', lastNames: 'Lovelace\nHopper' });
  });

  it('leaves a first-names-only paste alone', () => {
    expect(
      firstNamesField.pasteToPatch?.({
        pasted: 'Ada\nGrace',
        value: '',
        selectionStart: 0,
        selectionEnd: 0,
        ctx: ctx({ firstNames: '', lastNames: '' }),
      })
    ).toBeNull();
  });
});
