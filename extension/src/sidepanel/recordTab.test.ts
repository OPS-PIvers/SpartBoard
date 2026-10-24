import { describe, expect, it } from 'vitest';
import { isDefiniteNonAdmin } from './recordTab';

const list = (admin: boolean) => ({ at: 0, tours: [], admin });

describe('isDefiniteNonAdmin', () => {
  it('hides Record when the list says not admin or the server says no access', () => {
    expect(isDefiniteNonAdmin({ ok: true, list: list(false) })).toBe(true);
    expect(isDefiniteNonAdmin({ ok: false, why: 'no-access' })).toBe(true);
  });

  it('keeps Record for admins, a pending list and any failed list', () => {
    expect(isDefiniteNonAdmin({ ok: true, list: list(true) })).toBe(false);
    expect(isDefiniteNonAdmin(null)).toBe(false);
    for (const why of ['signed-out', 'offline', 'not-set-up'] as const) {
      expect(isDefiniteNonAdmin({ ok: false, why } as never)).toBe(false);
    }
  });
});
