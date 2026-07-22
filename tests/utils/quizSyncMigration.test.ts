import { describe, it, expect } from 'vitest';
import { migrateQuizMetadataShape } from '@/utils/quizSyncMigration';
import type { QuizMetadata } from '@/types';

/**
 * `migrateQuizMetadataShape` folds the two legacy flat fields
 * (`syncGroupId` + `lastSyncedVersion`) into the canonical
 * `sync: { groupId, lastSyncedVersion }` sub-object so every read site
 * sees one shape. The four documented branches are:
 *   1. well-formed `sync` → pass through unchanged
 *   2. malformed `sync` → strip linkage (treat as unsynced)
 *   3. both legacy fields populated → build `sync`, drop legacy fields
 *   4. otherwise → no `sync` linkage
 */

// The function accepts `unknown`; build minimal raw docs and cast at the
// call boundary the same way real read sites hand Firestore data in.
type RawDoc = Record<string, unknown>;
const migrate = (raw: RawDoc): QuizMetadata =>
  migrateQuizMetadataShape(raw as unknown);

describe('migrateQuizMetadataShape', () => {
  describe('branch 1 — already well-formed sync sub-object', () => {
    it('passes through a valid sync object unchanged', () => {
      const doc: RawDoc = {
        id: 'q1',
        title: 'Fractions',
        sync: { groupId: 'grp-1', lastSyncedVersion: 3 },
      };
      const result = migrate(doc);
      expect(result.sync).toEqual({ groupId: 'grp-1', lastSyncedVersion: 3 });
      expect(result).toMatchObject({ id: 'q1', title: 'Fractions' });
    });

    it('accepts lastSyncedVersion of 0 (numeric, not falsy-rejected)', () => {
      // 0 is a valid version; the guard checks `typeof === 'number'`, not
      // truthiness, so version 0 must survive.
      const result = migrate({
        id: 'q1',
        sync: { groupId: 'grp-1', lastSyncedVersion: 0 },
      });
      expect(result.sync).toEqual({ groupId: 'grp-1', lastSyncedVersion: 0 });
    });
  });

  describe('branch 2 — malformed sync sub-object is stripped', () => {
    it('drops linkage when groupId is an empty string', () => {
      const result = migrate({
        id: 'q1',
        sync: { groupId: '', lastSyncedVersion: 2 },
      });
      expect(result.sync).toBeUndefined();
      expect(result).toMatchObject({ id: 'q1' });
    });

    it('drops linkage when lastSyncedVersion is non-numeric', () => {
      const result = migrate({
        id: 'q1',
        sync: { groupId: 'grp-1', lastSyncedVersion: 'oops' },
      });
      expect(result.sync).toBeUndefined();
    });

    it('drops linkage when groupId is missing', () => {
      const result = migrate({
        id: 'q1',
        sync: { lastSyncedVersion: 4 },
      });
      expect(result.sync).toBeUndefined();
    });
  });

  describe('branch 3 — legacy flat fields folded into sync', () => {
    it('builds sync from syncGroupId + lastSyncedVersion and strips the legacy fields', () => {
      const result = migrate({
        id: 'q1',
        title: 'Legacy',
        syncGroupId: 'grp-legacy',
        lastSyncedVersion: 7,
      });
      expect(result.sync).toEqual({
        groupId: 'grp-legacy',
        lastSyncedVersion: 7,
      });
      // Legacy fields must not leak through onto the canonical shape.
      expect(result).not.toHaveProperty('syncGroupId');
      expect(result).not.toHaveProperty('lastSyncedVersion');
    });

    it('folds legacy fields with a version of 0', () => {
      const result = migrate({
        id: 'q1',
        syncGroupId: 'grp-legacy',
        lastSyncedVersion: 0,
      });
      expect(result.sync).toEqual({
        groupId: 'grp-legacy',
        lastSyncedVersion: 0,
      });
    });

    it('a well-formed sync sub-object wins over legacy fields', () => {
      // When both the canonical object and the legacy fields are present,
      // the sub-object branch returns first — legacy fields are dropped.
      const result = migrate({
        id: 'q1',
        sync: { groupId: 'grp-new', lastSyncedVersion: 9 },
        syncGroupId: 'grp-old',
        lastSyncedVersion: 1,
      });
      expect(result.sync).toEqual({ groupId: 'grp-new', lastSyncedVersion: 9 });
      expect(result).not.toHaveProperty('syncGroupId');
      expect(result).not.toHaveProperty('lastSyncedVersion');
    });
  });

  describe('branch 4 — no linkage', () => {
    it('returns the doc without sync when no linkage fields exist', () => {
      const result = migrate({ id: 'q1', title: 'Plain' });
      expect(result.sync).toBeUndefined();
      expect(result).toMatchObject({ id: 'q1', title: 'Plain' });
    });

    it('does not build sync from an empty legacy groupId', () => {
      const result = migrate({
        id: 'q1',
        syncGroupId: '',
        lastSyncedVersion: 5,
      });
      expect(result.sync).toBeUndefined();
    });

    it('does not build sync when lastSyncedVersion is missing', () => {
      const result = migrate({ id: 'q1', syncGroupId: 'grp-1' });
      expect(result.sync).toBeUndefined();
    });

    it('tolerates null / undefined input without throwing', () => {
      expect(() => migrateQuizMetadataShape(null)).not.toThrow();
      expect(() => migrateQuizMetadataShape(undefined)).not.toThrow();
      expect(migrateQuizMetadataShape(null).sync).toBeUndefined();
    });
  });
});
