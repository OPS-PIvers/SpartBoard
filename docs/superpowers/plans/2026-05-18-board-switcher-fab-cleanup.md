# Board Switcher FAB Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the always-visible Collection › Board breadcrumb pill (make it transient on change/mount) and replace the FAB-row kebab with dedicated Collections + Boards buttons that each open their pickers in a single tap.

**Architecture:** Refactor in place — no new files, no new context, no API changes. `BoardBreadcrumb` becomes a self-managed transient component (timer + opacity transition). `BoardNavFab` swaps its single kebab for two icon buttons (`Folder` + `LayoutGrid`), removes the in-menu "Switch Collection…" entry (replaced by the dedicated Collections button), and gains a "Manage all boards…" footer item that opens `BoardsModal` directly.

**Tech Stack:** React 19, TypeScript, Tailwind CSS (with `motion-reduce:` utilities), Vitest + React Testing Library, lucide-react icons, i18next.

**Spec:** [docs/superpowers/specs/2026-05-18-board-switcher-fab-cleanup-design.md](../specs/2026-05-18-board-switcher-fab-cleanup-design.md)

---

## File Map

**Modified:**

- `locales/en.json` — add 2 new keys (`boardNav.selectCollection`, `boardNav.manageAllBoards`)
- `components/layout/BoardBreadcrumb.tsx` — convert to transient (timer + fade)
- `components/layout/BoardNavFab.tsx` — split kebab into Collections + Boards buttons; remove "Switch Collection…" menu entry; add "Manage all boards…" footer item; update FAB-row visibility rule

**Updated tests:**

- `tests/components/layout/BoardBreadcrumb.test.tsx` — replace persistent-render assertions with transient-display assertions (uses `vi.useFakeTimers`)

**New tests:**

- `tests/components/layout/BoardNavFab.test.tsx` — currently missing; create from scratch to cover the new visibility rules, both menus, and the "Manage all boards…" path

**Untouched (verified):**

- `components/layout/CollectionSwitcherMenu.tsx` — no behavior change; only gets a new caller
- `tests/components/layout/CollectionSwitcherMenu.test.tsx` — keep as-is
- `components/boardsModal/BoardsModal.tsx` — no change
- `components/layout/DashboardView.tsx` — no change (still mounts `<BoardNavFab />` which mounts the pill internally; the pill's lifecycle aligns with the FAB row's visibility, which is the desired behavior per the spec)

---

## Task 1: Add i18n keys

**Files:**

- Modify: `locales/en.json`

- [ ] **Step 1: Add the two new keys to the `boardNav` block**

Edit `locales/en.json`. Find the existing block:

```json
  "boardNav": {
    "previous": "Previous board",
    "next": "Next board",
    "selectBoard": "Select board",
    "boardList": "All boards",
    "switchCollection": "Switch Collection…"
  },
```

Replace it with:

```json
  "boardNav": {
    "previous": "Previous board",
    "next": "Next board",
    "selectBoard": "Select board",
    "selectCollection": "Select collection",
    "boardList": "All boards",
    "switchCollection": "Switch Collection…",
    "manageAllBoards": "Manage all boards…"
  },
```

(`switchCollection` is kept for now — it's removed by Task 3 once nothing references it.)

- [ ] **Step 2: Verify JSON is valid**

Run:

```bash
node -e "JSON.parse(require('fs').readFileSync('locales/en.json','utf8'))" && echo OK
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add locales/en.json
git commit -m "i18n(en): add selectCollection + manageAllBoards keys for board nav FAB"
```

---

## Task 2: Convert BoardBreadcrumb to transient pill

**Files:**

- Modify: `components/layout/BoardBreadcrumb.tsx`
- Test: `tests/components/layout/BoardBreadcrumb.test.tsx` (full rewrite — the persistent-render assumptions no longer hold)

### Design notes

- Display window: 3000ms, then fade out via Tailwind opacity transition. `motion-reduce:` utility skips the transition entirely (no JS matchMedia needed).
- Single `useEffect` watching `[activeDashboard?.id, activeDashboard?.collectionId]`. Both-changes-in-one-commit case is handled automatically by React (one effect run per commit, not per dep change) — the existing timer is cleared and a fresh one is scheduled, so the pill shows once for 3s.
- First mount: the same effect runs on mount, so the pill shows on initial load with no extra code.
- Click handler stays the same — opens `BoardsModal`.

- [ ] **Step 1: Rewrite the test file**

Replace the entire contents of `tests/components/layout/BoardBreadcrumb.test.tsx` with:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BoardBreadcrumb } from '@/components/layout/BoardBreadcrumb';
import type { useDashboard } from '@/context/useDashboard';

const useDashboardMock = vi.fn();

vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => useDashboardMock() as ReturnType<typeof useDashboard>,
}));
vi.mock('@/components/boardsModal/BoardsModal', () => ({
  BoardsModal: ({ onClose }: { onClose: () => void }) => (
    <div role="dialog" aria-label="Boards Modal">
      <button onClick={onClose}>close-modal</button>
    </div>
  ),
}));

const collection = (id: string, name: string) => ({
  id,
  name,
  parentCollectionId: null,
  order: 0,
  createdAt: 0,
});

describe('BoardBreadcrumb (transient)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders nothing when there is no active dashboard', () => {
    useDashboardMock.mockReturnValue({
      activeDashboard: null,
      collectionsApi: { collections: [] },
    });
    const { container } = render(<BoardBreadcrumb />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders on first mount with "All Boards" when active board has no Collection', () => {
    useDashboardMock.mockReturnValue({
      activeDashboard: { id: 'd1', name: 'My Board', collectionId: null },
      collectionsApi: { collections: [] },
    });
    render(<BoardBreadcrumb />);
    expect(screen.getByText('All Boards')).toBeInTheDocument();
    expect(screen.getByText('My Board')).toBeInTheDocument();
  });

  it('renders the Collection name when the active board is in a Collection', () => {
    useDashboardMock.mockReturnValue({
      activeDashboard: { id: 'd1', name: 'Warmup', collectionId: 'c1' },
      collectionsApi: { collections: [collection('c1', 'Math')] },
    });
    render(<BoardBreadcrumb />);
    expect(screen.getByText('Math')).toBeInTheDocument();
    expect(screen.getByText('Warmup')).toBeInTheDocument();
  });

  it('disappears after the 3-second display window', () => {
    useDashboardMock.mockReturnValue({
      activeDashboard: { id: 'd1', name: 'My Board', collectionId: null },
      collectionsApi: { collections: [] },
    });
    render(<BoardBreadcrumb />);
    expect(screen.getByText('My Board')).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(3500);
    });
    expect(screen.queryByText('My Board')).not.toBeInTheDocument();
  });

  it('re-appears when activeDashboard.id changes', () => {
    useDashboardMock.mockReturnValue({
      activeDashboard: { id: 'd1', name: 'Board A', collectionId: null },
      collectionsApi: { collections: [] },
    });
    const { rerender } = render(<BoardBreadcrumb />);
    act(() => {
      vi.advanceTimersByTime(3500);
    });
    expect(screen.queryByText('Board A')).not.toBeInTheDocument();

    useDashboardMock.mockReturnValue({
      activeDashboard: { id: 'd2', name: 'Board B', collectionId: null },
      collectionsApi: { collections: [] },
    });
    rerender(<BoardBreadcrumb />);
    expect(screen.getByText('Board B')).toBeInTheDocument();
  });

  it('re-appears when activeDashboard.collectionId changes', () => {
    useDashboardMock.mockReturnValue({
      activeDashboard: { id: 'd1', name: 'Board A', collectionId: null },
      collectionsApi: { collections: [collection('c1', 'Math')] },
    });
    const { rerender } = render(<BoardBreadcrumb />);
    act(() => {
      vi.advanceTimersByTime(3500);
    });
    expect(screen.queryByText('Board A')).not.toBeInTheDocument();

    useDashboardMock.mockReturnValue({
      activeDashboard: { id: 'd1', name: 'Board A', collectionId: 'c1' },
      collectionsApi: { collections: [collection('c1', 'Math')] },
    });
    rerender(<BoardBreadcrumb />);
    expect(screen.getByText('Board A')).toBeInTheDocument();
    expect(screen.getByText('Math')).toBeInTheDocument();
  });

  it('shows the pill exactly once when board and collection change in the same render', () => {
    useDashboardMock.mockReturnValue({
      activeDashboard: { id: 'd1', name: 'Board A', collectionId: 'c1' },
      collectionsApi: {
        collections: [collection('c1', 'Math'), collection('c2', 'Reading')],
      },
    });
    const { rerender } = render(<BoardBreadcrumb />);
    act(() => {
      vi.advanceTimersByTime(3500);
    });
    expect(screen.queryByText('Board A')).not.toBeInTheDocument();

    // Single render commit changes BOTH id and collectionId.
    useDashboardMock.mockReturnValue({
      activeDashboard: { id: 'd2', name: 'Board B', collectionId: 'c2' },
      collectionsApi: {
        collections: [collection('c1', 'Math'), collection('c2', 'Reading')],
      },
    });
    rerender(<BoardBreadcrumb />);
    expect(screen.getByText('Board B')).toBeInTheDocument();

    // 3.5s later the pill should be gone — one timer scheduled, not two.
    act(() => {
      vi.advanceTimersByTime(3500);
    });
    expect(screen.queryByText('Board B')).not.toBeInTheDocument();
  });

  it('opens BoardsModal when clicked during the display window', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    useDashboardMock.mockReturnValue({
      activeDashboard: { id: 'd1', name: 'Board A', collectionId: null },
      collectionsApi: { collections: [] },
    });
    render(<BoardBreadcrumb />);
    await user.click(
      screen.getByRole('button', { name: /manage boards/i })
    );
    expect(
      screen.getByRole('dialog', { name: 'Boards Modal' })
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
pnpm vitest run tests/components/layout/BoardBreadcrumb.test.tsx
```

Expected: most tests fail (the existing component is always visible and has no timers). You should see failures on `disappears after the 3-second display window`, `re-appears when ...`, and `shows the pill exactly once ...`.

- [ ] **Step 3: Rewrite the component**

Replace the entire contents of `components/layout/BoardBreadcrumb.tsx` with:

```typescript
import { type FC, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Folder, ChevronRight } from 'lucide-react';
import { useDashboard } from '@/context/useDashboard';
import { BoardsModal } from '@/components/boardsModal/BoardsModal';

const DISPLAY_MS = 3000;

export const BoardBreadcrumb: FC = () => {
  const { t } = useTranslation();
  const {
    activeDashboard,
    collectionsApi: { collections },
  } = useDashboard();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isVisible, setIsVisible] = useState(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeId = activeDashboard?.id;
  const activeCollectionId = activeDashboard?.collectionId ?? null;

  // Show the pill on first mount and whenever the active board or its
  // Collection changes. React batches multiple dep changes per commit into a
  // single effect run, so a board-switch that also changes Collection only
  // schedules one timer.
  useEffect(() => {
    if (!activeId) return;
    setIsVisible(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setIsVisible(false), DISPLAY_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [activeId, activeCollectionId]);

  if (!activeDashboard) return null;
  if (!isVisible && !isModalOpen) return null;

  const collection = activeCollectionId
    ? collections.find((c) => c.id === activeCollectionId)
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
        className={`inline-flex items-center gap-1 max-w-[40vw] px-2.5 py-1 rounded-full bg-slate-900/70 backdrop-blur-md text-xxs font-medium text-white/80 hover:bg-slate-900/85 hover:text-white transition-opacity duration-300 motion-reduce:transition-none ${
          isVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
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

Why the `!isVisible && !isModalOpen` short-circuit: once the pill has faded and there's no open modal, return `null` so the unmounted DOM doesn't intercept clicks under the FAB row. While the modal is open we keep the pill mounted (faded out, pointer-events-none) so its `isModalOpen` state survives.

Why opacity transition rather than mount/unmount: keeps the fade smooth and avoids re-running React layout when the pill comes back.

- [ ] **Step 4: Run the tests to verify they pass**

Run:

```bash
pnpm vitest run tests/components/layout/BoardBreadcrumb.test.tsx
```

Expected: all 8 tests pass.

- [ ] **Step 5: Commit**

```bash
git add components/layout/BoardBreadcrumb.tsx tests/components/layout/BoardBreadcrumb.test.tsx
git commit -m "feat(board-breadcrumb): transient display on board/collection change

3s show window then opacity fade. Honours prefers-reduced-motion via
Tailwind's motion-reduce: utility. Click target stays live through the
display window so the existing 'tap pill -> open BoardsModal' affordance
is preserved for users who've learned it."
```

---

## Task 3: BoardNavFab — split kebab into Collections + Boards buttons

**Files:**

- Modify: `components/layout/BoardNavFab.tsx`
- Test: `tests/components/layout/BoardNavFab.test.tsx` (new — file currently does not exist)

### Design notes

- Replace the single `MoreVertical` kebab with two buttons: a `Folder` (Collections) and a `LayoutGrid` (Boards).
- Collections button: hidden when `collections.length < 2` (spec rule — with one named Collection there's nothing meaningful to "switch between" from the FAB; Root↔single-Collection traversal goes through "Manage all boards…" instead).
- FAB-row visibility: today renders only when `boardsInCollection.length > 1`. New rule: renders when `dashboards.length > 1` OR `collections.length > 0`. Inside the row: prev/next conditionally render when `boardsInCollection.length >= 2`.
- Boards menu loses its in-place "Switch Collection…" item (the dedicated Collections button replaces it) and gains a "Manage all boards…" footer item that opens `BoardsModal` (added in Task 4 — this task only restructures the buttons + removes the in-menu collection trigger).
- Keyboard navigation: with the "Switch Collection…" item gone, `itemRefs` no longer needs a `switchSlot` offset; refs are indexed by board position only.

This task is intentionally scoped to the button restructure + removal of the in-menu collection trigger. Task 4 adds the "Manage all boards…" item — splitting them keeps each commit reviewable on its own.

- [ ] **Step 1: Create the new test file**

Create `tests/components/layout/BoardNavFab.test.tsx` with:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BoardNavFab } from '@/components/layout/BoardNavFab';
import type { useDashboard } from '@/context/useDashboard';

const useDashboardMock = vi.fn();

vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => useDashboardMock() as ReturnType<typeof useDashboard>,
}));
// BoardBreadcrumb has its own test file; stub it here so we focus on FAB logic.
vi.mock('@/components/layout/BoardBreadcrumb', () => ({
  BoardBreadcrumb: () => null,
}));
// Stub the modal — opened in Task 4. For Task 3 it's never reached.
vi.mock('@/components/boardsModal/BoardsModal', () => ({
  BoardsModal: ({ onClose }: { onClose: () => void }) => (
    <div role="dialog" aria-label="Boards Modal">
      <button onClick={onClose}>close-modal</button>
    </div>
  ),
}));

const dashboard = (id: string, name = id, collectionId: string | null = null) => ({
  id,
  name,
  background: 'bg-slate-800',
  widgets: [],
  createdAt: 0,
  order: 0,
  collectionId,
  isPinned: false,
  isDefault: false,
});

const collection = (id: string, name = id) => ({
  id,
  name,
  parentCollectionId: null,
  order: 0,
  createdAt: 0,
});

const mockContext = (over: {
  dashboards?: ReturnType<typeof dashboard>[];
  collections?: ReturnType<typeof collection>[];
  active?: ReturnType<typeof dashboard> | null;
  loadDashboard?: ReturnType<typeof vi.fn>;
  setActiveCollectionId?: ReturnType<typeof vi.fn>;
} = {}) => {
  const dashboards = over.dashboards ?? [dashboard('d1', 'A'), dashboard('d2', 'B')];
  useDashboardMock.mockReturnValue({
    dashboards,
    activeDashboard: over.active ?? dashboards[0],
    loadDashboard: over.loadDashboard ?? vi.fn(),
    setActiveCollectionId: over.setActiveCollectionId ?? vi.fn(),
    collectionsApi: { collections: over.collections ?? [] },
  });
};

describe('BoardNavFab', () => {
  describe('visibility', () => {
    it('renders nothing when there is one board and no collections', () => {
      mockContext({ dashboards: [dashboard('d1', 'A')], collections: [] });
      const { container } = render(<BoardNavFab />);
      expect(container).toBeEmptyDOMElement();
    });

    it('renders the row when there is one board but at least one collection', () => {
      mockContext({
        dashboards: [dashboard('d1', 'A')],
        collections: [collection('c1', 'Math')],
      });
      render(<BoardNavFab />);
      expect(screen.getByRole('button', { name: /select board/i })).toBeInTheDocument();
    });

    it('renders prev/next only when 2+ boards exist in the active collection', () => {
      mockContext({
        dashboards: [dashboard('d1', 'A'), dashboard('d2', 'B')],
        collections: [],
      });
      render(<BoardNavFab />);
      expect(screen.getByRole('button', { name: /previous board/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /next board/i })).toBeInTheDocument();
    });

    it('hides prev/next when only 1 board in the active collection', () => {
      mockContext({
        dashboards: [dashboard('d1', 'A')],
        collections: [collection('c1', 'Math'), collection('c2', 'Reading')],
      });
      render(<BoardNavFab />);
      expect(screen.queryByRole('button', { name: /previous board/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /next board/i })).not.toBeInTheDocument();
    });
  });

  describe('Collections button', () => {
    it('is hidden when collections.length is 0', () => {
      mockContext({
        dashboards: [dashboard('d1', 'A'), dashboard('d2', 'B')],
        collections: [],
      });
      render(<BoardNavFab />);
      expect(screen.queryByRole('button', { name: /select collection/i })).not.toBeInTheDocument();
    });

    it('is hidden when collections.length is 1', () => {
      mockContext({
        dashboards: [dashboard('d1', 'A'), dashboard('d2', 'B')],
        collections: [collection('c1', 'Math')],
      });
      render(<BoardNavFab />);
      expect(screen.queryByRole('button', { name: /select collection/i })).not.toBeInTheDocument();
    });

    it('is visible when collections.length is 2+', () => {
      mockContext({
        dashboards: [dashboard('d1', 'A'), dashboard('d2', 'B')],
        collections: [collection('c1', 'Math'), collection('c2', 'Reading')],
      });
      render(<BoardNavFab />);
      expect(screen.getByRole('button', { name: /select collection/i })).toBeInTheDocument();
    });

    it('opens the CollectionSwitcherMenu when clicked', async () => {
      mockContext({
        dashboards: [dashboard('d1', 'A'), dashboard('d2', 'B')],
        collections: [collection('c1', 'Math'), collection('c2', 'Reading')],
      });
      render(<BoardNavFab />);
      await userEvent.click(screen.getByRole('button', { name: /select collection/i }));
      // CollectionSwitcherMenu renders the root + each collection.
      expect(screen.getByRole('menuitem', { name: /all boards \(root\)/i })).toBeInTheDocument();
      expect(screen.getByRole('menuitem', { name: 'Math' })).toBeInTheDocument();
      expect(screen.getByRole('menuitem', { name: 'Reading' })).toBeInTheDocument();
    });
  });

  describe('Boards menu', () => {
    it('opens when the boards button is clicked', async () => {
      mockContext({
        dashboards: [dashboard('d1', 'A'), dashboard('d2', 'B')],
        collections: [],
      });
      render(<BoardNavFab />);
      await userEvent.click(screen.getByRole('button', { name: /select board/i }));
      expect(screen.getByRole('menuitem', { name: /A/ })).toBeInTheDocument();
      expect(screen.getByRole('menuitem', { name: /B/ })).toBeInTheDocument();
    });

    it('no longer contains a "Switch Collection…" item', async () => {
      mockContext({
        dashboards: [dashboard('d1', 'A'), dashboard('d2', 'B')],
        collections: [collection('c1', 'Math'), collection('c2', 'Reading')],
      });
      render(<BoardNavFab />);
      await userEvent.click(screen.getByRole('button', { name: /select board/i }));
      expect(screen.queryByRole('menuitem', { name: /switch collection/i })).not.toBeInTheDocument();
    });

    it('loads the selected board on click', async () => {
      const loadDashboard = vi.fn();
      mockContext({
        dashboards: [dashboard('d1', 'A'), dashboard('d2', 'B')],
        collections: [],
        loadDashboard,
      });
      render(<BoardNavFab />);
      await userEvent.click(screen.getByRole('button', { name: /select board/i }));
      await userEvent.click(screen.getByRole('menuitem', { name: /B/ }));
      expect(loadDashboard).toHaveBeenCalledWith('d2');
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
pnpm vitest run tests/components/layout/BoardNavFab.test.tsx
```

Expected: tests fail. The "renders the row when there is one board but at least one collection" test fails (today the row hides outright). Various Collection-button assertions fail (the button doesn't exist yet). The "no longer contains Switch Collection…" test fails (the item still exists).

- [ ] **Step 3: Refactor the component**

Replace the entire contents of `components/layout/BoardNavFab.tsx` with:

```typescript
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FC,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { useTranslation } from 'react-i18next';
import {
  ChevronLeft,
  ChevronRight,
  Folder,
  LayoutGrid,
  Star,
} from 'lucide-react';
import { useDashboard } from '@/context/useDashboard';
import { useClickOutside } from '@/hooks/useClickOutside';
import { FAB_BASE } from './fabClasses';
import { BoardBreadcrumb } from './BoardBreadcrumb';
import { CollectionSwitcherMenu } from './CollectionSwitcherMenu';

export const BoardNavFab: FC = () => {
  const { t } = useTranslation();
  const {
    dashboards,
    activeDashboard,
    loadDashboard,
    setActiveCollectionId,
    collectionsApi: { collections },
  } = useDashboard();
  const [isBoardsMenuOpen, setIsBoardsMenuOpen] = useState(false);
  const [isCollectionMenuOpen, setIsCollectionMenuOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const boardsTriggerRef = useRef<HTMLButtonElement>(null);
  const collectionsTriggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const headerId = useId();

  const activeCollectionId = activeDashboard?.collectionId ?? null;
  const boardsInCollection = useMemo(
    () =>
      dashboards
        .filter((d) => (d.collectionId ?? null) === activeCollectionId)
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [dashboards, activeCollectionId]
  );

  const currentIndex = useMemo(() => {
    if (!activeDashboard) return -1;
    return boardsInCollection.findIndex((d) => d.id === activeDashboard.id);
  }, [boardsInCollection, activeDashboard]);

  const showCollectionsButton = collections.length >= 2;
  const showPrevNext = boardsInCollection.length >= 2;
  // Render the row whenever there's anything navigable. Without this guard the
  // single-board user would lose their only path to BoardsModal once the
  // always-on breadcrumb pill becomes transient.
  const showFabRow = dashboards.length > 1 || collections.length > 0;

  const closeBoardsMenu = useCallback(
    (returnFocus = true) => {
      setIsBoardsMenuOpen(false);
      if (returnFocus) boardsTriggerRef.current?.focus();
    },
    [setIsBoardsMenuOpen]
  );

  const handleClickOutside = useCallback(() => {
    setIsBoardsMenuOpen(false);
    setIsCollectionMenuOpen(false);
  }, []);

  useClickOutside(containerRef, handleClickOutside);

  // Seed focus to the active board (or first item) on first menu open. Tracks
  // "already focused this open cycle" via a ref so Firestore snapshots that
  // reorder dashboards don't yank focus from where the user navigated.
  const didFocusOnOpenRef = useRef(false);
  useEffect(() => {
    if (!isBoardsMenuOpen) {
      didFocusOnOpenRef.current = false;
      return;
    }
    if (didFocusOnOpenRef.current) return;
    didFocusOnOpenRef.current = true;
    const targetIdx = currentIndex >= 0 ? currentIndex : 0;
    itemRefs.current[targetIdx]?.focus();
  }, [isBoardsMenuOpen, currentIndex]);

  // Drop trailing ref slots when the dashboard list shrinks so we don't
  // dispatch focus to detached buttons after a board is deleted.
  useEffect(() => {
    itemRefs.current.length = boardsInCollection.length;
  }, [boardsInCollection.length]);

  if (!showFabRow) return null;

  const goPrev = () => {
    if (currentIndex < 0) return;
    const next =
      (currentIndex - 1 + boardsInCollection.length) %
      boardsInCollection.length;
    loadDashboard(boardsInCollection[next].id);
  };

  const goNext = () => {
    if (currentIndex < 0) return;
    const next = (currentIndex + 1) % boardsInCollection.length;
    loadDashboard(boardsInCollection[next].id);
  };

  const focusItem = (idx: number) => {
    const total = boardsInCollection.length;
    if (total === 0) return;
    const wrapped = ((idx % total) + total) % total;
    itemRefs.current[wrapped]?.focus();
  };

  const handleMenuKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const focusedIdx = itemRefs.current.findIndex(
      (el) => el === document.activeElement
    );
    switch (e.key) {
      case 'Escape':
        e.preventDefault();
        closeBoardsMenu();
        break;
      case 'ArrowDown':
        e.preventDefault();
        focusItem(focusedIdx < 0 ? 0 : focusedIdx + 1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        focusItem(
          focusedIdx < 0 ? boardsInCollection.length - 1 : focusedIdx - 1
        );
        break;
      case 'Home':
        e.preventDefault();
        focusItem(0);
        break;
      case 'End':
        e.preventDefault();
        focusItem(boardsInCollection.length - 1);
        break;
      case 'Tab':
        closeBoardsMenu(false);
        break;
    }
  };

  const activeName = activeDashboard?.name ?? '';
  const boardListLabel = t('boardNav.boardList', {
    defaultValue: 'All boards',
  });

  return (
    <div
      ref={containerRef}
      data-screenshot="exclude"
      className="fixed bottom-6 left-4 z-dock"
    >
      {isCollectionMenuOpen && (
        <CollectionSwitcherMenu
          collections={collections}
          activeCollectionId={activeCollectionId}
          onSelect={(id) => setActiveCollectionId(id)}
          onClose={() => {
            setIsCollectionMenuOpen(false);
            requestAnimationFrame(() =>
              collectionsTriggerRef.current?.focus()
            );
          }}
        />
      )}

      {isBoardsMenuOpen && !isCollectionMenuOpen && (
        <div
          role="menu"
          aria-labelledby={headerId}
          onKeyDown={handleMenuKeyDown}
          className="absolute bottom-full left-0 mb-2 w-64 max-h-[60vh] overflow-y-auto rounded-2xl border border-white/20 bg-slate-900/80 backdrop-blur-xl shadow-2xl py-1.5 animate-in fade-in slide-in-from-bottom-2 duration-150"
        >
          <div
            id={headerId}
            className="px-3 py-1.5 text-xxs font-bold uppercase tracking-wider text-white/40"
          >
            {boardListLabel}
          </div>
          {boardsInCollection.map((db, idx) => {
            const isActive = activeDashboard?.id === db.id;
            return (
              <button
                key={db.id}
                ref={(el) => {
                  itemRefs.current[idx] = el;
                }}
                role="menuitem"
                onClick={() => {
                  loadDashboard(db.id);
                  closeBoardsMenu();
                }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/50 ${
                  isActive
                    ? 'bg-brand-blue-primary text-white'
                    : 'text-white/80 hover:bg-white/10'
                }`}
              >
                {db.isDefault && (
                  <Star
                    className={`w-3.5 h-3.5 flex-shrink-0 ${
                      isActive
                        ? 'fill-white text-white'
                        : 'fill-amber-400 text-amber-400'
                    }`}
                  />
                )}
                <span className="truncate">{db.name}</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="absolute bottom-full left-0 mb-1.5 flex items-center">
        <BoardBreadcrumb />
      </div>

      <div className="flex items-center gap-1">
        {showPrevNext && (
          <button
            type="button"
            onClick={goPrev}
            aria-label={t('boardNav.previous', {
              defaultValue: 'Previous board',
            })}
            title={t('boardNav.previous', { defaultValue: 'Previous board' })}
            className={FAB_BASE}
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        )}
        {showCollectionsButton && (
          <button
            ref={collectionsTriggerRef}
            type="button"
            onClick={() => {
              setIsBoardsMenuOpen(false);
              setIsCollectionMenuOpen((v) => !v);
            }}
            aria-label={t('boardNav.selectCollection', {
              defaultValue: 'Select collection',
            })}
            aria-haspopup="menu"
            aria-expanded={isCollectionMenuOpen}
            title={t('boardNav.selectCollection', {
              defaultValue: 'Select collection',
            })}
            className={FAB_BASE}
          >
            <Folder className="w-4 h-4" />
          </button>
        )}
        <button
          ref={boardsTriggerRef}
          type="button"
          onClick={() => {
            setIsCollectionMenuOpen(false);
            setIsBoardsMenuOpen((v) => !v);
          }}
          aria-label={t('boardNav.selectBoard', {
            defaultValue: 'Select board',
          })}
          aria-haspopup="menu"
          aria-expanded={isBoardsMenuOpen}
          title={activeName}
          className={FAB_BASE}
        >
          <LayoutGrid className="w-4 h-4" />
        </button>
        {showPrevNext && (
          <button
            type="button"
            onClick={goNext}
            aria-label={t('boardNav.next', { defaultValue: 'Next board' })}
            title={t('boardNav.next', { defaultValue: 'Next board' })}
            className={FAB_BASE}
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
};
```

- [ ] **Step 4: Run the tests to verify they pass**

Run:

```bash
pnpm vitest run tests/components/layout/BoardNavFab.test.tsx
```

Expected: all tests in the file pass.

- [ ] **Step 5: Run the CollectionSwitcherMenu tests to confirm no regression**

Run:

```bash
pnpm vitest run tests/components/layout/CollectionSwitcherMenu.test.tsx
```

Expected: 5/5 pass (the component itself is untouched).

- [ ] **Step 6: Commit**

```bash
git add components/layout/BoardNavFab.tsx tests/components/layout/BoardNavFab.test.tsx
git commit -m "feat(board-nav-fab): split kebab into dedicated Collections + Boards buttons

One tap to switch collections, one tap to pick a board. The in-menu
'Switch Collection…' item is removed (the new Folder button replaces it).
FAB-row visibility widens to dashboards>1 OR collections>0 so the row
stays reachable even with a single board in an organised account.
Collections button hidden when only one named Collection exists."
```

---

## Task 4: Add "Manage all boards…" item to Boards menu

**Files:**

- Modify: `components/layout/BoardNavFab.tsx`
- Modify: `tests/components/layout/BoardNavFab.test.tsx` (extend with new tests)

### Design notes

- Append a "Manage all boards…" item to the bottom of the Boards menu, separated by a top border.
- Icon: `Settings` (gear) from lucide-react.
- Click opens `BoardsModal` (rendered locally in `BoardNavFab`, sibling to the rest of the FAB UI).
- This item gets a slot at index `boardsInCollection.length` in `itemRefs` so keyboard nav reaches it.

- [ ] **Step 1: Extend the test file**

Append the following `describe` block to `tests/components/layout/BoardNavFab.test.tsx`, just before the closing `});` of the outer `describe('BoardNavFab', ...)`:

```typescript
  describe('Manage all boards menu item', () => {
    it('appears as the last item in the Boards menu', async () => {
      mockContext({
        dashboards: [dashboard('d1', 'A'), dashboard('d2', 'B')],
        collections: [],
      });
      render(<BoardNavFab />);
      await userEvent.click(screen.getByRole('button', { name: /select board/i }));
      const items = screen.getAllByRole('menuitem');
      const labels = items.map((el) => el.textContent?.trim());
      expect(labels[labels.length - 1]).toMatch(/manage all boards/i);
    });

    it('opens BoardsModal when clicked', async () => {
      mockContext({
        dashboards: [dashboard('d1', 'A'), dashboard('d2', 'B')],
        collections: [],
      });
      render(<BoardNavFab />);
      await userEvent.click(screen.getByRole('button', { name: /select board/i }));
      await userEvent.click(screen.getByRole('menuitem', { name: /manage all boards/i }));
      expect(screen.getByRole('dialog', { name: 'Boards Modal' })).toBeInTheDocument();
    });

    it('is keyboard-reachable via ArrowDown wraparound', async () => {
      mockContext({
        dashboards: [dashboard('d1', 'A'), dashboard('d2', 'B')],
        collections: [],
      });
      render(<BoardNavFab />);
      await userEvent.click(screen.getByRole('button', { name: /select board/i }));
      // Initial focus lands on the active board (d1). End jumps to the last item.
      await userEvent.keyboard('{End}');
      expect(document.activeElement?.textContent?.trim()).toMatch(/manage all boards/i);
    });
  });
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run:

```bash
pnpm vitest run tests/components/layout/BoardNavFab.test.tsx
```

Expected: the 3 new tests fail — the menu has no "Manage all boards…" item yet.

- [ ] **Step 3: Update the component**

Edit `components/layout/BoardNavFab.tsx`:

**3a. Add `Settings` to the lucide-react import:**

Change:

```typescript
import {
  ChevronLeft,
  ChevronRight,
  Folder,
  LayoutGrid,
  Star,
} from 'lucide-react';
```

To:

```typescript
import {
  ChevronLeft,
  ChevronRight,
  Folder,
  LayoutGrid,
  Settings,
  Star,
} from 'lucide-react';
```

**3b. Add `BoardsModal` import** near the other component imports (after the `CollectionSwitcherMenu` import):

```typescript
import { BoardsModal } from '@/components/boardsModal/BoardsModal';
```

**3c. Add modal state** near the other `useState` calls in the component body:

```typescript
const [isBoardsModalOpen, setIsBoardsModalOpen] = useState(false);
```

**3d. Update the `itemRefs` cleanup effect** to account for the extra slot — find:

```typescript
useEffect(() => {
  itemRefs.current.length = boardsInCollection.length;
}, [boardsInCollection.length]);
```

Replace with:

```typescript
useEffect(() => {
  // +1 for the "Manage all boards…" footer item.
  itemRefs.current.length = boardsInCollection.length + 1;
}, [boardsInCollection.length]);
```

**3e. Update `focusItem` and the keyboard-nav `End` branch** to include the footer slot. Find:

```typescript
const focusItem = (idx: number) => {
  const total = boardsInCollection.length;
  if (total === 0) return;
  const wrapped = ((idx % total) + total) % total;
  itemRefs.current[wrapped]?.focus();
};
```

Replace with:

```typescript
const focusItem = (idx: number) => {
  // +1 for the "Manage all boards…" footer slot.
  const total = boardsInCollection.length + 1;
  const wrapped = ((idx % total) + total) % total;
  itemRefs.current[wrapped]?.focus();
};
```

In `handleMenuKeyDown`, update the `ArrowUp` and `End` branches that reference `boardsInCollection.length - 1` to reference `boardsInCollection.length` (the index of the "Manage all boards…" slot):

```typescript
      case 'ArrowUp':
        e.preventDefault();
        focusItem(
          focusedIdx < 0 ? boardsInCollection.length : focusedIdx - 1
        );
        break;
      case 'Home':
        e.preventDefault();
        focusItem(0);
        break;
      case 'End':
        e.preventDefault();
        focusItem(boardsInCollection.length);
        break;
```

**3f. Append the "Manage all boards…" menu item** to the Boards menu. Find the closing `</div>` of the `isBoardsMenuOpen` block (right after the `boardsInCollection.map(...)`); insert the new item between the map and the closing `</div>`:

```typescript
          {boardsInCollection.map((db, idx) => {
            /* …existing item rendering, unchanged… */
          })}
          <button
            ref={(el) => {
              itemRefs.current[boardsInCollection.length] = el;
            }}
            role="menuitem"
            onClick={() => {
              setIsBoardsModalOpen(true);
              closeBoardsMenu(false);
            }}
            className="w-full flex items-center gap-2 px-3 py-2 mt-1 text-left text-sm text-white/80 hover:bg-white/10 border-t border-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/50"
          >
            <Settings className="w-3.5 h-3.5 flex-shrink-0" />
            {t('boardNav.manageAllBoards', {
              defaultValue: 'Manage all boards…',
            })}
          </button>
        </div>
```

**3g. Render the modal** at the bottom of the outer container `<div>`, just before its closing tag (after the `flex items-center gap-1` button row):

```typescript
      </div>
      {isBoardsModalOpen && (
        <BoardsModal onClose={() => setIsBoardsModalOpen(false)} />
      )}
    </div>
  );
};
```

- [ ] **Step 4: Run the tests to verify they pass**

Run:

```bash
pnpm vitest run tests/components/layout/BoardNavFab.test.tsx
```

Expected: all tests pass (the 3 new ones + everything from Task 3).

- [ ] **Step 5: Remove the now-unused `boardNav.switchCollection` i18n key**

Edit `locales/en.json`. Find:

```json
  "boardNav": {
    "previous": "Previous board",
    "next": "Next board",
    "selectBoard": "Select board",
    "selectCollection": "Select collection",
    "boardList": "All boards",
    "switchCollection": "Switch Collection…",
    "manageAllBoards": "Manage all boards…"
  },
```

Replace with:

```json
  "boardNav": {
    "previous": "Previous board",
    "next": "Next board",
    "selectBoard": "Select board",
    "selectCollection": "Select collection",
    "boardList": "All boards",
    "manageAllBoards": "Manage all boards…"
  },
```

Confirm nothing still references `boardNav.switchCollection`:

```bash
grep -rn "boardNav.switchCollection" --include="*.ts" --include="*.tsx" .
```

Expected: no matches.

- [ ] **Step 6: Commit**

```bash
git add components/layout/BoardNavFab.tsx tests/components/layout/BoardNavFab.test.tsx locales/en.json
git commit -m "feat(board-nav-fab): add 'Manage all boards…' footer item to Boards menu

Restores the path to BoardsModal that the always-on breadcrumb pill used
to own. Keyboard nav (Home/End/Arrow) wraps through the new slot. Drops
the unused boardNav.switchCollection i18n key now that nothing references it."
```

---

## Task 5: Full validation pass + browser verification

**Files:** none modified — this is a verification gate.

- [ ] **Step 1: Run the full validation suite**

Run:

```bash
pnpm run validate
```

Expected: type-check, lint, format-check, and full test suite all pass. If anything fails, diagnose and fix before proceeding — do NOT skip.

- [ ] **Step 2: Start the dev server in the background**

Run:

```bash
pnpm run dev
```

(Or use the preview MCP's `preview_start` if available.) Then sign in.

- [ ] **Step 3: Manually verify the visibility matrix in the browser**

Walk through these states (create/delete boards and collections via the BoardsModal as needed):

| collections.length | dashboards.length | Expected FAB row                 |
| ------------------ | ----------------- | -------------------------------- |
| 0                  | 1                 | (hidden)                         |
| 0                  | ≥2                | `[<] [Boards] [>]`               |
| 1                  | 1                 | `[Boards]`                       |
| 1                  | ≥2                | `[<] [Boards] [>]`               |
| ≥2                 | 1                 | `[Collections] [Boards]`         |
| ≥2                 | ≥2                | `[<] [Collections] [Boards] [>]` |

For each state, confirm the FAB row matches the expected button set.

- [ ] **Step 4: Verify the transient pill behavior**

- Reload the page → pill should appear briefly, then fade after ~3s.
- Click a different board in the Boards menu → pill should re-appear with the new name, fade after ~3s.
- Click a different Collection in the Collections menu → pill should re-appear with new Collection name + first board name, fade after ~3s.
- During the pill's display window, click the pill → BoardsModal should open.
- After the pill has faded, the click target should be gone (click should pass through to the canvas underneath).
- In OS settings, enable "Reduce motion", reload the page → pill still appears + disappears but with no fade animation.

- [ ] **Step 5: Verify keyboard navigation**

- Tab to the Boards button → press Enter or Space → menu opens with focus on the active board.
- ArrowDown / ArrowUp wraps through board items including the "Manage all boards…" item at the end.
- End jumps to "Manage all boards…"; Home jumps to the first board.
- Escape closes the menu and returns focus to the Boards trigger button.
- Same for the Collections button → CollectionSwitcherMenu.

- [ ] **Step 6: Verify "Manage all boards…" → BoardsModal**

- Open Boards menu → click "Manage all boards…" → BoardsModal opens.
- Close the modal → focus should land somewhere sensible (the modal handles its own close-focus restoration).

- [ ] **Step 7: Stop the dev server**

If applicable, stop the dev server / preview.

- [ ] **Step 8: Final cleanup commit (if anything was tweaked during browser verification)**

If browser verification revealed any styling tweaks needed (spacing, icon size, etc.), commit them now:

```bash
git add -p
git commit -m "polish(board-nav-fab): minor visual tweaks from browser verification"
```

If nothing needed tweaking, skip this step.

---

## Done

After Task 5 completes, the branch should have 4 or 5 commits (depending on Step 8):

1. `i18n(en): add selectCollection + manageAllBoards keys for board nav FAB`
2. `feat(board-breadcrumb): transient display on board/collection change`
3. `feat(board-nav-fab): split kebab into dedicated Collections + Boards buttons`
4. `feat(board-nav-fab): add 'Manage all boards…' footer item to Boards menu`
5. (optional) `polish(board-nav-fab): minor visual tweaks from browser verification`

Push to `dev-paul` per the project's branching convention.
