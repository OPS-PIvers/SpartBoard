import { describe, it, expect } from 'vitest';
import schema from './settings.schema';
import { validateSchema } from '@/components/settings/schema/validateSchema';

describe('arts-letters-agenda settings schema', () => {
  it('passes validateSchema with no errors', () => {
    const result = validateSchema('arts-letters-agenda', schema);
    expect(result.errors).toEqual([]);
  });
});
