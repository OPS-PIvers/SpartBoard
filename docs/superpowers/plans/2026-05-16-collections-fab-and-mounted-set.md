# Collections Plan 2 — Collection-aware FAB, Breadcrumb chip, App-open behavior, Mounted-Set State Preservation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the live-classroom navigation surface Collection-aware (FAB iterates Boards in the _active Collection_, breadcrumb chip names the active Collection above it), restore the teacher's last Board in their last Collection on app open, and keep a small LRU cache of mounted Boards so Board-to-Board switching preserves in-flight state (drawings, timer counts, video positions) instead of doing a full remount.

**Architecture:** Builds on Plan 1's data layer (`useCollections`, `Dashboard.collectionId`, `UserProfile.lastActiveCollectionId`, `UserProfile.lastBoardIdByCollection`). Splits the existing `BoardNavFab` into a Board switcher _within_ the active Collection plus a Collection switcher; introduces a pure `pickInitialBoard()` helper that consumes the `userProfile` memory; refactors `DashboardView`'s widget root from a single `key={activeDashboard.id}` mount-and-remount into a small LRU window (default size 2) of mounted Boards toggled via CSS `display`. Live-session-active Boards are pinned in the cache so a session host never loses state by switching away.

**Tech Stack:** React 19, TypeScript 5.9, Vite 6, Firestore (modular SDK), Vitest 4, @testing-library/react, Playwright, Tailwind CSS, lucide-react.

**Builds on:** Plan 1 (`docs/superpowers/plans/2026-05-15-collections-core-and-modal.md`) — fully landed on `dev-paul`.

**Out of scope (covered by later plans):**

- Plan 3: Collection-level sharing (Copy + Substitute view-only).
- Plan 4: Collection templates (`/dashboard_templates/` with `type` discriminator).
- True per-Board widget-state hydration on cache eviction (out of scope; eviction discards in-flight state, same as today's full remount).
- Cache size > 2 — a tuning knob lives in `config/mountedBoardCache.ts` (Task 3.1) but the default stays 2 because real K-12 classroom usage tops out at 1–2 boards in flight.
- Thumbnails on Board cards.

---

## Files Created or Modified

**New files:**

- `utils/pickInitialBoard.ts` — pure resolver: `(dashboards, lastActiveCollectionId, lastBoardIdByCollection, collections) => Dashboard | null`.
- `tests/utils/pickInitialBoard.test.ts` — covers every fallback rung.
- `components/layout/BoardBreadcrumb.tsx` — Collection › Board chip that mounts above `BoardNavFab`. Clickable to open `BoardsModal`.
- `tests/components/layout/BoardBreadcrumb.test.tsx`.
- `components/layout/CollectionSwitcherMenu.tsx` — submenu that opens from `BoardNavFab`'s kebab; lists Collections (flat, with depth-indent) and switches the active Collection.
- `tests/components/layout/CollectionSwitcherMenu.test.tsx`.
- `config/mountedBoardCache.ts` — exports `MOUNTED_BOARD_CACHE_SIZE` (default `2`) so future tuning happens in one place.
- `hooks/useMountedBoardCache.ts` — LRU `(activeId, dashboards, isLiveSessionFor) => Dashboard[]` that returns the set of Boards currently mounted, with pinning for live-session hosts.
- `tests/hooks/useMountedBoardCache.test.ts`.
- `components/layout/MountedBoardsLayer.tsx` — renders the LRU window of `<BoardCanvas>`es, only the active one visible.
- `components/layout/BoardCanvas.tsx` — the inner widget-canvas previously inlined inside `DashboardView`. Receives `dashboard` + `isActive` (controls visibility); renders the widget map.
- `tests/components/layout/MountedBoardsLayer.test.tsx`.
- `tests/e2e/collections-fab.spec.ts` — happy path: app-open restore, breadcrumb shows, FAB only lists active Collection, Collection switcher works.

**Modified files:**

- `context/DashboardContext.tsx` — replace the in-snapshot initial-board selection (lines ~1783-1786) with a gated effect that calls `pickInitialBoard()` once `(dashboards, profileLoaded, collections)` are all ready. Expose a new `setActiveCollectionId(id)` action that loads the appropriate Board for that Collection.
- `context/DashboardContextValue.ts` — add `setActiveCollectionId` to the interface.
- `components/layout/BoardNavFab.tsx` — filter the menu to Boards in the active Collection; add a "Switch Collection" item at the top that opens `CollectionSwitcherMenu`; wrap prev/next chevrons within the active Collection only.
- `components/layout/DashboardView.tsx` — extract the widget-canvas into `BoardCanvas`, replace single mount with `<MountedBoardsLayer>`, drop the `key={activeDashboard.id}` remount.
- `components/layout/sidebar/SidebarBoardsActive.tsx` — `loadDashboard` calls already update `lastBoardIdByCollection`; ensure the Collection-switch button (added to header) calls the new `setActiveCollectionId` action.
- `locales/en.json` + `locales/de.json` + `locales/es.json` + `locales/fr.json` — new keys for breadcrumb chip + Collection switcher.

---

## Phase 0 — App-open behavior

Foundation phase: when the app loads, restore the teacher's last Board in their last Collection instead of always falling back to the global `isDefault`.

### Task 0.1 — Pure helper `pickInitialBoard()`

**Files:**

- Create: `utils/pickInitialBoard.ts`

- [ ] **Step 1: Write the file**

```typescript
import type { Collection, Dashboard } from '@/types';

/**
 * Choose which Board to load on app open. Honors per-Collection navigation
 * memory (`lastActiveCollectionId` + `lastBoardIdByCollection`) populated by
 * `loadDashboard` in Plan 1, with progressively weaker fallbacks so a
 * partially-populated profile (or a Board that no longer exists) still
 * lands on a sensible default.
 *
 * Fallback chain:
 *   1. `lastBoardIdByCollection[lastActiveCollectionId]` if that Board still
 *      exists AND still belongs to that Collection.
 *   2. The active Collection's `defaultBoardId` if set and present.
 *   3. The first Board in the active Collection (sorted by existing `order`).
 *   4. The first Board with `isDefault === true` globally.
 *   5. The first Board in the global list (last-resort).
 *   6. `null` if `dashboards` is empty.
 *
 * Pure function — all inputs are passed explicitly so this can be tested
 * without React or Firestore. `lastActiveCollectionId === null` means
 * "the user was last in the root (no Collection)"; `undefined` means the
 * profile hasn't been read yet and the caller should defer.
 */
export const pickInitialBoard = (
  dashboards: Dashboard[],
  lastActiveCollectionId: string | null | undefined,
  lastBoardIdByCollection: Record<string, string> | undefined,
  collections: Collection[]
): Dashboard | null => {
  if (dashboards.length === 0) return null;
  // Caller should never invoke this with `undefined` lastActiveCollectionId;
  // it indicates profile-not-yet-loaded. Treat as "no memory yet" and fall
  // through to global defaults so we don't crash if a caller forgets.
  if (lastActiveCollectionId === undefined) {
    return (
      dashboards.find((d) => d.isDefault === true) ?? dashboards[0] ?? null
    );
  }

  const targetCollectionId = lastActiveCollectionId;
  const collectionKey = targetCollectionId ?? '__root__';
  const rememberedBoardId = lastBoardIdByCollection?.[collectionKey];

  if (rememberedBoardId) {
    const remembered = dashboards.find((d) => d.id === rememberedBoardId);
    if (
      remembered &&
      (remembered.collectionId ?? null) === targetCollectionId
    ) {
      return remembered;
    }
  }

  if (targetCollectionId !== null) {
    const targetCollection = collections.find(
      (c) => c.id === targetCollectionId
    );
    if (targetCollection?.defaultBoardId) {
      const collectionDefault = dashboards.find(
        (d) =>
          d.id === targetCollection.defaultBoardId &&
          (d.collectionId ?? null) === targetCollectionId
      );
      if (collectionDefault) return collectionDefault;
    }
  }

  const inCollection = dashboards
    .filter((d) => (d.collectionId ?? null) === targetCollectionId)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  if (inCollection.length > 0) return inCollection[0];

  return dashboards.find((d) => d.isDefault === true) ?? dashboards[0] ?? null;
};
```

- [ ] **Step 2: Type-check + commit**

```bash
pnpm run type-check
git add utils/pickInitialBoard.ts
git commit -m "feat(boards): add pickInitialBoard pure resolver for app-open"
```

### Task 0.2 — Tests for `pickInitialBoard`

**Files:**

- Create: `tests/utils/pickInitialBoard.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
import { describe, it, expect } from 'vitest';
import { pickInitialBoard } from '@/utils/pickInitialBoard';
import type { Collection, Dashboard } from '@/types';

const board = (over: Partial<Dashboard> = {}): Dashboard => ({
  id: over.id ?? 'b-default',
  name: over.name ?? 'Default Board',
  background: 'bg-slate-800',
  widgets: [],
  createdAt: 0,
  order: over.order ?? 0,
  collectionId: over.collectionId ?? null,
  isPinned: over.isPinned ?? false,
  isDefault: over.isDefault ?? false,
  ...over,
});

const collection = (over: Partial<Collection> = {}): Collection => ({
  id: over.id ?? 'c1',
  name: over.name ?? 'Collection 1',
  parentCollectionId: over.parentCollectionId ?? null,
  order: over.order ?? 0,
  createdAt: 0,
  ...over,
});

describe('pickInitialBoard', () => {
  it('returns null when no boards exist', () => {
    expect(pickInitialBoard([], null, undefined, [])).toBeNull();
  });

  it('returns the remembered Board when it still exists in the right Collection', () => {
    const target = board({ id: 'b1', collectionId: 'c1' });
    const other = board({ id: 'b2', collectionId: 'c1' });
    const result = pickInitialBoard([target, other], 'c1', { c1: 'b1' }, [
      collection({ id: 'c1' }),
    ]);
    expect(result?.id).toBe('b1');
  });

  it('skips the remembered Board when it has moved out of the Collection', () => {
    const moved = board({ id: 'b1', collectionId: 'c2' });
    const sibling = board({ id: 'b2', collectionId: 'c1', order: 0 });
    const result = pickInitialBoard([moved, sibling], 'c1', { c1: 'b1' }, [
      collection({ id: 'c1' }),
    ]);
    expect(result?.id).toBe('b2');
  });

  it('falls back to the Collection defaultBoardId when no memory exists', () => {
    const b = board({ id: 'defaultInColl', collectionId: 'c1' });
    const other = board({ id: 'otherInColl', collectionId: 'c1', order: 0 });
    const result = pickInitialBoard([other, b], 'c1', undefined, [
      collection({ id: 'c1', defaultBoardId: 'defaultInColl' }),
    ]);
    expect(result?.id).toBe('defaultInColl');
  });

  it('falls back to the first Board in the Collection by order', () => {
    const b2 = board({ id: 'second', collectionId: 'c1', order: 5 });
    const b1 = board({ id: 'first', collectionId: 'c1', order: 1 });
    const result = pickInitialBoard([b2, b1], 'c1', undefined, [
      collection({ id: 'c1' }),
    ]);
    expect(result?.id).toBe('first');
  });

  it('falls back to the global isDefault when the Collection is empty', () => {
    const orphan = board({ id: 'g1', collectionId: null, isDefault: true });
    const inOther = board({ id: 'g2', collectionId: 'cOther' });
    const result = pickInitialBoard([orphan, inOther], 'c1', undefined, [
      collection({ id: 'c1' }),
    ]);
    expect(result?.id).toBe('g1');
  });

  it('treats null lastActiveCollectionId as the root Collection', () => {
    const rootBoard = board({ id: 'r1', collectionId: null, order: 0 });
    const inColl = board({ id: 'i1', collectionId: 'c1' });
    const result = pickInitialBoard(
      [inColl, rootBoard],
      null,
      { __root__: 'r1' },
      []
    );
    expect(result?.id).toBe('r1');
  });

  it('falls through to global default when lastActiveCollectionId is undefined (profile not yet loaded)', () => {
    const def = board({ id: 'def', isDefault: true });
    const other = board({ id: 'other' });
    const result = pickInitialBoard([other, def], undefined, undefined, []);
    expect(result?.id).toBe('def');
  });
});
```

- [ ] **Step 2: Run tests, verify they pass**

```bash
pnpm vitest run tests/utils/pickInitialBoard.test.ts
```

Expected: all 7 tests PASS (helper from Task 0.1 already covers each case).

- [ ] **Step 3: Commit**

```bash
git add tests/utils/pickInitialBoard.test.ts
git commit -m "test(boards): cover pickInitialBoard fallback chain"
```

### Task 0.3 — Wire `pickInitialBoard` into the snapshot listener

**Files:**

- Modify: `context/DashboardContext.tsx` (the initial-board selection inside the snapshot handler, around lines 1783-1786)

- [ ] **Step 1: Locate the existing branch**

Open `context/DashboardContext.tsx` and find the snapshot callback that currently reads:

```typescript
if (migratedDashboards.length > 0 && !activeIdRef.current) {
  // Try to load default dashboard first
  const defaultDb = migratedDashboards.find((d) => d.isDefault);
  updateActiveId(defaultDb ? defaultDb.id : migratedDashboards[0].id);
}
```

The selection runs only when no `activeId` is set yet — i.e., once on first snapshot after sign-in. The profile (and therefore `lastActiveCollectionId`) may not have loaded yet at that moment. We need to either defer this until profile is ready, OR pick a sane fallback and let a follow-up effect upgrade the choice once the profile arrives.

- [ ] **Step 2: Add the profile-aware selection branch**

Replace the block above with:

```typescript
if (migratedDashboards.length > 0 && !activeIdRef.current) {
  // Wait for the userProfile snapshot to land before picking. If we
  // pick now using `undefined` lastActiveCollectionId, pickInitialBoard
  // falls through to the global default — a behavior we explicitly
  // want to AVOID on the first paint so the teacher doesn't see a
  // flash of "wrong board" before profile-aware selection corrects it.
  // The `initialBoardSelectedRef` gate (added in Step 3) makes the
  // selection run exactly once across snapshot churn.
  if (profileLoadedRef.current) {
    const initial = pickInitialBoard(
      migratedDashboards,
      lastActiveCollectionIdRef.current,
      lastBoardIdByCollectionRef.current,
      collectionsRef.current
    );
    if (initial) updateActiveId(initial.id);
  }
}
```

- [ ] **Step 3: Add the three refs at the top of `DashboardProvider`**

After the existing `dashboardsRef` block (around line 338), add:

```typescript
// Refs mirror auth/collections state used by the initial-board selection
// path so that branch (which runs inside the snapshot callback) doesn't
// have to be re-bound on every userProfile/collection change. Refs are
// the right call here because the selection is fire-once on app open,
// not a reactive computation.
const profileLoadedRef = useRef(profileLoaded);
profileLoadedRef.current = profileLoaded;
const lastActiveCollectionIdRef = useRef(lastActiveCollectionId);
lastActiveCollectionIdRef.current = lastActiveCollectionId;
const lastBoardIdByCollectionRef = useRef(lastBoardIdByCollection);
lastBoardIdByCollectionRef.current = lastBoardIdByCollection;
const collectionsRef = useRef<Collection[]>([]);
// collectionsRef is populated in Task 0.4 via the useCollections hook
// — leave empty for now.
```

- [ ] **Step 4: Pull the new fields out of `useAuth()`**

Update the `useAuth()` destructuring (around line 207) to include the navigation-memory fields:

```typescript
const {
  user,
  isAdmin,
  // ...existing fields...
  profileLoaded,
  lastActiveCollectionId,
  lastBoardIdByCollection,
} = useAuth();
```

- [ ] **Step 5: Add the import**

At the top of `context/DashboardContext.tsx`:

```typescript
import { pickInitialBoard } from '../utils/pickInitialBoard';
import type { Collection } from '@/types';
```

- [ ] **Step 6: Type-check + commit**

```bash
pnpm run type-check
git add context/DashboardContext.tsx
git commit -m "feat(dashboard): wire pickInitialBoard into snapshot initial select"
```

### Task 0.4 — Trigger a profile-aware re-selection once the profile lands

The branch in 0.3 only fires when the snapshot CALLBACK runs. If dashboards arrive before the profile, the selection is skipped and never re-runs.

**Files:**

- Modify: `context/DashboardContext.tsx`

- [ ] **Step 1: Add a delayed-initial-select effect**

After the existing dashboard-snapshot subscription effect (search for `subscribeToDashboards` registration), add:

```typescript
// One-shot upgrade of the initial Board choice once profile + collections
// are both available. Runs at most once — guarded by `initialBoardSelectedRef`
// so a subsequent profile refresh doesn't yank the teacher to a different
// Board after they've started working.
const initialBoardSelectedRef = useRef(false);
useEffect(() => {
  if (initialBoardSelectedRef.current) return;
  if (!profileLoaded) return;
  if (loading) return;
  if (dashboards.length === 0) return;
  if (activeIdRef.current) {
    // Some other path already picked an active Board (e.g. URL deep-link).
    initialBoardSelectedRef.current = true;
    return;
  }
  const initial = pickInitialBoard(
    dashboards,
    lastActiveCollectionId,
    lastBoardIdByCollection,
    collections
  );
  if (initial) {
    updateActiveId(initial.id);
    initialBoardSelectedRef.current = true;
  }
}, [
  profileLoaded,
  loading,
  dashboards,
  lastActiveCollectionId,
  lastBoardIdByCollection,
  collections,
  updateActiveId,
]);
```

- [ ] **Step 2: Wire `useCollections` into the provider**

Search for where the provider currently _doesn't_ read collections (`useCollections` is consumed in the BoardsModal — we need it here too). Add near the other hook calls in `DashboardProvider`:

```typescript
const { collections } = useCollections(user?.uid);
```

…and update the ref-mirror line from Task 0.3:

```typescript
const collectionsRef = useRef(collections);
collectionsRef.current = collections;
```

- [ ] **Step 3: Type-check + commit**

```bash
pnpm run type-check
git add context/DashboardContext.tsx
git commit -m "feat(dashboard): defer initial-board select until profile+collections land"
```

### Task 0.5 — Add `setActiveCollectionId` action

Switching Collections from the FAB or sidebar needs to load the right Board for that Collection. Wraps `pickInitialBoard` for that sub-set.

**Files:**

- Modify: `context/DashboardContext.tsx`
- Modify: `context/DashboardContextValue.ts`

- [ ] **Step 1: Implement the action**

Add inside `DashboardProvider` near the other action callbacks:

```typescript
const setActiveCollectionId = useCallback(
  (nextCollectionId: string | null) => {
    // Reuse pickInitialBoard but force its lastActiveCollectionId arg to
    // the new Collection — this picks the per-Collection remembered
    // Board (or the right fallback) without an extra Firestore read.
    const target = pickInitialBoard(
      dashboards,
      nextCollectionId,
      lastBoardIdByCollection,
      collections
    );
    if (target) loadDashboard(target.id);
  },
  [dashboards, lastBoardIdByCollection, collections, loadDashboard]
);
```

- [ ] **Step 2: Expose it on the context value**

In `context/DashboardContextValue.ts` add:

```typescript
setActiveCollectionId: (collectionId: string | null) => void;
```

In `DashboardContext.tsx` add `setActiveCollectionId` to both `useMemo` returns (the loading-shell and the loaded value).

- [ ] **Step 3: Type-check + commit**

```bash
pnpm run type-check
git add context/DashboardContext.tsx context/DashboardContextValue.ts
git commit -m "feat(dashboard): add setActiveCollectionId action"
```

---

## Phase 1 — Breadcrumb chip above the Board FAB

Read-only chip that names the active Collection (or "All Boards" for root) and the active Board. Clicking opens the BoardsModal scoped to the active Collection.

### Task 1.1 — Create `BoardBreadcrumb.tsx`

**Files:**

- Create: `components/layout/BoardBreadcrumb.tsx`

- [ ] **Step 1: Write the component**

```tsx
import { type FC, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Folder, ChevronRight } from 'lucide-react';
import { useDashboard } from '@/context/useDashboard';
import { useAuth } from '@/context/useAuth';
import { useCollections } from '@/hooks/useCollections';
import { BoardsModal } from '@/components/boardsModal/BoardsModal';

export const BoardBreadcrumb: FC = () => {
  const { t } = useTranslation();
  const { activeDashboard } = useDashboard();
  const { user } = useAuth();
  const { collections } = useCollections(user?.uid);
  const [isModalOpen, setIsModalOpen] = useState(false);

  if (!activeDashboard) return null;
  const collectionId = activeDashboard.collectionId ?? null;
  const collection = collectionId
    ? collections.find((c) => c.id === collectionId)
    : null;
  const collectionLabel = collection
    ? collection.name
    : t('boardBreadcrumb.root', { defaultValue: 'All Boards' });

  return (
    <>
      <button
        type="button"
        onClick={() => setIsModalOpen(true)}
        data-screenshot="exclude"
        aria-label={t('boardBreadcrumb.openManager', {
          defaultValue: 'Manage Boards',
        })}
        className="inline-flex items-center gap-1 max-w-[40vw] px-2.5 py-1 rounded-full bg-slate-900/70 backdrop-blur-md text-xxs font-medium text-white/80 hover:bg-slate-900/85 hover:text-white transition-colors"
      >
        <Folder
          className="w-3 h-3 flex-shrink-0"
          style={collection?.color ? { color: collection.color } : undefined}
        />
        <span className="truncate">{collectionLabel}</span>
        <ChevronRight className="w-3 h-3 flex-shrink-0 text-white/40" />
        <span className="truncate font-bold text-white">
          {activeDashboard.name}
        </span>
      </button>
      {isModalOpen && <BoardsModal onClose={() => setIsModalOpen(false)} />}
    </>
  );
};
```

- [ ] **Step 2: Type-check + commit**

```bash
pnpm run type-check
git add components/layout/BoardBreadcrumb.tsx
git commit -m "feat(layout): add BoardBreadcrumb chip"
```

### Task 1.2 — Tests for `BoardBreadcrumb`

**Files:**

- Create: `tests/components/layout/BoardBreadcrumb.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BoardBreadcrumb } from '@/components/layout/BoardBreadcrumb';

const useDashboardMock = vi.fn();
const useAuthMock = vi.fn();
const useCollectionsMock = vi.fn();

vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => useDashboardMock(),
}));
vi.mock('@/context/useAuth', () => ({
  useAuth: () => useAuthMock(),
}));
vi.mock('@/hooks/useCollections', () => ({
  useCollections: () => useCollectionsMock(),
}));
vi.mock('@/components/boardsModal/BoardsModal', () => ({
  BoardsModal: ({ onClose }: { onClose: () => void }) => (
    <div role="dialog" aria-label="Boards Modal">
      <button onClick={onClose}>close-modal</button>
    </div>
  ),
}));

beforeEach(() => {
  useAuthMock.mockReturnValue({ user: { uid: 'u1' } });
});

describe('BoardBreadcrumb', () => {
  it('renders nothing when no active dashboard', () => {
    useDashboardMock.mockReturnValue({ activeDashboard: null });
    useCollectionsMock.mockReturnValue({ collections: [] });
    const { container } = render(<BoardBreadcrumb />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders "All Boards" when the active dashboard is at root', () => {
    useDashboardMock.mockReturnValue({
      activeDashboard: { id: 'd1', name: 'My Board', collectionId: null },
    });
    useCollectionsMock.mockReturnValue({ collections: [] });
    render(<BoardBreadcrumb />);
    expect(screen.getByText('All Boards')).toBeInTheDocument();
    expect(screen.getByText('My Board')).toBeInTheDocument();
  });

  it('renders the Collection name when the active dashboard is in a Collection', () => {
    useDashboardMock.mockReturnValue({
      activeDashboard: { id: 'd1', name: 'Warmup', collectionId: 'c1' },
    });
    useCollectionsMock.mockReturnValue({
      collections: [
        {
          id: 'c1',
          name: 'Math',
          parentCollectionId: null,
          order: 0,
          createdAt: 0,
        },
      ],
    });
    render(<BoardBreadcrumb />);
    expect(screen.getByText('Math')).toBeInTheDocument();
    expect(screen.getByText('Warmup')).toBeInTheDocument();
  });

  it('opens the BoardsModal when clicked', async () => {
    useDashboardMock.mockReturnValue({
      activeDashboard: { id: 'd1', name: 'Warmup', collectionId: null },
    });
    useCollectionsMock.mockReturnValue({ collections: [] });
    render(<BoardBreadcrumb />);
    await userEvent.click(
      screen.getByRole('button', { name: /manage boards/i })
    );
    expect(
      screen.getByRole('dialog', { name: 'Boards Modal' })
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run + verify pass**

```bash
pnpm vitest run tests/components/layout/BoardBreadcrumb.test.tsx
```

Expected: 4 passing tests.

- [ ] **Step 3: Commit**

```bash
git add tests/components/layout/BoardBreadcrumb.test.tsx
git commit -m "test(layout): cover BoardBreadcrumb rendering + click-to-open"
```

### Task 1.3 — Mount `BoardBreadcrumb` above the existing FAB

**Files:**

- Modify: `components/layout/BoardNavFab.tsx` (return-stack)

- [ ] **Step 1: Add the chip mount point**

Inside the outer `<div ref={containerRef}>` of `BoardNavFab`, insert above the existing chevron group:

```tsx
<div className="absolute bottom-full left-0 mb-1.5 flex items-center">
  <BoardBreadcrumb />
</div>
```

…and add the import at the top:

```typescript
import { BoardBreadcrumb } from './BoardBreadcrumb';
```

- [ ] **Step 2: Verify in the dev server**

```bash
pnpm run dev
```

Expected: with at least one Board loaded, the chip appears above the FAB row. The chip should NOT show the BoardsModal until clicked.

- [ ] **Step 3: Commit**

```bash
git add components/layout/BoardNavFab.tsx
git commit -m "feat(layout): mount BoardBreadcrumb above BoardNavFab"
```

---

## Phase 2 — Collection-aware FAB

`BoardNavFab` currently iterates every Board globally. Make it iterate only Boards in the active Collection, with a "Switch Collection" submenu for jumping between Collections.

### Task 2.1 — Filter `BoardNavFab` to the active Collection

**Files:**

- Modify: `components/layout/BoardNavFab.tsx`

- [ ] **Step 1: Replace the global `dashboards` reference with an active-Collection slice**

At the top of the component, after destructuring `useDashboard()`, add:

```typescript
const activeCollectionId = activeDashboard?.collectionId ?? null;
const boardsInCollection = useMemo(
  () =>
    dashboards
      .filter((d) => (d.collectionId ?? null) === activeCollectionId)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
  [dashboards, activeCollectionId]
);
```

Then replace every remaining reference to `dashboards` inside this component (in `currentIndex`, `goPrev`, `goNext`, the `useEffect` cleanup, and the picker `.map`) with `boardsInCollection`.

- [ ] **Step 2: Update the empty-state guard**

```typescript
if (boardsInCollection.length <= 1) return null;
```

Don't render the FAB at all when only one Board lives in the Collection (matches current behavior for the global case).

- [ ] **Step 3: Type-check + commit**

```bash
pnpm run type-check
git add components/layout/BoardNavFab.tsx
git commit -m "feat(layout): FAB iterates Boards within active Collection"
```

### Task 2.2 — `CollectionSwitcherMenu`

**Files:**

- Create: `components/layout/CollectionSwitcherMenu.tsx`

- [ ] **Step 1: Write the menu**

```tsx
import { type FC, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Folder, Home } from 'lucide-react';
import type { Collection } from '@/types';

interface CollectionSwitcherMenuProps {
  collections: Collection[];
  activeCollectionId: string | null;
  onSelect: (collectionId: string | null) => void;
  onClose: () => void;
}

/**
 * Submenu opened from BoardNavFab. Lists all Collections (flat with
 * depth-indent) plus the "Root (no Collection)" entry. Used to jump the
 * navigation surface to a different Collection — the actual Board switch
 * is handled by the caller, which routes through
 * DashboardContext.setActiveCollectionId.
 */
export const CollectionSwitcherMenu: FC<CollectionSwitcherMenuProps> = ({
  collections,
  activeCollectionId,
  onSelect,
  onClose,
}) => {
  const { t } = useTranslation();

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
    <div
      role="menu"
      aria-label={t('collectionSwitcher.title', {
        defaultValue: 'Switch Collection',
      })}
      className="absolute bottom-full left-0 mb-2 w-64 max-h-[60vh] overflow-y-auto rounded-2xl border border-white/20 bg-slate-900/80 backdrop-blur-xl shadow-2xl py-1.5 animate-in fade-in slide-in-from-bottom-2 duration-150"
    >
      <div className="px-3 py-1.5 text-xxs font-bold uppercase tracking-wider text-white/40">
        {t('collectionSwitcher.title', { defaultValue: 'Switch Collection' })}
      </div>
      <button
        role="menuitem"
        onClick={() => {
          onSelect(null);
          onClose();
        }}
        className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/50 ${
          activeCollectionId === null
            ? 'bg-brand-blue-primary text-white'
            : 'text-white/80 hover:bg-white/10'
        }`}
      >
        <Home className="w-3.5 h-3.5 flex-shrink-0" />
        {t('collectionSwitcher.root', { defaultValue: 'All Boards (root)' })}
      </button>
      {flat.map(({ c, depth }) => {
        const isActive = activeCollectionId === c.id;
        return (
          <button
            key={c.id}
            role="menuitem"
            onClick={() => {
              onSelect(c.id);
              onClose();
            }}
            style={{ paddingLeft: `${0.75 + depth * 1}rem` }}
            className={`w-full flex items-center gap-2 pr-3 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/50 ${
              isActive
                ? 'bg-brand-blue-primary text-white'
                : 'text-white/80 hover:bg-white/10'
            }`}
          >
            <Folder
              className="w-3.5 h-3.5 flex-shrink-0"
              style={c.color ? { color: c.color } : undefined}
            />
            <span className="truncate">{c.name}</span>
          </button>
        );
      })}
    </div>
  );
};
```

- [ ] **Step 2: Type-check + commit**

```bash
pnpm run type-check
git add components/layout/CollectionSwitcherMenu.tsx
git commit -m "feat(layout): add CollectionSwitcherMenu submenu"
```

### Task 2.3 — Tests for `CollectionSwitcherMenu`

**Files:**

- Create: `tests/components/layout/CollectionSwitcherMenu.test.tsx`

- [ ] **Step 1: Write the tests**

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CollectionSwitcherMenu } from '@/components/layout/CollectionSwitcherMenu';
import type { Collection } from '@/types';

const coll = (
  id: string,
  parent: string | null,
  order = 0,
  name = id
): Collection => ({
  id,
  name,
  parentCollectionId: parent,
  order,
  createdAt: 0,
});

describe('CollectionSwitcherMenu', () => {
  it('always shows the "All Boards (root)" item', () => {
    render(
      <CollectionSwitcherMenu
        collections={[]}
        activeCollectionId={null}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(
      screen.getByRole('menuitem', { name: /all boards \(root\)/i })
    ).toBeInTheDocument();
  });

  it('renders nested Collections in tree order with depth indent', () => {
    const collections = [
      coll('a', null, 0, 'A'),
      coll('b', 'a', 0, 'B'),
      coll('c', 'a', 1, 'C'),
      coll('d', null, 1, 'D'),
    ];
    render(
      <CollectionSwitcherMenu
        collections={collections}
        activeCollectionId={null}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />
    );
    const menuItems = screen.getAllByRole('menuitem');
    // Root + 4 Collections = 5 items, in DFS order: root, A, B, C, D.
    const labels = menuItems.map((el) => el.textContent?.trim());
    expect(labels).toEqual([
      expect.stringContaining('All Boards'),
      'A',
      'B',
      'C',
      'D',
    ]);
  });

  it('marks the active Collection', () => {
    render(
      <CollectionSwitcherMenu
        collections={[coll('a', null, 0, 'A')]}
        activeCollectionId="a"
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />
    );
    const aItem = screen.getByRole('menuitem', { name: 'A' });
    expect(aItem.className).toMatch(/bg-brand-blue-primary/);
  });

  it('calls onSelect + onClose when an item is clicked', async () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(
      <CollectionSwitcherMenu
        collections={[coll('a', null, 0, 'A')]}
        activeCollectionId={null}
        onSelect={onSelect}
        onClose={onClose}
      />
    );
    await userEvent.click(screen.getByRole('menuitem', { name: 'A' }));
    expect(onSelect).toHaveBeenCalledWith('a');
    expect(onClose).toHaveBeenCalled();
  });

  it('passes null to onSelect for the root item', async () => {
    const onSelect = vi.fn();
    render(
      <CollectionSwitcherMenu
        collections={[]}
        activeCollectionId="a"
        onSelect={onSelect}
        onClose={vi.fn()}
      />
    );
    await userEvent.click(
      screen.getByRole('menuitem', { name: /all boards \(root\)/i })
    );
    expect(onSelect).toHaveBeenCalledWith(null);
  });
});
```

- [ ] **Step 2: Run + verify pass**

```bash
pnpm vitest run tests/components/layout/CollectionSwitcherMenu.test.tsx
```

Expected: 5 passing tests.

- [ ] **Step 3: Commit**

```bash
git add tests/components/layout/CollectionSwitcherMenu.test.tsx
git commit -m "test(layout): cover CollectionSwitcherMenu tree + selection"
```

### Task 2.4 — Wire `CollectionSwitcherMenu` into `BoardNavFab`

**Files:**

- Modify: `components/layout/BoardNavFab.tsx`

- [ ] **Step 1: Add state + collections + setActiveCollectionId hookup**

At the top of `BoardNavFab` add:

```typescript
const { user } = useAuth();
const { collections } = useCollections(user?.uid);
const { setActiveCollectionId } = useDashboard();
const [isCollectionMenuOpen, setIsCollectionMenuOpen] = useState(false);
```

Add the imports at the top:

```typescript
import { useAuth } from '@/context/useAuth';
import { useCollections } from '@/hooks/useCollections';
import { CollectionSwitcherMenu } from './CollectionSwitcherMenu';
```

- [ ] **Step 2: Render the submenu when open**

Inside the outer `<div>` (above the existing menu render), add:

```tsx
{
  isCollectionMenuOpen && (
    <CollectionSwitcherMenu
      collections={collections}
      activeCollectionId={activeCollectionId}
      onSelect={(id) => setActiveCollectionId(id)}
      onClose={() => setIsCollectionMenuOpen(false)}
    />
  );
}
```

The existing Board-list menu should be suppressed while the Collection submenu is open. Adjust the existing render condition:

```typescript
{isPickerOpen && !isCollectionMenuOpen && (
  <div role="menu" ...>
```

- [ ] **Step 3: Add a "Switch Collection" item at the top of the Board-list menu**

Inside the existing Board-list menu, BEFORE the `boardsInCollection.map(...)` block:

```tsx
{
  collections.length > 0 && (
    <button
      role="menuitem"
      onClick={() => {
        setIsPickerOpen(false);
        setIsCollectionMenuOpen(true);
      }}
      className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-white/80 hover:bg-white/10 border-b border-white/10 mb-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/50"
    >
      <Folder className="w-3.5 h-3.5 flex-shrink-0" />
      {t('boardNav.switchCollection', { defaultValue: 'Switch Collection…' })}
    </button>
  );
}
```

Add `Folder` to the existing `lucide-react` import line.

- [ ] **Step 4: Verify in dev server**

```bash
pnpm run dev
```

Expected:

1. With ≥ 1 Collections, kebab menu now has a "Switch Collection…" item at the top.
2. Clicking it opens the Collection submenu.
3. Picking a Collection switches the active Board to that Collection's last-visited / default / first Board.
4. Prev/next chevrons only iterate within the active Collection.

- [ ] **Step 5: Commit**

```bash
git add components/layout/BoardNavFab.tsx
git commit -m "feat(layout): wire Collection switcher into BoardNavFab"
```

---

## Phase 3 — Mounted-set state preservation (P4)

Today `DashboardView` mounts a single `<div key={activeDashboard.id}>` and re-mounts the whole subtree on every Board switch. Drawing canvas state, timer counts, video positions, and any other in-flight React state evaporate. This phase extracts the widget-canvas into its own component and renders an LRU window (default size 2) so the most-recent N Boards stay mounted with their state intact, hidden via `display: none` when inactive.

> **Safety rationale for cache size = 2.** Real K-12 classroom usage tops out at 1–2 boards in flight at once. Higher caps risk audio-context fights (TimeToolWidget singletons), runaway Firestore subscriptions (live-session children continue running for hidden boards), and webcam-permission contention. Two is enough to make "switch to check, switch back" preserve state without those failure modes appearing.

### Task 3.1 — Cache config + LRU hook

**Files:**

- Create: `config/mountedBoardCache.ts`
- Create: `hooks/useMountedBoardCache.ts`

- [ ] **Step 1: Write the config**

```typescript
/**
 * Number of Boards held mounted at any moment. Active Board + (N-1)
 * most-recently-touched. Live-session-active Boards are pinned in
 * addition to the LRU set (never evicted while the session is live).
 *
 * Default 2: enough to make "switch to look up something, switch back"
 * preserve drawing/timer/video state on the originating Board. Higher
 * values risk audio-context fights, webcam contention, and unbounded
 * Firestore subscriptions in hidden Boards' widgets.
 */
export const MOUNTED_BOARD_CACHE_SIZE = 2;
```

- [ ] **Step 2: Write the hook**

```typescript
import { useEffect, useRef, useMemo } from 'react';
import type { Dashboard } from '@/types';
import { MOUNTED_BOARD_CACHE_SIZE } from '@/config/mountedBoardCache';

/**
 * Maintains an LRU set of Dashboard IDs that should be mounted.
 *
 * Inputs:
 * - `activeId` — the currently visible Board id. Bumped to most-recent on
 *   every change.
 * - `dashboards` — full Dashboard list; we filter out IDs that no longer
 *   exist (deleted) before returning, so the layer never tries to render
 *   a stale Board.
 * - `pinnedIds` — IDs that MUST stay mounted regardless of LRU position.
 *   Used to keep live-session hosts pinned so a session never dies just
 *   because the teacher switched away briefly.
 *
 * Returns the Dashboards (in LRU-old-to-new order) that should be mounted.
 */
export const useMountedBoardCache = (
  activeId: string | null,
  dashboards: Dashboard[],
  pinnedIds: Set<string> = new Set()
): Dashboard[] => {
  // Ordered array — oldest first, newest last. Operates by ref so
  // re-renders driven by widget state inside hidden Boards don't trigger
  // a setState/rerender cascade in the parent.
  const lruRef = useRef<string[]>([]);

  // Bump on activeId change (kept synchronous so the first render sees
  // the new id at the end of the array).
  useEffect(() => {
    if (!activeId) return;
    const existing = lruRef.current.filter((id) => id !== activeId);
    lruRef.current = [...existing, activeId];
  }, [activeId]);

  return useMemo(() => {
    const knownIds = new Set(dashboards.map((d) => d.id));
    // Prune deleted Boards from the LRU before applying caps.
    lruRef.current = lruRef.current.filter((id) => knownIds.has(id));

    // Force `activeId` to the tail even on the first render (the effect
    // above runs AFTER the first paint; this guarantees the active Board
    // is visible immediately).
    let working = lruRef.current;
    if (activeId && knownIds.has(activeId)) {
      working = [...working.filter((id) => id !== activeId), activeId];
    }

    // Cap to MOUNTED_BOARD_CACHE_SIZE, but never evict a pinned ID.
    // Walk from oldest forward, dropping non-pinned entries until we fit.
    const cap = Math.max(1, MOUNTED_BOARD_CACHE_SIZE);
    let pinnedCount = 0;
    for (const id of working) if (pinnedIds.has(id)) pinnedCount += 1;
    const capForLru = Math.max(1, cap - pinnedCount);

    const pinnedSlots: string[] = [];
    const lruSlots: string[] = [];
    for (const id of working) {
      if (pinnedIds.has(id)) pinnedSlots.push(id);
      else lruSlots.push(id);
    }
    // Keep only the most-recent `capForLru` non-pinned entries.
    const keptLru =
      lruSlots.length > capForLru ? lruSlots.slice(-capForLru) : lruSlots;

    const orderedKeptIds = new Set([...pinnedSlots, ...keptLru]);
    const ordered = working.filter((id) => orderedKeptIds.has(id));
    return ordered
      .map((id) => dashboards.find((d) => d.id === id))
      .filter((d): d is Dashboard => Boolean(d));
  }, [activeId, dashboards, pinnedIds]);
};
```

- [ ] **Step 3: Type-check + commit**

```bash
pnpm run type-check
git add config/mountedBoardCache.ts hooks/useMountedBoardCache.ts
git commit -m "feat(layout): add MOUNTED_BOARD_CACHE_SIZE + useMountedBoardCache"
```

### Task 3.2 — Tests for `useMountedBoardCache`

**Files:**

- Create: `tests/hooks/useMountedBoardCache.test.ts`

- [ ] **Step 1: Write the tests**

```typescript
import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useMountedBoardCache } from '@/hooks/useMountedBoardCache';
import type { Dashboard } from '@/types';

vi.mock('@/config/mountedBoardCache', () => ({
  MOUNTED_BOARD_CACHE_SIZE: 2,
}));

const board = (id: string): Dashboard => ({
  id,
  name: id,
  background: 'bg-slate-800',
  widgets: [],
  createdAt: 0,
  collectionId: null,
});

describe('useMountedBoardCache', () => {
  it('returns just the active Board on first render', () => {
    const all = [board('a'), board('b'), board('c')];
    const { result } = renderHook(() => useMountedBoardCache('a', all));
    expect(result.current.map((d) => d.id)).toEqual(['a']);
  });

  it('keeps the previously-active Board after one switch', () => {
    const all = [board('a'), board('b'), board('c')];
    const { result, rerender } = renderHook(
      ({ activeId }) => useMountedBoardCache(activeId, all),
      { initialProps: { activeId: 'a' } }
    );
    rerender({ activeId: 'b' });
    expect(result.current.map((d) => d.id).sort()).toEqual(['a', 'b']);
  });

  it('evicts the oldest non-active Board when the cap is exceeded', () => {
    const all = [board('a'), board('b'), board('c')];
    const { result, rerender } = renderHook(
      ({ activeId }) => useMountedBoardCache(activeId, all),
      { initialProps: { activeId: 'a' } }
    );
    rerender({ activeId: 'b' });
    rerender({ activeId: 'c' });
    // Cap = 2. 'a' should have been evicted.
    expect(result.current.map((d) => d.id).sort()).toEqual(['b', 'c']);
  });

  it('never evicts a pinned Board', () => {
    const all = [board('a'), board('b'), board('c')];
    const pinned = new Set(['a']);
    const { result, rerender } = renderHook(
      ({ activeId }) => useMountedBoardCache(activeId, all, pinned),
      { initialProps: { activeId: 'a' } }
    );
    rerender({ activeId: 'b' });
    rerender({ activeId: 'c' });
    // 'a' is pinned, must stay. Active is 'c'. Cap is 2 → only 1 LRU slot
    // remains beside the pinned 'a'. 'c' is active so it takes the slot;
    // 'b' is evicted.
    expect(result.current.map((d) => d.id).sort()).toEqual(['a', 'c']);
  });

  it('drops a Board that no longer exists in the dashboard list', () => {
    const initial = [board('a'), board('b')];
    const { result, rerender } = renderHook(
      ({ activeId, all }: { activeId: string; all: Dashboard[] }) =>
        useMountedBoardCache(activeId, all),
      { initialProps: { activeId: 'a', all: initial } }
    );
    rerender({ activeId: 'b', all: initial });
    rerender({ activeId: 'b', all: [board('b')] });
    expect(result.current.map((d) => d.id)).toEqual(['b']);
  });
});
```

- [ ] **Step 2: Run + verify pass**

```bash
pnpm vitest run tests/hooks/useMountedBoardCache.test.ts
```

Expected: 5 passing tests.

- [ ] **Step 3: Commit**

```bash
git add tests/hooks/useMountedBoardCache.test.ts
git commit -m "test(layout): cover useMountedBoardCache LRU + pinning + pruning"
```

### Task 3.3 — Extract `BoardCanvas` from `DashboardView`

**Files:**

- Create: `components/layout/BoardCanvas.tsx`
- Modify: `components/layout/DashboardView.tsx`

- [ ] **Step 1: Identify the extraction boundary**

In `DashboardView.tsx`, find the existing single-board mount block (search for `key={activeDashboard.id}` on the outer wrapper, around line 1625). The block ends at the close of `</div>` that wraps `activeDashboard.widgets.map(...)`.

- [ ] **Step 2: Create `BoardCanvas.tsx` with the extracted markup**

```tsx
import { type FC } from 'react';
import type { Dashboard } from '@/types';
import { WidgetRenderer } from '@/components/widgets/WidgetRenderer';
// (Copy any other imports the extracted block requires — Spotlight,
// session helpers, etc. The extracted block currently lives inside the
// scope of DashboardView's hooks, so the new component needs to receive
// what it consumes as PROPS rather than reading from useDashboard
// directly. This keeps the LRU window cheap to render — only the active
// Board re-reads context.)

interface BoardCanvasProps {
  dashboard: Dashboard;
  isActive: boolean;
  isMinimized: boolean;
  // Pass in everything the inner block reads. See DashboardView for the
  // exact list — typically session{}, students, updateWidget, etc.
  // KEEP THIS PROP LIST EXPLICIT — that's how we ensure the hidden
  // Boards don't accidentally re-render on unrelated state changes.
  sessionForBoard: SessionShape | null;
  // … all other previously-inlined dependencies
}

// SessionShape declared locally for the props interface — extract from
// existing `session` shape in DashboardView.
type SessionShape = {
  isActive: boolean;
  activeWidgetId: string | null;
  code?: string;
  frozen?: boolean;
};

export const BoardCanvas: FC<BoardCanvasProps> = ({
  dashboard,
  isActive,
  isMinimized,
  sessionForBoard,
  // ... rest
}) => {
  return (
    <div
      className={`absolute inset-0 transition-opacity duration-200 ease-in-out ${
        isActive
          ? 'opacity-100 pointer-events-auto'
          : 'opacity-0 pointer-events-none'
      }`}
      style={{
        // Hidden Boards stay mounted (preserves state) but are not in
        // the accessibility tree and don't intercept pointer events.
        display: isActive ? 'block' : 'none',
        transform: isMinimized && isActive ? 'translateY(80vh)' : undefined,
        transformOrigin: isMinimized ? 'bottom center' : 'center center',
        opacity: isMinimized && isActive ? 0 : isActive ? 1 : 0,
        pointerEvents:
          isMinimized && isActive ? 'none' : isActive ? 'auto' : 'none',
      }}
      aria-hidden={!isActive}
      data-board-id={dashboard.id}
    >
      {dashboard.widgets.map((widget) => {
        const isLive =
          sessionForBoard?.isActive &&
          sessionForBoard?.activeWidgetId === widget.id;
        return (
          <WidgetRenderer
            key={widget.id}
            widget={widget}
            isStudentView={false}
            sessionCode={sessionForBoard?.code}
            isGlobalFrozen={sessionForBoard?.frozen ?? false}
            isLive={isLive ?? false}
            // ... pass-through every other prop the inline version supplied
          />
        );
      })}
    </div>
  );
};
```

> **Implementation note for the engineer.** The actual extraction in this step is mechanical: copy the inner `<div key={activeDashboard.id}>...</div>` from `DashboardView` verbatim, replace `activeDashboard` with `dashboard`, change the `key` to `dashboard.id` (it now needs to be unique across multiple mounted instances), and lift every closure value the block reads into a prop. The example above shows the SHAPE of the component — the prop list will be longer in practice; copy it from `DashboardView`'s existing call site.

- [ ] **Step 3: Type-check + commit**

```bash
pnpm run type-check
git add components/layout/BoardCanvas.tsx
git commit -m "feat(layout): extract BoardCanvas from DashboardView"
```

### Task 3.4 — Render through `MountedBoardsLayer`

**Files:**

- Create: `components/layout/MountedBoardsLayer.tsx`
- Modify: `components/layout/DashboardView.tsx`

- [ ] **Step 1: Write `MountedBoardsLayer`**

```tsx
import { type FC, useMemo } from 'react';
import type { Dashboard } from '@/types';
import { useMountedBoardCache } from '@/hooks/useMountedBoardCache';
import { BoardCanvas } from './BoardCanvas';

interface MountedBoardsLayerProps {
  activeId: string | null;
  dashboards: Dashboard[];
  isMinimized: boolean;
  // Map of (boardId → SessionShape) so each canvas gets its own slot.
  // For now only the active Board has a live session, so the map will
  // have at most one entry; passing it through as a map lets Plan 3
  // (Collection-sharing) add per-Board session pinning later.
  sessions?: Map<string, unknown>;
  // …pass-through props for BoardCanvas, exact list per Task 3.3
}

export const MountedBoardsLayer: FC<MountedBoardsLayerProps> = ({
  activeId,
  dashboards,
  isMinimized,
  sessions,
  ...passthrough
}) => {
  const pinnedIds = useMemo(() => {
    const s = new Set<string>();
    if (sessions) {
      for (const [boardId] of sessions) s.add(boardId);
    }
    return s;
  }, [sessions]);

  const mounted = useMountedBoardCache(activeId, dashboards, pinnedIds);

  return (
    <div className="relative w-full h-full">
      {mounted.map((db) => (
        <BoardCanvas
          key={db.id}
          dashboard={db}
          isActive={db.id === activeId}
          isMinimized={isMinimized}
          sessionForBoard={(sessions?.get(db.id) ?? null) as never}
          {...passthrough}
        />
      ))}
    </div>
  );
};
```

- [ ] **Step 2: Replace the inline canvas mount in `DashboardView`**

Where the inline `<div key={activeDashboard.id}>...</div>` lived, render:

```tsx
<MountedBoardsLayer
  activeId={activeDashboard?.id ?? null}
  dashboards={dashboards}
  isMinimized={isMinimized}
  sessions={
    session?.isActive && activeDashboard
      ? new Map([[activeDashboard.id, session]])
      : undefined
  }
  // …pass-through every prop the inline block supplied to WidgetRenderer
/>
```

The `key={activeDashboard.id}` reset is GONE. Verify that `rescueWidgetsRef` (around line 701) and `lastDashboardId` (around line 766) still behave correctly: both should observe `activeDashboard.id` changes via the existing state hooks, NOT via a remount.

- [ ] **Step 3: Verify in dev server**

```bash
pnpm run dev
```

Test plan:

1. Load a Board with the TimeToolWidget. Start a 5-min timer.
2. Switch to another Board.
3. Switch back. The timer should still be counting (not reset to 5:00).
4. Switch to a THIRD Board, then a FOURTH. Switch back to the first.
5. The first should be re-mounted fresh (cap = 2 → it was evicted).

- [ ] **Step 4: Commit**

```bash
git add components/layout/MountedBoardsLayer.tsx components/layout/DashboardView.tsx
git commit -m "feat(layout): mount Boards via MountedBoardsLayer LRU window"
```

### Task 3.5 — Tests for `MountedBoardsLayer`

**Files:**

- Create: `tests/components/layout/MountedBoardsLayer.test.tsx`

- [ ] **Step 1: Write the test (focused on visibility toggling — LRU coverage already in hook tests)**

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MountedBoardsLayer } from '@/components/layout/MountedBoardsLayer';
import type { Dashboard } from '@/types';

vi.mock('@/components/layout/BoardCanvas', () => ({
  BoardCanvas: ({
    dashboard,
    isActive,
  }: {
    dashboard: Dashboard;
    isActive: boolean;
  }) => (
    <div
      data-testid={`canvas-${dashboard.id}`}
      data-active={isActive ? 'true' : 'false'}
    >
      {dashboard.name}
    </div>
  ),
}));

const board = (id: string): Dashboard => ({
  id,
  name: id,
  background: 'bg-slate-800',
  widgets: [],
  createdAt: 0,
  collectionId: null,
});

describe('MountedBoardsLayer', () => {
  it('mounts only the active Board on first render', () => {
    render(
      <MountedBoardsLayer
        activeId="a"
        dashboards={[board('a'), board('b')]}
        isMinimized={false}
      />
    );
    expect(screen.getByTestId('canvas-a')).toHaveAttribute(
      'data-active',
      'true'
    );
    expect(screen.queryByTestId('canvas-b')).not.toBeInTheDocument();
  });

  it('mounts pinned Boards even when they are not active', () => {
    const sessions = new Map<string, unknown>([['b', { isActive: true }]]);
    render(
      <MountedBoardsLayer
        activeId="a"
        dashboards={[board('a'), board('b')]}
        isMinimized={false}
        sessions={sessions}
      />
    );
    expect(screen.getByTestId('canvas-a')).toHaveAttribute(
      'data-active',
      'true'
    );
    expect(screen.getByTestId('canvas-b')).toHaveAttribute(
      'data-active',
      'false'
    );
  });
});
```

- [ ] **Step 2: Run + verify pass**

```bash
pnpm vitest run tests/components/layout/MountedBoardsLayer.test.tsx
```

Expected: 2 passing tests.

- [ ] **Step 3: Commit**

```bash
git add tests/components/layout/MountedBoardsLayer.test.tsx
git commit -m "test(layout): cover MountedBoardsLayer active/pinned wiring"
```

---

## Phase 4 — i18n + E2E + acceptance

### Task 4.1 — Add the new i18n keys

**Files:**

- Modify: `locales/en.json`, `locales/de.json`, `locales/es.json`, `locales/fr.json`

- [ ] **Step 1: Append the new keys in each locale file**

Under the existing top-level groups, add (English fallback for non-en locales — matches Plan 1's pattern):

```json
"boardBreadcrumb": {
  "root": "All Boards",
  "openManager": "Manage Boards"
},
"collectionSwitcher": {
  "title": "Switch Collection",
  "root": "All Boards (root)"
},
"boardNav": {
  "switchCollection": "Switch Collection…"
}
```

Place inside the existing JSON object — `boardNav` keys already exist in the en file, so add `switchCollection` to that group, not as a new group.

- [ ] **Step 2: Commit**

```bash
git add locales/
git commit -m "i18n: add boardBreadcrumb + collectionSwitcher keys"
```

### Task 4.2 — E2E happy-path

**Files:**

- Create: `tests/e2e/collections-fab.spec.ts`

- [ ] **Step 1: Write the spec**

```typescript
import { test, expect } from '@playwright/test';

test.describe('Collections — FAB + Breadcrumb + app-open', () => {
  test.beforeEach(async ({ page }) => {
    await page.addStyleTag({
      content:
        '*, *::before, *::after { transition: none !important; animation: none !important; }',
    });
    await page.goto('/');
    await expect(page.getByTitle('Open Menu')).toBeVisible({ timeout: 15000 });
  });

  test('breadcrumb chip shows the active Collection and Board name', async ({
    page,
  }) => {
    // With no Collection, the chip should show "All Boards › <Board name>".
    const chip = page
      .locator('button')
      .filter({ hasText: /All Boards/i })
      .filter({ hasText: />/ });
    await expect(chip.first()).toBeVisible({ timeout: 10000 });
  });

  test('FAB kebab popover lists only Boards in the active Collection', async ({
    page,
  }) => {
    // Open Boards modal, create a Collection + 2 Boards inside it, then
    // verify the FAB picker only iterates those two.
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
    const prompt = page.getByRole('dialog', { name: /new collection/i });
    await prompt.getByRole('textbox').fill('Collection FAB');
    await prompt.getByRole('button', { name: /^create$/i }).click();

    await modal.getByText('Collection FAB').first().click();
    await modal.getByRole('button', { name: /new board/i }).click();
    const boardPrompt = page.getByRole('dialog', { name: /new board/i });
    await boardPrompt.getByRole('textbox').fill('FAB Board 1');
    await boardPrompt.getByRole('button', { name: /^create$/i }).click();

    // Close modal — Board 1 is now active inside "Collection FAB".
    await modal.getByRole('button', { name: /close/i }).click();

    // FAB shouldn't render with only 1 Board in the active Collection.
    await expect(page.getByLabel('Select board')).toBeHidden();
  });
});
```

- [ ] **Step 2: Run locally**

```bash
pnpm exec playwright test tests/e2e/collections-fab.spec.ts --reporter=line
```

Expected: 2 passing tests.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/collections-fab.spec.ts
git commit -m "test(e2e): cover FAB Collection filter + breadcrumb chip"
```

### Task 4.3 — Final validate + acceptance walkthrough

- [ ] **Step 1: Run the full validation**

```bash
pnpm run validate
```

Expected: type-check clean, lint clean, format clean, all unit + functions tests pass.

- [ ] **Step 2: Manual acceptance**

In a dev session:

1. **App-open restore.** Sign in. Pick a Board inside Collection X. Close the browser tab. Reopen. Expect to land on the same Board inside Collection X (not the global default).
2. **Breadcrumb chip.** Visible above the FAB. Shows Collection name + active Board name. Click → BoardsModal opens.
3. **FAB scope.** Kebab menu lists only the Boards in the active Collection. Prev/next chevrons wrap inside the Collection.
4. **Switch Collection.** Kebab menu has "Switch Collection…" at the top. Picking another Collection loads its last-visited Board.
5. **State preservation.** Open a TimeToolWidget on Board A, start the timer. Switch to Board B. Switch back to A. Timer is still counting.
6. **LRU eviction.** Continue from #5. Switch to Boards C, D. Switch back to A. Timer is RESET (A was evicted from the cap-2 cache).

- [ ] **Step 3: Commit (no code) — push for CI**

```bash
git push -u origin claude/<branch-name>
```

---

## Acceptance criteria

- [ ] App-open lands on `lastBoardIdByCollection[lastActiveCollectionId]` when populated.
- [ ] Breadcrumb chip visible, shows correct Collection + Board.
- [ ] FAB kebab menu and prev/next chevrons operate only within the active Collection.
- [ ] "Switch Collection…" item present when ≥ 1 Collection exists; opens the switcher submenu.
- [ ] Switching Collections via the submenu loads the right Board for that Collection (memory → defaultBoardId → first board → fallback).
- [ ] Cache size 2: previous Board's React state preserved on switch-back within the cache window.
- [ ] Live-session-active Boards are pinned in the cache (never evicted while the session is live).
- [ ] No regressions: existing E2E + unit tests pass; `sharing.spec.ts` + `collections.spec.ts` continue to pass.
- [ ] No `console.error` introduced; new logging uses `logError` per project standard.
- [ ] All new i18n strings have `defaultValue` fallbacks; en + de + es + fr files updated.

---

## Known limitations

1. **Cache eviction discards in-flight state.** When a Board is evicted from the LRU window, its React state is lost — same as today's full-remount behavior. Lifting persistent-but-evicted state into Firestore is out of scope.
2. **Cap = 2 is conservative.** Tuning happens in `config/mountedBoardCache.ts`. Higher values risk audio-context contention, multiple webcams contending for `getUserMedia`, and Firestore subscription proliferation. Bump only after measuring.
3. **Live-session pinning is single-host.** If a host runs a live session on Board A then opens Board B and starts another session, both stay pinned — but the existing live-session machinery in Plan 1 only supports one active session per teacher, so this is a theoretical concern.
4. **Per-Collection `defaultBoardId` UI surfaces are deferred.** Plan 1's data layer supports `Collection.defaultBoardId`, but no UI exposes it yet — Plan 2 reads it in `pickInitialBoard` for app-open behavior, but setting it is still admin-only via direct Firestore writes. A "Set as Collection default" context-menu item is deferred.
5. **No URL routing for Collection state.** Deep-linking to `/c/{collectionId}` is out of scope; navigation memory lives entirely in `userProfile`.
6. **No animation on Board switch.** Today's fade-in animation tied to the remount disappears with the mounted-set refactor. Re-adding it would require animating the visibility toggle in `BoardCanvas`; deferred.

---

## Commit-history outline (chronological)

1. `feat(boards): add pickInitialBoard pure resolver for app-open`
2. `test(boards): cover pickInitialBoard fallback chain`
3. `feat(dashboard): wire pickInitialBoard into snapshot initial select`
4. `feat(dashboard): defer initial-board select until profile+collections land`
5. `feat(dashboard): add setActiveCollectionId action`
6. `feat(layout): add BoardBreadcrumb chip`
7. `test(layout): cover BoardBreadcrumb rendering + click-to-open`
8. `feat(layout): mount BoardBreadcrumb above BoardNavFab`
9. `feat(layout): FAB iterates Boards within active Collection`
10. `feat(layout): add CollectionSwitcherMenu submenu`
11. `test(layout): cover CollectionSwitcherMenu tree + selection`
12. `feat(layout): wire Collection switcher into BoardNavFab`
13. `feat(layout): add MOUNTED_BOARD_CACHE_SIZE + useMountedBoardCache`
14. `test(layout): cover useMountedBoardCache LRU + pinning + pruning`
15. `feat(layout): extract BoardCanvas from DashboardView`
16. `feat(layout): mount Boards via MountedBoardsLayer LRU window`
17. `test(layout): cover MountedBoardsLayer active/pinned wiring`
18. `i18n: add boardBreadcrumb + collectionSwitcher keys`
19. `test(e2e): cover FAB Collection filter + breadcrumb chip`
