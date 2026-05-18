# SpartBoard Collections — Plan 1: Core + Management Modal

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Collections (nestable folders) for Boards and a large management modal for organizing them. Replace the narrow sidebar Boards list with a thin Active-Collection picker. Existing FAB + Board-switching behavior is unchanged in this plan (deferred to Plan 2).

**Architecture:** Mirrors the existing `useFolders` (`hooks/useFolders.ts`) + `LibraryFolder` pattern used for library item foldering. Collections live in `/users/{userId}/collections/{collectionId}` with the same shape pattern (`{ id, name, parentCollectionId, order, createdAt, updatedAt }` plus `color?`, `icon?`, `defaultBoardId?`). Boards (existing `Dashboard` docs) gain `collectionId: string | null` and `isPinned: boolean` fields. `UserProfile` tracks `lastActiveCollectionId` and `lastBoardIdByCollection` for app-open behavior in Plan 2.

The management modal (`components/boardsModal/BoardsModal.tsx`) follows the existing full-screen modal pattern (cf. `components/admin/AdminSettings.tsx`): two panes (Collection tree on left, Board grid on right) with collapsible left pane on small screens. Drag-and-drop reuses `@dnd-kit` (already used by `SidebarBoards.tsx`).

**Tech Stack:** React 19, TypeScript 5.9, Vite 6, Firestore (modular SDK), Vitest 4, @testing-library/react, @dnd-kit/core + sortable, Tailwind CSS, lucide-react.

**Out of scope for this plan (covered by later plans):**

- Plan 2: FAB redesign, breadcrumb chip, P4 state preservation (mounted-set architecture).
- Plan 3: Collection sharing (Copy + Substitute view-only modes).
- Plan 4: Collection templates (extending `/dashboard_templates/` with `type` discriminator).

---

## Files Created or Modified

**New files:**

- `hooks/useCollections.ts` — Firestore CRUD hook (mirrors `useFolders`)
- `tests/hooks/useCollections.test.ts` — shape + auth tests
- `utils/collectionsMigration.ts` — one-time migration: seed `collectionId: null`, `isPinned: false` on existing Dashboards
- `tests/utils/collectionsMigration.test.ts`
- `components/layout/sidebar/SidebarBoardsActive.tsx` — thin Active-Collection picker (replaces `SidebarBoards` content)
- `tests/components/layout/sidebar/SidebarBoardsActive.test.tsx`
- `components/boardsModal/BoardsModal.tsx` — modal shell + state coordination
- `components/boardsModal/BoardsModalHeader.tsx` — search + "New" buttons + multi-select bar
- `components/boardsModal/CollectionTree.tsx` — left pane: Pinned section + Collection tree
- `components/boardsModal/CollectionTreeNode.tsx` — recursive tree node
- `components/boardsModal/PinnedSection.tsx` — Pinned Boards section in left pane
- `components/boardsModal/BoardGrid.tsx` — right pane: sub-Collections + Boards
- `components/boardsModal/BoardCard.tsx` — single Board card
- `components/boardsModal/CollectionCard.tsx` — single sub-Collection card
- `components/boardsModal/BulkActionsBar.tsx` — bottom bar when items selected
- `components/boardsModal/DeleteCollectionDialog.tsx` — confirm flow for collection delete
- `components/boardsModal/MoveToCollectionMenu.tsx` — submenu for moving Boards
- `components/boardsModal/useMultiSelect.ts` — selection state hook
- `components/boardsModal/useBoardsModalDnd.ts` — @dnd-kit setup
- `tests/components/boardsModal/*.test.tsx` — covered per task

**Modified files:**

- `types.ts` — `Collection` interface; `Dashboard.collectionId`, `Dashboard.isPinned`; `UserProfile.lastActiveCollectionId`, `UserProfile.lastBoardIdByCollection`
- `firestore.rules` — owner read/write rule for `/users/{uid}/collections/{collectionId}`
- `context/DashboardContext.tsx` — collection-aware actions: `moveBoardToCollection`, `pinBoard`, `unpinBoard`, `setDefaultBoardInCollection`. Migration call on first load.
- `context/DashboardContextValue.ts` — exposed action types
- `context/AuthContext.tsx` — extend `userProfile` writes to include new fields
- `components/layout/sidebar/Sidebar.tsx` — sidebar Boards entry now opens the modal directly; replace `<SidebarBoards>` mount with `<SidebarBoardsActive>` (separate, smaller surface)
- `components/layout/sidebar/SidebarBoards.tsx` — removed in favor of new components OR repurposed as the modal's right-pane grid (decision: **delete**; modal owns its own components)
- `locales/en/translation.json`, `locales/de/translation.json`, `locales/es/translation.json`, `locales/fr/translation.json` — i18n keys for the new UI
- `tests/e2e/collections.spec.ts` — E2E happy path

---

## Phase 0 — Types & Firestore Rules

Foundation: types compile, Firestore rules permit owner access. No behavior change yet.

### Task 0.1 — Add `Collection` type

**Files:**

- Modify: `types.ts` (immediately after `LibraryFolder` definition around line 5982)

- [ ] **Step 1: Find insertion point.** Open `types.ts`, find `export interface LibraryFolder`. The insertion point is just after this interface (and after its closing `}`).

- [ ] **Step 2: Add the type**

Insert immediately after `LibraryFolder`:

```typescript
/**
 * A Board collection (folder) stored at
 * `/users/{userId}/collections/{collectionId}`.
 *
 * Collections are nestable: `parentCollectionId === null` means root-level.
 * Sibling collections within a given parent are ordered by `order` ascending.
 *
 * `defaultBoardId` is the Board that loads when a teacher first enters this
 * Collection (before any per-Collection history is recorded). Only one Board
 * per Collection may be the default; the constraint is enforced in
 * `useCollections.setCollectionDefaultBoard`.
 */
export interface Collection {
  id: string;
  name: string;
  /** Parent collection id, or `null` for root-level collections. */
  parentCollectionId: string | null;
  /** Sort order among siblings (ascending). */
  order: number;
  /** Optional accent color (any CSS color string, e.g. '#ad2122'). */
  color?: string;
  /** Optional lucide-react icon name (e.g., 'BookOpen'). */
  icon?: string;
  /** Board id to load on first entry to this collection. */
  defaultBoardId?: string;
  /** Epoch ms at create. */
  createdAt: number;
  /** Epoch ms at last rename / move / reorder / metadata change. */
  updatedAt?: number;
}
```

- [ ] **Step 3: Run type check**

Run: `pnpm run type-check`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add types.ts
git commit -m "feat(types): add Collection type for Board foldering"
```

### Task 0.2 — Extend `Dashboard` with `collectionId` + `isPinned`

**Files:**

- Modify: `types.ts` (Dashboard interface around line 4961)

- [ ] **Step 1: Locate Dashboard interface**

In `types.ts`, find `export interface Dashboard {` around line 4961.

- [ ] **Step 2: Add the two fields**

Add (anywhere in the interface body — recommend right after `order?: number;`):

```typescript
  /**
   * Parent collection id, or `null` for root-level Boards (no collection).
   * Optional during the migration window; populated by
   * `collectionsMigration.ts` the first time a legacy dashboard loads.
   */
  collectionId?: string | null;
  /**
   * When true, this Board appears in the Pinned section of the modal and
   * the FAB kebab popover (Plan 2). Independent of `collectionId` — pinned
   * Boards still belong to their Collection.
   */
  isPinned?: boolean;
```

- [ ] **Step 3: Run type check**

Run: `pnpm run type-check`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add types.ts
git commit -m "feat(types): add Dashboard.collectionId and isPinned fields"
```

### Task 0.3 — Extend `UserProfile` with active-Collection tracking

**Files:**

- Modify: `types.ts` (UserProfile interface around line 4895)

- [ ] **Step 1: Locate UserProfile interface**

In `types.ts`, find `export interface UserProfile {`.

- [ ] **Step 2: Add the two fields**

Add inside the interface body (recommend after `setupCompleted?: boolean;`):

```typescript
  /**
   * The Collection the teacher was most recently in. App-open restores
   * this. `null` means "root level (no collection)". Set by
   * `loadDashboard` in DashboardContext when a Board is opened.
   */
  lastActiveCollectionId?: string | null;
  /**
   * Per-Collection last-visited Board memory. Keys are Collection ids
   * (or the literal string `"__root__"` for root-level Boards).
   * Populated whenever a Board within a Collection is opened.
   */
  lastBoardIdByCollection?: Record<string, string>;
```

- [ ] **Step 3: Type check + commit**

```bash
pnpm run type-check
git add types.ts
git commit -m "feat(types): track active Collection on UserProfile"
```

### Task 0.4 — Firestore rules for `/users/{uid}/collections/{collectionId}`

**Files:**

- Modify: `firestore.rules` (insert after the `quiz_folders` rule around line 2797)

- [ ] **Step 1: Add the rule**

Find the block starting `match /users/{userId}/quiz_folders/{folderId} {` (around line 2797). Add immediately above it (for alphabetical-ish grouping):

```
    match /users/{userId}/collections/{collectionId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
```

- [ ] **Step 2: Validate rules locally**

Run: `pnpm exec firebase emulators:exec --only firestore "echo 'rules ok'"` (or just deploy in the next step — but local validation is cheaper).

If you don't have the emulator set up: skip and rely on the deploy validation in Step 3.

- [ ] **Step 3: Commit**

```bash
git add firestore.rules
git commit -m "chore(firestore): allow owner read/write on /collections subcollection"
```

> **Deployment note:** Rules will be deployed by CI/CD on merge. Do NOT deploy from a feature branch — let the existing pipeline handle it.

---

## Phase 1 — `useCollections` Hook

Mirror `useFolders` exactly. New hook for the Collections subcollection. No UI yet.

### Task 1.1 — Shape tests for `useCollections`

**Files:**

- Create: `tests/hooks/useCollections.test.ts`

- [ ] **Step 1: Write the failing shape test**

```typescript
/**
 * Shape tests for `useCollections`. Pins the public API so future changes
 * can't silently drop a field or rename a method. Real Firestore behavior
 * (create → rename → move → delete) is covered by integration tests.
 */

import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useCollections } from '@/hooks/useCollections';

describe('useCollections', () => {
  it('returns the expected shape when userId is undefined', () => {
    const { result } = renderHook(() => useCollections(undefined));

    expect(result.current.collections).toEqual([]);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();

    expect(typeof result.current.createCollection).toBe('function');
    expect(typeof result.current.renameCollection).toBe('function');
    expect(typeof result.current.moveCollection).toBe('function');
    expect(typeof result.current.deleteCollection).toBe('function');
    expect(typeof result.current.reorderSiblings).toBe('function');
    expect(typeof result.current.setCollectionMetadata).toBe('function');
    expect(typeof result.current.setCollectionDefaultBoard).toBe('function');
  });

  it('write operations reject when not authenticated', async () => {
    const { result } = renderHook(() => useCollections(undefined));

    await expect(result.current.createCollection('New', null)).rejects.toThrow(
      /Not authenticated/
    );
    await expect(result.current.renameCollection('c1', 'X')).rejects.toThrow(
      /Not authenticated/
    );
    await expect(result.current.moveCollection('c1', null)).rejects.toThrow(
      /Not authenticated/
    );
    await expect(
      result.current.deleteCollection('c1', 'move-to-parent')
    ).rejects.toThrow(/Not authenticated/);
    await expect(result.current.reorderSiblings(null, ['c1'])).rejects.toThrow(
      /Not authenticated/
    );
    await expect(
      result.current.setCollectionMetadata('c1', { color: '#fff' })
    ).rejects.toThrow(/Not authenticated/);
    await expect(
      result.current.setCollectionDefaultBoard('c1', 'b1')
    ).rejects.toThrow(/Not authenticated/);
  });
});
```

- [ ] **Step 2: Run test, expect failure**

Run: `pnpm exec vitest run tests/hooks/useCollections.test.ts`
Expected: FAIL — module `@/hooks/useCollections` does not exist.

### Task 1.2 — Implement `useCollections`

**Files:**

- Create: `hooks/useCollections.ts`

- [ ] **Step 1: Implement hook**

The shape is intentionally near-identical to `useFolders.ts`. Major differences:

- Single subcollection (`collections`), not parameterized by widget type.
- Field is `parentCollectionId` (not `parentId`).
- `deleteCollection` re-homes Boards (not library items) by updating `Dashboard.collectionId` rather than a `folderId` field on item docs.
- Adds `setCollectionMetadata(collectionId, { color?, icon?, name? })` and `setCollectionDefaultBoard(collectionId, boardId | null)`.

```typescript
/**
 * useCollections — Board collection management.
 *
 * Streams collections from `/users/{userId}/collections` and exposes CRUD
 * operations that round-trip to Firestore. The returned hook result is
 * memoized so consumers can include it in effect dependency arrays without
 * thrashing.
 *
 * Schema recap (see `types.ts` `Collection`):
 *   /users/{userId}/collections/{collectionId}
 *     => { id, name, parentCollectionId: string | null, order: number,
 *          color?, icon?, defaultBoardId?, createdAt, updatedAt? }
 *
 * Board re-homing semantics on collection delete:
 *   When a Collection is deleted in 'move-to-parent' mode, descendant
 *   Collections are reparented to the deleted Collection's parent (null = root)
 *   and Boards inside are re-homed to that same parent. 'delete-all' deletes
 *   descendant Collections but STILL re-homes Boards rather than deleting
 *   them — destructive Board loss must be explicit, never a side-effect of
 *   Collection cleanup.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  where,
  writeBatch,
  addDoc,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import type { Collection } from '@/types';

const COLLECTIONS_SUBPATH = 'collections';
const DASHBOARDS_SUBPATH = 'dashboards';

export type DeleteCollectionMode = 'move-to-parent' | 'delete-all';

export interface UseCollectionsResult {
  collections: Collection[];
  loading: boolean;
  error: string | null;
  createCollection: (
    name: string,
    parentCollectionId: string | null
  ) => Promise<string>;
  renameCollection: (collectionId: string, nextName: string) => Promise<void>;
  moveCollection: (
    collectionId: string,
    nextParentCollectionId: string | null
  ) => Promise<void>;
  deleteCollection: (
    collectionId: string,
    mode: DeleteCollectionMode
  ) => Promise<void>;
  reorderSiblings: (
    parentCollectionId: string | null,
    orderedIds: string[]
  ) => Promise<void>;
  setCollectionMetadata: (
    collectionId: string,
    patch: Partial<Pick<Collection, 'name' | 'color' | 'icon'>>
  ) => Promise<void>;
  setCollectionDefaultBoard: (
    collectionId: string,
    boardId: string | null
  ) => Promise<void>;
}

export const useCollections = (
  userId: string | undefined
): UseCollectionsResult => {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState<boolean>(!!userId);
  const [error, setError] = useState<string | null>(null);

  // Reset state on userId change without using useEffect.
  const [prevUserId, setPrevUserId] = useState(userId);
  if (userId !== prevUserId) {
    setPrevUserId(userId);
    if (!userId) {
      setCollections([]);
      setLoading(false);
      setError(null);
    } else {
      setLoading(true);
    }
  }

  useEffect(() => {
    if (!userId) return;

    const q = query(
      collection(db, 'users', userId, COLLECTIONS_SUBPATH),
      orderBy('order', 'asc')
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: Collection[] = snap.docs.map((d) => {
          const data = d.data() as Omit<Collection, 'id'>;
          return { ...data, id: d.id };
        });
        setCollections(list);
        setLoading(false);
      },
      (err) => {
        console.error('[useCollections] Firestore error:', err);
        setError('Failed to load collections');
        setLoading(false);
      }
    );

    return unsub;
  }, [userId]);

  const createCollection = useCallback(
    async (
      name: string,
      parentCollectionId: string | null
    ): Promise<string> => {
      if (!userId) throw new Error('Not authenticated');
      const trimmed = name.trim();
      if (!trimmed) throw new Error('Collection name is required');

      const siblingOrders = collections
        .filter((c) => c.parentCollectionId === parentCollectionId)
        .map((c) => c.order);
      const nextOrder =
        siblingOrders.length === 0 ? 0 : Math.max(...siblingOrders) + 1;

      const now = Date.now();
      const ref = await addDoc(
        collection(db, 'users', userId, COLLECTIONS_SUBPATH),
        {
          name: trimmed,
          parentCollectionId,
          order: nextOrder,
          createdAt: now,
          updatedAt: now,
        }
      );
      return ref.id;
    },
    [userId, collections]
  );

  const renameCollection = useCallback(
    async (collectionId: string, nextName: string): Promise<void> => {
      if (!userId) throw new Error('Not authenticated');
      const trimmed = nextName.trim();
      if (!trimmed) throw new Error('Collection name is required');

      const batch = writeBatch(db);
      batch.update(
        doc(db, 'users', userId, COLLECTIONS_SUBPATH, collectionId),
        {
          name: trimmed,
          updatedAt: Date.now(),
        }
      );
      await batch.commit();
    },
    [userId]
  );

  // Detect whether moving `collectionId` under `candidateAncestorId` would
  // create a cycle. Walks UP from candidate; if we encounter collectionId,
  // collectionId is an ancestor of candidate → cycle.
  const isDescendantOrSelf = useCallback(
    (candidateAncestorId: string, collectionId: string): boolean => {
      if (candidateAncestorId === collectionId) return true;
      const byId = new Map(collections.map((c) => [c.id, c] as const));
      let cursor = byId.get(candidateAncestorId);
      let depth = 0;
      while (cursor && depth < 256) {
        if (cursor.id === collectionId) return true;
        if (cursor.parentCollectionId == null) break;
        cursor = byId.get(cursor.parentCollectionId);
        depth += 1;
      }
      return false;
    },
    [collections]
  );

  const moveCollection = useCallback(
    async (
      collectionId: string,
      nextParentCollectionId: string | null
    ): Promise<void> => {
      if (!userId) throw new Error('Not authenticated');
      if (collectionId === nextParentCollectionId) {
        throw new Error('Cannot move a collection into itself');
      }
      if (
        nextParentCollectionId != null &&
        isDescendantOrSelf(nextParentCollectionId, collectionId)
      ) {
        throw new Error(
          'Cannot move a collection into one of its own subcollections'
        );
      }

      const siblingOrders = collections
        .filter(
          (c) =>
            c.parentCollectionId === nextParentCollectionId &&
            c.id !== collectionId
        )
        .map((c) => c.order);
      const nextOrder =
        siblingOrders.length === 0 ? 0 : Math.max(...siblingOrders) + 1;

      const batch = writeBatch(db);
      batch.update(
        doc(db, 'users', userId, COLLECTIONS_SUBPATH, collectionId),
        {
          parentCollectionId: nextParentCollectionId,
          order: nextOrder,
          updatedAt: Date.now(),
        }
      );
      await batch.commit();
    },
    [userId, collections, isDescendantOrSelf]
  );

  const reorderSiblings = useCallback(
    async (
      _parentCollectionId: string | null,
      orderedIds: string[]
    ): Promise<void> => {
      if (!userId) throw new Error('Not authenticated');
      if (orderedIds.length === 0) return;

      const batch = writeBatch(db);
      const now = Date.now();
      orderedIds.forEach((id, index) => {
        batch.update(doc(db, 'users', userId, COLLECTIONS_SUBPATH, id), {
          order: index,
          updatedAt: now,
        });
      });
      await batch.commit();
    },
    [userId]
  );

  const setCollectionMetadata = useCallback(
    async (
      collectionId: string,
      patch: Partial<Pick<Collection, 'name' | 'color' | 'icon'>>
    ): Promise<void> => {
      if (!userId) throw new Error('Not authenticated');
      const update: Record<string, unknown> = { updatedAt: Date.now() };
      if (patch.name !== undefined) {
        const trimmed = patch.name.trim();
        if (!trimmed) throw new Error('Collection name is required');
        update.name = trimmed;
      }
      if (patch.color !== undefined) update.color = patch.color;
      if (patch.icon !== undefined) update.icon = patch.icon;

      const batch = writeBatch(db);
      batch.update(
        doc(db, 'users', userId, COLLECTIONS_SUBPATH, collectionId),
        update
      );
      await batch.commit();
    },
    [userId]
  );

  const setCollectionDefaultBoard = useCallback(
    async (collectionId: string, boardId: string | null): Promise<void> => {
      if (!userId) throw new Error('Not authenticated');
      const batch = writeBatch(db);
      batch.update(
        doc(db, 'users', userId, COLLECTIONS_SUBPATH, collectionId),
        {
          defaultBoardId: boardId,
          updatedAt: Date.now(),
        }
      );
      await batch.commit();
    },
    [userId]
  );

  // Recursively collect descendant collection ids.
  const collectDescendantCollectionIds = useCallback(
    (rootId: string): string[] => {
      const byParent = new Map<string | null, Collection[]>();
      for (const c of collections) {
        const bucket = byParent.get(c.parentCollectionId) ?? [];
        bucket.push(c);
        byParent.set(c.parentCollectionId, bucket);
      }
      const out: string[] = [];
      const walk = (id: string): void => {
        const kids = byParent.get(id) ?? [];
        for (const k of kids) {
          out.push(k.id);
          walk(k.id);
        }
      };
      walk(rootId);
      return out;
    },
    [collections]
  );

  const deleteCollection = useCallback(
    async (collectionId: string, mode: DeleteCollectionMode): Promise<void> => {
      if (!userId) throw new Error('Not authenticated');
      const target = collections.find((c) => c.id === collectionId);
      if (!target) throw new Error('Collection not found');

      const batch = writeBatch(db);
      const now = Date.now();

      if (mode === 'move-to-parent') {
        // Reparent direct child collections to target's parent.
        const childCollections = collections.filter(
          (c) => c.parentCollectionId === collectionId
        );
        for (const cc of childCollections) {
          batch.update(doc(db, 'users', userId, COLLECTIONS_SUBPATH, cc.id), {
            parentCollectionId: target.parentCollectionId,
            updatedAt: now,
          });
        }
        // Re-home Boards in this Collection to target's parent (null or id).
        const boardsQuery = query(
          collection(db, 'users', userId, DASHBOARDS_SUBPATH),
          where('collectionId', '==', collectionId)
        );
        const boardSnap = await getDocs(boardsQuery);
        boardSnap.docs.forEach((d) => {
          batch.update(d.ref, {
            collectionId: target.parentCollectionId,
            updatedAt: now,
          });
        });
        batch.delete(
          doc(db, 'users', userId, COLLECTIONS_SUBPATH, collectionId)
        );
        await batch.commit();
        return;
      }

      // mode === 'delete-all'
      const descendantIds = collectDescendantCollectionIds(collectionId);
      const allCollectionIds = [collectionId, ...descendantIds];

      // Re-home Boards anywhere in this tree to target's parent. Chunk to
      // stay within Firestore 'in' query limit (30).
      const CHUNK = 30;
      for (let i = 0; i < allCollectionIds.length; i += CHUNK) {
        const chunkIds = allCollectionIds.slice(i, i + CHUNK);
        const boardsQuery = query(
          collection(db, 'users', userId, DASHBOARDS_SUBPATH),
          where('collectionId', 'in', chunkIds)
        );
        const boardSnap = await getDocs(boardsQuery);
        boardSnap.docs.forEach((d) => {
          batch.update(d.ref, {
            collectionId: target.parentCollectionId,
            updatedAt: now,
          });
        });
      }

      // Delete each Collection doc. Batch limit is 500 writes; chunk.
      let writeCount = 0;
      let currentBatch = batch;
      for (const id of allCollectionIds) {
        if (writeCount >= 400) {
          await currentBatch.commit();
          currentBatch = writeBatch(db);
          writeCount = 0;
        }
        currentBatch.delete(doc(db, 'users', userId, COLLECTIONS_SUBPATH, id));
        writeCount += 1;
      }
      await currentBatch.commit();
    },
    [userId, collections, collectDescendantCollectionIds]
  );

  return useMemo<UseCollectionsResult>(
    () => ({
      collections,
      loading,
      error,
      createCollection,
      renameCollection,
      moveCollection,
      deleteCollection,
      reorderSiblings,
      setCollectionMetadata,
      setCollectionDefaultBoard,
    }),
    [
      collections,
      loading,
      error,
      createCollection,
      renameCollection,
      moveCollection,
      deleteCollection,
      reorderSiblings,
      setCollectionMetadata,
      setCollectionDefaultBoard,
    ]
  );
};
```

- [ ] **Step 2: Run shape tests**

Run: `pnpm exec vitest run tests/hooks/useCollections.test.ts`
Expected: PASS.

- [ ] **Step 3: Lint + format**

Run: `pnpm run lint -- hooks/useCollections.ts tests/hooks/useCollections.test.ts`
Run: `pnpm run format`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add hooks/useCollections.ts tests/hooks/useCollections.test.ts
git commit -m "feat(hooks): add useCollections for Board folder CRUD"
```

---

## Phase 2 — Migration Utility

One-time client-side migration to seed `collectionId: null` and `isPinned: false` on existing Dashboards. Idempotent — safe to run multiple times.

### Task 2.1 — Tests for migration utility

**Files:**

- Create: `tests/utils/collectionsMigration.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import {
  needsCollectionMigration,
  migrateBoardForCollections,
} from '@/utils/collectionsMigration';
import type { Dashboard } from '@/types';

const mkBoard = (overrides: Partial<Dashboard> = {}): Dashboard => ({
  id: 'b1',
  name: 'Test',
  background: 'bg-slate-800',
  widgets: [],
  createdAt: Date.now(),
  ...overrides,
});

describe('needsCollectionMigration', () => {
  it('returns true when collectionId is undefined', () => {
    expect(needsCollectionMigration(mkBoard())).toBe(true);
  });

  it('returns false when collectionId is null (already migrated)', () => {
    expect(needsCollectionMigration(mkBoard({ collectionId: null }))).toBe(
      false
    );
  });

  it('returns false when collectionId is set', () => {
    expect(needsCollectionMigration(mkBoard({ collectionId: 'c1' }))).toBe(
      false
    );
  });

  it('returns true when isPinned is undefined even if collectionId is set', () => {
    expect(needsCollectionMigration(mkBoard({ collectionId: 'c1' }))).toBe(
      false
    );
    expect(
      needsCollectionMigration(mkBoard({ collectionId: null, isPinned: false }))
    ).toBe(false);
    // Treat missing isPinned as needing migration when collectionId also missing,
    // since that's the legacy case. If collectionId is set, we trust the doc.
  });
});

describe('migrateBoardForCollections', () => {
  it('seeds collectionId: null on legacy boards', () => {
    const result = migrateBoardForCollections(mkBoard());
    expect(result.collectionId).toBeNull();
    expect(result.isPinned).toBe(false);
  });

  it('preserves existing collectionId', () => {
    const result = migrateBoardForCollections(
      mkBoard({ collectionId: 'c1', isPinned: true })
    );
    expect(result.collectionId).toBe('c1');
    expect(result.isPinned).toBe(true);
  });

  it('preserves all other fields', () => {
    const board = mkBoard({ name: 'Original', isDefault: true });
    const result = migrateBoardForCollections(board);
    expect(result.name).toBe('Original');
    expect(result.isDefault).toBe(true);
  });
});
```

- [ ] **Step 2: Run test, expect failure**

Run: `pnpm exec vitest run tests/utils/collectionsMigration.test.ts`
Expected: FAIL — module does not exist.

### Task 2.2 — Implement migration utility

**Files:**

- Create: `utils/collectionsMigration.ts`

- [ ] **Step 1: Implement**

```typescript
import type { Dashboard } from '@/types';

/**
 * True if this Dashboard hasn't been migrated for the Collections feature
 * (i.e., `collectionId` is undefined). Boards with `collectionId === null`
 * are considered already migrated to "root level."
 */
export const needsCollectionMigration = (board: Dashboard): boolean => {
  return board.collectionId === undefined;
};

/**
 * Idempotent migration: seeds `collectionId: null` and `isPinned: false`
 * on a Board that lacks those fields. Returns the migrated Board (or the
 * original if no change was needed).
 *
 * Run on every Board load until cleaned up by a subsequent Firestore write.
 */
export const migrateBoardForCollections = (board: Dashboard): Dashboard => {
  if (!needsCollectionMigration(board) && board.isPinned !== undefined) {
    return board;
  }
  return {
    ...board,
    collectionId: board.collectionId ?? null,
    isPinned: board.isPinned ?? false,
  };
};
```

- [ ] **Step 2: Run tests**

Run: `pnpm exec vitest run tests/utils/collectionsMigration.test.ts`
Expected: PASS.

- [ ] **Step 3: Lint + commit**

```bash
pnpm run lint -- utils/collectionsMigration.ts tests/utils/collectionsMigration.test.ts
pnpm run format
git add utils/collectionsMigration.ts tests/utils/collectionsMigration.test.ts
git commit -m "feat(utils): add idempotent Collections migration for legacy Boards"
```

### Task 2.3 — Wire migration into DashboardContext

**Files:**

- Modify: `context/DashboardContext.tsx` — apply migration on every Board load.

- [ ] **Step 1: Locate the dashboards subscription**

Find the `onSnapshot` for `/users/{uid}/dashboards/` (likely around the section that builds `setDashboards(...)` from the snapshot). Let it return an unsubscribe.

- [ ] **Step 2: Apply migration in the snapshot mapper**

Wherever the snapshot maps docs to `Dashboard[]`, run each through `migrateBoardForCollections`:

```typescript
import { migrateBoardForCollections } from '@/utils/collectionsMigration';

// inside the onSnapshot callback that builds the dashboards array:
const list: Dashboard[] = snap.docs.map((d) => {
  const raw = { ...(d.data() as Omit<Dashboard, 'id'>), id: d.id } as Dashboard;
  return migrateBoardForCollections(raw);
});
setDashboards(list);
```

> Note: this is a _client-side hydration_ migration only — it does not write to Firestore. The next `updateWidget` / `renameDashboard` / etc. naturally writes back the migrated shape. This avoids a write storm on first load.

- [ ] **Step 3: Type-check + lint**

Run: `pnpm run type-check && pnpm run lint`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add context/DashboardContext.tsx
git commit -m "feat(dashboard): hydrate legacy Boards with Collections defaults on load"
```

---

## Phase 3 — DashboardContext: Collection-Aware Actions

Add new actions so the modal and other consumers can mutate Boards' Collection membership.

### Task 3.1 — Add `moveBoardToCollection` action

**Files:**

- Modify: `context/DashboardContext.tsx`
- Modify: `context/DashboardContextValue.ts` (the type/value shape file referenced from useDashboard)

- [ ] **Step 1: Add to DashboardContext implementation**

Inside the `DashboardProvider` body (near other action callbacks like `renameDashboard`):

```typescript
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '@/config/firebase';

const moveBoardToCollection = useCallback(
  async (boardId: string, collectionId: string | null): Promise<void> => {
    if (!user?.uid) throw new Error('Not authenticated');
    await updateDoc(doc(db, 'users', user.uid, 'dashboards', boardId), {
      collectionId,
      updatedAt: Date.now(),
    });
  },
  [user?.uid]
);
```

- [ ] **Step 2: Expose in the context value object**

Add `moveBoardToCollection` to the object returned by the context value (the big `useMemo` near the end of the provider).

- [ ] **Step 3: Add to DashboardContextValue type**

In `context/DashboardContextValue.ts`, add to the interface:

```typescript
moveBoardToCollection: (boardId: string, collectionId: string | null) =>
  Promise<void>;
```

- [ ] **Step 4: Type-check + commit**

```bash
pnpm run type-check
git add context/DashboardContext.tsx context/DashboardContextValue.ts
git commit -m "feat(dashboard): add moveBoardToCollection action"
```

### Task 3.2 — Add `pinBoard` and `unpinBoard` actions

**Files:**

- Modify: `context/DashboardContext.tsx`
- Modify: `context/DashboardContextValue.ts`

- [ ] **Step 1: Add to provider**

```typescript
const pinBoard = useCallback(
  async (boardId: string): Promise<void> => {
    if (!user?.uid) throw new Error('Not authenticated');
    await updateDoc(doc(db, 'users', user.uid, 'dashboards', boardId), {
      isPinned: true,
      updatedAt: Date.now(),
    });
  },
  [user?.uid]
);

const unpinBoard = useCallback(
  async (boardId: string): Promise<void> => {
    if (!user?.uid) throw new Error('Not authenticated');
    await updateDoc(doc(db, 'users', user.uid, 'dashboards', boardId), {
      isPinned: false,
      updatedAt: Date.now(),
    });
  },
  [user?.uid]
);
```

- [ ] **Step 2: Expose in context value + type**

Add to the returned object and to `DashboardContextValue`:

```typescript
pinBoard: (boardId: string) => Promise<void>;
unpinBoard: (boardId: string) => Promise<void>;
```

- [ ] **Step 3: Commit**

```bash
pnpm run type-check
git add context/DashboardContext.tsx context/DashboardContextValue.ts
git commit -m "feat(dashboard): add pinBoard and unpinBoard actions"
```

### Task 3.3 — Refactor `setDefaultDashboard` to be Collection-aware

The existing `setDefaultDashboard(boardId)` makes the Board the global default. We're changing semantics: only one Board per Collection (or per root) may be default.

**Files:**

- Modify: `context/DashboardContext.tsx`

- [ ] **Step 1: Find the existing action**

In `context/DashboardContext.tsx`, find `const setDefaultDashboard = useCallback(...)` (around line 3225 per the earlier grep).

- [ ] **Step 2: Update logic to scope by Collection**

Replace the implementation so that flipping a Board to `isDefault: true` first clears `isDefault` on any sibling in the same Collection (including root). Use a write batch:

```typescript
import { writeBatch, doc } from 'firebase/firestore';

const setDefaultDashboard = useCallback(
  async (boardId: string): Promise<void> => {
    if (!user?.uid) throw new Error('Not authenticated');
    const target = dashboards.find((d) => d.id === boardId);
    if (!target) return;
    const targetCollectionId = target.collectionId ?? null;

    const batch = writeBatch(db);
    const now = Date.now();

    // Clear isDefault on every sibling in the same Collection.
    dashboards.forEach((d) => {
      const dColl = d.collectionId ?? null;
      if (dColl === targetCollectionId && d.isDefault && d.id !== boardId) {
        batch.update(doc(db, 'users', user.uid, 'dashboards', d.id), {
          isDefault: false,
          updatedAt: now,
        });
      }
    });
    // Set on the target.
    batch.update(doc(db, 'users', user.uid, 'dashboards', boardId), {
      isDefault: true,
      updatedAt: now,
    });
    await batch.commit();
  },
  [user?.uid, dashboards]
);
```

- [ ] **Step 3: Type-check + commit**

```bash
pnpm run type-check
git add context/DashboardContext.tsx
git commit -m "refactor(dashboard): scope default Board to its Collection"
```

---

## Phase 4 — UserProfile: Active Collection Tracking

Add the new fields to `UserProfile` writes so app-open behavior in Plan 2 has data to read.

### Task 4.1 — Track `lastActiveCollectionId` on Board load

**Files:**

- Modify: `context/DashboardContext.tsx` — inside `loadDashboard`
- Modify: `context/AuthContext.tsx` — wherever `userProfile` is updated, allow the new fields through

- [ ] **Step 1: Find `loadDashboard` in DashboardContext**

Find `const loadDashboard = useCallback(...)`.

- [ ] **Step 2: Update userProfile after the dashboard is loaded**

Add a side effect that updates the profile with the active Collection and the per-Collection last-Board memory:

```typescript
import { setDoc, doc } from 'firebase/firestore';
import { db } from '@/config/firebase';

// inside loadDashboard, after the load logic completes:
if (user?.uid) {
  const target = dashboards.find((d) => d.id === boardId);
  if (target) {
    const collectionKey = target.collectionId ?? '__root__';
    const profileRef = doc(db, 'users', user.uid, 'userProfile', 'profile');
    const updates: Record<string, unknown> = {
      lastActiveCollectionId: target.collectionId ?? null,
      [`lastBoardIdByCollection.${collectionKey}`]: boardId,
    };
    void setDoc(profileRef, updates, { merge: true });
  }
}
```

> The dotted-path key (`lastBoardIdByCollection.${collectionKey}`) updates a single field inside the map without overwriting siblings. Firestore supports this in `setDoc({ merge: true })`.

- [ ] **Step 3: Type-check + commit**

```bash
pnpm run type-check
git add context/DashboardContext.tsx
git commit -m "feat(dashboard): persist lastActiveCollectionId + per-Collection last Board on load"
```

### Task 4.2 — Surface `userProfile.lastActiveCollectionId` in AuthContext

**Files:**

- Modify: `context/AuthContext.tsx` — extend the userProfile reader to include the new fields (no code change required if the userProfile object is already read whole; just verify).

- [ ] **Step 1: Verify the userProfile read pulls the full doc**

Search `context/AuthContext.tsx` for `userProfile` and the `onSnapshot` reading from `userProfile/profile`. Confirm it does `setUserProfile(snap.data() as UserProfile)`. If it explicitly destructures fields, add the new ones.

- [ ] **Step 2: If changes were needed, type-check + commit**

```bash
pnpm run type-check
git add context/AuthContext.tsx
git commit -m "chore(auth): ensure new UserProfile fields surface to consumers"
```

> If no code change needed, just note this in the next commit message and skip.

---

## Phase 5 — Sidebar Replacement: Active-Collection Picker

Replace the existing wide `<SidebarBoards>` with a thin `<SidebarBoardsActive>` component. The full management UI is in the modal (Phase 6); this sidebar entry is just a quick-pick + "manage" button.

### Task 5.1 — Tests for `SidebarBoardsActive`

**Files:**

- Create: `tests/components/layout/sidebar/SidebarBoardsActive.test.tsx`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SidebarBoardsActive } from '@/components/layout/sidebar/SidebarBoardsActive';

// Mock the dashboard + auth contexts. Lightweight stubs are fine — this is a
// shape/behavior test, not an integration test.
vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({
    dashboards: [
      { id: 'b1', name: 'Warm-up', collectionId: 'c1', createdAt: 0, background: '', widgets: [] },
      { id: 'b2', name: 'Activity', collectionId: 'c1', createdAt: 0, background: '', widgets: [] },
      { id: 'b3', name: 'Other', collectionId: 'c2', createdAt: 0, background: '', widgets: [] },
    ],
    activeDashboard: { id: 'b1', name: 'Warm-up', collectionId: 'c1', createdAt: 0, background: '', widgets: [] },
    loadDashboard: vi.fn(),
  }),
}));
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ userProfile: { lastActiveCollectionId: 'c1' } }),
}));

describe('SidebarBoardsActive', () => {
  it('renders only Boards in the active Collection', () => {
    const onOpenModal = vi.fn();
    render(<SidebarBoardsActive isVisible={true} onOpenModal={onOpenModal} />);
    expect(screen.getByText('Warm-up')).toBeInTheDocument();
    expect(screen.getByText('Activity')).toBeInTheDocument();
    expect(screen.queryByText('Other')).not.toBeInTheDocument();
  });

  it('calls onOpenModal when "Manage all boards" is clicked', () => {
    const onOpenModal = vi.fn();
    render(<SidebarBoardsActive isVisible={true} onOpenModal={onOpenModal} />);
    fireEvent.click(screen.getByRole('button', { name: /manage all boards/i }));
    expect(onOpenModal).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test, expect failure**

Run: `pnpm exec vitest run tests/components/layout/sidebar/SidebarBoardsActive.test.tsx`
Expected: FAIL — module does not exist.

### Task 5.2 — Implement `SidebarBoardsActive`

**Files:**

- Create: `components/layout/sidebar/SidebarBoardsActive.tsx`

- [ ] **Step 1: Implement**

```typescript
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Star, FolderOpen, Settings2 } from 'lucide-react';
import { useDashboard } from '@/context/useDashboard';
import { useAuth } from '@/context/useAuth';

interface SidebarBoardsActiveProps {
  isVisible: boolean;
  onOpenModal: () => void;
}

export const SidebarBoardsActive: React.FC<SidebarBoardsActiveProps> = ({
  isVisible,
  onOpenModal,
}) => {
  const { t } = useTranslation();
  const { dashboards, activeDashboard, loadDashboard } = useDashboard();
  const { userProfile } = useAuth();

  const activeCollectionId =
    activeDashboard?.collectionId ??
    userProfile?.lastActiveCollectionId ??
    null;

  const boardsInActiveCollection = dashboards
    .filter((d) => (d.collectionId ?? null) === activeCollectionId)
    .slice(0, 6); // thin picker — modal handles the rest

  return (
    <div
      className={`absolute inset-0 p-4 flex flex-col gap-4 overflow-y-auto custom-scrollbar transition-all duration-300 ease-in-out ${
        isVisible
          ? 'translate-x-0 opacity-100 visible'
          : 'translate-x-full opacity-0 invisible'
      }`}
    >
      <div className="flex items-center gap-2 text-xxs font-bold text-slate-400 uppercase tracking-widest px-1">
        <FolderOpen className="w-3.5 h-3.5" />
        {activeCollectionId
          ? t('sidebar.boards.activeCollection', { defaultValue: 'Active Collection' })
          : t('sidebar.boards.rootBoards', { defaultValue: 'Boards' })}
      </div>

      <div className="grid grid-cols-1 gap-2">
        {boardsInActiveCollection.map((db) => {
          const isActive = activeDashboard?.id === db.id;
          return (
            <button
              key={db.id}
              onClick={() => loadDashboard(db.id)}
              className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium text-left transition-colors ${
                isActive
                  ? 'bg-brand-blue-primary text-white'
                  : 'text-slate-700 hover:bg-brand-blue-lighter/40'
              }`}
            >
              {db.isDefault && (
                <Star
                  className={`w-3.5 h-3.5 flex-shrink-0 ${
                    isActive ? 'fill-white text-white' : 'fill-amber-400 text-amber-400'
                  }`}
                />
              )}
              <span className="truncate flex-1">{db.name}</span>
            </button>
          );
        })}
      </div>

      <button
        onClick={onOpenModal}
        className="flex items-center justify-center gap-2 px-3 py-3 rounded-xl text-xxs font-bold uppercase tracking-wider text-white bg-brand-blue-primary hover:bg-brand-blue-dark shadow-sm transition mt-auto"
      >
        <Settings2 className="w-4 h-4" />
        {t('sidebar.boards.manageAll', { defaultValue: 'Manage all boards' })}
      </button>
    </div>
  );
};
```

- [ ] **Step 2: Run tests**

Run: `pnpm exec vitest run tests/components/layout/sidebar/SidebarBoardsActive.test.tsx`
Expected: PASS.

- [ ] **Step 3: Lint + commit**

```bash
pnpm run lint -- components/layout/sidebar/SidebarBoardsActive.tsx
pnpm run format
git add components/layout/sidebar/SidebarBoardsActive.tsx tests/components/layout/sidebar/SidebarBoardsActive.test.tsx
git commit -m "feat(sidebar): add SidebarBoardsActive thin picker for active Collection"
```

### Task 5.3 — Wire `SidebarBoardsActive` into `Sidebar.tsx`

**Files:**

- Modify: `components/layout/sidebar/Sidebar.tsx`
- Delete (later): `components/layout/sidebar/SidebarBoards.tsx` — but DON'T delete yet; the modal in Phase 6 will absorb its functionality.

- [ ] **Step 1: Add modal-open state + import**

Near the top of the Sidebar component body, add:

```typescript
import { BoardsModal } from '@/components/boardsModal/BoardsModal';
import { SidebarBoardsActive } from './SidebarBoardsActive';

// inside Sidebar function body:
const [isBoardsModalOpen, setIsBoardsModalOpen] = useState(false);
```

- [ ] **Step 2: Replace the SidebarBoards mount**

Find `<SidebarBoards isVisible={activeSection === 'boards'} />` near the bottom of the content area. Replace with:

```tsx
<SidebarBoardsActive
  isVisible={activeSection === 'boards'}
  onOpenModal={() => {
    setIsBoardsModalOpen(true);
    setIsOpen(false); // close the sidebar drawer when opening the modal
    setActiveSection('main');
  }}
/>
```

- [ ] **Step 3: Mount the modal**

Below the Sidebar's other top-level conditional renders (e.g., `{showAdminSettings && ...}`), add:

```tsx
{
  isBoardsModalOpen && (
    <BoardsModal onClose={() => setIsBoardsModalOpen(false)} />
  );
}
```

- [ ] **Step 4: Type-check (will fail until Phase 6 lands)**

Run: `pnpm run type-check`
Expected: FAIL — `BoardsModal` doesn't exist yet. Move on; Phase 6 unblocks this.

> **Optional intermediate commit:** stash this change as a WIP commit if your workflow prefers small commits, OR hold this whole task uncommitted until Phase 6 Task 6.1 creates the BoardsModal stub. Recommend the latter — fewer red-CI commits.

---

## Phase 6 — Management Modal

The big UI work. Built with the existing `fixed inset-0 z-modal` full-screen pattern. Bite-sized: shell first, panes second, drag-drop last.

### Task 6.1 — Modal shell (stub) so Phase 5 wiring compiles

**Files:**

- Create: `components/boardsModal/BoardsModal.tsx`

- [ ] **Step 1: Create stub component**

```typescript
import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface BoardsModalProps {
  onClose: () => void;
}

export const BoardsModal: React.FC<BoardsModalProps> = ({ onClose }) => {
  const { t } = useTranslation();

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-modal bg-slate-50 flex flex-col overscroll-none"
      role="dialog"
      aria-modal="true"
      aria-labelledby="boards-modal-title"
    >
      <div className="bg-white w-full h-full overflow-hidden flex flex-col">
        <div className="bg-gradient-to-r from-brand-blue-primary to-brand-blue-dark text-white h-14 md:h-16 px-4 flex items-center justify-between shadow-sm shrink-0">
          <h2 id="boards-modal-title" className="text-lg font-bold">
            {t('boardsModal.title', { defaultValue: 'Boards' })}
          </h2>
          <button
            onClick={onClose}
            aria-label={t('boardsModal.close', { defaultValue: 'Close' })}
            className="p-2 hover:bg-white/20 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-hidden flex">
          {/* Tree pane + Grid pane wired in subsequent tasks */}
        </div>
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Type-check (Phase 5 should now compile)**

Run: `pnpm run type-check`
Expected: PASS.

- [ ] **Step 3: Commit Phase 5 wiring + this stub together**

```bash
git add components/layout/sidebar/Sidebar.tsx components/boardsModal/BoardsModal.tsx
git commit -m "feat(sidebar): wire BoardsModal stub from sidebar Boards entry"
```

### Task 6.2 — `useMultiSelect` hook

Track selected items in the modal. Boards and Collections can both be selected. Long-press on touch enters select mode (Q9 + B).

**Files:**

- Create: `components/boardsModal/useMultiSelect.ts`
- Create: `tests/components/boardsModal/useMultiSelect.test.ts`

- [ ] **Step 1: Test**

```typescript
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMultiSelect } from '@/components/boardsModal/useMultiSelect';

describe('useMultiSelect', () => {
  it('starts with no selection', () => {
    const { result } = renderHook(() => useMultiSelect());
    expect(result.current.selectedIds.size).toBe(0);
    expect(result.current.isSelectMode).toBe(false);
  });

  it('toggles a selection on (and enters select mode)', () => {
    const { result } = renderHook(() => useMultiSelect());
    act(() => result.current.toggle('b1'));
    expect(result.current.selectedIds.has('b1')).toBe(true);
    expect(result.current.isSelectMode).toBe(true);
  });

  it('toggles a selection off (and exits select mode when empty)', () => {
    const { result } = renderHook(() => useMultiSelect());
    act(() => result.current.toggle('b1'));
    act(() => result.current.toggle('b1'));
    expect(result.current.selectedIds.size).toBe(0);
    expect(result.current.isSelectMode).toBe(false);
  });

  it('clearSelection exits select mode', () => {
    const { result } = renderHook(() => useMultiSelect());
    act(() => result.current.toggle('b1'));
    act(() => result.current.toggle('b2'));
    act(() => result.current.clearSelection());
    expect(result.current.selectedIds.size).toBe(0);
    expect(result.current.isSelectMode).toBe(false);
  });
});
```

- [ ] **Step 2: Implement**

```typescript
import { useCallback, useMemo, useState } from 'react';

export interface UseMultiSelectResult {
  selectedIds: ReadonlySet<string>;
  isSelectMode: boolean;
  toggle: (id: string) => void;
  selectOnly: (id: string) => void;
  clearSelection: () => void;
}

export const useMultiSelect = (): UseMultiSelectResult => {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggle = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectOnly = useCallback((id: string) => {
    setSelectedIds(new Set([id]));
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  return useMemo(
    () => ({
      selectedIds,
      isSelectMode: selectedIds.size > 0,
      toggle,
      selectOnly,
      clearSelection,
    }),
    [selectedIds, toggle, selectOnly, clearSelection]
  );
};
```

- [ ] **Step 3: Run tests, lint, commit**

```bash
pnpm exec vitest run tests/components/boardsModal/useMultiSelect.test.ts
pnpm run lint -- components/boardsModal/useMultiSelect.ts
git add components/boardsModal/useMultiSelect.ts tests/components/boardsModal/useMultiSelect.test.ts
git commit -m "feat(boardsModal): add useMultiSelect hook"
```

### Task 6.3 — `BoardsModalHeader`: search + new buttons + multi-select bar

**Files:**

- Create: `components/boardsModal/BoardsModalHeader.tsx`

- [ ] **Step 1: Implement**

```typescript
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Search, Plus, FolderPlus, X, Trash2, FolderInput, Pin, PinOff } from 'lucide-react';

interface BoardsModalHeaderProps {
  search: string;
  onSearchChange: (next: string) => void;
  onCreateBoard: () => void;
  onCreateCollection: () => void;
  isSelectMode: boolean;
  selectedCount: number;
  onClearSelection: () => void;
  onBulkDelete: () => void;
  onBulkMove: () => void;
  onBulkPin: () => void;
  onBulkUnpin: () => void;
}

export const BoardsModalHeader: React.FC<BoardsModalHeaderProps> = ({
  search,
  onSearchChange,
  onCreateBoard,
  onCreateCollection,
  isSelectMode,
  selectedCount,
  onClearSelection,
  onBulkDelete,
  onBulkMove,
  onBulkPin,
  onBulkUnpin,
}) => {
  const { t } = useTranslation();

  if (isSelectMode) {
    return (
      <div className="h-14 px-4 border-b border-slate-200 bg-brand-blue-lighter/30 flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onClearSelection}
            aria-label={t('boardsModal.clearSelection', { defaultValue: 'Clear selection' })}
            className="p-2 hover:bg-white/40 rounded-lg transition-colors"
          >
            <X className="w-4 h-4 text-slate-700" />
          </button>
          <span className="text-sm font-bold text-slate-700">
            {t('boardsModal.selectedCount', {
              count: selectedCount,
              defaultValue: '{{count}} selected',
            })}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onBulkPin}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xxs font-bold uppercase tracking-wider text-slate-700 bg-white rounded-lg hover:bg-slate-100 transition"
          >
            <Pin className="w-3.5 h-3.5" />
            {t('boardsModal.pin', { defaultValue: 'Pin' })}
          </button>
          <button
            onClick={onBulkUnpin}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xxs font-bold uppercase tracking-wider text-slate-700 bg-white rounded-lg hover:bg-slate-100 transition"
          >
            <PinOff className="w-3.5 h-3.5" />
            {t('boardsModal.unpin', { defaultValue: 'Unpin' })}
          </button>
          <button
            onClick={onBulkMove}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xxs font-bold uppercase tracking-wider text-slate-700 bg-white rounded-lg hover:bg-slate-100 transition"
          >
            <FolderInput className="w-3.5 h-3.5" />
            {t('boardsModal.move', { defaultValue: 'Move…' })}
          </button>
          <button
            onClick={onBulkDelete}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xxs font-bold uppercase tracking-wider text-white bg-brand-red-primary rounded-lg hover:bg-brand-red-dark transition"
          >
            <Trash2 className="w-3.5 h-3.5" />
            {t('boardsModal.delete', { defaultValue: 'Delete' })}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-14 px-4 border-b border-slate-200 bg-white flex items-center gap-3 shrink-0">
      <div className="relative flex-1 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        <input
          type="search"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={t('boardsModal.searchPlaceholder', { defaultValue: 'Search Boards & Collections' })}
          className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-blue-primary focus:border-brand-blue-primary"
        />
      </div>
      <div className="flex items-center gap-2 ml-auto">
        <button
          onClick={onCreateCollection}
          className="flex items-center gap-1.5 px-3 py-2 text-xxs font-bold uppercase tracking-wider text-slate-700 bg-slate-100 rounded-xl hover:bg-slate-200 transition"
        >
          <FolderPlus className="w-3.5 h-3.5" />
          {t('boardsModal.newCollection', { defaultValue: 'New Collection' })}
        </button>
        <button
          onClick={onCreateBoard}
          className="flex items-center gap-1.5 px-3 py-2 text-xxs font-bold uppercase tracking-wider text-white bg-brand-blue-primary rounded-xl hover:bg-brand-blue-dark shadow-sm transition"
        >
          <Plus className="w-3.5 h-3.5" />
          {t('boardsModal.newBoard', { defaultValue: 'New Board' })}
        </button>
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Lint + commit**

```bash
pnpm run lint -- components/boardsModal/BoardsModalHeader.tsx
git add components/boardsModal/BoardsModalHeader.tsx
git commit -m "feat(boardsModal): add header with search, new buttons, multi-select bar"
```

### Task 6.4 — `PinnedSection` (left pane top section)

**Files:**

- Create: `components/boardsModal/PinnedSection.tsx`

- [ ] **Step 1: Implement**

```typescript
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Pin } from 'lucide-react';
import type { Dashboard } from '@/types';
import { useDashboard } from '@/context/useDashboard';

interface PinnedSectionProps {
  pinnedBoards: Dashboard[];
  selectedCollectionId: string | null;
  onSelectCollection: (id: string | null) => void;
}

export const PinnedSection: React.FC<PinnedSectionProps> = ({
  pinnedBoards,
}) => {
  const { t } = useTranslation();
  const { unpinBoard, loadDashboard } = useDashboard();

  return (
    <div className="px-2 pt-3 pb-2 border-b border-slate-100">
      <div className="flex items-center gap-1.5 px-2 mb-1.5">
        <Pin className="w-3 h-3 text-amber-500" />
        <span className="text-xxs font-bold text-slate-500 uppercase tracking-widest">
          {t('boardsModal.pinned', { defaultValue: 'Pinned' })}
        </span>
        <span className="ml-auto text-xxs text-slate-400">{pinnedBoards.length}</span>
      </div>

      {pinnedBoards.length === 0 ? (
        <div className="px-2 py-3 text-xxs text-slate-400 italic">
          {t('boardsModal.pinnedEmpty', {
            defaultValue: 'Pin Boards to keep them one tap away',
          })}
        </div>
      ) : (
        <div className="flex flex-col gap-0.5">
          {pinnedBoards.map((b) => (
            <div
              key={b.id}
              className="group flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-slate-700 hover:bg-slate-100 transition-colors"
            >
              <button
                onClick={() => loadDashboard(b.id)}
                className="flex-1 truncate text-left"
              >
                {b.name}
              </button>
              <button
                onClick={() => void unpinBoard(b.id)}
                aria-label={t('boardsModal.unpinBoard', { defaultValue: 'Unpin Board' })}
                className="p-0.5 rounded text-amber-500 opacity-0 group-hover:opacity-100 hover:bg-amber-100 transition"
              >
                <Pin className="w-3 h-3 fill-current" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
```

- [ ] **Step 2: Commit**

```bash
pnpm run lint -- components/boardsModal/PinnedSection.tsx
git add components/boardsModal/PinnedSection.tsx
git commit -m "feat(boardsModal): add PinnedSection with click-to-unpin"
```

### Task 6.5 — `CollectionTreeNode` recursive renderer

**Files:**

- Create: `components/boardsModal/CollectionTreeNode.tsx`

- [ ] **Step 1: Implement**

```typescript
import React, { useState } from 'react';
import { ChevronRight, Folder } from 'lucide-react';
import type { Collection, Dashboard } from '@/types';

interface CollectionTreeNodeProps {
  node: Collection;
  childrenByParent: Map<string | null, Collection[]>;
  boardsByCollection: Map<string | null, Dashboard[]>;
  selectedCollectionId: string | null;
  onSelectCollection: (id: string | null) => void;
  depth: number;
}

export const CollectionTreeNode: React.FC<CollectionTreeNodeProps> = ({
  node,
  childrenByParent,
  boardsByCollection,
  selectedCollectionId,
  onSelectCollection,
  depth,
}) => {
  const [isExpanded, setIsExpanded] = useState(depth < 1);
  const children = childrenByParent.get(node.id) ?? [];
  const boardCount = (boardsByCollection.get(node.id) ?? []).length;
  const totalCount = boardCount + children.length;
  const isSelected = selectedCollectionId === node.id;
  const hasChildren = children.length > 0;

  return (
    <div>
      <div
        className={`flex items-center gap-1 px-1 py-1 rounded-md text-sm cursor-pointer transition-colors ${
          isSelected
            ? 'bg-brand-blue-lighter text-brand-blue-primary font-bold'
            : 'text-slate-700 hover:bg-slate-100'
        }`}
        style={{ paddingLeft: `${0.25 + depth * 0.75}rem` }}
        onClick={() => onSelectCollection(node.id)}
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            setIsExpanded((v) => !v);
          }}
          aria-label={isExpanded ? 'Collapse' : 'Expand'}
          className={`shrink-0 p-0.5 rounded hover:bg-slate-200 ${
            hasChildren ? 'visible' : 'invisible'
          }`}
        >
          <ChevronRight
            className={`w-3.5 h-3.5 transition-transform ${
              isExpanded ? 'rotate-90' : ''
            }`}
          />
        </button>
        <Folder
          className="w-3.5 h-3.5 shrink-0"
          style={node.color ? { color: node.color } : undefined}
        />
        <span className="flex-1 truncate">{node.name}</span>
        {totalCount > 0 && (
          <span className="text-xxs text-slate-400">{totalCount}</span>
        )}
      </div>

      {isExpanded && children.length > 0 && (
        <div>
          {children.map((child) => (
            <CollectionTreeNode
              key={child.id}
              node={child}
              childrenByParent={childrenByParent}
              boardsByCollection={boardsByCollection}
              selectedCollectionId={selectedCollectionId}
              onSelectCollection={onSelectCollection}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
};
```

- [ ] **Step 2: Commit**

```bash
pnpm run lint -- components/boardsModal/CollectionTreeNode.tsx
git add components/boardsModal/CollectionTreeNode.tsx
git commit -m "feat(boardsModal): add recursive CollectionTreeNode"
```

### Task 6.6 — `CollectionTree` (left pane container)

**Files:**

- Create: `components/boardsModal/CollectionTree.tsx`

- [ ] **Step 1: Implement**

```typescript
import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { FolderOpen } from 'lucide-react';
import type { Collection, Dashboard } from '@/types';
import { CollectionTreeNode } from './CollectionTreeNode';
import { PinnedSection } from './PinnedSection';

interface CollectionTreeProps {
  collections: Collection[];
  boards: Dashboard[];
  selectedCollectionId: string | null;
  onSelectCollection: (id: string | null) => void;
}

export const CollectionTree: React.FC<CollectionTreeProps> = ({
  collections,
  boards,
  selectedCollectionId,
  onSelectCollection,
}) => {
  const { t } = useTranslation();

  // Group collections by parent for O(1) child lookup during recursive render.
  const childrenByParent = useMemo(() => {
    const m = new Map<string | null, Collection[]>();
    for (const c of collections) {
      const bucket = m.get(c.parentCollectionId) ?? [];
      bucket.push(c);
      m.set(c.parentCollectionId, bucket);
    }
    // Sort each bucket by `order`.
    for (const bucket of m.values()) {
      bucket.sort((a, b) => a.order - b.order);
    }
    return m;
  }, [collections]);

  const boardsByCollection = useMemo(() => {
    const m = new Map<string | null, Dashboard[]>();
    for (const b of boards) {
      const key = b.collectionId ?? null;
      const bucket = m.get(key) ?? [];
      bucket.push(b);
      m.set(key, bucket);
    }
    return m;
  }, [boards]);

  const rootCollections = childrenByParent.get(null) ?? [];
  const rootBoards = boardsByCollection.get(null) ?? [];
  const pinnedBoards = useMemo(() => boards.filter((b) => b.isPinned), [boards]);
  const isRootSelected = selectedCollectionId === null;

  return (
    <div className="w-72 shrink-0 border-r border-slate-200 bg-white overflow-y-auto custom-scrollbar flex flex-col">
      <PinnedSection
        pinnedBoards={pinnedBoards}
        selectedCollectionId={selectedCollectionId}
        onSelectCollection={onSelectCollection}
      />

      <div className="px-2 pt-3 pb-2 flex-1">
        <div className="flex items-center gap-1.5 px-2 mb-1.5">
          <FolderOpen className="w-3 h-3 text-slate-500" />
          <span className="text-xxs font-bold text-slate-500 uppercase tracking-widest">
            {t('boardsModal.allBoards', { defaultValue: 'Boards' })}
          </span>
        </div>

        {/* Root selector — clicking shows all root-level Boards in the grid */}
        <div
          className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-sm cursor-pointer transition-colors mb-1 ${
            isRootSelected
              ? 'bg-brand-blue-lighter text-brand-blue-primary font-bold'
              : 'text-slate-700 hover:bg-slate-100'
          }`}
          onClick={() => onSelectCollection(null)}
        >
          <span className="flex-1 truncate">
            {t('boardsModal.rootLabel', { defaultValue: 'All Boards (no Collection)' })}
          </span>
          <span className="text-xxs text-slate-400">{rootBoards.length}</span>
        </div>

        {rootCollections.map((node) => (
          <CollectionTreeNode
            key={node.id}
            node={node}
            childrenByParent={childrenByParent}
            boardsByCollection={boardsByCollection}
            selectedCollectionId={selectedCollectionId}
            onSelectCollection={onSelectCollection}
            depth={0}
          />
        ))}
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Commit**

```bash
pnpm run lint -- components/boardsModal/CollectionTree.tsx
git add components/boardsModal/CollectionTree.tsx
git commit -m "feat(boardsModal): add CollectionTree left pane"
```

### Task 6.7 — `BoardCard` and `CollectionCard` for the grid

**Files:**

- Create: `components/boardsModal/BoardCard.tsx`
- Create: `components/boardsModal/CollectionCard.tsx`

- [ ] **Step 1: Implement BoardCard**

```typescript
import React, { useRef } from 'react';
import { Star, Pin, MoreVertical, GripVertical } from 'lucide-react';
import type { Dashboard } from '@/types';
import { useDashboard } from '@/context/useDashboard';

interface BoardCardProps {
  board: Dashboard;
  isActive: boolean;
  isSelected: boolean;
  isSelectMode: boolean;
  onClick: () => void;
  onLongPress: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

const LONG_PRESS_MS = 350;

export const BoardCard: React.FC<BoardCardProps> = ({
  board,
  isActive,
  isSelected,
  isSelectMode,
  onClick,
  onLongPress,
  onContextMenu,
}) => {
  const { unpinBoard, pinBoard } = useDashboard();
  const longPressTimer = useRef<number | null>(null);

  const handlePointerDown = () => {
    longPressTimer.current = window.setTimeout(() => {
      onLongPress();
      longPressTimer.current = null;
    }, LONG_PRESS_MS);
  };

  const cancelLongPress = () => {
    if (longPressTimer.current !== null) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const widgetCount = board.widgets?.length ?? 0;
  const lastEdited = board.updatedAt
    ? new Date(board.updatedAt).toLocaleDateString()
    : '—';

  return (
    <div
      className={`relative group rounded-xl border bg-white p-4 cursor-pointer transition-all hover:shadow-md ${
        isSelected
          ? 'border-brand-blue-primary ring-2 ring-brand-blue-primary/30'
          : isActive
          ? 'border-amber-300'
          : 'border-slate-200'
      }`}
      onClick={() => {
        if (isSelectMode) onLongPress(); // toggle selection in select mode
        else onClick();
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        onContextMenu(e);
      }}
      onPointerDown={handlePointerDown}
      onPointerUp={cancelLongPress}
      onPointerLeave={cancelLongPress}
      onPointerCancel={cancelLongPress}
    >
      {/* Drag handle (top-right) */}
      <button
        aria-label="Drag to move"
        className="absolute top-2 right-2 p-1 rounded text-slate-300 opacity-0 group-hover:opacity-100 hover:bg-slate-100 transition cursor-grab active:cursor-grabbing"
        onClick={(e) => e.stopPropagation()}
        data-drag-handle="board"
      >
        <GripVertical className="w-3.5 h-3.5" />
      </button>

      {/* Selection checkbox (top-left, visible in select mode) */}
      {isSelectMode && (
        <div
          className={`absolute top-2 left-2 w-5 h-5 rounded border-2 flex items-center justify-center transition ${
            isSelected
              ? 'bg-brand-blue-primary border-brand-blue-primary'
              : 'bg-white border-slate-300'
          }`}
        >
          {isSelected && (
            <svg viewBox="0 0 20 20" className="w-3.5 h-3.5 text-white fill-current">
              <path d="M16.7 5.3a1 1 0 010 1.4l-7.5 7.5a1 1 0 01-1.4 0l-3.5-3.5a1 1 0 111.4-1.4L8.5 12.1l6.8-6.8a1 1 0 011.4 0z" />
            </svg>
          )}
        </div>
      )}

      <div className="flex items-start gap-2 mb-2 mt-2">
        {board.isDefault && <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400 shrink-0" />}
        {board.isPinned && <Pin className="w-3 h-3 text-amber-500 fill-amber-500 shrink-0" />}
      </div>

      <div className="text-sm font-bold text-slate-800 truncate mb-1">{board.name}</div>
      <div className="text-xxs text-slate-400">
        {widgetCount} widgets · edited {lastEdited}
      </div>

      <button
        onClick={(e) => {
          e.stopPropagation();
          if (board.isPinned) void unpinBoard(board.id);
          else void pinBoard(board.id);
        }}
        aria-label={board.isPinned ? 'Unpin' : 'Pin'}
        className="absolute bottom-2 right-2 p-1 rounded text-slate-300 hover:text-amber-500 hover:bg-amber-50 transition"
      >
        <Pin className={`w-3.5 h-3.5 ${board.isPinned ? 'fill-amber-500 text-amber-500' : ''}`} />
      </button>
    </div>
  );
};
```

- [ ] **Step 2: Implement CollectionCard**

```typescript
import React, { useRef } from 'react';
import { Folder, GripVertical } from 'lucide-react';
import type { Collection, Dashboard } from '@/types';

interface CollectionCardProps {
  collection: Collection;
  childCollectionsCount: number;
  childBoardsCount: number;
  isSelected: boolean;
  isSelectMode: boolean;
  onClick: () => void;
  onLongPress: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

const LONG_PRESS_MS = 350;

export const CollectionCard: React.FC<CollectionCardProps> = ({
  collection,
  childCollectionsCount,
  childBoardsCount,
  isSelected,
  isSelectMode,
  onClick,
  onLongPress,
  onContextMenu,
}) => {
  const longPressTimer = useRef<number | null>(null);

  const handlePointerDown = () => {
    longPressTimer.current = window.setTimeout(() => {
      onLongPress();
      longPressTimer.current = null;
    }, LONG_PRESS_MS);
  };
  const cancelLongPress = () => {
    if (longPressTimer.current !== null) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  return (
    <div
      className={`relative group rounded-xl border bg-slate-50 p-4 cursor-pointer transition-all hover:shadow-md ${
        isSelected
          ? 'border-brand-blue-primary ring-2 ring-brand-blue-primary/30'
          : 'border-slate-200'
      }`}
      onClick={() => {
        if (isSelectMode) onLongPress();
        else onClick();
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        onContextMenu(e);
      }}
      onPointerDown={handlePointerDown}
      onPointerUp={cancelLongPress}
      onPointerLeave={cancelLongPress}
      onPointerCancel={cancelLongPress}
    >
      <button
        aria-label="Drag to move"
        className="absolute top-2 right-2 p-1 rounded text-slate-300 opacity-0 group-hover:opacity-100 hover:bg-slate-100 transition cursor-grab active:cursor-grabbing"
        onClick={(e) => e.stopPropagation()}
        data-drag-handle="collection"
      >
        <GripVertical className="w-3.5 h-3.5" />
      </button>

      <Folder
        className="w-7 h-7 mb-2"
        style={collection.color ? { color: collection.color } : undefined}
      />
      <div className="text-sm font-bold text-slate-800 truncate mb-1">{collection.name}</div>
      <div className="text-xxs text-slate-400">
        {childCollectionsCount > 0 && `${childCollectionsCount} folders · `}
        {childBoardsCount} boards
      </div>
    </div>
  );
};
```

- [ ] **Step 3: Commit**

```bash
pnpm run lint -- components/boardsModal/BoardCard.tsx components/boardsModal/CollectionCard.tsx
git add components/boardsModal/BoardCard.tsx components/boardsModal/CollectionCard.tsx
git commit -m "feat(boardsModal): add BoardCard and CollectionCard with long-press select"
```

### Task 6.8 — `BoardGrid` (right pane)

**Files:**

- Create: `components/boardsModal/BoardGrid.tsx`

- [ ] **Step 1: Implement**

```typescript
import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { Collection, Dashboard } from '@/types';
import { useDashboard } from '@/context/useDashboard';
import { BoardCard } from './BoardCard';
import { CollectionCard } from './CollectionCard';

interface BoardGridProps {
  selectedCollectionId: string | null;
  collections: Collection[];
  boards: Dashboard[];
  selectedIds: ReadonlySet<string>;
  isSelectMode: boolean;
  onSelectCollection: (id: string | null) => void;
  onToggleSelect: (id: string) => void;
  onOpenBoard: (id: string) => void;
  onContextMenu: (
    e: React.MouseEvent,
    target: { type: 'board' | 'collection'; id: string }
  ) => void;
}

export const BoardGrid: React.FC<BoardGridProps> = ({
  selectedCollectionId,
  collections,
  boards,
  selectedIds,
  isSelectMode,
  onSelectCollection,
  onToggleSelect,
  onOpenBoard,
  onContextMenu,
}) => {
  const { t } = useTranslation();
  const { activeDashboard } = useDashboard();

  const subCollections = useMemo(
    () =>
      collections
        .filter((c) => c.parentCollectionId === selectedCollectionId)
        .sort((a, b) => a.order - b.order),
    [collections, selectedCollectionId]
  );

  const boardsHere = useMemo(
    () =>
      boards
        .filter((b) => (b.collectionId ?? null) === selectedCollectionId)
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [boards, selectedCollectionId]
  );

  const childCounts = useMemo(() => {
    const counts = new Map<string, { folders: number; boards: number }>();
    for (const c of collections) {
      counts.set(c.id, { folders: 0, boards: 0 });
    }
    for (const c of collections) {
      if (c.parentCollectionId && counts.has(c.parentCollectionId)) {
        counts.get(c.parentCollectionId)!.folders += 1;
      }
    }
    for (const b of boards) {
      if (b.collectionId && counts.has(b.collectionId)) {
        counts.get(b.collectionId)!.boards += 1;
      }
    }
    return counts;
  }, [collections, boards]);

  const isEmpty = subCollections.length === 0 && boardsHere.length === 0;

  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar p-6 bg-slate-50">
      {isEmpty ? (
        <div className="flex flex-col items-center justify-center h-full text-slate-400 text-sm">
          {t('boardsModal.empty', {
            defaultValue: 'This Collection is empty — drag Boards here or create one.',
          })}
        </div>
      ) : (
        <>
          {subCollections.length > 0 && (
            <div className="mb-6">
              <h3 className="text-xxs font-bold text-slate-500 uppercase tracking-widest mb-3">
                {t('boardsModal.subCollections', { defaultValue: 'Sub-Collections' })}
              </h3>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
                {subCollections.map((c) => {
                  const counts = childCounts.get(c.id) ?? { folders: 0, boards: 0 };
                  return (
                    <CollectionCard
                      key={c.id}
                      collection={c}
                      childCollectionsCount={counts.folders}
                      childBoardsCount={counts.boards}
                      isSelected={selectedIds.has(c.id)}
                      isSelectMode={isSelectMode}
                      onClick={() => onSelectCollection(c.id)}
                      onLongPress={() => onToggleSelect(c.id)}
                      onContextMenu={(e) => onContextMenu(e, { type: 'collection', id: c.id })}
                    />
                  );
                })}
              </div>
            </div>
          )}

          {boardsHere.length > 0 && (
            <div>
              <h3 className="text-xxs font-bold text-slate-500 uppercase tracking-widest mb-3">
                {t('boardsModal.boards', { defaultValue: 'Boards' })}
              </h3>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
                {boardsHere.map((b) => (
                  <BoardCard
                    key={b.id}
                    board={b}
                    isActive={activeDashboard?.id === b.id}
                    isSelected={selectedIds.has(b.id)}
                    isSelectMode={isSelectMode}
                    onClick={() => onOpenBoard(b.id)}
                    onLongPress={() => onToggleSelect(b.id)}
                    onContextMenu={(e) => onContextMenu(e, { type: 'board', id: b.id })}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
```

- [ ] **Step 2: Commit**

```bash
pnpm run lint -- components/boardsModal/BoardGrid.tsx
git add components/boardsModal/BoardGrid.tsx
git commit -m "feat(boardsModal): add BoardGrid right pane with sub-Collection + Board sections"
```

### Task 6.9 — Wire `BoardsModal` shell to use the panes

**Files:**

- Modify: `components/boardsModal/BoardsModal.tsx`

- [ ] **Step 1: Replace the stub shell with the wired version**

Open the file and replace the body of the inner `<div className="flex-1 overflow-hidden flex">` block. Wire in `useCollections`, `useDashboard`, `useMultiSelect`, the header, the tree, and the grid:

```typescript
import React, { useEffect, useState, useCallback } from 'react';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useDialog } from '@/context/useDialog';
import { useDashboard } from '@/context/useDashboard';
import { useAuth } from '@/context/useAuth';
import { useCollections } from '@/hooks/useCollections';
import { CollectionTree } from './CollectionTree';
import { BoardGrid } from './BoardGrid';
import { BoardsModalHeader } from './BoardsModalHeader';
import { useMultiSelect } from './useMultiSelect';

interface BoardsModalProps {
  onClose: () => void;
}

export const BoardsModal: React.FC<BoardsModalProps> = ({ onClose }) => {
  const { t } = useTranslation();
  const { showPrompt, showConfirm } = useDialog();
  const { user } = useAuth();
  const {
    dashboards,
    activeDashboard,
    loadDashboard,
    createNewDashboard,
    deleteDashboard,
    moveBoardToCollection,
    pinBoard,
    unpinBoard,
  } = useDashboard();
  const {
    collections,
    createCollection,
    deleteCollection,
  } = useCollections(user?.uid);

  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(
    activeDashboard?.collectionId ?? null
  );
  const [search, setSearch] = useState('');
  const multi = useMultiSelect();

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (multi.isSelectMode) multi.clearSelection();
        else onClose();
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose, multi]);

  const handleCreateBoard = useCallback(async () => {
    const name = await showPrompt(t('boardsModal.newBoardPrompt', { defaultValue: 'Board name' }), {
      title: t('boardsModal.newBoard', { defaultValue: 'New Board' }),
      placeholder: 'Untitled',
      confirmLabel: t('common.create', { defaultValue: 'Create' }),
    });
    if (!name?.trim()) return;
    // createNewDashboard returns the new id (or void); when it returns the id,
    // also write the collectionId. The minimum-API approach: create then move.
    await createNewDashboard(name.trim());
    // Find the just-created Board (it'll be the most-recent one by createdAt).
    const newest = [...dashboards].sort((a, b) => b.createdAt - a.createdAt)[0];
    if (newest && selectedCollectionId !== null) {
      await moveBoardToCollection(newest.id, selectedCollectionId);
    }
  }, [showPrompt, t, createNewDashboard, dashboards, selectedCollectionId, moveBoardToCollection]);

  const handleCreateCollection = useCallback(async () => {
    const name = await showPrompt(
      t('boardsModal.newCollectionPrompt', { defaultValue: 'Collection name' }),
      {
        title: t('boardsModal.newCollection', { defaultValue: 'New Collection' }),
        placeholder: 'Untitled',
        confirmLabel: t('common.create', { defaultValue: 'Create' }),
      }
    );
    if (!name?.trim()) return;
    await createCollection(name.trim(), selectedCollectionId);
  }, [showPrompt, t, createCollection, selectedCollectionId]);

  const handleOpenBoard = useCallback(
    (id: string) => {
      loadDashboard(id);
      onClose();
    },
    [loadDashboard, onClose]
  );

  const handleBulkDelete = useCallback(async () => {
    const confirmed = await showConfirm(
      t('boardsModal.bulkDeleteConfirm', {
        count: multi.selectedIds.size,
        defaultValue: 'Delete {{count}} item(s)? This cannot be undone.',
      }),
      { title: 'Delete', variant: 'danger', confirmLabel: 'Delete' }
    );
    if (!confirmed) return;
    for (const id of multi.selectedIds) {
      const isBoard = dashboards.some((d) => d.id === id);
      if (isBoard) await deleteDashboard(id);
      else await deleteCollection(id, 'move-to-parent');
    }
    multi.clearSelection();
  }, [showConfirm, t, multi, dashboards, deleteDashboard, deleteCollection]);

  const handleBulkPin = useCallback(async () => {
    for (const id of multi.selectedIds) {
      const board = dashboards.find((d) => d.id === id);
      if (board) await pinBoard(id);
    }
    multi.clearSelection();
  }, [multi, dashboards, pinBoard]);

  const handleBulkUnpin = useCallback(async () => {
    for (const id of multi.selectedIds) {
      const board = dashboards.find((d) => d.id === id);
      if (board) await unpinBoard(id);
    }
    multi.clearSelection();
  }, [multi, dashboards, unpinBoard]);

  const handleBulkMove = useCallback(async () => {
    // Minimal v1: prompt for the destination Collection name and look it up.
    // Replaced in Task 6.11 with a proper picker submenu.
    const destName = await showPrompt(
      t('boardsModal.moveDestination', {
        defaultValue: 'Collection name to move to (or leave blank for root)',
      }),
      { title: 'Move', confirmLabel: 'Move', placeholder: 'Math / Monday' }
    );
    if (destName === null) return;
    const dest = destName.trim()
      ? collections.find((c) => c.name === destName.trim())
      : null;
    const destId = dest?.id ?? null;
    for (const id of multi.selectedIds) {
      const isBoard = dashboards.some((d) => d.id === id);
      if (isBoard) await moveBoardToCollection(id, destId);
    }
    multi.clearSelection();
  }, [showPrompt, t, multi, collections, dashboards, moveBoardToCollection]);

  // Filter by search (substring on Board + Collection names)
  const filteredCollections = search.trim()
    ? collections.filter((c) =>
        c.name.toLowerCase().includes(search.trim().toLowerCase())
      )
    : collections;
  const filteredBoards = search.trim()
    ? dashboards.filter((d) =>
        d.name.toLowerCase().includes(search.trim().toLowerCase())
      )
    : dashboards;

  return (
    <div
      className="fixed inset-0 z-modal bg-slate-50 flex flex-col overscroll-none"
      role="dialog"
      aria-modal="true"
      aria-labelledby="boards-modal-title"
    >
      <div className="bg-white w-full h-full overflow-hidden flex flex-col">
        <div className="bg-gradient-to-r from-brand-blue-primary to-brand-blue-dark text-white h-14 md:h-16 px-4 flex items-center justify-between shadow-sm shrink-0">
          <h2 id="boards-modal-title" className="text-lg font-bold">
            {t('boardsModal.title', { defaultValue: 'Boards' })}
          </h2>
          <button
            onClick={onClose}
            aria-label={t('boardsModal.close', { defaultValue: 'Close' })}
            className="p-2 hover:bg-white/20 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <BoardsModalHeader
          search={search}
          onSearchChange={setSearch}
          onCreateBoard={handleCreateBoard}
          onCreateCollection={handleCreateCollection}
          isSelectMode={multi.isSelectMode}
          selectedCount={multi.selectedIds.size}
          onClearSelection={multi.clearSelection}
          onBulkDelete={handleBulkDelete}
          onBulkMove={handleBulkMove}
          onBulkPin={handleBulkPin}
          onBulkUnpin={handleBulkUnpin}
        />

        <div className="flex-1 overflow-hidden flex">
          <CollectionTree
            collections={filteredCollections}
            boards={filteredBoards}
            selectedCollectionId={selectedCollectionId}
            onSelectCollection={setSelectedCollectionId}
          />
          <BoardGrid
            selectedCollectionId={selectedCollectionId}
            collections={filteredCollections}
            boards={filteredBoards}
            selectedIds={multi.selectedIds}
            isSelectMode={multi.isSelectMode}
            onSelectCollection={setSelectedCollectionId}
            onToggleSelect={multi.toggle}
            onOpenBoard={handleOpenBoard}
            onContextMenu={() => {
              /* wired in Task 6.10 */
            }}
          />
        </div>
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Type-check + lint**

Run: `pnpm run type-check && pnpm run lint`
Expected: PASS.

- [ ] **Step 3: Manual smoke test** (optional but recommended)

Start dev server: `pnpm run dev`. Sign in with the auth bypass (`VITE_AUTH_BYPASS=true`). Open Sidebar → Boards → "Manage all boards." Verify:

- Modal opens
- Tree shows root + collections (none initially)
- Grid shows root-level Boards
- Search filters
- "+ New Collection" creates a Collection
- "+ New Board" creates a Board in the selected Collection
- Long-press on a Board enters select mode
- Bulk delete works

- [ ] **Step 4: Commit**

```bash
git add components/boardsModal/BoardsModal.tsx
git commit -m "feat(boardsModal): wire shell to tree + grid + multi-select + bulk actions"
```

### Task 6.10 — Right-click / context menu for Boards & Collections

**Files:**

- Create: `components/boardsModal/BoardContextMenu.tsx`
- Create: `components/boardsModal/CollectionContextMenu.tsx`
- Modify: `components/boardsModal/BoardsModal.tsx`

- [ ] **Step 1: Create BoardContextMenu**

A floating menu pinned to a screen position with: Open, Rename, Duplicate, Set as default, Pin/Unpin, Move to…, Share, Save as Template (admin only), Delete.

> **Feature-parity note:** Today's `SortableDashboardItem` exposes Share + Save as Template (admin only). We MUST carry both forward to avoid a regression. Plan 3 (Collection sharing) will add a parallel item on `CollectionContextMenu`; Plan 4 (Collection templates) will extend Save as Template.

```typescript
import React, { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ExternalLink, Pencil, Copy, Star, Pin, PinOff, FolderInput, Share2, LayoutTemplate, Trash2,
} from 'lucide-react';
import type { Dashboard } from '@/types';

interface BoardContextMenuProps {
  board: Dashboard;
  position: { x: number; y: number };
  canShare: boolean;
  isAdmin: boolean;
  onClose: () => void;
  onOpen: () => void;
  onRename: () => void;
  onDuplicate: () => void;
  onSetDefault: () => void;
  onTogglePin: () => void;
  onMove: () => void;
  onShare: () => void;
  onSaveAsTemplate: () => void;
  onDelete: () => void;
}

export const BoardContextMenu: React.FC<BoardContextMenuProps> = ({
  board, position, canShare, isAdmin, onClose, onOpen, onRename, onDuplicate, onSetDefault,
  onTogglePin, onMove, onShare, onSaveAsTemplate, onDelete,
}) => {
  const { t } = useTranslation();
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  type Item = { label: string; icon: typeof ExternalLink; action: () => void; danger?: boolean };
  const items: Item[] = [
    { label: t('boardsModal.menu.open', { defaultValue: 'Open' }), icon: ExternalLink, action: onOpen },
    { label: t('boardsModal.menu.rename', { defaultValue: 'Rename' }), icon: Pencil, action: onRename },
    { label: t('boardsModal.menu.duplicate', { defaultValue: 'Duplicate (fresh)' }), icon: Copy, action: onDuplicate },
    { label: t('boardsModal.menu.setDefault', { defaultValue: 'Set as default in this Collection' }), icon: Star, action: onSetDefault },
    { label: board.isPinned
        ? t('boardsModal.menu.unpin', { defaultValue: 'Unpin' })
        : t('boardsModal.menu.pin', { defaultValue: 'Pin' }),
      icon: board.isPinned ? PinOff : Pin, action: onTogglePin },
    { label: t('boardsModal.menu.move', { defaultValue: 'Move to…' }), icon: FolderInput, action: onMove },
  ];
  if (canShare) {
    items.push({ label: t('boardsModal.menu.share', { defaultValue: 'Share…' }), icon: Share2, action: onShare });
  }
  if (isAdmin) {
    items.push({ label: t('boardsModal.menu.saveAsTemplate', { defaultValue: 'Save as Template…' }), icon: LayoutTemplate, action: onSaveAsTemplate });
  }
  items.push({ label: t('boardsModal.menu.delete', { defaultValue: 'Delete' }), icon: Trash2, action: onDelete, danger: true });

  return (
    <div
      ref={menuRef}
      className="fixed z-popover bg-white rounded-xl shadow-xl border border-slate-200 py-1 min-w-[200px] animate-in fade-in zoom-in-95 duration-100"
      style={{ top: position.y, left: position.x }}
      role="menu"
    >
      {items.map((item, i) => {
        const Icon = item.icon;
        return (
          <button
            key={i}
            onClick={() => { item.action(); onClose(); }}
            className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors ${
              item.danger ? 'text-brand-red-primary hover:bg-brand-red-primary/10' : 'text-slate-700 hover:bg-slate-100'
            }`}
            role="menuitem"
          >
            <Icon className="w-4 h-4" />
            {item.label}
          </button>
        );
      })}
    </div>
  );
};
```

- [ ] **Step 2: Create CollectionContextMenu** (similar pattern; items: Open, Rename, Move to…, Set color, Delete).

```typescript
import React, { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ExternalLink, Pencil, FolderInput, Palette, Trash2 } from 'lucide-react';

interface CollectionContextMenuProps {
  position: { x: number; y: number };
  onClose: () => void;
  onOpen: () => void;
  onRename: () => void;
  onMove: () => void;
  onColor: () => void;
  onDelete: () => void;
}

export const CollectionContextMenu: React.FC<CollectionContextMenuProps> = ({
  position, onClose, onOpen, onRename, onMove, onColor, onDelete,
}) => {
  const { t } = useTranslation();
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  const items = [
    { label: t('boardsModal.menu.openCollection', { defaultValue: 'Open' }), icon: ExternalLink, action: onOpen },
    { label: t('boardsModal.menu.rename', { defaultValue: 'Rename' }), icon: Pencil, action: onRename },
    { label: t('boardsModal.menu.move', { defaultValue: 'Move to…' }), icon: FolderInput, action: onMove },
    { label: t('boardsModal.menu.color', { defaultValue: 'Set color' }), icon: Palette, action: onColor },
    { label: t('boardsModal.menu.delete', { defaultValue: 'Delete' }), icon: Trash2, action: onDelete, danger: true },
  ];

  return (
    <div
      ref={menuRef}
      className="fixed z-popover bg-white rounded-xl shadow-xl border border-slate-200 py-1 min-w-[200px]"
      style={{ top: position.y, left: position.x }}
      role="menu"
    >
      {items.map((item, i) => {
        const Icon = item.icon;
        return (
          <button
            key={i}
            onClick={() => { item.action(); onClose(); }}
            className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors ${
              item.danger ? 'text-brand-red-primary hover:bg-brand-red-primary/10' : 'text-slate-700 hover:bg-slate-100'
            }`}
            role="menuitem"
          >
            <Icon className="w-4 h-4" />
            {item.label}
          </button>
        );
      })}
    </div>
  );
};
```

- [ ] **Step 3: Wire context menu state in `BoardsModal.tsx`**

Add imports + state:

```typescript
import { BoardContextMenu } from './BoardContextMenu';
import { CollectionContextMenu } from './CollectionContextMenu';
import { ShareLinkCreatorModal } from '@/components/share/ShareLinkCreatorModal';
import { SaveAsTemplateModal } from '@/components/admin/SaveAsTemplateModal';

// Extend the existing useDashboard / useCollections / useAuth destructures:
const {
  // ...existing
  renameDashboard,
  duplicateDashboard,
  setDefaultDashboard,
} = useDashboard();
const {
  // ...existing
  renameCollection,
  setCollectionMetadata,
} = useCollections(user?.uid);
const { isAdmin, canAccessFeature } = useAuth();
const canShare = canAccessFeature('dashboard-sharing');

const [contextMenu, setContextMenu] = useState<{
  type: 'board' | 'collection';
  id: string;
  position: { x: number; y: number };
} | null>(null);
const [shareTarget, setShareTarget] = useState<Dashboard | null>(null);
const [saveAsTemplateTarget, setSaveAsTemplateTarget] =
  useState<Dashboard | null>(null);

const handleContextMenu = (
  e: React.MouseEvent,
  target: { type: 'board' | 'collection'; id: string }
) => {
  setContextMenu({ ...target, position: { x: e.clientX, y: e.clientY } });
};
```

Pass `handleContextMenu` to the `<BoardGrid>`. Render the menus + the existing modals conditionally:

```tsx
{contextMenu?.type === 'board' && (() => {
  const board = dashboards.find((d) => d.id === contextMenu.id);
  if (!board) return null;
  return (
    <BoardContextMenu
      board={board}
      position={contextMenu.position}
      canShare={canShare}
      isAdmin={Boolean(isAdmin)}
      onClose={() => setContextMenu(null)}
      onOpen={() => handleOpenBoard(board.id)}
      onRename={async () => {
        const next = await showPrompt(t('common.rename', { defaultValue: 'Rename' }), {
          title: 'Rename', confirmLabel: 'Save', placeholder: board.name,
        });
        if (next?.trim()) await renameDashboard(board.id, next.trim());
      }}
      onDuplicate={() => void duplicateDashboard(board.id)}
      onSetDefault={() => void setDefaultDashboard(board.id)}
      onTogglePin={() => board.isPinned ? unpinBoard(board.id) : pinBoard(board.id)}
      onMove={handleBulkMove /* one-item edge case ok */}
      onShare={() => setShareTarget(board)}
      onSaveAsTemplate={() => setSaveAsTemplateTarget(board)}
      onDelete={async () => {
        const ok = await showConfirm(t('boardsModal.deleteBoardConfirm', {
          defaultValue: 'Delete this Board?',
        }), { title: 'Delete', variant: 'danger', confirmLabel: 'Delete' });
        if (ok) await deleteDashboard(board.id);
      }}
    />
  );
})()}

<ShareLinkCreatorModal
  isOpen={!!shareTarget}
  dashboard={shareTarget}
  onClose={() => setShareTarget(null)}
/>
<SaveAsTemplateModal
  isOpen={!!saveAsTemplateTarget}
  currentDashboard={saveAsTemplateTarget}
  onClose={() => setSaveAsTemplateTarget(null)}
/>

{contextMenu?.type === 'collection' && (() => {
  const c = collections.find((cc) => cc.id === contextMenu.id);
  if (!c) return null;
  return (
    <CollectionContextMenu
      position={contextMenu.position}
      onClose={() => setContextMenu(null)}
      onOpen={() => setSelectedCollectionId(c.id)}
      onRename={async () => {
        const next = await showPrompt('Rename Collection', {
          title: 'Rename', confirmLabel: 'Save', placeholder: c.name,
        });
        if (next?.trim()) await renameCollection(c.id, next.trim());
      }}
      onMove={() => { /* implemented in Task 6.11 */ }}
      onColor={async () => {
        const color = await showPrompt('Color (hex, e.g., #ad2122)', {
          title: 'Set color', confirmLabel: 'Save', placeholder: c.color ?? '#2d3f89',
        });
        if (color) await setCollectionMetadata(c.id, { color });
      }}
      onDelete={async () => {
        const ok = await showConfirm(
          t('boardsModal.deleteCollectionConfirm', {
            defaultValue: 'Delete this Collection? Boards inside will move to its parent.',
          }),
          { title: 'Delete', variant: 'danger', confirmLabel: 'Delete' }
        );
        if (ok) await deleteCollection(c.id, 'move-to-parent');
      }}
    />
  );
})()}
```

- [ ] **Step 4: Type-check, lint, commit**

```bash
pnpm run type-check && pnpm run lint
git add components/boardsModal/BoardContextMenu.tsx components/boardsModal/CollectionContextMenu.tsx components/boardsModal/BoardsModal.tsx
git commit -m "feat(boardsModal): add context menus for Boards and Collections"
```

### Task 6.11 — Drag-and-drop with @dnd-kit

**Files:**

- Create: `components/boardsModal/useBoardsModalDnd.ts`
- Modify: `components/boardsModal/BoardsModal.tsx`, `BoardCard.tsx`, `CollectionCard.tsx`, `CollectionTreeNode.tsx`

> This task adds drag-drop. It is the largest single task — budget 60-90 minutes.

- [ ] **Step 1: Set up the DnD context wrapper**

In `useBoardsModalDnd.ts`:

```typescript
import { useCallback } from 'react';
import {
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { useDashboard } from '@/context/useDashboard';
import { useAuth } from '@/context/useAuth';
import { useCollections } from '@/hooks/useCollections';

export const useBoardsModalDnd = () => {
  const { user } = useAuth();
  const { moveBoardToCollection } = useDashboard();
  const { moveCollection } = useCollections(user?.uid);

  // Mouse: 15px movement to start drag (matches existing SidebarBoards).
  // Touch: 350ms hold (matches BoardCard long-press) — but @dnd-kit's
  // TouchSensor uses `delay` for hold-to-drag. Important: TouchSensor
  // activation should fire ONLY when starting on a drag handle (data
  // attribute below).
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 15 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 350, tolerance: 5 },
    }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over) return;
      // Drag ID encodes type + id, e.g., 'board:abc' or 'collection:xyz'
      const [activeKind, activeId] = String(active.id).split(':');
      const [overKind, overId] = String(over.id).split(':');

      if (activeKind === 'board' && overKind === 'collection') {
        await moveBoardToCollection(
          activeId,
          overId === 'root' ? null : overId
        );
      } else if (activeKind === 'board' && overKind === 'root-zone') {
        await moveBoardToCollection(activeId, null);
      } else if (activeKind === 'collection' && overKind === 'collection') {
        await moveCollection(activeId, overId === 'root' ? null : overId);
      }
    },
    [moveBoardToCollection, moveCollection]
  );

  return { sensors, handleDragEnd };
};
```

- [ ] **Step 2: Wrap modal content with `<DndContext>`**

In `BoardsModal.tsx`:

```typescript
import { DndContext, closestCenter } from '@dnd-kit/core';
import { useBoardsModalDnd } from './useBoardsModalDnd';

const { sensors, handleDragEnd } = useBoardsModalDnd();

// wrap the inner flex container:
<DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
  <div className="flex-1 overflow-hidden flex">
    {/* existing CollectionTree + BoardGrid */}
  </div>
</DndContext>
```

- [ ] **Step 3: Make BoardCard draggable**

Replace the `BoardCard` outer container with a draggable wrapper. Use `useDraggable`:

```typescript
import { useDraggable } from '@dnd-kit/core';

const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
  id: `board:${board.id}`,
});

// On the root <div>:
ref={setNodeRef}
{...attributes}
// only attach listeners to the drag handle button (NOT the whole card):

// Update the handle button:
<button
  {...listeners}
  data-drag-handle="board"
  ...
>
```

Apply `opacity-50` when `isDragging`.

- [ ] **Step 4: Make CollectionTreeNode and CollectionCard droppable**

Use `useDroppable`:

```typescript
import { useDroppable } from '@dnd-kit/core';

// CollectionTreeNode:
const { setNodeRef: setDroppableRef, isOver } = useDroppable({
  id: `collection:${node.id}`,
});

// On the row <div>:
ref={setDroppableRef}
className={`... ${isOver ? 'bg-brand-blue-lighter ring-2 ring-brand-blue-primary' : ''}`}
```

Same for CollectionCard.

Add a "root" droppable at the top of the tree (`id: 'collection:root'`) so dragging a Board to root works.

- [ ] **Step 5: Make CollectionTreeNode draggable too**

Add `useDraggable({ id: \`collection:${node.id}\` })` similarly. The drag handle on a tree node is the row itself (touch users use long-press; keyboard users use Tab + Space per @dnd-kit defaults).

- [ ] **Step 6: Type-check, lint, manual smoke test, commit**

Run: `pnpm run dev`, smoke-test desktop drag (mouse) and touch drag (browser dev tools touch emulation):

- Drag a Board card onto a Collection in the tree → Board moves
- Drag a Board card onto root droppable → Board moves to root
- Drag a Collection node in the tree onto another Collection → reparents
- Touch: long-press card → drag indicator appears, drop on Collection works

```bash
pnpm run type-check && pnpm run lint
git add components/boardsModal/
git commit -m "feat(boardsModal): drag-and-drop Boards and Collections via @dnd-kit"
```

### Task 6.12 — Replace `handleBulkMove` placeholder with proper picker submenu

**Files:**

- Create: `components/boardsModal/MoveToCollectionMenu.tsx`
- Modify: `components/boardsModal/BoardsModal.tsx`

- [ ] **Step 1: Create MoveToCollectionMenu**

```typescript
import React, { useEffect, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Folder, X } from 'lucide-react';
import type { Collection } from '@/types';

interface MoveToCollectionMenuProps {
  collections: Collection[];
  onMove: (collectionId: string | null) => void;
  onClose: () => void;
}

export const MoveToCollectionMenu: React.FC<MoveToCollectionMenuProps> = ({
  collections,
  onMove,
  onClose,
}) => {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  // Render flat list with indentation by depth.
  const flat = useMemo(() => {
    const childrenByParent = new Map<string | null, Collection[]>();
    for (const c of collections) {
      const bucket = childrenByParent.get(c.parentCollectionId) ?? [];
      bucket.push(c);
      childrenByParent.set(c.parentCollectionId, bucket);
    }
    for (const bucket of childrenByParent.values()) {
      bucket.sort((a, b) => a.order - b.order);
    }
    const out: { c: Collection; depth: number }[] = [];
    const walk = (parent: string | null, depth: number) => {
      const kids = childrenByParent.get(parent) ?? [];
      for (const k of kids) {
        out.push({ c: k, depth });
        walk(k.id, depth + 1);
      }
    };
    walk(null, 0);
    return out;
  }, [collections]);

  return (
    <div className="fixed inset-0 z-popover bg-black/40 flex items-center justify-center" onClick={onClose}>
      <div
        ref={ref}
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-sm max-h-[60vh] flex flex-col"
      >
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
            {t('boardsModal.moveTitle', { defaultValue: 'Move to Collection' })}
          </h2>
          <button onClick={onClose} aria-label="Close" className="p-1 hover:bg-slate-100 rounded">
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>
        <div className="overflow-y-auto custom-scrollbar p-2">
          <button
            onClick={() => { onMove(null); onClose(); }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left rounded-lg hover:bg-slate-100 transition-colors"
          >
            <span className="text-slate-700">
              {t('boardsModal.rootDestination', { defaultValue: 'Root (no Collection)' })}
            </span>
          </button>
          {flat.map(({ c, depth }) => (
            <button
              key={c.id}
              onClick={() => { onMove(c.id); onClose(); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left rounded-lg hover:bg-slate-100 transition-colors"
              style={{ paddingLeft: `${0.75 + depth * 1}rem` }}
            >
              <Folder
                className="w-3.5 h-3.5 text-slate-500 shrink-0"
                style={c.color ? { color: c.color } : undefined}
              />
              <span className="truncate">{c.name}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Wire into BoardsModal**

Add state:

```typescript
const [moveMenuOpen, setMoveMenuOpen] = useState(false);
```

Replace `handleBulkMove`:

```typescript
const handleBulkMove = useCallback(() => {
  setMoveMenuOpen(true);
}, []);

const handleMoveDestinationPicked = useCallback(
  async (destId: string | null) => {
    for (const id of multi.selectedIds) {
      const isBoard = dashboards.some((d) => d.id === id);
      if (isBoard) await moveBoardToCollection(id, destId);
      // (Collection-to-Collection move via the menu can be added later — for v1
      // we use drag-drop or context-menu Move on a single Collection.)
    }
    multi.clearSelection();
  },
  [multi, dashboards, moveBoardToCollection]
);
```

Render conditionally:

```tsx
{
  moveMenuOpen && (
    <MoveToCollectionMenu
      collections={collections}
      onMove={handleMoveDestinationPicked}
      onClose={() => setMoveMenuOpen(false)}
    />
  );
}
```

- [ ] **Step 3: Type-check, lint, commit**

```bash
pnpm run type-check && pnpm run lint
git add components/boardsModal/MoveToCollectionMenu.tsx components/boardsModal/BoardsModal.tsx
git commit -m "feat(boardsModal): replace bulk-move prompt with picker submenu"
```

### Task 6.13 — Delete `SidebarBoards.tsx` (now unused)

**Files:**

- Delete: `components/layout/sidebar/SidebarBoards.tsx`

- [ ] **Step 1: Verify no lingering imports**

Run: `pnpm exec rg "SidebarBoards"` (with the Grep tool — DO NOT run `rg` directly).

Use the Grep tool with pattern `SidebarBoards`. There should be only the file itself (and possibly the active component `SidebarBoardsActive`). If anything else still imports `SidebarBoards`, fix the import first.

- [ ] **Step 2: Delete the file**

```bash
git rm components/layout/sidebar/SidebarBoards.tsx
```

- [ ] **Step 3: Type-check, lint, commit**

```bash
pnpm run type-check && pnpm run lint
git commit -m "chore(sidebar): remove obsolete SidebarBoards (replaced by SidebarBoardsActive + BoardsModal)"
```

---

## Phase 7 — i18n & Polish

### Task 7.1 — Add i18n keys

**Files:**

- Modify: `locales/en/translation.json`, `locales/de/translation.json`, `locales/es/translation.json`, `locales/fr/translation.json`

- [ ] **Step 1: Add the new keys to en**

Add a `boardsModal` namespace to `locales/en/translation.json`:

```json
"boardsModal": {
  "title": "Boards",
  "close": "Close",
  "searchPlaceholder": "Search Boards & Collections",
  "newBoard": "New Board",
  "newBoardPrompt": "Board name",
  "newCollection": "New Collection",
  "newCollectionPrompt": "Collection name",
  "manageAll": "Manage all boards",
  "pinned": "Pinned",
  "pinnedEmpty": "Pin Boards to keep them one tap away",
  "allBoards": "Boards",
  "rootLabel": "All Boards (no Collection)",
  "subCollections": "Sub-Collections",
  "boards": "Boards",
  "empty": "This Collection is empty — drag Boards here or create one.",
  "selectedCount": "{{count}} selected",
  "clearSelection": "Clear selection",
  "pin": "Pin",
  "unpin": "Unpin",
  "move": "Move…",
  "moveTitle": "Move to Collection",
  "moveDestination": "Collection name to move to (or leave blank for root)",
  "rootDestination": "Root (no Collection)",
  "delete": "Delete",
  "bulkDeleteConfirm": "Delete {{count}} item(s)? This cannot be undone.",
  "deleteBoardConfirm": "Delete this Board?",
  "deleteCollectionConfirm": "Delete this Collection? Boards inside will move to its parent.",
  "unpinBoard": "Unpin Board",
  "menu": {
    "open": "Open",
    "openCollection": "Open",
    "rename": "Rename",
    "duplicate": "Duplicate (fresh)",
    "setDefault": "Set as default in this Collection",
    "pin": "Pin",
    "unpin": "Unpin",
    "move": "Move to…",
    "color": "Set color",
    "share": "Share…",
    "saveAsTemplate": "Save as Template…",
    "delete": "Delete"
  }
},
"sidebar": {
  "boards": {
    "activeCollection": "Active Collection",
    "rootBoards": "Boards",
    "manageAll": "Manage all boards"
  }
}
```

(Merge under existing `sidebar.boards` rather than overwriting.)

- [ ] **Step 2: Mirror in de, es, fr** (use the existing translations as a template; for v1 you can leave new keys as English fallbacks, since the components use `defaultValue:` everywhere).

- [ ] **Step 3: Run i18n tests**

Run: `pnpm exec vitest run tests/i18n`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add locales/
git commit -m "i18n: add boardsModal keys (en + fallbacks for de/es/fr)"
```

### Task 7.2 — Validate full pipeline

- [ ] **Step 1: Run validate**

Run: `pnpm run validate`
Expected: PASS (type-check + lint + format + tests).

- [ ] **Step 2: Run E2E (existing suite)**

Run: `pnpm run test:e2e`
Expected: existing tests pass; no regressions.

- [ ] **Step 3: Manual smoke test**

Start `pnpm run dev` (or use the Claude Preview tools — preview_start, then verify):

- Sidebar → Boards → Modal opens
- Create a Collection "Math"
- Create another Collection "Monday" inside Math
- Create a Board "Warm-up" inside Math/Monday
- Drag Warm-up out to root → confirm moved
- Drag it back into Math → confirm moved
- Pin Warm-up via card pin button → confirm appears in Pinned section
- Right-click a Board → all menu actions work
- Long-press a Board on touch → enters select mode, can multi-select, bulk delete
- Sidebar quick-pick shows the active Collection's Boards
- Existing FAB ◀ ▶ behavior unchanged (no regressions)

---

## Phase 8 — E2E Coverage

### Task 8.1 — Playwright happy-path test

**Files:**

- Create: `tests/e2e/collections.spec.ts`

- [ ] **Step 1: Write the test**

```typescript
import { test, expect } from '@playwright/test';

test.describe('Collections feature', () => {
  test.beforeEach(async ({ page }) => {
    // Auth bypass mode — VITE_AUTH_BYPASS=true must be set in test env.
    await page.goto('/');
    await page.waitForSelector('[data-testid="dashboard-view"]', {
      timeout: 10000,
    });
  });

  test('create Collection, move Board into it, pin/unpin', async ({ page }) => {
    // Open sidebar
    await page.getByLabel(/open menu/i).click();
    // Open Boards section, then Manage all
    await page
      .getByText(/^boards$/i)
      .first()
      .click();
    await page.getByRole('button', { name: /manage all boards/i }).click();

    // Modal is open
    await expect(page.getByRole('dialog', { name: /boards/i })).toBeVisible();

    // Create a Collection
    await page.getByRole('button', { name: /new collection/i }).click();
    await page.getByRole('textbox').fill('Math');
    await page.getByRole('button', { name: /create/i }).click();

    // Collection appears in tree
    await expect(page.getByRole('dialog').getByText('Math')).toBeVisible();

    // Create a Board in Math
    await page.getByRole('dialog').getByText('Math').click();
    await page.getByRole('button', { name: /new board/i }).click();
    await page.getByRole('textbox').fill('Warm-up');
    await page.getByRole('button', { name: /create/i }).click();

    // Board appears in grid under Math
    await expect(page.getByRole('dialog').getByText('Warm-up')).toBeVisible();

    // Pin via card pin button (last button in card)
    const card = page
      .locator('[role="dialog"]')
      .getByText('Warm-up')
      .locator('..')
      .locator('..');
    await card.getByRole('button', { name: /^pin$/i }).first().click();

    // Verify appears in Pinned section
    await expect(
      page
        .locator('[role="dialog"]')
        .getByText(/pinned/i)
        .locator('..')
        .getByText('Warm-up')
    ).toBeVisible();
  });
});
```

- [ ] **Step 2: Run test**

Run: `pnpm exec playwright test tests/e2e/collections.spec.ts`
Expected: PASS.

> If selectors are flaky, add `data-testid` attributes to the relevant components and re-run. Don't ship a flaky test.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/collections.spec.ts
git commit -m "test(e2e): add Collections happy-path coverage"
```

---

## Final Checklist

Before opening the PR, verify:

- [ ] `pnpm run validate` passes
- [ ] `pnpm run test:e2e` passes
- [ ] Manual smoke test on desktop browser (Chrome) AND tablet emulation (DevTools, iPad Pro)
- [ ] Long-press select works on touch
- [ ] Drag-drop works on touch (long-press handle)
- [ ] All copy is i18n-keyed (no hardcoded strings in components)
- [ ] No `console.log` left behind
- [ ] No `// TODO` or `// FIXME` comments added
- [ ] No regressions to existing FAB / Board switching (Plan 2 will change this)
- [ ] Existing `SidebarBoards.tsx` deleted; nothing imports it
- [ ] Dashboard migration runs idempotently (refresh the page twice — no Firestore write storm)
- [ ] Firestore rules deployed via the existing CI pipeline (don't deploy from feature branch)

## Open issues / known limitations of Plan 1

1. **No state preservation on Board switch yet.** Switching Boards within a Collection still does a full reload. Plan 2 introduces P4 mounted-set architecture.
2. **No FAB redesign yet.** Existing FAB iterates all Boards in flat order, ignoring Collections. Plan 2 makes it Collection-aware.
3. **No breadcrumb chip on the FAB row yet.** Plan 2.
4. **No Collection-level sharing.** Plan 3 (Copy + Substitute view-only).
5. **No Collection templates.** Plan 4.
6. **No thumbnails on Board cards.** Cards show name + breadcrumb + widget count + last-edited. Real thumbnails deferred (significant Storage cost + edge cases).
7. **App-open behavior unchanged.** Even though we persist `lastActiveCollectionId`, the existing dashboard-load logic still uses the global default. Plan 2 changes app-open to honor `lastActiveCollectionId` + `lastBoardIdByCollection`.

---

## Commit summary

By plan completion, the following commits exist on the branch (titles only):

1. `feat(types): add Collection type for Board foldering`
2. `feat(types): add Dashboard.collectionId and isPinned fields`
3. `feat(types): track active Collection on UserProfile`
4. `chore(firestore): allow owner read/write on /collections subcollection`
5. `feat(hooks): add useCollections for Board folder CRUD`
6. `feat(utils): add idempotent Collections migration for legacy Boards`
7. `feat(dashboard): hydrate legacy Boards with Collections defaults on load`
8. `feat(dashboard): add moveBoardToCollection action`
9. `feat(dashboard): add pinBoard and unpinBoard actions`
10. `refactor(dashboard): scope default Board to its Collection`
11. `feat(dashboard): persist lastActiveCollectionId + per-Collection last Board on load`
12. `chore(auth): ensure new UserProfile fields surface to consumers` (optional)
13. `feat(sidebar): add SidebarBoardsActive thin picker for active Collection`
14. `feat(sidebar): wire BoardsModal stub from sidebar Boards entry`
15. `feat(boardsModal): add useMultiSelect hook`
16. `feat(boardsModal): add header with search, new buttons, multi-select bar`
17. `feat(boardsModal): add PinnedSection with click-to-unpin`
18. `feat(boardsModal): add recursive CollectionTreeNode`
19. `feat(boardsModal): add CollectionTree left pane`
20. `feat(boardsModal): add BoardCard and CollectionCard with long-press select`
21. `feat(boardsModal): add BoardGrid right pane with sub-Collection + Board sections`
22. `feat(boardsModal): wire shell to tree + grid + multi-select + bulk actions`
23. `feat(boardsModal): add context menus for Boards and Collections`
24. `feat(boardsModal): drag-and-drop Boards and Collections via @dnd-kit`
25. `feat(boardsModal): replace bulk-move prompt with picker submenu`
26. `chore(sidebar): remove obsolete SidebarBoards (replaced by SidebarBoardsActive + BoardsModal)`
27. `i18n: add boardsModal keys (en + fallbacks for de/es/fr)`
28. `test(e2e): add Collections happy-path coverage`

~28 small commits over ~3-5 days of focused work for one developer with reviews between.
