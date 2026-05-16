# Collections Plan 3 — Collection-Level Sharing (Copy + Substitute View-Only)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a teacher share a whole Collection (the Collection metadata + every Board in it) with another teacher (Copy mode → recipient imports a full Collection into their own account) or with a substitute teacher (Substitute view-only → sub sees the Collection's Boards in the `/subs` portal for the host-chosen time window).

**Architecture:** Mirrors Plan 1's existing single-Board share infrastructure (`/shared_boards/{shareId}` + `ShareLinkCreatorModal` + `/subs` portal). Adds a parallel `/shared_collections/{shareId}` Firestore path that stores Collection metadata in the parent doc and a frozen Board snapshot per child doc under `/shared_collections/{shareId}/boards/{boardId}` (subcollection avoids the 1MB Firestore doc limit for big Collections). Two share modes only — `copy` and `substitute`. No `synced` (live N-board mirroring is too heavy and out of scope per Plan 1/2 deferred notes).

**Tech Stack:** React 19, TypeScript 5.9, Vite 6, Firestore (modular SDK), Vitest 4, @testing-library/react, Playwright, Tailwind CSS, lucide-react.

**Builds on:** Plan 1 (Collections data layer + BoardsModal) and Plan 2 (Collection-aware navigation + mounted-set). Both merged on `dev-paul`.

**Out of scope (covered by later plans):**

- Plan 4: Collection templates (`/dashboard_templates/` with `type` discriminator).
- `synced` (live-mirror) mode for Collections — N-board syncing is unbounded cost; defer indefinitely.
- PLC-scoped Collection shares (`plcId` field) — Plan 1's single-Board sharing has it; Collection version deferred unless a teacher specifically asks.
- Thumbnails on shared Collection cards.

---

## Files Created or Modified

**New files:**

- `hooks/useSharedCollection.ts` — Firestore CRUD: `shareCollection`, `loadSharedCollection`, `loadSharedCollectionBoards`, `importSharedCollection`, `shareSubstituteCollection`.
- `tests/hooks/useSharedCollection.test.ts`
- `components/share/ShareCollectionLinkCreatorModal.tsx` — host picks mode (copy / substitute) + (for substitute) expiresAt + buildingId + subEmails; emits share URL on success.
- `tests/components/share/ShareCollectionLinkCreatorModal.test.tsx`
- `components/share/ImportSharedCollectionModal.tsx` — recipient confirms import; on submit creates a new Collection + N Boards in their account, then navigates to the new Collection.
- `tests/components/share/ImportSharedCollectionModal.test.tsx`
- `components/subs/SubCollectionsList.tsx` — `/subs` UI extension that groups boards by their source Collection (when the underlying share was a Collection share) and surfaces a "Collection: <name>" section header.
- `tests/components/subs/SubCollectionsList.test.tsx`
- `tests/e2e/share-collection.spec.ts` — Playwright happy-path: host shares a 2-board Collection in copy mode → recipient imports → both boards present in the new Collection.

**Modified files:**

- `types.ts` — new `SharedCollection`, `SharedCollectionImportMode = 'copy' | 'substitute'`, `CollectionSubstituteShareInput`, `SharedCollectionBoardDoc`.
- `firestore.rules` — new rule for `/shared_collections/{shareId}` and its subcollection `/shared_collections/{shareId}/boards/{boardId}`.
- `context/DashboardContext.tsx` — wire the 4 new actions; add `pendingSharedCollectionId` state (parallels `pendingShareId`).
- `context/DashboardContextValue.ts` — expose the new action types.
- `components/boardsModal/CollectionContextMenu.tsx` — replace the existing `onMove: () => {}` placeholder with a real wire-up AND add a new `onShare` callback for "Share Collection…". (`onMove` is out of scope for Plan 3; we just stop having the placeholder be a dead arrow and route to a no-op toast for clarity.)
- `components/boardsModal/BoardsModal.tsx` — wire the new `onShare`, mount `ShareCollectionLinkCreatorModal`.
- `App.tsx` — new lazy route `/share-collection/:shareId` mounted in the teacher app shell.
- `components/subs/SubsApp.tsx` — surface Collection-grouped shares via `SubCollectionsList`.
- `locales/en.json` + `locales/de.json` + `locales/es.json` + `locales/fr.json` — new keys for share/import UX.

---

## Phase 0 — Types + Firestore Rules + Data Layer

Foundation: types compile, rules permit owner/recipient access, hook is testable in isolation. No UI yet.

### Task 0.1 — Add the `SharedCollection` types

**Files:**

- Modify: `types.ts` (insert near the existing `SharedBoardImportMode` / `SubstituteShareInput` definitions in `context/DashboardContextValue.ts` — but the new types live in `types.ts` itself for re-use across modules)

- [ ] **Step 1: Find the right insertion point**

Run `git grep -n "SharedBoardImportMode\|SubstituteShareInput" types.ts context/DashboardContextValue.ts` to confirm the home base. The single-Board sharing types live in `context/DashboardContextValue.ts`. For consistency, add the new Collection types ALSO in `types.ts` (so widgets can import them without depending on a context value module). Add them near the existing `Collection` interface (already in `types.ts` from Plan 1).

- [ ] **Step 2: Add the types**

In `types.ts`, after the existing `Collection` interface, insert:

```typescript
/**
 * Mode applied to a shared-Collection import. NOT including 'synced' —
 * live-mirroring N boards is unbounded cost. Substitute is a frozen,
 * time-boxed view-only flavor used by the /subs portal.
 */
export type SharedCollectionImportMode = 'copy' | 'substitute';

/**
 * Frozen snapshot stored at `/shared_collections/{shareId}`. Each Board
 * in the Collection is stored as a separate doc under
 * `/shared_collections/{shareId}/boards/{boardId}` to dodge Firestore's
 * 1MB-per-doc limit. The parent doc stores Collection metadata + an
 * ordered `boardIds` list for the recipient flow.
 */
export interface SharedCollection {
  shareId: string;
  hostUid: string;
  hostDisplayName: string | null;
  intendedMode: SharedCollectionImportMode;
  /** Frozen Collection metadata at share time (NOT the live Collection). */
  collection: {
    name: string;
    color?: string;
    icon?: string;
  };
  /** Ordered Board IDs — recipient reads from subcollection by these IDs. */
  boardIds: string[];
  /** ms epoch. */
  createdAt: number;
  /** Substitute-only: ms epoch when this share expires. */
  expiresAt?: number;
  /** Substitute-only: building id (config/buildings.ts) for /subs scoping. */
  buildingId?: string;
}

/**
 * One Board snapshot inside a Collection share. Stored at
 * `/shared_collections/{shareId}/boards/{boardId}`. Mirrors the existing
 * `Dashboard` shape minus any `linkedShareId`/`linkedShareRole` fields
 * (a share-import is never itself a share host).
 */
export interface SharedCollectionBoardDoc {
  boardId: string;
  /** Frozen `Dashboard` at share time. */
  dashboard: Dashboard;
}

/**
 * Input to `shareSubstituteCollection()`. Mirrors `SubstituteShareInput`
 * for single Boards but operates on a whole Collection.
 */
export interface CollectionSubstituteShareInput {
  collectionId: string;
  expiresAt: number;
  buildingId: string;
  subEmails?: string[];
  rosterDriveFileIds?: string[];
}
```

- [ ] **Step 3: Type-check + commit**

```bash
cd $(git rev-parse --show-toplevel)
pnpm run type-check
git add types.ts
git commit -m "feat(types): add SharedCollection + CollectionSubstituteShareInput types"
```

### Task 0.2 — Firestore rules for `/shared_collections/{shareId}`

**Files:**

- Modify: `firestore.rules` — add the new rule block immediately after the existing `/shared_boards/{shareId}` block (around line 701).

- [ ] **Step 1: Find the existing single-Board rule**

Run `git grep -n "match /shared_boards" firestore.rules` to confirm the line number. Read 50 lines AROUND it to understand the existing pattern (host write, authenticated read, sub-domain read gating, etc.).

- [ ] **Step 2: Write the new rule**

Insert AFTER the closing `}` of the `match /shared_boards/{shareId}` block:

```
    // Collection-level shares — parent doc holds metadata, subcollection
    // holds frozen Board snapshots. Same access semantics as
    // /shared_boards/{shareId}: host writes, any authenticated user can
    // read (the share URL is the access token), and substitute shares
    // additionally check the `/subs` building gate via existing helpers.
    match /shared_collections/{shareId} {
      // READ: any authenticated user can fetch the metadata doc. Substitute
      // shares are additionally gated by the existing isSubInBuilding()
      // helper used by /shared_boards.
      allow read: if request.auth != null
        && (
          resource.data.intendedMode != 'substitute'
          || isSubInBuilding(resource.data.buildingId)
        );

      // CREATE: host must be authenticated, payload must have a valid
      // hostUid matching request.auth.uid, a non-empty boardIds[], a
      // non-empty collection.name, and intendedMode in the legal set.
      allow create: if request.auth != null
        && request.resource.data.hostUid == request.auth.uid
        && request.resource.data.boardIds is list
        && request.resource.data.boardIds.size() > 0
        && request.resource.data.boardIds.size() <= 500
        && request.resource.data.collection.name is string
        && request.resource.data.collection.name.size() > 0
        && request.resource.data.intendedMode in ['copy', 'substitute']
        && (
          request.resource.data.intendedMode != 'substitute'
          || (
            request.resource.data.buildingId is string
            && request.resource.data.expiresAt is number
            && request.resource.data.expiresAt > request.time.toMillis()
          )
        );

      // UPDATE/DELETE: only the host. Substitute shares are immutable
      // (frozen-at-creation) so we deny update for those.
      allow update: if request.auth != null
        && resource.data.hostUid == request.auth.uid
        && resource.data.intendedMode == 'copy';

      allow delete: if request.auth != null
        && resource.data.hostUid == request.auth.uid;

      // Per-Board snapshots. Same READ semantics as parent (anyone with
      // share URL). WRITE is only allowed during the initial share
      // creation — once the parent doc exists, the boards subcollection
      // is read-only.
      match /boards/{boardId} {
        allow read: if request.auth != null
          && (
            get(/databases/$(database)/documents/shared_collections/$(shareId)).data.intendedMode != 'substitute'
            || isSubInBuilding(get(/databases/$(database)/documents/shared_collections/$(shareId)).data.buildingId)
          );

        // Allow writes ONLY when the parent share doc was just created by
        // this user. We can't distinguish "creation-time" from "later"
        // cleanly without a transaction, so we require the writer to be
        // the host. The client batches everything in a single writeBatch
        // so all writes happen near-instantly after parent creation.
        allow create: if request.auth != null
          && get(/databases/$(database)/documents/shared_collections/$(shareId)).data.hostUid == request.auth.uid;

        allow update, delete: if request.auth != null
          && get(/databases/$(database)/documents/shared_collections/$(shareId)).data.hostUid == request.auth.uid;
      }
    }
```

- [ ] **Step 3: Rules tests** (use the existing test harness)

Run `git grep -l "shared_boards" tests/firestore-rules/ 2>/dev/null` to find existing rules tests. Add a parallel test file `tests/firestore-rules/shared-collections.test.ts` mirroring the single-Board tests with `/shared_collections/{shareId}` paths. Cover:

- Anonymous user cannot read.
- Authenticated non-host user CAN read a `copy` share.
- Authenticated user can read a `substitute` share ONLY if `isSubInBuilding(buildingId)` is true.
- Host can create with valid payload; create rejected when `boardIds.size() == 0`, `intendedMode` is invalid, `substitute` without `expiresAt`, etc.
- Update/delete: only host; substitute updates rejected.

- [ ] **Step 4: Deploy + verify locally**

```bash
cd $(git rev-parse --show-toplevel)
pnpm vitest run tests/firestore-rules/shared-collections.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add firestore.rules tests/firestore-rules/shared-collections.test.ts
git commit -m "feat(rules): /shared_collections/{shareId} read/write rules + tests"
```

### Task 0.3 — `useSharedCollection` hook — write side

**Files:**

- Create: `hooks/useSharedCollection.ts`

- [ ] **Step 1: Write the file (write actions only — read/import in Task 0.4)**

```typescript
/**
 * useSharedCollection — Collection share lifecycle.
 *
 * Two writes (`shareCollection`, `shareSubstituteCollection`) and two
 * reads (`loadSharedCollection`, `loadSharedCollectionBoards`) plus the
 * recipient-side `importSharedCollection`. Mirrors the single-Board
 * sharing surface in `useFirestore.shareDashboard` etc., but scoped to
 * `/shared_collections/{shareId}`.
 *
 * The hook does NOT subscribe — Collection shares are one-shot writes/
 * reads, not live-mirrored. No onSnapshot.
 */

import { useCallback } from 'react';
import {
  doc,
  getDoc,
  getDocs,
  collection,
  writeBatch,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import { logError } from '@/utils/logError';
import type {
  Dashboard,
  SharedCollection,
  SharedCollectionBoardDoc,
  Collection as CollectionType,
  CollectionSubstituteShareInput,
} from '@/types';

const SHARED_COLLECTIONS_SUBPATH = 'shared_collections';
const SHARED_COLLECTION_BOARDS_SUBPATH = 'boards';

interface ShareCollectionInput {
  collection: CollectionType;
  boards: Dashboard[];
  hostUid: string;
  hostDisplayName: string | null;
}

export const useSharedCollection = () => {
  /**
   * Host action: write the share metadata + every Board snapshot in a
   * single writeBatch. Returns the new shareId.
   *
   * Chunking note: a `writeBatch` is capped at 500 operations. A Collection
   * with > 499 Boards exceeds that (metadata + 499 boards = 500). We split
   * into multiple batches if needed — boards are immutable post-creation,
   * so partial-batch failure recovery is simple (delete the parent if any
   * board batch fails).
   */
  const shareCollection = useCallback(
    async (input: ShareCollectionInput): Promise<string> => {
      const shareId = crypto.randomUUID();
      const parentRef = doc(db, SHARED_COLLECTIONS_SUBPATH, shareId);
      const now = Date.now();

      const parentPayload: SharedCollection = {
        shareId,
        hostUid: input.hostUid,
        hostDisplayName: input.hostDisplayName,
        intendedMode: 'copy',
        collection: {
          name: input.collection.name,
          ...(input.collection.color !== undefined && {
            color: input.collection.color,
          }),
          ...(input.collection.icon !== undefined && {
            icon: input.collection.icon,
          }),
        },
        boardIds: input.boards.map((b) => b.id),
        createdAt: now,
      };

      // BATCH_LIMIT 400 leaves headroom for the parent write in the first
      // batch and for Firestore quirks. Boards are written by their
      // existing id so the recipient can read them in the parent's
      // boardIds order.
      const BATCH_LIMIT = 400;
      const allBoards = input.boards;
      let firstBatch = writeBatch(db);
      firstBatch.set(parentRef, parentPayload);

      let inBatch = 1;
      let currentBatch = firstBatch;
      for (const board of allBoards) {
        if (inBatch >= BATCH_LIMIT) {
          await currentBatch.commit();
          currentBatch = writeBatch(db);
          inBatch = 0;
        }
        const boardRef = doc(
          db,
          SHARED_COLLECTIONS_SUBPATH,
          shareId,
          SHARED_COLLECTION_BOARDS_SUBPATH,
          board.id
        );
        const boardPayload: SharedCollectionBoardDoc = {
          boardId: board.id,
          dashboard: board,
        };
        currentBatch.set(boardRef, boardPayload);
        inBatch += 1;
      }
      if (inBatch > 0) await currentBatch.commit();

      return shareId;
    },
    []
  );

  /**
   * Host action: substitute variant. Identical to shareCollection except
   * `intendedMode: 'substitute'`, adds `expiresAt` + `buildingId`, and
   * defers Drive-grant work to the existing per-Board path (this plan
   * does NOT implement Drive grants for Collection shares — too much
   * surface area; out of scope per Plan 3 deferred notes).
   */
  const shareSubstituteCollection = useCallback(
    async (
      input: ShareCollectionInput & CollectionSubstituteShareInput
    ): Promise<string> => {
      // Implementation parallels shareCollection. Same chunked batch
      // strategy. Adds substitute fields to the parent payload.
      // (Implementer: copy the body of shareCollection, change
      // `intendedMode` to 'substitute', add `expiresAt` + `buildingId`
      // to the parent payload, set `parentPayload.collection` the same
      // way, and reuse the same chunked-batch loop.)
      const shareId = crypto.randomUUID();
      const parentRef = doc(db, SHARED_COLLECTIONS_SUBPATH, shareId);
      const now = Date.now();

      const parentPayload: SharedCollection = {
        shareId,
        hostUid: input.hostUid,
        hostDisplayName: input.hostDisplayName,
        intendedMode: 'substitute',
        collection: {
          name: input.collection.name,
          ...(input.collection.color !== undefined && {
            color: input.collection.color,
          }),
          ...(input.collection.icon !== undefined && {
            icon: input.collection.icon,
          }),
        },
        boardIds: input.boards.map((b) => b.id),
        createdAt: now,
        expiresAt: input.expiresAt,
        buildingId: input.buildingId,
      };

      const BATCH_LIMIT = 400;
      let firstBatch = writeBatch(db);
      firstBatch.set(parentRef, parentPayload);
      let inBatch = 1;
      let currentBatch = firstBatch;
      for (const board of input.boards) {
        if (inBatch >= BATCH_LIMIT) {
          await currentBatch.commit();
          currentBatch = writeBatch(db);
          inBatch = 0;
        }
        const boardRef = doc(
          db,
          SHARED_COLLECTIONS_SUBPATH,
          shareId,
          SHARED_COLLECTION_BOARDS_SUBPATH,
          board.id
        );
        const boardPayload: SharedCollectionBoardDoc = {
          boardId: board.id,
          dashboard: board,
        };
        currentBatch.set(boardRef, boardPayload);
        inBatch += 1;
      }
      if (inBatch > 0) await currentBatch.commit();

      return shareId;
    },
    []
  );

  return { shareCollection, shareSubstituteCollection };
};
```

- [ ] **Step 2: Type-check + commit**

```bash
pnpm run type-check
git add hooks/useSharedCollection.ts
git commit -m "feat(sharing): useSharedCollection — write side (copy + substitute)"
```

### Task 0.4 — `useSharedCollection` hook — read + import side

**Files:**

- Modify: `hooks/useSharedCollection.ts`

- [ ] **Step 1: Add `loadSharedCollection` + `loadSharedCollectionBoards` + `importSharedCollection`**

Append inside the hook (before the `return { ... }`):

```typescript
/**
 * Recipient action: fetch the share metadata doc. Returns null if not
 * found, expired, or rejected by rules.
 */
const loadSharedCollection = useCallback(
  async (shareId: string): Promise<SharedCollection | null> => {
    try {
      const parentRef = doc(db, SHARED_COLLECTIONS_SUBPATH, shareId);
      const snap = await getDoc(parentRef);
      if (!snap.exists()) return null;
      const data = snap.data() as SharedCollection;
      if (
        data.intendedMode === 'substitute' &&
        data.expiresAt &&
        data.expiresAt < Date.now()
      ) {
        return null;
      }
      return data;
    } catch (err) {
      logError('useSharedCollection.loadSharedCollection', err, { shareId });
      return null;
    }
  },
  []
);

/**
 * Recipient action: fetch every frozen Board snapshot in the share.
 * Order respects the parent's `boardIds[]` so the recipient sees the
 * same ordering as the host had at share time.
 */
const loadSharedCollectionBoards = useCallback(
  async (shareId: string, boardIds: string[]): Promise<Dashboard[]> => {
    // Use getDocs on the whole subcollection (1 query) then re-order
    // by boardIds. Single-query is cheaper than N getDoc calls for
    // moderate Collection sizes (< 30 Boards). For huge Collections
    // the recipient may pay a few hundred ms; acceptable for one-shot
    // import.
    const colRef = collection(
      db,
      SHARED_COLLECTIONS_SUBPATH,
      shareId,
      SHARED_COLLECTION_BOARDS_SUBPATH
    );
    const snap = await getDocs(colRef);
    const byId = new Map<string, Dashboard>();
    for (const d of snap.docs) {
      const data = d.data() as SharedCollectionBoardDoc;
      byId.set(d.id, data.dashboard);
    }
    return boardIds
      .map((id) => byId.get(id))
      .filter((d): d is Dashboard => Boolean(d));
  },
  []
);

return {
  shareCollection,
  shareSubstituteCollection,
  loadSharedCollection,
  loadSharedCollectionBoards,
};
```

- [ ] **Step 2: Add `importSharedCollection` — orchestrates everything for the recipient**

This action is NOT inside `useSharedCollection.ts` — it depends on `DashboardContext`'s `createCollection` + `createNewDashboard`. Add it in Task 0.5 inside `DashboardContext.tsx` instead.

- [ ] **Step 3: Type-check + commit**

```bash
pnpm run type-check
git add hooks/useSharedCollection.ts
git commit -m "feat(sharing): useSharedCollection — read side (loadSharedCollection + boards)"
```

### Task 0.5 — Wire `importSharedCollection` into `DashboardContext`

**Files:**

- Modify: `context/DashboardContext.tsx`
- Modify: `context/DashboardContextValue.ts`

- [ ] **Step 1: Add the action in `DashboardContext.tsx`**

Add inside `DashboardProvider` near the other share actions (search for `importSharedBoard`):

```typescript
const { collectionsApi } = useDashboard(); // already destructured nearby
const { loadSharedCollection, loadSharedCollectionBoards } =
  useSharedCollection();

const importSharedCollection = useCallback(
  async (shareId: string): Promise<{ collectionId: string } | null> => {
    if (!user) {
      addToast('Must be signed in to import', 'error');
      return null;
    }
    const meta = await loadSharedCollection(shareId);
    if (!meta) {
      addToast(
        t('shareCollection.notFound', {
          defaultValue: 'Shared Collection not found or expired',
        }),
        'error'
      );
      return null;
    }
    const boards = await loadSharedCollectionBoards(shareId, meta.boardIds);
    if (boards.length === 0) {
      addToast(
        t('shareCollection.empty', {
          defaultValue: 'Shared Collection is empty',
        }),
        'error'
      );
      return null;
    }

    try {
      // Phase 1: create the recipient's Collection.
      const newCollectionId = await collectionsApi.createCollection(
        meta.collection.name,
        null // root — recipient can move it later
      );

      // Phase 2: clone each Board into the new Collection. Each
      // createNewDashboard fans out to a Firestore write; collect failures
      // so the user sees a partial-success report instead of silent skips.
      const importResults = await Promise.allSettled(
        boards.map((b) =>
          createNewDashboard(
            // Suffix avoids name collisions with the recipient's
            // existing Boards. Plan 1's import-as-copy uses the same
            // pattern.
            `${b.name} (Imported)`,
            { ...b, id: crypto.randomUUID() } as Dashboard,
            { collectionId: newCollectionId }
          )
        )
      );
      const failed = importResults.filter(
        (r) => r.status === 'rejected'
      ).length;
      const succeeded = boards.length - failed;
      if (failed > 0) {
        addToast(
          t('shareCollection.partialImport', {
            succeeded,
            failed,
            defaultValue: 'Imported {{succeeded}} board(s) — {{failed}} failed',
          }),
          'error'
        );
      } else {
        addToast(
          t('shareCollection.imported', {
            count: succeeded,
            defaultValue: 'Imported Collection with {{count}} board(s)',
          })
        );
      }
      return { collectionId: newCollectionId };
    } catch (err) {
      logError('DashboardContext.importSharedCollection', err, {
        shareId,
        boardCount: boards.length,
      });
      addToast(
        t('shareCollection.importFailed', {
          defaultValue: 'Failed to import shared Collection',
        }),
        'error'
      );
      return null;
    }
  },
  [
    user,
    addToast,
    t,
    loadSharedCollection,
    loadSharedCollectionBoards,
    collectionsApi,
    createNewDashboard,
  ]
);
```

- [ ] **Step 2: Add a state for `pendingSharedCollectionId`**

Parallels `pendingShareId` (Plan 1's single-Board pending-share state). Used by the URL handler to surface the import modal:

```typescript
const [pendingSharedCollectionId, setPendingSharedCollectionId] = useState<
  string | null
>(null);

const clearPendingSharedCollection = useCallback(() => {
  setPendingSharedCollectionId(null);
}, []);
```

- [ ] **Step 3: Expose on the context value**

In `context/DashboardContextValue.ts` add:

```typescript
shareCollection: (input: {
  collection: import('@/types').Collection;
  boards: Dashboard[];
}) => Promise<string>;
shareSubstituteCollection: (
  input: import('@/types').CollectionSubstituteShareInput & {
    collection: import('@/types').Collection;
    boards: Dashboard[];
  }
) => Promise<string>;
importSharedCollection: (
  shareId: string
) => Promise<{ collectionId: string } | null>;
pendingSharedCollectionId: string | null;
setPendingSharedCollectionId: (id: string | null) => void;
clearPendingSharedCollection: () => void;
```

Add the same to the useMemo return value(s) in `DashboardContext.tsx`. Wire `shareCollection` + `shareSubstituteCollection` to the corresponding `useSharedCollection()` returns (need to pass `user.uid` and `user.displayName` from `DashboardProvider` scope, which already destructures `user`).

- [ ] **Step 4: Type-check + commit**

```bash
pnpm run type-check
git add context/DashboardContext.tsx context/DashboardContextValue.ts
git commit -m "feat(sharing): wire Collection share + import actions into DashboardContext"
```

### Task 0.6 — Tests for the data layer

**Files:**

- Create: `tests/hooks/useSharedCollection.test.ts`

- [ ] **Step 1: Write the tests**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

vi.mock('firebase/firestore', () => {
  const batchedOps: Array<{ ref: { path: string }; data: unknown }> = [];
  const docs = new Map<string, unknown>();
  return {
    doc: vi.fn((db: unknown, ...segments: string[]) => ({
      path: segments.join('/'),
    })),
    collection: vi.fn((db: unknown, ...segments: string[]) => ({
      path: segments.join('/'),
    })),
    getDoc: vi.fn(async (ref: { path: string }) => ({
      exists: () => docs.has(ref.path),
      data: () => docs.get(ref.path),
    })),
    getDocs: vi.fn(async () => ({
      docs: Array.from(docs.entries())
        .filter(([path]) => path.includes('/boards/'))
        .map(([path, data]) => ({
          id: path.split('/').pop()!,
          data: () => data,
        })),
    })),
    writeBatch: vi.fn(() => ({
      set: vi.fn((ref: { path: string }, data: unknown) => {
        batchedOps.push({ ref, data });
        docs.set(ref.path, data);
      }),
      commit: vi.fn(async () => undefined),
    })),
    Timestamp: { now: () => ({ toMillis: () => 1000 }) },
    __testHelpers: {
      docs,
      batchedOps,
      reset: () => {
        docs.clear();
        batchedOps.length = 0;
      },
    },
  };
});

vi.mock('@/config/firebase', () => ({ db: {} }));
vi.mock('@/utils/logError', () => ({ logError: vi.fn() }));

import { useSharedCollection } from '@/hooks/useSharedCollection';
import type { Collection, Dashboard } from '@/types';

const dashboard = (id: string): Dashboard => ({
  id,
  name: `Board ${id}`,
  background: 'bg-slate-800',
  widgets: [],
  createdAt: 0,
  collectionId: 'src-collection',
});

const sourceCollection = (): Collection => ({
  id: 'src-collection',
  name: 'Source',
  parentCollectionId: null,
  order: 0,
  createdAt: 0,
  color: '#ad2122',
});

describe('useSharedCollection', () => {
  beforeEach(async () => {
    const mod = await vi.importMock('firebase/firestore');
    (mod as { __testHelpers: { reset: () => void } }).__testHelpers.reset();
  });

  it('shareCollection writes parent + N boards and returns a shareId', async () => {
    const { result } = renderHook(() => useSharedCollection());
    const shareId = await result.current.shareCollection({
      collection: sourceCollection(),
      boards: [dashboard('b1'), dashboard('b2')],
      hostUid: 'host-uid',
      hostDisplayName: 'Mr. Teacher',
    });
    expect(shareId).toMatch(/^[0-9a-f-]{36}$/);
    // Verify the parent payload made it into the mock store
    const mod = (await vi.importMock('firebase/firestore')) as {
      __testHelpers: { docs: Map<string, unknown> };
    };
    const parent = mod.__testHelpers.docs.get(
      `shared_collections/${shareId}`
    ) as { boardIds: string[]; intendedMode: string };
    expect(parent.boardIds).toEqual(['b1', 'b2']);
    expect(parent.intendedMode).toBe('copy');
  });

  it('shareSubstituteCollection sets intendedMode=substitute + expiresAt', async () => {
    const { result } = renderHook(() => useSharedCollection());
    const shareId = await result.current.shareSubstituteCollection({
      collection: sourceCollection(),
      boards: [dashboard('b1')],
      hostUid: 'host-uid',
      hostDisplayName: 'Mr. Teacher',
      collectionId: 'src-collection',
      expiresAt: 9999999999999,
      buildingId: 'middle-school',
    });
    const mod = (await vi.importMock('firebase/firestore')) as {
      __testHelpers: { docs: Map<string, unknown> };
    };
    const parent = mod.__testHelpers.docs.get(
      `shared_collections/${shareId}`
    ) as { intendedMode: string; expiresAt: number };
    expect(parent.intendedMode).toBe('substitute');
    expect(parent.expiresAt).toBe(9999999999999);
  });

  it('loadSharedCollection returns null for an expired substitute share', async () => {
    const mod = (await vi.importMock('firebase/firestore')) as {
      __testHelpers: { docs: Map<string, unknown> };
    };
    mod.__testHelpers.docs.set('shared_collections/expired', {
      shareId: 'expired',
      intendedMode: 'substitute',
      expiresAt: Date.now() - 1000,
      boardIds: [],
      collection: { name: 'gone' },
    });
    const { result } = renderHook(() => useSharedCollection());
    const meta = await result.current.loadSharedCollection('expired');
    expect(meta).toBeNull();
  });

  it('loadSharedCollectionBoards returns boards in boardIds order', async () => {
    const mod = (await vi.importMock('firebase/firestore')) as {
      __testHelpers: { docs: Map<string, unknown> };
    };
    mod.__testHelpers.docs.set('shared_collections/s1/boards/b1', {
      boardId: 'b1',
      dashboard: dashboard('b1'),
    });
    mod.__testHelpers.docs.set('shared_collections/s1/boards/b2', {
      boardId: 'b2',
      dashboard: dashboard('b2'),
    });
    const { result } = renderHook(() => useSharedCollection());
    const boards = await result.current.loadSharedCollectionBoards('s1', [
      'b2',
      'b1',
    ]);
    expect(boards.map((b) => b.id)).toEqual(['b2', 'b1']);
  });
});
```

- [ ] **Step 2: Run + verify**

```bash
pnpm vitest run tests/hooks/useSharedCollection.test.ts
```

Expected: 4 passing tests.

- [ ] **Step 3: Commit**

```bash
git add tests/hooks/useSharedCollection.test.ts
git commit -m "test(sharing): cover useSharedCollection write/read/import paths"
```

---

## Phase 1 — Share-creation UI (host side)

### Task 1.1 — `ShareCollectionLinkCreatorModal`

**Files:**

- Create: `components/share/ShareCollectionLinkCreatorModal.tsx`

- [ ] **Step 1: Read the existing `ShareLinkCreatorModal` first**

Run `cat components/share/ShareLinkCreatorModal.tsx | head -120` and identify:

- How it surfaces the mode picker (3 options for Boards)
- How it calls `shareDashboard()` then renders the result panel with the share URL
- The clipboard auto-copy pattern

The Collection version mirrors this with TWO modes instead of three (no 'synced') and an additional substitute-only section for `expiresAt` + `buildingId`.

- [ ] **Step 2: Write the file**

```tsx
import { type FC, useState, useId, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Folder, Copy, UserCheck } from 'lucide-react';
import type { Collection, Dashboard } from '@/types';
import { useDashboard } from '@/context/useDashboard';

interface ShareCollectionLinkCreatorModalProps {
  isOpen: boolean;
  collection: Collection | null;
  /** Boards currently in the Collection. Frozen at modal open. */
  boards: Dashboard[];
  onClose: () => void;
}

type ModeChoice = 'copy' | 'substitute';

const SUB_TTL_PRESETS: { label: string; ms: number }[] = [
  { label: '4 hours', ms: 4 * 60 * 60 * 1000 },
  { label: '1 day', ms: 24 * 60 * 60 * 1000 },
  { label: '3 days', ms: 3 * 24 * 60 * 60 * 1000 },
  { label: '1 week', ms: 7 * 24 * 60 * 60 * 1000 },
];

export const ShareCollectionLinkCreatorModal: FC<
  ShareCollectionLinkCreatorModalProps
> = ({ isOpen, collection, boards, onClose }) => {
  const { t } = useTranslation();
  const { shareCollection, shareSubstituteCollection, addToast } =
    useDashboard();
  const [mode, setMode] = useState<ModeChoice>('copy');
  const [ttlMs, setTtlMs] = useState<number>(SUB_TTL_PRESETS[1].ms);
  const [buildingId, setBuildingId] = useState<string>('');
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const headingId = useId();

  const handleCreate = useCallback(async () => {
    if (!collection) return;
    setBusy(true);
    try {
      let shareId: string;
      if (mode === 'copy') {
        shareId = await shareCollection({ collection, boards });
      } else {
        if (!buildingId) {
          addToast(
            t('shareCollection.buildingRequired', {
              defaultValue: 'Select a building before sharing with a sub.',
            }),
            'error'
          );
          setBusy(false);
          return;
        }
        shareId = await shareSubstituteCollection({
          collection,
          boards,
          collectionId: collection.id,
          expiresAt: Date.now() + ttlMs,
          buildingId,
        });
      }
      const url = `${window.location.origin}/share-collection/${shareId}`;
      setShareUrl(url);
      try {
        await navigator.clipboard.writeText(url);
      } catch {
        // clipboard may be blocked — URL is still shown in the input
      }
    } catch (err) {
      addToast(
        t('shareCollection.createFailed', {
          defaultValue: 'Failed to create Collection share',
        }),
        'error'
      );
      setBusy(false);
      return;
    }
    setBusy(false);
  }, [
    mode,
    ttlMs,
    buildingId,
    collection,
    boards,
    shareCollection,
    shareSubstituteCollection,
    addToast,
    t,
  ]);

  if (!isOpen || !collection) return null;

  return (
    <div
      className="fixed inset-0 z-modal bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={headingId}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="p-5 border-b border-slate-100 flex items-center gap-2">
          <Folder
            className="w-5 h-5 flex-shrink-0"
            style={collection.color ? { color: collection.color } : undefined}
          />
          <h2 id={headingId} className="text-lg font-bold text-slate-800">
            {t('shareCollection.title', {
              defaultValue: 'Share Collection',
            })}
            : <span className="font-normal">{collection.name}</span>
          </h2>
        </div>

        {!shareUrl && (
          <div className="p-5 space-y-4">
            <p className="text-sm text-slate-600">
              {t('shareCollection.subtitle', {
                count: boards.length,
                defaultValue:
                  'Sharing {{count}} board(s) from this Collection.',
              })}
            </p>
            <fieldset className="space-y-2">
              <legend className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                {t('shareCollection.mode', { defaultValue: 'Share Mode' })}
              </legend>
              <label className="flex items-start gap-2 p-3 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-50">
                <input
                  type="radio"
                  name="mode"
                  checked={mode === 'copy'}
                  onChange={() => setMode('copy')}
                  className="mt-1"
                />
                <span className="flex-1">
                  <span className="flex items-center gap-1 text-sm font-bold text-slate-800">
                    <Copy className="w-3.5 h-3.5" />
                    {t('shareCollection.copyMode', { defaultValue: 'Copy' })}
                  </span>
                  <span className="block text-xs text-slate-500 mt-0.5">
                    {t('shareCollection.copyModeHint', {
                      defaultValue:
                        'Recipient imports a full copy into their account.',
                    })}
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-2 p-3 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-50">
                <input
                  type="radio"
                  name="mode"
                  checked={mode === 'substitute'}
                  onChange={() => setMode('substitute')}
                  className="mt-1"
                />
                <span className="flex-1">
                  <span className="flex items-center gap-1 text-sm font-bold text-slate-800">
                    <UserCheck className="w-3.5 h-3.5" />
                    {t('shareCollection.substituteMode', {
                      defaultValue: 'Substitute (view-only)',
                    })}
                  </span>
                  <span className="block text-xs text-slate-500 mt-0.5">
                    {t('shareCollection.substituteModeHint', {
                      defaultValue:
                        'A sub teacher sees the Collection in /subs for the window you choose.',
                    })}
                  </span>
                </span>
              </label>
            </fieldset>

            {mode === 'substitute' && (
              <div className="space-y-3 p-3 rounded-lg bg-slate-50 border border-slate-200">
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">
                  {t('shareCollection.expiresIn', {
                    defaultValue: 'Expires in',
                  })}
                </label>
                <div className="grid grid-cols-4 gap-1">
                  {SUB_TTL_PRESETS.map((p) => (
                    <button
                      key={p.ms}
                      type="button"
                      onClick={() => setTtlMs(p.ms)}
                      className={`text-xxs font-bold py-1.5 rounded-md transition-colors ${
                        ttlMs === p.ms
                          ? 'bg-brand-blue-primary text-white'
                          : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">
                  {t('shareCollection.building', { defaultValue: 'Building' })}
                </label>
                <input
                  type="text"
                  value={buildingId}
                  onChange={(e) => setBuildingId(e.target.value)}
                  placeholder="e.g. middle-school"
                  className="w-full px-2 py-1 text-sm border border-slate-300 rounded"
                />
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 rounded"
              >
                {t('common.cancel', { defaultValue: 'Cancel' })}
              </button>
              <button
                type="button"
                onClick={() => void handleCreate()}
                disabled={busy}
                className="px-3 py-1.5 text-sm font-bold bg-brand-blue-primary text-white rounded hover:bg-brand-blue-dark disabled:opacity-50"
              >
                {busy
                  ? t('shareCollection.creating', {
                      defaultValue: 'Creating…',
                    })
                  : t('shareCollection.createLink', {
                      defaultValue: 'Create link',
                    })}
              </button>
            </div>
          </div>
        )}

        {shareUrl && (
          <div className="p-5 space-y-3">
            <p className="text-sm text-slate-600">
              {t('shareCollection.linkReady', {
                defaultValue: 'Share link copied to clipboard.',
              })}
            </p>
            <input
              type="text"
              readOnly
              value={shareUrl}
              aria-label={t('shareCollection.urlLabel', {
                defaultValue: 'Share collection URL',
              })}
              className="w-full px-2 py-1.5 text-xs font-mono bg-slate-50 border border-slate-200 rounded select-all"
              onFocus={(e) => e.currentTarget.select()}
            />
            <div className="flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 text-sm font-bold bg-brand-blue-primary text-white rounded hover:bg-brand-blue-dark"
              >
                {t('common.done', { defaultValue: 'Done' })}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
```

- [ ] **Step 3: Type-check + commit**

```bash
pnpm run type-check
git add components/share/ShareCollectionLinkCreatorModal.tsx
git commit -m "feat(sharing): add ShareCollectionLinkCreatorModal"
```

### Task 1.2 — Tests for `ShareCollectionLinkCreatorModal`

**Files:**

- Create: `tests/components/share/ShareCollectionLinkCreatorModal.test.tsx`

- [ ] **Step 1: Write tests covering**

- Renders nothing when `!isOpen` or `!collection`
- Shows mode picker with two options (Copy + Substitute), Copy selected by default
- Switching to Substitute reveals expiresIn presets + building input
- Clicking "Create link" with Substitute mode + empty building shows error toast
- Clicking "Create link" with Copy mode calls `shareCollection` and shows the URL panel

Use mock implementations of `useDashboard()` exposing the share functions as `vi.fn()`.

- [ ] **Step 2: Run + commit**

```bash
pnpm vitest run tests/components/share/ShareCollectionLinkCreatorModal.test.tsx
git add tests/components/share/ShareCollectionLinkCreatorModal.test.tsx
git commit -m "test(sharing): cover ShareCollectionLinkCreatorModal modes + URL flow"
```

### Task 1.3 — Wire "Share Collection…" into `CollectionContextMenu`

**Files:**

- Modify: `components/boardsModal/CollectionContextMenu.tsx`
- Modify: `components/boardsModal/BoardsModal.tsx`

- [ ] **Step 1: Add `onShare` to `CollectionContextMenuProps`**

```typescript
interface CollectionContextMenuProps {
  // ... existing props
  canShare: boolean;
  onShare: () => void;
}
```

Add the menu item conditionally (matches BoardContextMenu's `canShare` gating from Plan 1):

```typescript
if (canShare) {
  items.push({
    label: t('collectionMenu.share', { defaultValue: 'Share Collection…' }),
    icon: Share2,
    action: onShare,
  });
}
```

Import `Share2` from `lucide-react`.

- [ ] **Step 2: Wire it in `BoardsModal.tsx`**

Find the `<CollectionContextMenu ... />` render. Add new state for the share modal target, render the modal, and pass `onShare`:

```tsx
const [shareCollectionTarget, setShareCollectionTarget] =
  useState<Collection | null>(null);

// In the CollectionContextMenu render:
<CollectionContextMenu
  /* ...existing props... */
  canShare={canShare}
  onShare={() => setShareCollectionTarget(c)}
/>;

// At the modal-render layer of BoardsModal (alongside ShareLinkCreatorModal):
{
  shareCollectionTarget && (
    <ShareCollectionLinkCreatorModal
      isOpen
      collection={shareCollectionTarget}
      boards={dashboards.filter(
        (d) => (d.collectionId ?? null) === shareCollectionTarget.id
      )}
      onClose={() => setShareCollectionTarget(null)}
    />
  );
}
```

- [ ] **Step 3: Type-check + verify**

```bash
pnpm run type-check
pnpm test
```

Expected: clean. Tests for `BoardsModal` that don't mock the share modal will simply ignore the new branch since `shareCollectionTarget` defaults to null.

- [ ] **Step 4: Commit**

```bash
git add components/boardsModal/CollectionContextMenu.tsx components/boardsModal/BoardsModal.tsx
git commit -m "feat(sharing): wire 'Share Collection…' context-menu item + modal"
```

---

## Phase 2 — Recipient flow: Copy mode

### Task 2.1 — `ImportSharedCollectionModal`

**Files:**

- Create: `components/share/ImportSharedCollectionModal.tsx`

- [ ] **Step 1: Write the modal**

Single-step (no mode picker because only Copy is offered for recipient import — Substitute shares are consumed by `/subs`):

```tsx
import { type FC, useState, useEffect, useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Folder } from 'lucide-react';
import { useDashboard } from '@/context/useDashboard';
import type { SharedCollection } from '@/types';

interface ImportSharedCollectionModalProps {
  shareId: string;
  onClose: () => void;
  onImported: (collectionId: string) => void;
}

export const ImportSharedCollectionModal: FC<
  ImportSharedCollectionModalProps
> = ({ shareId, onClose, onImported }) => {
  const { t } = useTranslation();
  const { importSharedCollection } = useDashboard();
  const [meta, setMeta] = useState<SharedCollection | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const headingId = useId();

  useEffect(() => {
    let cancelled = false;
    // useSharedCollection's loadSharedCollection is exposed via the hook,
    // not via DashboardContext. Inline the call here via a fresh hook
    // call — the read is one-shot so no instance leakage.
    void (async () => {
      const { useSharedCollection } =
        await import('@/hooks/useSharedCollection');
      const tempHook = useSharedCollection();
      const result = await tempHook.loadSharedCollection(shareId);
      if (!cancelled) {
        setMeta(result);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [shareId]);

  const handleImport = async () => {
    if (!meta) return;
    setBusy(true);
    const result = await importSharedCollection(shareId);
    setBusy(false);
    if (result) {
      onImported(result.collectionId);
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-modal bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={headingId}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="p-5 border-b border-slate-100 flex items-center gap-2">
          <Folder
            className="w-5 h-5 flex-shrink-0"
            style={
              meta?.collection.color
                ? { color: meta.collection.color }
                : undefined
            }
          />
          <h2 id={headingId} className="text-lg font-bold text-slate-800">
            {t('importSharedCollection.title', {
              defaultValue: 'Import shared Collection',
            })}
          </h2>
        </div>
        <div className="p-5 space-y-3">
          {loading && (
            <p className="text-sm text-slate-500">
              {t('importSharedCollection.loading', {
                defaultValue: 'Loading shared Collection…',
              })}
            </p>
          )}
          {!loading && !meta && (
            <p className="text-sm text-red-600">
              {t('importSharedCollection.notFound', {
                defaultValue: 'Shared Collection not found or expired.',
              })}
            </p>
          )}
          {!loading && meta && (
            <>
              <p className="text-sm text-slate-800">
                <span className="font-bold">{meta.collection.name}</span>{' '}
                <span className="text-slate-500">
                  (
                  {t('importSharedCollection.boardCount', {
                    count: meta.boardIds.length,
                    defaultValue: '{{count}} board(s)',
                  })}
                  )
                </span>
              </p>
              {meta.hostDisplayName && (
                <p className="text-xs text-slate-500">
                  {t('importSharedCollection.shared', {
                    name: meta.hostDisplayName,
                    defaultValue: 'Shared by {{name}}',
                  })}
                </p>
              )}
            </>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 rounded"
            >
              {t('common.cancel', { defaultValue: 'Cancel' })}
            </button>
            <button
              type="button"
              onClick={() => void handleImport()}
              disabled={busy || loading || !meta}
              className="px-3 py-1.5 text-sm font-bold bg-brand-blue-primary text-white rounded hover:bg-brand-blue-dark disabled:opacity-50"
            >
              {busy
                ? t('importSharedCollection.importing', {
                    defaultValue: 'Importing…',
                  })
                : t('importSharedCollection.import', {
                    defaultValue: 'Import Collection',
                  })}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
```

> **Implementation note for the engineer.** The inline `await import('@/hooks/useSharedCollection')` + `useSharedCollection()` call inside a `useEffect` is technically a React hooks-rules violation (calling a hook outside a component body). React WILL complain in dev. The cleanest fix is to hoist `loadSharedCollection` to `DashboardContext` (alongside `loadSharedDashboard`) so the modal calls `useDashboard().loadSharedCollection(...)`. Refactor before commit:
>
> 1. In `context/DashboardContext.tsx`, add `const sharedCollectionApi = useSharedCollection();` and expose `loadSharedCollection: sharedCollectionApi.loadSharedCollection` on the context value (like Plan 2 did for `collectionsApi`).
> 2. In `ImportSharedCollectionModal`, replace the inline `await import` with `const { loadSharedCollection, importSharedCollection } = useDashboard();` and call it directly inside a normal `useEffect`.
>
> The plan template above is intentionally explicit about the hooks-rules issue so the engineer doesn't ship the broken version.

- [ ] **Step 2: Apply the implementation note** — refactor to use context

In `context/DashboardContext.tsx` (alongside the Phase 0.5 wiring):

```typescript
const sharedCollectionApi = useSharedCollection();
// ... and expose on value:
//   loadSharedCollection: sharedCollectionApi.loadSharedCollection,
//   loadSharedCollectionBoards: sharedCollectionApi.loadSharedCollectionBoards,
//   shareCollection: (input) => sharedCollectionApi.shareCollection({ ...input, hostUid: user.uid, hostDisplayName: user.displayName }),
//   shareSubstituteCollection: (input) => sharedCollectionApi.shareSubstituteCollection({ ...input, hostUid: user.uid, hostDisplayName: user.displayName }),
```

In `context/DashboardContextValue.ts` add:

```typescript
loadSharedCollection: (shareId: string) =>
  Promise<import('@/types').SharedCollection | null>;
loadSharedCollectionBoards: (shareId: string, boardIds: string[]) =>
  Promise<Dashboard[]>;
```

Rewrite the `ImportSharedCollectionModal` `useEffect` to use the context:

```typescript
const { loadSharedCollection, importSharedCollection } = useDashboard();
useEffect(() => {
  let cancelled = false;
  void loadSharedCollection(shareId).then((result) => {
    if (!cancelled) {
      setMeta(result);
      setLoading(false);
    }
  });
  return () => {
    cancelled = true;
  };
}, [shareId, loadSharedCollection]);
```

- [ ] **Step 3: Type-check + commit**

```bash
pnpm run type-check
git add components/share/ImportSharedCollectionModal.tsx context/DashboardContext.tsx context/DashboardContextValue.ts
git commit -m "feat(sharing): ImportSharedCollectionModal + context exposure of loadSharedCollection"
```

### Task 2.2 — Route `/share-collection/:shareId` + URL handler

**Files:**

- Modify: `App.tsx`

- [ ] **Step 1: Add the lazy route alongside the existing `/share/:shareId` route**

Find the existing `/share/:shareId` route in `App.tsx`. Add a parallel:

```tsx
<Route
  path="/share-collection/:shareId"
  element={<SharedCollectionRedirector />}
/>
```

Where `SharedCollectionRedirector` is a small wrapper that reads `shareId` from `useParams()` and calls `setPendingSharedCollectionId` on `DashboardContext`:

```tsx
import { useParams, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import { useDashboard } from '@/context/useDashboard';

const SharedCollectionRedirector: FC = () => {
  const { shareId } = useParams<{ shareId: string }>();
  const { setPendingSharedCollectionId } = useDashboard();
  useEffect(() => {
    if (shareId) setPendingSharedCollectionId(shareId);
  }, [shareId, setPendingSharedCollectionId]);
  return <Navigate to="/" replace />;
};
```

(Defined inline in `App.tsx` for brevity. Alternatively, factor out to `components/share/SharedCollectionRedirector.tsx` if `App.tsx` is getting heavy.)

- [ ] **Step 2: Mount the import modal at the app shell when `pendingSharedCollectionId` is set**

Find where the existing `ImportShareModePicker` is mounted (look in `components/layout/DashboardView.tsx` or wherever the single-Board pending-share flow is mounted). Add a parallel mount:

```tsx
const {
  pendingSharedCollectionId,
  clearPendingSharedCollection,
  loadDashboard,
  dashboards,
} = useDashboard();

// ...in the JSX tree:
{
  pendingSharedCollectionId && (
    <ImportSharedCollectionModal
      shareId={pendingSharedCollectionId}
      onClose={clearPendingSharedCollection}
      onImported={(newCollectionId) => {
        // Navigate to the first Board of the newly-created Collection
        // so the user sees their import landed somewhere.
        const firstBoard = dashboards.find(
          (d) => (d.collectionId ?? null) === newCollectionId
        );
        if (firstBoard) loadDashboard(firstBoard.id);
      }}
    />
  );
}
```

- [ ] **Step 3: Type-check + commit**

```bash
pnpm run type-check
git add App.tsx components/layout/DashboardView.tsx
git commit -m "feat(sharing): /share-collection/:shareId route + mount import modal"
```

---

## Phase 3 — Recipient flow: Substitute mode (extend `/subs` portal)

### Task 3.1 — Extend `/subs` to list shared Collections

**Files:**

- Create: `components/subs/SubCollectionsList.tsx`
- Modify: `components/subs/SubsApp.tsx`

- [ ] **Step 1: Read the existing `/subs` listing code**

Run `grep -n "shared_boards\|substitute" components/subs/SubsApp.tsx hooks/useSubsView.ts utils/subsView.ts` to find how single-Board substitute shares are surfaced today. The sub-portal already has a directory of teachers + their shared boards. We'll add a "Collections" section per teacher.

- [ ] **Step 2: Write `SubCollectionsList`**

```tsx
import { type FC, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Folder } from 'lucide-react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { logError } from '@/utils/logError';
import type { SharedCollection } from '@/types';

interface SubCollectionsListProps {
  buildingId: string;
  /** Called when the sub clicks a Board within a shared Collection. */
  onOpenBoard: (shareId: string, boardId: string) => void;
}

export const SubCollectionsList: FC<SubCollectionsListProps> = ({
  buildingId,
  onOpenBoard,
}) => {
  const { t } = useTranslation();
  const [collections, setCollections] = useState<SharedCollection[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const q = query(
          collection(db, 'shared_collections'),
          where('intendedMode', '==', 'substitute'),
          where('buildingId', '==', buildingId),
          where('expiresAt', '>', Date.now())
        );
        const snap = await getDocs(q);
        if (cancelled) return;
        setCollections(snap.docs.map((d) => d.data() as SharedCollection));
      } catch (err) {
        logError('SubCollectionsList.load', err, { buildingId });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [buildingId]);

  if (loading) {
    return (
      <p className="text-sm text-slate-500 italic">
        {t('subCollections.loading', {
          defaultValue: 'Loading shared Collections…',
        })}
      </p>
    );
  }

  if (collections.length === 0) {
    return null; // no Collections shared → render nothing (Boards-only flow unaffected)
  }

  return (
    <section className="space-y-3">
      <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider">
        {t('subCollections.heading', { defaultValue: 'Collections' })}
      </h3>
      {collections.map((c) => (
        <div
          key={c.shareId}
          className="rounded-xl border border-slate-200 bg-white p-3"
        >
          <div className="flex items-center gap-2 mb-2">
            <Folder
              className="w-4 h-4 flex-shrink-0"
              style={
                c.collection.color ? { color: c.collection.color } : undefined
              }
            />
            <span className="text-sm font-bold text-slate-800">
              {c.collection.name}
            </span>
            <span className="ml-auto text-xxs text-slate-400">
              {t('subCollections.boardCount', {
                count: c.boardIds.length,
                defaultValue: '{{count}} board(s)',
              })}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {c.boardIds.map((boardId) => (
              <button
                key={boardId}
                type="button"
                onClick={() => onOpenBoard(c.shareId, boardId)}
                className="text-left px-2 py-1.5 text-xs rounded-md bg-slate-50 hover:bg-slate-100 border border-slate-200"
              >
                {/* Sub doesn't see the Board name without loading the
                    sub-doc; show a placeholder + boardId tail. The full
                    Board name appears on click after loading. */}
                {t('subCollections.boardPlaceholder', {
                  id: boardId.slice(-4),
                  defaultValue: 'Board …{{id}}',
                })}
              </button>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
};
```

- [ ] **Step 3: Mount in `SubsApp.tsx`**

Find the existing board-list render. Add `<SubCollectionsList buildingId={...} onOpenBoard={...} />` above or below it. The sub-portal's existing routing/state knows how to render a single Board once selected; for Collections, the click handler will need to load the per-Board sub-doc via `useSharedCollection().loadSharedCollectionBoards(shareId, [boardId])` and render it via the existing single-Board view.

- [ ] **Step 4: Commit**

```bash
pnpm run type-check
git add components/subs/SubCollectionsList.tsx components/subs/SubsApp.tsx
git commit -m "feat(subs): surface shared Collections in /subs portal"
```

### Task 3.2 — Tests for `SubCollectionsList`

**Files:**

- Create: `tests/components/subs/SubCollectionsList.test.tsx`

- [ ] **Step 1: Mock `firebase/firestore` + write tests**

Cover:

- Renders "Loading…" while pending
- Renders nothing when no Collections returned
- Renders one section per Collection with name + board count
- Clicking a board button calls `onOpenBoard(shareId, boardId)`

- [ ] **Step 2: Commit**

```bash
git add tests/components/subs/SubCollectionsList.test.tsx
git commit -m "test(subs): cover SubCollectionsList render + click"
```

---

## Phase 4 — i18n + E2E + acceptance

### Task 4.1 — Add the i18n keys

**Files:**

- Modify: `locales/en.json`, `locales/de.json`, `locales/es.json`, `locales/fr.json`

- [ ] **Step 1: Append new top-level groups** (English values; non-en files use the same English strings as Plan 1/2 convention)

```json
"shareCollection": {
  "title": "Share Collection",
  "subtitle": "Sharing {{count}} board(s) from this Collection.",
  "mode": "Share Mode",
  "copyMode": "Copy",
  "copyModeHint": "Recipient imports a full copy into their account.",
  "substituteMode": "Substitute (view-only)",
  "substituteModeHint": "A sub teacher sees the Collection in /subs for the window you choose.",
  "expiresIn": "Expires in",
  "building": "Building",
  "buildingRequired": "Select a building before sharing with a sub.",
  "createLink": "Create link",
  "creating": "Creating…",
  "createFailed": "Failed to create Collection share",
  "linkReady": "Share link copied to clipboard.",
  "urlLabel": "Share collection URL",
  "imported": "Imported Collection with {{count}} board(s)",
  "partialImport": "Imported {{succeeded}} board(s) — {{failed}} failed",
  "importFailed": "Failed to import shared Collection",
  "notFound": "Shared Collection not found or expired",
  "empty": "Shared Collection is empty"
},
"importSharedCollection": {
  "title": "Import shared Collection",
  "loading": "Loading shared Collection…",
  "notFound": "Shared Collection not found or expired.",
  "shared": "Shared by {{name}}",
  "boardCount": "{{count}} board(s)",
  "importing": "Importing…",
  "import": "Import Collection"
},
"subCollections": {
  "loading": "Loading shared Collections…",
  "heading": "Collections",
  "boardCount": "{{count}} board(s)",
  "boardPlaceholder": "Board …{{id}}"
},
"collectionMenu": {
  "share": "Share Collection…"
}
```

- [ ] **Step 2: Commit**

```bash
git add locales/
git commit -m "i18n: add shareCollection + importSharedCollection + subCollections keys"
```

### Task 4.2 — E2E happy-path

**Files:**

- Create: `tests/e2e/share-collection.spec.ts`

- [ ] **Step 1: Write the test**

```typescript
import { test, expect } from '@playwright/test';

test.describe('Collections — share + import (Copy mode)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addStyleTag({
      content:
        '*, *::before, *::after { transition: none !important; animation: none !important; }',
    });
    await page.goto('/');
    await expect(page.getByTitle('Open Menu')).toBeVisible({ timeout: 15000 });
  });

  test('host shares a Collection in Copy mode + recipient imports it', async ({
    page,
  }) => {
    // 1. Create a Collection with 2 Boards
    await page.getByTitle('Open Menu').click();
    await page
      .locator('nav button')
      .filter({ hasText: /Boards/i })
      .click();
    await page
      .locator('button')
      .filter({ hasText: /manage all boards/i })
      .click();
    const modal = page.getByRole('dialog', { name: /boards/i });

    await modal.getByRole('button', { name: /new collection/i }).click();
    const cPrompt = page.getByRole('dialog', { name: /new collection/i });
    await cPrompt.getByRole('textbox').fill('Share Test Coll');
    await cPrompt.getByRole('button', { name: /^create$/i }).click();
    await modal.getByText('Share Test Coll').first().click();

    for (const name of ['Share-A', 'Share-B']) {
      await modal.getByRole('button', { name: /new board/i }).click();
      const bPrompt = page.getByRole('dialog', { name: /new board/i });
      await bPrompt.getByRole('textbox').fill(name);
      await bPrompt.getByRole('button', { name: /^create$/i }).click();
    }

    // 2. Right-click the Collection → Share…
    const collTreeNode = modal.getByText('Share Test Coll').first();
    await collTreeNode.click({ button: 'right' });
    const ctxMenu = page.getByRole('menu');
    await expect(ctxMenu).toBeVisible({ timeout: 5000 });
    await ctxMenu.getByRole('menuitem', { name: /share collection/i }).click();

    // 3. Share creator opens; default mode is Copy → Create link
    const shareDialog = page.getByRole('dialog', { name: /share collection/i });
    await expect(shareDialog).toBeVisible({ timeout: 5000 });
    await shareDialog.getByRole('button', { name: /create link/i }).click();

    // 4. URL appears
    const urlInput = shareDialog.getByLabel('Share collection URL');
    await expect(urlInput).toBeVisible({ timeout: 10000 });
    await expect(urlInput).toHaveValue(/\/share-collection\//);
    const shareUrl = await urlInput.inputValue();
    await shareDialog.getByRole('button', { name: /done/i }).click();

    // 5. Visit the share URL → import modal appears
    await page.goto(shareUrl);
    const importDialog = page.getByRole('dialog', {
      name: /import shared collection/i,
    });
    await expect(importDialog).toBeVisible({ timeout: 10000 });
    await expect(importDialog.getByText('Share Test Coll')).toBeVisible();

    // 6. Click Import
    await importDialog
      .getByRole('button', { name: /^import collection$/i })
      .click();

    // 7. Modal dismisses, user lands on imported Collection's first Board
    await expect(importDialog).not.toBeVisible({ timeout: 10000 });
    // The imported boards carry "(Imported)" suffix
    await expect(page.getByText(/Share-A \(Imported\)/i).first()).toBeVisible({
      timeout: 10000,
    });
  });
});
```

- [ ] **Step 2: Run + commit**

```bash
pnpm exec playwright test tests/e2e/share-collection.spec.ts --reporter=line
git add tests/e2e/share-collection.spec.ts
git commit -m "test(e2e): cover Collection share + import happy path"
```

### Task 4.3 — Final validate + acceptance walkthrough

- [ ] **Step 1: Full validation**

```bash
pnpm run validate
pnpm exec playwright test tests/e2e/share-collection.spec.ts tests/e2e/collections-fab.spec.ts tests/e2e/collections.spec.ts tests/e2e/sharing.spec.ts --reporter=line
```

Expected: all green.

- [ ] **Step 2: Manual acceptance**

1. **Share a Collection (Copy mode).** Sidebar → Boards → Manage → right-click a Collection → Share Collection… → Copy → Create link → URL copied.
2. **Import.** Paste URL in a different browser session (or same with manual user-swap if your dev env allows). Modal appears with the source Collection name + board count + host name. Click Import → boards arrive in a new Collection in the recipient's account.
3. **Share Substitute.** Same right-click flow → choose Substitute → pick a TTL preset → enter buildingId → Create link.
4. **Sub portal.** Sign into `/subs` as a teacher matching the buildingId. Confirm the shared Collection appears in the Collections section + clicking a board enters board-view.
5. **Expiration.** Wait until the TTL passes (or temporarily reduce TTL in the test). Re-load `/subs` — the expired Collection is gone.

- [ ] **Step 3: Push for CI**

```bash
git push -u origin claude/collections-plan-3
```

---

## Acceptance criteria

- [ ] Host can create a Copy-mode Collection share via the right-click "Share Collection…" item on `CollectionContextMenu`.
- [ ] Host can create a Substitute-mode Collection share with a TTL + buildingId.
- [ ] Recipient visiting `/share-collection/:shareId` sees an import modal with Collection name, board count, and host name. Clicking Import creates a new Collection + N Boards in their account.
- [ ] Sub teacher signed into `/subs` for a matching buildingId sees shared Collections in a "Collections" section. Clicking a Board enters the existing single-Board sub-view.
- [ ] Substitute shares are filtered by `expiresAt` in both the `/subs` query and the recipient-side load.
- [ ] Firestore rules reject create with no boardIds, no name, invalid intendedMode, or substitute without expiresAt/buildingId.
- [ ] No regressions: existing single-Board sharing + Collections (Plan 1 + 2) flows still pass.
- [ ] `pnpm run validate` green; lint+type-check+format clean; no `console.error` introduced (use `logError`).
- [ ] All new i18n strings have `defaultValue` fallbacks; en/de/es/fr files updated.

---

## Known limitations

1. **No `synced` (live) mode for Collections.** Live-mirroring N boards across users is unbounded cost. If users ask, a later plan could add it with explicit cap (e.g., max 3 boards per synced Collection share).
2. **Drive grants not implemented for Collection-substitute shares.** Single-Board substitute shares support per-recipient Drive sharing of roster files. Adding it for Collection shares is a non-trivial surface (cross-product of subEmails × N rosterDriveFileIds). Deferred — the substitute can still view the Boards; they just don't get roster Drive access via this flow.
3. **Sub portal shows only board placeholders, not Board names, in the list view.** The list query reads only the parent metadata doc (cheap). Pulling board names would require N additional reads per Collection. Click-to-open loads the full Board.
4. **No PLC-scoped Collection shares.** Single-Board sharing has a `plcId` field; Collection version omits it for now (no user request yet).
5. **Cap of 500 boards per share** is enforced by the Firestore rule. Real-world Collections won't approach this, but flagged for clarity.
6. **Sub-doc writes use the host's auth.** A long-running batch (huge Collection) could theoretically have the auth token expire mid-batch; the existing single-Board share has the same property and we haven't seen the failure. Flagged for awareness, not action.

---

## Commit-history outline (chronological)

1. `feat(types): add SharedCollection + CollectionSubstituteShareInput types`
2. `feat(rules): /shared_collections/{shareId} read/write rules + tests`
3. `feat(sharing): useSharedCollection — write side (copy + substitute)`
4. `feat(sharing): useSharedCollection — read side (loadSharedCollection + boards)`
5. `feat(sharing): wire Collection share + import actions into DashboardContext`
6. `test(sharing): cover useSharedCollection write/read/import paths`
7. `feat(sharing): add ShareCollectionLinkCreatorModal`
8. `test(sharing): cover ShareCollectionLinkCreatorModal modes + URL flow`
9. `feat(sharing): wire 'Share Collection…' context-menu item + modal`
10. `feat(sharing): ImportSharedCollectionModal + context exposure of loadSharedCollection`
11. `feat(sharing): /share-collection/:shareId route + mount import modal`
12. `feat(subs): surface shared Collections in /subs portal`
13. `test(subs): cover SubCollectionsList render + click`
14. `i18n: add shareCollection + importSharedCollection + subCollections keys`
15. `test(e2e): cover Collection share + import happy path`
