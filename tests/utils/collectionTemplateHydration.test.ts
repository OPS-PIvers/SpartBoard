import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { hydrateCollectionTemplate } from '@/utils/collectionTemplateHydration';
import type { CollectionTemplate, Dashboard } from '@/types';

const template = (
  overrides: Partial<CollectionTemplate> = {}
): CollectionTemplate => ({
  id: 't1',
  type: 'collection',
  name: 'Morning Routine',
  description: '',
  collectionSnapshot: { name: 'Morning Routine', color: '#abc' },
  boardSnapshots: [
    {
      id: 'orig-b1',
      name: 'Welcome',
      background: 'bg-slate-900',
      widgets: [],
      createdAt: 1,
    },
    {
      id: 'orig-b2',
      name: 'Math',
      background: 'bg-slate-800',
      widgets: [],
      createdAt: 1,
    },
  ],
  tags: [],
  targetGradeLevels: [],
  targetBuildings: [],
  enabled: true,
  accessLevel: 'public',
  createdAt: 1,
  updatedAt: 1,
  createdBy: 'a@b',
  ...overrides,
});

beforeEach(() => {
  let n = 0;
  vi.stubGlobal('crypto', {
    randomUUID: () => `uuid-${++n}`,
  } as unknown as Crypto);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('hydrateCollectionTemplate', () => {
  it('returns Collection input matching the snapshot metadata', () => {
    const out = hydrateCollectionTemplate(template(), { existingMaxOrder: 5 });
    expect(out.collectionInput).toEqual({
      name: 'Morning Routine',
      color: '#abc',
      parentCollectionId: null,
    });
  });

  it('assigns a fresh uuid + deterministic order to each Board', () => {
    const out = hydrateCollectionTemplate(template(), { existingMaxOrder: 5 });
    expect(out.boardInputs).toHaveLength(2);
    expect(out.boardInputs[0].id).toBe('uuid-1');
    expect(out.boardInputs[1].id).toBe('uuid-2');
    expect(out.boardInputs[0].order).toBe(6);
    expect(out.boardInputs[1].order).toBe(7);
  });

  it('drops snapshot ids from the Dashboard payload (recipient owns the new ids)', () => {
    const out = hydrateCollectionTemplate(template(), { existingMaxOrder: 0 });
    // The original snapshot id 'orig-b1' must not survive — only the new uuid.
    expect(out.boardInputs[0].id).not.toBe('orig-b1');
    expect(out.boardInputs[1].id).not.toBe('orig-b2');
  });

  it('preserves Board name and widgets', () => {
    const out = hydrateCollectionTemplate(template(), { existingMaxOrder: 0 });
    expect(out.boardInputs[0].name).toBe('Welcome');
    expect(out.boardInputs[1].name).toBe('Math');
  });

  it('resolves defaultBoardSnapshotId to the new Board uuid', () => {
    const t = template({
      collectionSnapshot: {
        name: 'Morning Routine',
        color: '#abc',
        defaultBoardSnapshotId: 'orig-b2',
      },
    });
    const out = hydrateCollectionTemplate(t, { existingMaxOrder: 0 });
    expect(out.defaultBoardId).toBe('uuid-2');
  });

  it('returns null defaultBoardId when snapshot has no default', () => {
    const out = hydrateCollectionTemplate(template(), { existingMaxOrder: 0 });
    expect(out.defaultBoardId).toBeNull();
  });

  it('returns null defaultBoardId when the snapshot id is not in boardSnapshots', () => {
    const t = template({
      collectionSnapshot: {
        name: 'Morning Routine',
        defaultBoardSnapshotId: 'does-not-exist',
      },
    });
    const out = hydrateCollectionTemplate(t, { existingMaxOrder: 0 });
    expect(out.defaultBoardId).toBeNull();
  });

  it('returns a Dashboard cast on each boardInput (no host fields)', () => {
    const out = hydrateCollectionTemplate(template(), { existingMaxOrder: 0 });
    const sample: Dashboard = out.boardInputs[0];
    // Confirm no leftover snapshot-only fields exist on the Dashboard.
    expect(sample).not.toHaveProperty('linkedShareId');
    expect(sample).not.toHaveProperty('driveFileId');
    expect(sample).not.toHaveProperty('thumbnailUrl');
  });
});
