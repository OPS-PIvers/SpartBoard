import { describe, expect, it } from 'vitest';
import type { FieldCtx } from '@/components/settings/schema/types';
import schema from './settings.schema';

const ctx = (config: Record<string, unknown>): FieldCtx => ({
  config,
  widget: {
    id: 'checklist-test',
    type: 'checklist',
    x: 0,
    y: 0,
    w: 300,
    h: 300,
    z: 1,
    flipped: false,
    config,
  },
  isAdmin: true,
  canAccessFeature: () => true,
  t: (key) => key,
});

describe('Checklist settings schema', () => {
  it('exposes tasks as editable list rows instead of an opaque panel', () => {
    const items = schema.groups[0]?.fields.find(
      (field) => field.key === 'items'
    );
    expect(items?.type).toBe('list');
    if (items?.type !== 'list') throw new Error('items must be a list field');
    expect(items.row.fields.map((field) => field.key)).toEqual(['text']);
  });

  it('shows custom-name fields only for a custom roster', () => {
    const firstNames = schema.groups[0]?.fields.find(
      (field) => field.key === 'firstNames'
    );
    expect(firstNames?.visibleWhen?.(ctx({ mode: 'roster' }))).toBe(false);
    expect(
      firstNames?.visibleWhen?.(ctx({ mode: 'roster', rosterMode: 'custom' }))
    ).toBe(true);
  });
});
