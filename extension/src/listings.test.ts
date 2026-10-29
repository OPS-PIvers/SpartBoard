import { createECDH } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { LISTINGS } from './listings';

describe('listings', () => {
  it.each(Object.entries(LISTINGS))(
    '%s has no push key or an uncompressed P-256 public key (F5)',
    (_id, listing) => {
      const key = listing.vapidPublicKey;
      if (key === '') return;
      expect(key).toMatch(/^[A-Za-z0-9_-]+$/);
      const point = Buffer.from(key, 'base64url');
      expect(point).toHaveLength(65);
      expect(point[0]).toBe(4);
      const ecdh = createECDH('prime256v1');
      ecdh.generateKeys();
      // Throws unless the point is on the curve.
      expect(() => ecdh.computeSecret(point)).not.toThrow();
    }
  );

  it('gives each listing its own push key', () => {
    const keys = Object.values(LISTINGS)
      .map((l) => l.vapidPublicKey)
      .filter(Boolean);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
