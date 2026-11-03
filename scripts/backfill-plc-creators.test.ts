import { describe, expect, it } from 'vitest';
import { creatorRecord, legacyCreatorUid } from './backfill-plc-creators.mjs';

const ts = (ms: number) => ({ toMillis: () => ms });

describe('legacyCreatorUid', () => {
  it('picks the member who joined with the root createdAt', () => {
    expect(
      legacyCreatorUid({
        createdAt: ts(10),
        members: { a: { joinedAt: ts(5) }, b: { joinedAt: ts(10) } },
      })
    ).toBe('b');
  });

  it('falls back to the earliest joiner, then memberUids[0]', () => {
    expect(
      legacyCreatorUid({
        createdAt: 1,
        members: { a: { joinedAt: 30 }, b: { joinedAt: 20 } },
      })
    ).toBe('b');
    expect(legacyCreatorUid({ memberUids: ['x', 'y'] })).toBe('x');
    expect(legacyCreatorUid({})).toBe('');
  });

  it('prefers the lead when no joinedAt matches createdAt', () => {
    expect(
      legacyCreatorUid({
        createdAt: 1,
        leadUid: 'c',
        members: {
          a: { joinedAt: 30 },
          b: { joinedAt: 30 },
          c: { joinedAt: 30 },
        },
      })
    ).toBe('c');
  });
});

describe('creatorRecord', () => {
  it('binds the guess to the root create time', () => {
    expect(creatorRecord({ memberUids: ['x'] }, 123)).toEqual({
      creatorUid: 'x',
      rootCreateMs: 123,
      source: 'backfill',
    });
  });
});
