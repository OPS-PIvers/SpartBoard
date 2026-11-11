import { describe, it, expect } from 'vitest';
import { validateSlug } from '@/utils/shortLinkValidation';
import { helpShortLinkCode } from './helpCenterState';

describe('helpShortLinkCode canonical form', () => {
  it.each([
    'sharing-your-boards-with-students',
    'my_guide_',
    'trailing-',
    '_abc',
    '-abc',
    'a'.repeat(26) + '_b',
  ])('is already the slug createShortLink would store for %s', (id) => {
    const code = helpShortLinkCode(id);
    const result = validateSlug(code);
    expect(result.ok && result.slug).toBe(code);
  });
});
