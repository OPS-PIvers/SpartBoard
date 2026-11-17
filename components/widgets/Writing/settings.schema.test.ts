import { describe, it, expect } from 'vitest';
import schema from './settings.schema';
import { validateSchema } from '@/components/settings/schema/validateSchema';

describe('writing settings schema', () => {
  it('passes validateSchema with no errors', () => {
    const result = validateSchema('writing', schema);
    expect(result.errors).toEqual([]);
  });
});
