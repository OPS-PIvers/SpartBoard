import { describe, it, expect, vi } from 'vitest';

vi.mock('firebase-functions/v2/https', () => ({
  HttpsError: class HttpsError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  },
}));

import { assertNotDistrictGroup } from './districtLibraryGuard';

describe('assertNotDistrictGroup', () => {
  it('refuses to add a participant to a District library canonical', () => {
    expect(() => assertNotDistrictGroup({ districtItemId: 'item-1' })).toThrow(
      /read-only/
    );
  });

  it('lets ordinary team groups through', () => {
    expect(() => assertNotDistrictGroup({ participants: {} })).not.toThrow();
    expect(() => assertNotDistrictGroup({ districtItemId: '' })).not.toThrow();
    expect(() => assertNotDistrictGroup(undefined)).not.toThrow();
  });
});
