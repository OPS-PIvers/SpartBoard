import { describe, it, expect } from 'vitest';
import {
  decidePlcSyncPull,
  isPlcSyncPullConflict,
  type PlcLocalReplicaSyncState,
} from './plcSyncPull';

describe('decidePlcSyncPull', () => {
  it('returns "auto-pull" when canonical is ahead and there are no local edits', () => {
    expect(decidePlcSyncPull({ lastSyncedVersion: 1, dirty: false }, 2)).toBe(
      'auto-pull'
    );
  });

  it('treats an absent dirty flag as clean → "auto-pull" when canonical is ahead', () => {
    const clean: PlcLocalReplicaSyncState = { lastSyncedVersion: 3 };
    expect(decidePlcSyncPull(clean, 5)).toBe('auto-pull');
  });

  it('returns "conflict" when canonical is ahead AND there are local edits', () => {
    expect(decidePlcSyncPull({ lastSyncedVersion: 1, dirty: true }, 2)).toBe(
      'conflict'
    );
  });

  it('returns "up-to-date" when canonical is not ahead (equal version)', () => {
    expect(decidePlcSyncPull({ lastSyncedVersion: 4, dirty: false }, 4)).toBe(
      'up-to-date'
    );
  });

  it('returns "up-to-date" when the local replica is somehow ahead of canonical', () => {
    // e.g. a just-published edit whose canonical snapshot hasn't landed yet.
    expect(decidePlcSyncPull({ lastSyncedVersion: 6, dirty: false }, 5)).toBe(
      'up-to-date'
    );
  });

  it('does NOT report a conflict when canonical is not ahead, even if dirty', () => {
    // Dirty local edits with no canonical drift are not a sync conflict —
    // they are simply unpublished. Nothing to pull, so no prompt.
    expect(decidePlcSyncPull({ lastSyncedVersion: 4, dirty: true }, 4)).toBe(
      'up-to-date'
    );
  });

  it('handles a large version gap as an auto-pull when clean', () => {
    expect(decidePlcSyncPull({ lastSyncedVersion: 1, dirty: false }, 99)).toBe(
      'auto-pull'
    );
  });
});

describe('isPlcSyncPullConflict', () => {
  it('is true only in the conflict case', () => {
    expect(
      isPlcSyncPullConflict({ lastSyncedVersion: 1, dirty: true }, 2)
    ).toBe(true);
  });

  it('is false for auto-pull', () => {
    expect(
      isPlcSyncPullConflict({ lastSyncedVersion: 1, dirty: false }, 2)
    ).toBe(false);
  });

  it('is false for up-to-date', () => {
    expect(
      isPlcSyncPullConflict({ lastSyncedVersion: 2, dirty: true }, 2)
    ).toBe(false);
  });
});
