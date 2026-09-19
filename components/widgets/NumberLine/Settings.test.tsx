import { describe, expect, it } from 'vitest';
import type { FieldCtx } from '@/components/settings/schema/types';
import numberLineSchema from './settings.schema';

const field = (key: string) =>
  numberLineSchema.groups
    .flatMap((group) => group.fields)
    .find((candidate) => candidate.key === key);

const ctx = (config: Record<string, unknown>): FieldCtx => ({
  config,
  widget: {
    id: 'number-line-test',
    type: 'numberLine',
    x: 0,
    y: 0,
    w: 700,
    h: 200,
    z: 1,
    flipped: true,
    config,
  },
  isAdmin: false,
  canAccessFeature: () => true,
  t: (key) => key,
});

describe('Number Line settings schema', () => {
  it('keeps minimum and maximum values ordered and bounded', () => {
    const minField = field('min');
    const maxField = field('max');
    expect(minField?.toPatch?.(-2000, ctx({ max: 10 }))).toEqual({
      min: -1000,
    });
    expect(maxField?.toPatch?.(2000, ctx({ min: -10 }))).toEqual({ max: 1000 });
  });

  it('enforces the positive step and maximum tick constraints', () => {
    const stepField = field('step');
    expect(stepField?.toPatch?.(0, ctx({ min: -1000, max: 1000 }))).toEqual({
      step: 0.4,
    });
    expect(stepField?.toPatch?.(2, ctx({ min: -10, max: 10 }))).toEqual({
      step: 2,
    });
  });

  it('exposes marker and jump editing as standard list fields', () => {
    const markers = field('markers');
    const jumps = field('jumps');
    expect(markers?.type).toBe('list');
    expect(jumps?.type).toBe('list');
    if (markers?.type === 'list' && jumps?.type === 'list') {
      const marker = markers.row.createRow?.();
      const jump = jumps.row.createRow?.();
      expect(marker?.value).toBe(0);
      expect(typeof marker?.color).toBe('string');
      expect(jump?.startValue).toBe(0);
      expect(jump?.endValue).toBe(5);
    }
  });
});
