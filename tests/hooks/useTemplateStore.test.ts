/**
 * Tests for the `mockTemplateStore` singleton in `hooks/useTemplateStore.ts`.
 *
 * This is the in-memory / sessionStorage-backed mock for
 * `/dashboard_templates/` used in auth-bypass / E2E mode. It is NOT a React
 * hook (despite living in `hooks/`) — it is a module-level singleton with a
 * synchronous `save` / `remove` / `getAll` surface.
 *
 * Because the store is a module singleton with a one-shot `hydrate()` guard,
 * each test re-imports the module via `vi.resetModules()` + dynamic `import()`
 * so it gets a fresh instance with `hydrated === false` and an empty Map. This
 * mirrors how the real E2E flow boots a clean store per page load.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  AnyTemplate,
  CollectionTemplate,
  DashboardTemplate,
} from '@/types';

const STORAGE_KEY = 'mock_dashboard_templates';

/**
 * Returns a fresh `mockTemplateStore` singleton. `vi.resetModules()` discards
 * the cached module so re-importing constructs a brand-new instance that has
 * not yet hydrated — required to exercise the first-call hydration path.
 */
async function loadStore() {
  vi.resetModules();
  const mod = await import('@/hooks/useTemplateStore');
  return mod.mockTemplateStore;
}

/** Minimal valid Board (DashboardTemplate) fixture. */
function boardTemplate(
  overrides: Partial<DashboardTemplate> = {}
): DashboardTemplate {
  return {
    id: 'board-1',
    name: 'Morning Meeting',
    description: 'A calm start to the day',
    type: 'board',
    widgets: [],
    tags: [],
    targetGradeLevels: [],
    targetBuildings: [],
    enabled: true,
    accessLevel: 'public',
    createdAt: 1000,
    updatedAt: 1000,
    createdBy: 'admin@example.com',
    ...overrides,
  };
}

/** Minimal valid Collection (CollectionTemplate) fixture. */
function collectionTemplate(
  overrides: Partial<CollectionTemplate> = {}
): CollectionTemplate {
  return {
    id: 'coll-1',
    type: 'collection',
    name: 'Science Unit',
    description: 'Bundled science boards',
    collectionSnapshot: { name: 'Science Unit' },
    boardSnapshots: [],
    tags: [],
    targetGradeLevels: [],
    targetBuildings: [],
    enabled: true,
    accessLevel: 'public',
    createdAt: 2000,
    updatedAt: 2000,
    createdBy: 'admin@example.com',
    ...overrides,
  };
}

/** Reads the raw persisted array straight out of sessionStorage. */
function readPersisted(): AnyTemplate[] {
  const raw = sessionStorage.getItem(STORAGE_KEY);
  return raw ? (JSON.parse(raw) as AnyTemplate[]) : [];
}

beforeEach(() => {
  sessionStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  sessionStorage.clear();
});

describe('mockTemplateStore', () => {
  describe('getAll', () => {
    it('returns an empty array for a fresh store', async () => {
      const store = await loadStore();
      expect(store.getAll()).toEqual([]);
    });

    it('returns saved templates', async () => {
      const store = await loadStore();
      const t = boardTemplate();
      store.save(t);
      expect(store.getAll()).toEqual([t]);
    });

    it('sorts by createdAt descending — newest first', async () => {
      const store = await loadStore();
      const oldest = boardTemplate({ id: 'a', createdAt: 100 });
      const newest = boardTemplate({ id: 'b', createdAt: 300 });
      const middle = boardTemplate({ id: 'c', createdAt: 200 });
      // Insert out of order to prove the sort, not insertion order, wins.
      store.save(oldest);
      store.save(newest);
      store.save(middle);
      expect(store.getAll().map((t) => t.id)).toEqual(['b', 'c', 'a']);
    });

    it('returns both Board and Collection templates together', async () => {
      const store = await loadStore();
      const board = boardTemplate({ id: 'board', createdAt: 1 });
      const collection = collectionTemplate({ id: 'coll', createdAt: 2 });
      store.save(board);
      store.save(collection);
      // Collection has the larger createdAt, so it sorts first.
      expect(store.getAll().map((t) => t.id)).toEqual(['coll', 'board']);
    });
  });

  describe('save', () => {
    it('upserts by id — saving the same id replaces, does not duplicate', async () => {
      const store = await loadStore();
      store.save(boardTemplate({ id: 'x', name: 'Original' }));
      store.save(boardTemplate({ id: 'x', name: 'Renamed' }));
      const all = store.getAll();
      expect(all).toHaveLength(1);
      expect(all[0].name).toBe('Renamed');
    });

    it('persists the saved templates to sessionStorage', async () => {
      const store = await loadStore();
      const t = boardTemplate({ id: 'persist-me' });
      store.save(t);
      expect(readPersisted()).toEqual([t]);
    });
  });

  describe('remove', () => {
    it('removes a template by id', async () => {
      const store = await loadStore();
      store.save(boardTemplate({ id: 'keep' }));
      store.save(boardTemplate({ id: 'drop' }));
      store.remove('drop');
      expect(store.getAll().map((t) => t.id)).toEqual(['keep']);
    });

    it('is a no-op when the id does not exist', async () => {
      const store = await loadStore();
      store.save(boardTemplate({ id: 'keep' }));
      store.remove('nonexistent');
      expect(store.getAll().map((t) => t.id)).toEqual(['keep']);
    });

    it('persists the removal to sessionStorage', async () => {
      const store = await loadStore();
      store.save(boardTemplate({ id: 'a' }));
      store.save(boardTemplate({ id: 'b' }));
      store.remove('a');
      expect(readPersisted().map((t) => t.id)).toEqual(['b']);
    });
  });

  describe('hydration from sessionStorage', () => {
    it('hydrates pre-existing templates on first access', async () => {
      const seeded = [
        boardTemplate({ id: 'seed-1', createdAt: 10 }),
        collectionTemplate({ id: 'seed-2', createdAt: 20 }),
      ];
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
      const store = await loadStore();
      // Sorted by createdAt desc: seed-2 (20) before seed-1 (10).
      expect(store.getAll().map((t) => t.id)).toEqual(['seed-2', 'seed-1']);
    });

    it('merges a newly saved template with hydrated ones', async () => {
      sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify([boardTemplate({ id: 'existing', createdAt: 50 })])
      );
      const store = await loadStore();
      store.save(boardTemplate({ id: 'fresh', createdAt: 60 }));
      expect(store.getAll().map((t) => t.id)).toEqual(['fresh', 'existing']);
    });

    it('hydrates only once — a later external sessionStorage edit is ignored', async () => {
      sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify([boardTemplate({ id: 'first' })])
      );
      const store = await loadStore();
      // First access triggers hydration.
      expect(store.getAll().map((t) => t.id)).toEqual(['first']);
      // Mutating sessionStorage directly afterwards must not re-hydrate.
      sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify([boardTemplate({ id: 'sneaky' })])
      );
      expect(store.getAll().map((t) => t.id)).toEqual(['first']);
    });
  });

  describe('sessionStorage error resilience', () => {
    it('falls back to in-memory when reading sessionStorage throws', async () => {
      const getSpy = vi
        .spyOn(Storage.prototype, 'getItem')
        .mockImplementation(() => {
          throw new Error('sessionStorage unavailable');
        });
      const store = await loadStore();
      // getAll() triggers hydrate(), which swallows the read error.
      expect(store.getAll()).toEqual([]);
      getSpy.mockRestore();
      // Subsequent writes still work in-memory.
      store.save(boardTemplate({ id: 'mem-only' }));
      expect(store.getAll().map((t) => t.id)).toEqual(['mem-only']);
    });

    it('falls back to in-memory when malformed JSON is stored', async () => {
      sessionStorage.setItem(STORAGE_KEY, '{ not valid json');
      const store = await loadStore();
      // JSON.parse throws inside hydrate() and is swallowed.
      expect(store.getAll()).toEqual([]);
    });

    it('keeps the in-memory value when persisting to sessionStorage throws', async () => {
      const store = await loadStore();
      const setSpy = vi
        .spyOn(Storage.prototype, 'setItem')
        .mockImplementation(() => {
          throw new Error('quota exceeded');
        });
      store.save(boardTemplate({ id: 'survives' }));
      // The write to the backing Map happens before persist(), so the value
      // is retained even though persistence failed.
      expect(store.getAll().map((t) => t.id)).toEqual(['survives']);
      setSpy.mockRestore();
    });
  });
});
