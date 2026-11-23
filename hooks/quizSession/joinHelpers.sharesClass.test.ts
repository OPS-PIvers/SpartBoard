import { describe, it, expect, vi } from 'vitest';

vi.mock('@/config/firebase', () => ({ db: {}, functions: {} }));

import { sharesClass } from './joinHelpers';

describe('sharesClass', () => {
  it('passes a run with no classes', () => {
    expect(sharesClass(undefined, ['a'])).toBe(true);
    expect(sharesClass([], ['a'])).toBe(true);
  });

  it('needs one class the claim names', () => {
    expect(sharesClass(['a', 'b'], ['b'])).toBe(true);
    expect(sharesClass(['a'], ['b'])).toBe(false);
    expect(sharesClass(['a'], undefined)).toBe(false);
  });
});
