import { describe, it, expect } from 'vitest';
import schema from './settings.schema';
import { validateSchema } from '@/components/settings/schema/validateSchema';

describe('agenda settings schema', () => {
  it('passes validateSchema with no errors', () => {
    const result = validateSchema('agenda', schema);
    expect(result.errors).toEqual([]);
  });
});
