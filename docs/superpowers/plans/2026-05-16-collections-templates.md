# Collection Templates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the existing `/dashboard_templates/` Firestore collection with a `type: 'board' | 'collection'` discriminator so admins can save Collections (with their child Boards) as templates, and users can instantiate a Collection from a template via the Boards modal.

**Architecture:** Add a `type` field to template docs (legacy docs without it are treated as Board templates — zero migration). Introduce a sibling `CollectionTemplate` interface that snapshots Collection metadata plus an ordered array of Board snapshots. Extend the existing `SaveAsTemplateModal` to accept a discriminated `target` prop (Board or Collection). Add a "Save as Template…" item to `CollectionContextMenu` (admin-gated, mirroring `BoardContextMenu`). Add a `CreateFromTemplateModal` picker mounted from a new "+ from Template" button in the Boards-modal header. Hydration uses the existing `useCollections.createCollection()` + `DashboardContext.createNewDashboard()` actions — no new Firestore primitives. Extract Plan 3's snapshot-sanitization helper to a shared util so Board snapshots in templates have the same fields stripped as Board snapshots in shared Collections.

**Tech Stack:** React 19, TypeScript 5.9, Vite, Firestore modular SDK, Vitest, Playwright, react-i18next.

---

## File Structure

**Created:**

- `utils/dashboardSanitize.ts` — exports `sanitizeBoardSnapshot(board: Dashboard): Dashboard`, the helper currently inlined in `hooks/useSharedCollection.ts`. Single source of truth used by Plan 3's share flow AND Plan 4's template flow.
- `utils/collectionTemplateHydration.ts` — pure helper that converts a `CollectionTemplate` into the structures needed to instantiate: returns `{ collectionInput, boardInputs }` ready to feed `useCollections.createCollection` and `DashboardContext.createNewDashboard`. No I/O.
- `components/boardsModal/CreateFromTemplateModal.tsx` — picker UI that subscribes to `/dashboard_templates/`, filters by `type` (Board or Collection), and on selection calls the hydration helper + creation actions, then closes.
- `tests/utils/dashboardSanitize.test.ts` — covers the helper extraction.
- `tests/utils/collectionTemplateHydration.test.ts` — pure-function tests for hydration ordering, id assignment, sanitization.
- `tests/components/admin/SaveAsTemplateModal.collection.test.tsx` — Collection-target capture path.
- `tests/components/boardsModal/CreateFromTemplateModal.test.tsx` — picker filters by type, hydration is called with correct payload.
- `tests/e2e/collection-template.spec.ts` — Playwright happy path: admin saves a Collection as a template; teacher uses the picker to create a new Collection from that template; new Collection appears with N child Boards.

**Modified:**

- `types.ts` (after line 5562) — add `type?: 'board'` to existing `DashboardTemplate`; add new `CollectionTemplate` interface, `BoardSnapshot` interface, `AnyTemplate` union, and `isCollectionTemplate` / `isBoardTemplate` type guards.
- `hooks/useSharedCollection.ts` (lines 35–80 area) — replace inlined `sanitizeBoardForShare` with import from `utils/dashboardSanitize.ts`.
- `components/admin/SaveAsTemplateModal.tsx` — change prop shape from `currentDashboard: Dashboard | null` to a discriminated `target` prop; branch write logic on `target.kind`. Filter the "update existing" list by matching type.
- `components/boardsModal/CollectionContextMenu.tsx` — add `canSaveAsTemplate: boolean` + `onSaveAsTemplate: () => void` props; render the new menu item.
- `components/boardsModal/BoardsModal.tsx` — new state `saveAsCollectionTemplateTarget`; wire CollectionContextMenu callback; mount `SaveAsTemplateModal` for Collections; mount `CreateFromTemplateModal`; add "+ from Template" trigger in the header area.
- `components/boardsModal/BoardsModalHeader.tsx` — add "+ from Template" button with `onCreateFromTemplate` callback prop.
- `components/admin/DashboardTemplatesManager.tsx` — show type badge on each card; add type filter ("All | Boards | Collections").
- `locales/en.json` — new keys.
- `locales/de.json`, `locales/es.json`, `locales/fr.json` — English fallbacks for new keys (matches the Plan 2/3 convention; see commits `48634c78` and the Plan 3 locale updates).

**Not modified:**

- `firestore.rules` — existing `/dashboard_templates/{templateId}` rule (admin-write / authed-read) covers both `type` values without change. The Collection template snapshot is embedded in a single doc; no subcollection.
- `firestore.indexes.json` — no new composite queries.

---

## Task 0: Extract `sanitizeBoardSnapshot` helper

Plan 3's `sanitizeBoardForShare` is inlined in `hooks/useSharedCollection.ts`. Plan 4 needs the exact same sanitization for Board snapshots embedded in a Collection template — same logic, same reasoning (strip host-specific fields the recipient must not inherit). Extract first so Task 1 onward can import from one source.

**Files:**

- Create: `utils/dashboardSanitize.ts`
- Create: `tests/utils/dashboardSanitize.test.ts`
- Modify: `hooks/useSharedCollection.ts` (replace inlined helper with import)

- [ ] **Step 0.1: Write the failing test**

Create `tests/utils/dashboardSanitize.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { sanitizeBoardSnapshot } from '@/utils/dashboardSanitize';
import type { Dashboard } from '@/types';

const baseBoard = (): Dashboard => ({
  id: 'b1',
  name: 'Test Board',
  background: 'bg-slate-900',
  widgets: [],
  createdAt: 1000,
});

describe('sanitizeBoardSnapshot', () => {
  it('keeps id, name, background, widgets, createdAt', () => {
    const out = sanitizeBoardSnapshot(baseBoard());
    expect(out.id).toBe('b1');
    expect(out.name).toBe('Test Board');
    expect(out.background).toBe('bg-slate-900');
    expect(out.widgets).toEqual([]);
    expect(out.createdAt).toBe(1000);
  });

  it('strips linkedShare* fields', () => {
    const out = sanitizeBoardSnapshot({
      ...baseBoard(),
      linkedShareId: 's1',
      linkedShareRole: 'collaborator',
      linkedShareHostName: 'Host',
      linkedShareEnded: true,
    });
    expect(out.linkedShareId).toBeUndefined();
    expect(out.linkedShareRole).toBeUndefined();
    expect(out.linkedShareHostName).toBeUndefined();
    expect(out.linkedShareEnded).toBeUndefined();
  });

  it('strips driveFileId, thumbnailUrl, sharedGroups, annotationOverlay', () => {
    const out = sanitizeBoardSnapshot({
      ...baseBoard(),
      driveFileId: 'drive123',
      thumbnailUrl: 'https://example/thumb.png',
      sharedGroups: [
        { groupId: 'g1', role: 'viewer' },
      ] as unknown as Dashboard['sharedGroups'],
      annotationOverlay: { objects: [], updatedAt: 1 },
    });
    expect(out.driveFileId).toBeUndefined();
    expect(out.thumbnailUrl).toBeUndefined();
    expect(out.sharedGroups).toBeUndefined();
    expect(out.annotationOverlay).toBeUndefined();
  });

  it('strips isDefault, isPinned, updatedAt, collectionId', () => {
    const out = sanitizeBoardSnapshot({
      ...baseBoard(),
      isDefault: true,
      isPinned: true,
      updatedAt: 2000,
      collectionId: 'coll1',
    });
    expect(out.isDefault).toBeUndefined();
    expect(out.isPinned).toBeUndefined();
    expect(out.updatedAt).toBeUndefined();
    expect(out.collectionId).toBeUndefined();
  });

  it('preserves viewport hints (used for proportional layout scaling)', () => {
    const out = sanitizeBoardSnapshot({
      ...baseBoard(),
      viewportWidth: 1920,
      viewportHeight: 1080,
    });
    expect(out.viewportWidth).toBe(1920);
    expect(out.viewportHeight).toBe(1080);
  });

  it('preserves globalStyle, settings, libraryOrder, order', () => {
    const out = sanitizeBoardSnapshot({
      ...baseBoard(),
      globalStyle: { fontFamily: 'Lexend' } as Dashboard['globalStyle'],
      settings: { hideDock: false } as unknown as Dashboard['settings'],
      libraryOrder: ['clock'],
      order: 7,
    });
    expect(out.globalStyle).toEqual({ fontFamily: 'Lexend' });
    expect(out.settings).toEqual({ hideDock: false });
    expect(out.libraryOrder).toEqual(['clock']);
    expect(out.order).toBe(7);
  });
});
```

- [ ] **Step 0.2: Run test to verify it fails**

```
pnpm vitest run tests/utils/dashboardSanitize.test.ts
```

Expected: FAIL — `Cannot find module '@/utils/dashboardSanitize'`.

- [ ] **Step 0.3: Create the helper**

Create `utils/dashboardSanitize.ts`:

```ts
import type { Dashboard } from '@/types';

/**
 * Strip host-specific fields from a Dashboard before snapshotting into
 * any recipient-facing artifact (Collection share, Collection template,
 * Board template). The recipient is starting fresh — they must not
 * inherit anything that names the host, points at the host's Storage /
 * Drive, or replays the host's live-session state.
 *
 * Stripped:
 * - `linkedShareId` / `linkedShareRole` / `linkedShareHostName` /
 *   `linkedShareEnded`: live single-Board share linkage. Inheriting these
 *   would falsely mark the recipient as a collaborator on the host's
 *   original share.
 * - `driveFileId`: points at the HOST's Drive file. A recipient writing
 *   updates through this id would push to the host's Drive.
 * - `thumbnailUrl`: signed URL into the host's Storage bucket. Expires
 *   and isn't reachable under the recipient's auth — let it regenerate
 *   on first save.
 * - `sharedGroups`: per-host share permissions; not transferable.
 * - `annotationOverlay`: live pencil-overlay strokes from the host's
 *   session. Transient state — never persisted state.
 * - `isDefault`: host's "open this on sign-in" flag. Snapshots must not
 *   silently change which Board the recipient lands on.
 * - `isPinned`: host's pin in the FAB popover. Snapshots should not
 *   surprise the recipient with new pinned Boards.
 * - `updatedAt`: timestamp from the host's last edit. Recipient's copy
 *   should stamp this on first own edit, not lie about provenance.
 * - `collectionId`: host's local Collection id. Consumers reassign at
 *   instantiation time — keeping it would be stale data.
 *
 * Preserved:
 * - `viewportWidth` / `viewportHeight` — layout hints for proportional
 *   widget scaling on load. Recipient benefits from seeing the original
 *   composition's intended viewport.
 * - `globalStyle`, `settings`, `libraryOrder`, `widgets`, `background`,
 *   `name`, `id`, `createdAt`, `order` — the Board's design itself.
 */
export const sanitizeBoardSnapshot = (board: Dashboard): Dashboard => {
  const {
    linkedShareId: _linkedShareId,
    linkedShareRole: _linkedShareRole,
    linkedShareHostName: _linkedShareHostName,
    linkedShareEnded: _linkedShareEnded,
    driveFileId: _driveFileId,
    thumbnailUrl: _thumbnailUrl,
    sharedGroups: _sharedGroups,
    annotationOverlay: _annotationOverlay,
    isDefault: _isDefault,
    isPinned: _isPinned,
    updatedAt: _updatedAt,
    collectionId: _collectionId,
    ...rest
  } = board;
  return rest;
};
```

- [ ] **Step 0.4: Run test to verify it passes**

```
pnpm vitest run tests/utils/dashboardSanitize.test.ts
```

Expected: 6 passed.

- [ ] **Step 0.5: Replace the inlined helper in `hooks/useSharedCollection.ts`**

Open `hooks/useSharedCollection.ts`. Find the block starting around line 35 (`Strip host-specific fields...`) ending at `};` after `return rest;`. Replace the entire block with an import.

At the top of the file, add to the imports block (alongside the existing `import { logError } ...`):

```ts
import { sanitizeBoardSnapshot } from '@/utils/dashboardSanitize';
```

Delete the entire `const sanitizeBoardForShare = (board: Dashboard): Dashboard => { ... };` declaration and its multi-paragraph JSDoc comment.

Find both call sites inside the hook (formerly `sanitizeBoardForShare(board)`) and replace with `sanitizeBoardSnapshot(board)`. Use Grep to confirm zero remaining references to `sanitizeBoardForShare`:

```
pnpm grep -r sanitizeBoardForShare .
```

Expected: zero matches.

- [ ] **Step 0.6: Verify Plan 3's tests still pass**

```
pnpm vitest run tests/hooks/useSharedCollection.test.ts
```

Expected: all existing tests pass (4+ tests). The behavior is identical — we only moved the function.

- [ ] **Step 0.7: Commit**

```
git add utils/dashboardSanitize.ts tests/utils/dashboardSanitize.test.ts hooks/useSharedCollection.ts
git commit -m "refactor(sanitize): extract sanitizeBoardSnapshot to shared util

Plan 3 inlined this helper in useSharedCollection.ts. Plan 4's Collection
templates need identical sanitization for Board snapshots, so promote
it to utils/ with its own test coverage. Behavior unchanged."
```

---

## Task 1: Add `CollectionTemplate` type and discriminators

Schema-only task. No UI, no I/O. Defines the data shape every subsequent task references.

**Files:**

- Modify: `types.ts` (insert after line 5562, immediately after the existing `DashboardTemplate` interface)

- [ ] **Step 1.1: Add `type` field to existing `DashboardTemplate`**

Open `types.ts`. Find the `DashboardTemplate` interface (line 5539). Add a `type` field after `description` (around line 5542). The field is optional with literal `'board'` — undefined or `'board'` both mean Board template, preserving backwards-compat with legacy docs that lack the field.

Replace lines 5539-5562 with:

```ts
export interface DashboardTemplate {
  id: string;
  name: string;
  description: string;
  /**
   * Discriminates Board templates (this interface) from Collection
   * templates (see CollectionTemplate). Optional + literal 'board' so
   * legacy docs without the field deserialize as Board templates with
   * zero migration. Always pass 'board' when writing new docs.
   */
  type?: 'board';
  /** Snapshot of widgets to pre-populate the dashboard with */
  widgets: WidgetData[];
  /** Optional global style override applied when template is deployed */
  globalStyle?: Partial<GlobalStyle>;
  /** Optional background to apply (Tailwind class, hex, gradient, or URL) */
  background?: string;
  /** Tag labels for filtering in the template browser */
  tags: string[];
  /** Grade-level targeting — empty means applicable to all grades */
  targetGradeLevels: GradeLevel[];
  /** Building IDs this template is offered to; empty = all buildings */
  targetBuildings: string[];
  /** Whether this template is available to users (replaces isPublished) */
  enabled: boolean;
  /** Who can see/use this template */
  accessLevel: 'admin' | 'beta' | 'public';
  createdAt: number;
  updatedAt: number;
  createdBy: string; // admin email
}
```

- [ ] **Step 1.2: Append `CollectionTemplate` and helpers**

After the closing `}` of `DashboardTemplate` (around line 5562 in the new numbering), append:

```ts
/**
 * A single Board's snapshot when embedded inside a CollectionTemplate.
 * Mirrors the fields that `sanitizeBoardSnapshot` preserves — the rest
 * of a Dashboard's surface is host-specific and stripped at capture
 * time. `id` is the host's original Board id; the importer assigns a
 * fresh id during instantiation, so this id is for ordering / debugging
 * only.
 */
export interface BoardTemplateSnapshot {
  id: string;
  name: string;
  background: string;
  widgets: WidgetData[];
  globalStyle?: Partial<GlobalStyle>;
  settings?: DashboardSettings;
  libraryOrder?: (WidgetType | InternalToolType)[];
  viewportWidth?: number;
  viewportHeight?: number;
  createdAt: number;
}

/**
 * A Collection's metadata captured for the template browser. Mirrors the
 * subset of `Collection` that admins curate; the recipient's
 * createCollection action stamps fresh `id`, `order`, `createdAt` /
 * `updatedAt`, and `parentCollectionId: null` (templates always land at
 * root — admins or teachers move them after).
 */
export interface CollectionTemplateSnapshot {
  name: string;
  color?: string;
  icon?: string;
  /**
   * Optional default-board hint: the snapshot id of the Board that
   * should be marked as the Collection's default on first open. Stored
   * as the `BoardTemplateSnapshot.id`; resolved to the recipient's new
   * Board id at hydration time. Undefined means no default.
   */
  defaultBoardSnapshotId?: string;
}

/**
 * A Collection-level template. Same Firestore collection as
 * `DashboardTemplate` (`/dashboard_templates/`) — the `type` field
 * discriminates. Admin-curated, authed-read, same rule gate.
 */
export interface CollectionTemplate {
  id: string;
  type: 'collection';
  name: string;
  description: string;
  collectionSnapshot: CollectionTemplateSnapshot;
  /** Ordered list — defines the order child Boards appear in the new Collection. */
  boardSnapshots: BoardTemplateSnapshot[];
  tags: string[];
  targetGradeLevels: GradeLevel[];
  targetBuildings: string[];
  enabled: boolean;
  accessLevel: 'admin' | 'beta' | 'public';
  createdAt: number;
  updatedAt: number;
  createdBy: string;
}

/**
 * Union of every doc shape stored in `/dashboard_templates/`. Read sites
 * MUST discriminate via `isCollectionTemplate` / `isBoardTemplate` before
 * accessing Board-only fields like `widgets`.
 */
export type AnyTemplate = DashboardTemplate | CollectionTemplate;

export const isCollectionTemplate = (t: AnyTemplate): t is CollectionTemplate =>
  t.type === 'collection';

export const isBoardTemplate = (t: AnyTemplate): t is DashboardTemplate =>
  t.type !== 'collection';
```

- [ ] **Step 1.3: Verify type-check passes**

```
pnpm run type-check
```

Expected: 0 errors. (The new types are not yet imported anywhere — they're declarations only.)

- [ ] **Step 1.4: Commit**

```
git add types.ts
git commit -m "types(templates): add CollectionTemplate + type discriminator

Introduces the schema Plan 4 hangs off. Legacy Board template docs lack
the type field; isBoardTemplate / isCollectionTemplate normalize at
read sites. No Firestore migration — the field is optional on the
existing DashboardTemplate interface."
```

---

## Task 2: Extend `SaveAsTemplateModal` to accept Collection target

Today the modal is hard-coded to a single Board (`currentDashboard: Dashboard | null`). Replace the prop with a discriminated `target` that the caller fills in based on whether they're saving a Board or a Collection.

**Files:**

- Modify: `components/admin/SaveAsTemplateModal.tsx`
- Test: `tests/components/admin/SaveAsTemplateModal.collection.test.tsx`

- [ ] **Step 2.1: Write the failing test**

Create `tests/components/admin/SaveAsTemplateModal.collection.test.tsx`:

```tsx
/* @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SaveAsTemplateModal } from '@/components/admin/SaveAsTemplateModal';
import type { Collection, Dashboard } from '@/types';

const addDocMock = vi.fn().mockResolvedValue({ id: 'new-template-id' });
const setDocMock = vi.fn().mockResolvedValue(undefined);

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => 'COLL_REF'),
  doc: vi.fn(() => 'DOC_REF'),
  onSnapshot: vi.fn((_q, _onNext) => () => undefined),
  query: vi.fn((c) => c),
  orderBy: vi.fn(),
  addDoc: (...args: unknown[]) => addDocMock(...args),
  setDoc: (...args: unknown[]) => setDocMock(...args),
}));

vi.mock('@/config/firebase', () => ({
  db: {},
  isAuthBypass: true, // skip the snapshot subscription
}));

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ user: { email: 'admin@example.com' } }),
}));

vi.mock('@/hooks/useAdminBuildings', () => ({
  useAdminBuildings: () => [],
}));

const collection: Collection = {
  id: 'coll1',
  name: 'Morning Routine',
  parentCollectionId: null,
  order: 0,
  color: '#abc',
  icon: 'star',
  createdAt: 1000,
};

const board = (id: string, name: string): Dashboard => ({
  id,
  name,
  background: 'bg-slate-900',
  widgets: [],
  createdAt: 1000,
  collectionId: 'coll1',
});

beforeEach(() => {
  addDocMock.mockClear();
  setDocMock.mockClear();
});

describe('SaveAsTemplateModal — Collection target', () => {
  it('captures Collection metadata + child Board snapshots when saving a Collection', async () => {
    render(
      <SaveAsTemplateModal
        isOpen
        onClose={() => undefined}
        target={{
          kind: 'collection',
          collection,
          boards: [board('b1', 'Welcome'), board('b2', 'Math')],
        }}
      />
    );

    fireEvent.change(screen.getByPlaceholderText(/e\.g\. Morning Routine/i), {
      target: { value: 'My Template' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Save New Template/i }));

    await waitFor(() => expect(addDocMock).toHaveBeenCalledTimes(1));
    const written = addDocMock.mock.calls[0][1] as Record<string, unknown>;
    expect(written.type).toBe('collection');
    expect(written.collectionSnapshot).toMatchObject({
      name: 'Morning Routine',
      color: '#abc',
      icon: 'star',
    });
    expect(written.boardSnapshots).toHaveLength(2);
    const snapshots = written.boardSnapshots as Array<Record<string, unknown>>;
    expect(snapshots[0]).toMatchObject({ id: 'b1', name: 'Welcome' });
    expect(snapshots[1]).toMatchObject({ id: 'b2', name: 'Math' });
    // Sanitization removes collectionId from each snapshot.
    expect(snapshots[0]).not.toHaveProperty('collectionId');
    expect(snapshots[1]).not.toHaveProperty('collectionId');
    expect(written.name).toBe('My Template');
    expect(written.createdBy).toBe('admin@example.com');
  });

  it('renders the Collection title in the modal heading', () => {
    render(
      <SaveAsTemplateModal
        isOpen
        onClose={() => undefined}
        target={{
          kind: 'collection',
          collection,
          boards: [board('b1', 'Welcome')],
        }}
      />
    );
    expect(
      screen.getByText(/Save Collection as Template/i)
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 2.2: Run test to verify it fails**

```
pnpm vitest run tests/components/admin/SaveAsTemplateModal.collection.test.tsx
```

Expected: FAIL — `Type '{ kind: "collection"; ...}' is not assignable to type 'Dashboard | null'` (or a render error if test runs).

- [ ] **Step 2.3: Update the props shape and write logic**

Open `components/admin/SaveAsTemplateModal.tsx`. Replace the imports block (lines 1-16) and the interface + component declaration (lines 18-30) with:

```tsx
import React, { useState, useEffect } from 'react';
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  doc,
  setDoc,
  addDoc,
} from 'firebase/firestore';
import { db, isAuthBypass } from '@/config/firebase';
import { LayoutTemplate, Save, RefreshCw, Loader2 } from 'lucide-react';
import { Modal } from '@/components/common/Modal';
import {
  Dashboard,
  DashboardTemplate,
  AnyTemplate,
  Collection as CollectionType,
  CollectionTemplate,
  BoardTemplateSnapshot,
  WidgetData,
  isCollectionTemplate,
} from '@/types';
import { useAuth } from '@/context/useAuth';
import { useAdminBuildings } from '@/hooks/useAdminBuildings';
import { sanitizeBoardSnapshot } from '@/utils/dashboardSanitize';

export type SaveTemplateTarget =
  | { kind: 'board'; dashboard: Dashboard }
  | { kind: 'collection'; collection: CollectionType; boards: Dashboard[] };

interface SaveAsTemplateModalProps {
  isOpen: boolean;
  onClose: () => void;
  target: SaveTemplateTarget | null;
}

const TEMPLATES_COLLECTION = 'dashboard_templates';

export const SaveAsTemplateModal: React.FC<SaveAsTemplateModalProps> = ({
  isOpen,
  onClose,
  target,
}) => {
```

- [ ] **Step 2.4: Update the templates subscription to type the docs as `AnyTemplate`**

In the same file, find the `useEffect` that subscribes to `/dashboard_templates/` (around lines 51–80). Replace the `setTemplates(...)` line with a filter that excludes mismatched-type templates, so the "Update existing" picker only shows compatible candidates:

```tsx
// Subscribe to templates while modal is open. Filters by target kind so
// teachers updating a Board template never see Collection templates in
// the picker (and vice versa) — overwriting across types would corrupt
// the doc shape.
useEffect(() => {
  if (!isOpen) return;
  if (isAuthBypass) {
    setLoadingTemplates(false);
    return;
  }

  setLoadingTemplates(true);
  const q = query(
    collection(db, TEMPLATES_COLLECTION),
    orderBy('createdAt', 'desc')
  );
  const unsub = onSnapshot(
    q,
    (snap) => {
      const all = snap.docs.map(
        (d) => ({ ...(d.data() as AnyTemplate), id: d.id }) as AnyTemplate
      );
      const filtered = all.filter((t) =>
        target?.kind === 'collection'
          ? isCollectionTemplate(t)
          : !isCollectionTemplate(t)
      );
      setTemplates(filtered);
      setLoadingTemplates(false);
    },
    (err) => {
      console.error('Failed to load templates:', err);
      setLoadingTemplates(false);
    }
  );
  return unsub;
}, [isOpen, target?.kind]);
```

Also update the state types — change `const [templates, setTemplates] = useState<DashboardTemplate[]>([]);` to:

```tsx
const [templates, setTemplates] = useState<AnyTemplate[]>([]);
```

- [ ] **Step 2.5: Replace `captureWidgets` with type-aware capture helpers**

Find `captureWidgets` (lines 92-97). Replace with:

```tsx
/** Board-template payload: widgets + style snapshot, sanitized. */
const captureBoardForBoardTemplate = (dashboard: Dashboard) => {
  const cleaned = sanitizeBoardSnapshot(dashboard);
  return {
    widgets: cleaned.widgets.map((w: WidgetData) => ({
      ...w,
      isLocked: undefined,
      config: structuredClone(w.config),
    })),
    globalStyle: cleaned.globalStyle ?? null,
    background: cleaned.background ?? null,
  };
};

/** Each Board in a Collection becomes one BoardTemplateSnapshot. */
const captureBoardForCollectionTemplate = (
  dashboard: Dashboard
): BoardTemplateSnapshot => {
  const cleaned = sanitizeBoardSnapshot(dashboard);
  return {
    id: cleaned.id,
    name: cleaned.name,
    background: cleaned.background,
    widgets: cleaned.widgets.map((w: WidgetData) => ({
      ...w,
      isLocked: undefined,
      config: structuredClone(w.config),
    })),
    ...(cleaned.globalStyle !== undefined && {
      globalStyle: cleaned.globalStyle,
    }),
    ...(cleaned.settings !== undefined && { settings: cleaned.settings }),
    ...(cleaned.libraryOrder !== undefined && {
      libraryOrder: cleaned.libraryOrder,
    }),
    ...(cleaned.viewportWidth !== undefined && {
      viewportWidth: cleaned.viewportWidth,
    }),
    ...(cleaned.viewportHeight !== undefined && {
      viewportHeight: cleaned.viewportHeight,
    }),
    createdAt: cleaned.createdAt,
  };
};
```

- [ ] **Step 2.6: Update `handleUpdate` and `handleSaveNew` to branch on `target.kind`**

Replace `handleUpdate` (lines 99-121) and `handleSaveNew` (lines 123-157) with:

```tsx
const handleUpdate = async () => {
  if (!target || !selectedTemplateId) return;
  setUpdating(true);
  setMessage(null);
  try {
    if (target.kind === 'board') {
      await setDoc(
        doc(db, TEMPLATES_COLLECTION, selectedTemplateId),
        {
          ...captureBoardForBoardTemplate(target.dashboard),
          updatedAt: Date.now(),
        },
        { merge: true }
      );
    } else {
      await setDoc(
        doc(db, TEMPLATES_COLLECTION, selectedTemplateId),
        {
          collectionSnapshot: {
            name: target.collection.name,
            ...(target.collection.color !== undefined && {
              color: target.collection.color,
            }),
            ...(target.collection.icon !== undefined && {
              icon: target.collection.icon,
            }),
          },
          boardSnapshots: target.boards.map(captureBoardForCollectionTemplate),
          updatedAt: Date.now(),
        },
        { merge: true }
      );
    }
    setMessage({ type: 'success', text: 'Template updated successfully.' });
  } catch (err) {
    console.error('Failed to update template:', err);
    setMessage({ type: 'error', text: 'Failed to update template.' });
  } finally {
    setUpdating(false);
  }
};

const handleSaveNew = async () => {
  if (!target || !newName.trim() || !user?.email) return;
  setSaving(true);
  setMessage(null);
  try {
    const now = Date.now();
    let payload: Omit<DashboardTemplate, 'id'> | Omit<CollectionTemplate, 'id'>;
    if (target.kind === 'board') {
      payload = {
        type: 'board',
        name: newName.trim(),
        description: '',
        ...captureBoardForBoardTemplate(target.dashboard),
        tags: [],
        targetGradeLevels: [],
        targetBuildings: newBuildings,
        enabled: true,
        accessLevel: 'public',
        createdAt: now,
        updatedAt: now,
        createdBy: user.email,
      };
    } else {
      payload = {
        type: 'collection',
        name: newName.trim(),
        description: '',
        collectionSnapshot: {
          name: target.collection.name,
          ...(target.collection.color !== undefined && {
            color: target.collection.color,
          }),
          ...(target.collection.icon !== undefined && {
            icon: target.collection.icon,
          }),
        },
        boardSnapshots: target.boards.map(captureBoardForCollectionTemplate),
        tags: [],
        targetGradeLevels: [],
        targetBuildings: newBuildings,
        enabled: true,
        accessLevel: 'public',
        createdAt: now,
        updatedAt: now,
        createdBy: user.email,
      };
    }
    await addDoc(collection(db, TEMPLATES_COLLECTION), payload);
    setMessage({
      type: 'success',
      text: `Template "${newName.trim()}" saved.`,
    });
    setNewName('');
    setNewBuildings([]);
  } catch (err) {
    console.error('Failed to save template:', err);
    setMessage({ type: 'error', text: 'Failed to save template.' });
  } finally {
    setSaving(false);
  }
};
```

- [ ] **Step 2.7: Update the modal title to reflect target kind**

Find the `<Modal ... title="Save Board as Template">` line (around line 169). Replace with:

```tsx
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        target?.kind === 'collection'
          ? 'Save Collection as Template'
          : 'Save Board as Template'
      }
      maxWidth="max-w-lg"
      zIndex="z-modal-deep"
    >
```

- [ ] **Step 2.8: Update the only existing caller — `components/boardsModal/BoardsModal.tsx`**

Open `components/boardsModal/BoardsModal.tsx`. Find the `<SaveAsTemplateModal>` mount (around lines 586-590, look for `saveAsTemplateTarget`). It currently passes `currentDashboard={saveAsTemplateTarget}`. Replace that prop with:

```tsx
<SaveAsTemplateModal
  isOpen={saveAsTemplateTarget !== null}
  onClose={() => setSaveAsTemplateTarget(null)}
  target={
    saveAsTemplateTarget
      ? { kind: 'board', dashboard: saveAsTemplateTarget }
      : null
  }
/>
```

- [ ] **Step 2.9: Run the Collection-target test, the previously-existing tests, and type-check**

```
pnpm vitest run tests/components/admin/SaveAsTemplateModal.collection.test.tsx
pnpm vitest run tests/hooks/useSharedCollection.test.ts
pnpm run type-check
```

Expected: new tests pass (2), Plan 3 tests still pass, 0 type errors.

- [ ] **Step 2.10: Commit**

```
git add components/admin/SaveAsTemplateModal.tsx components/boardsModal/BoardsModal.tsx tests/components/admin/SaveAsTemplateModal.collection.test.tsx
git commit -m "feat(templates): SaveAsTemplateModal accepts Board or Collection target

Replaces the single 'currentDashboard' prop with a discriminated
'target' so the same modal serves both Board and Collection saves.
Picker now filters by type so updating a Board template never lists
Collection templates (and vice versa). Reuses sanitizeBoardSnapshot
for every captured Board (host-specific fields stripped consistently
with Plan 3 share flow)."
```

---

## Task 3: Add "Save as Template…" to `CollectionContextMenu`

Wire the new menu item. Mirror the admin-gated pattern from `BoardContextMenu`.

**Files:**

- Modify: `components/boardsModal/CollectionContextMenu.tsx`

- [ ] **Step 3.1: Update props interface and items array**

Open `components/boardsModal/CollectionContextMenu.tsx`. Add `LayoutTemplate` to the lucide-react import line (top of file):

```ts
import {
  ExternalLink,
  Pencil,
  FolderInput,
  Palette,
  Share2,
  LayoutTemplate,
  Trash2,
} from 'lucide-react';
```

Update the `CollectionContextMenuProps` interface (lines 12-22) — add two new props after `onShare`:

```ts
interface CollectionContextMenuProps {
  position: { x: number; y: number };
  onClose: () => void;
  onOpen: () => void;
  onRename: () => void;
  onMove: () => void;
  onColor: () => void;
  canShare: boolean;
  onShare: () => void;
  canSaveAsTemplate: boolean;
  onSaveAsTemplate: () => void;
  onDelete: () => void;
}
```

Add the same props to the destructured arg list in the component (lines 24-34):

```tsx
export const CollectionContextMenu: React.FC<CollectionContextMenuProps> = ({
  position,
  onClose,
  onOpen,
  onRename,
  onMove,
  onColor,
  canShare,
  onShare,
  canSaveAsTemplate,
  onSaveAsTemplate,
  onDelete,
}) => {
```

After the `if (canShare) { items.push(...) }` block (lines 77-83), insert a parallel block — place it BEFORE the final `items.push(Delete)` so "Save as Template…" appears above "Delete" in the menu:

```tsx
if (canSaveAsTemplate) {
  items.push({
    label: t('collectionMenu.saveAsTemplate', {
      defaultValue: 'Save as Template…',
    }),
    icon: LayoutTemplate,
    action: onSaveAsTemplate,
  });
}
```

- [ ] **Step 3.2: Verify type-check**

```
pnpm run type-check
```

Expected: 1 error in `BoardsModal.tsx` — `Property 'canSaveAsTemplate' is missing` (the call site doesn't yet pass the new props). Task 4 fixes this.

- [ ] **Step 3.3: Commit**

```
git add components/boardsModal/CollectionContextMenu.tsx
git commit -m "feat(boardsModal): add 'Save as Template…' item to CollectionContextMenu

Admin-gated, parallels the Plan-1 wiring on BoardContextMenu. Caller
wiring lands in the next commit (Task 4)."
```

---

## Task 4: Wire the menu callback + mount modal for Collections in `BoardsModal`

**Files:**

- Modify: `components/boardsModal/BoardsModal.tsx`

- [ ] **Step 4.1: Add target state and wire the new menu props**

Open `components/boardsModal/BoardsModal.tsx`. Find the existing `const [saveAsTemplateTarget, setSaveAsTemplateTarget] = useState<Dashboard | null>(null);` declaration (around line 67). Add immediately below it:

```ts
const [saveAsCollectionTemplateTarget, setSaveAsCollectionTemplateTarget] =
  useState<Collection | null>(null);
```

If `Collection` isn't already imported in this file, add it to the existing types import line (look for `import type { ... } from '@/types';`).

Find the `<CollectionContextMenu>` mount (around lines 500-548). Add `canSaveAsTemplate` and `onSaveAsTemplate` props next to the existing `canShare` / `onShare`:

```tsx
<CollectionContextMenu
  position={collectionContextMenu.position}
  onClose={() => setCollectionContextMenu(null)}
  onOpen={() => setSelectedCollectionId(collectionContextMenu.collection.id)}
  onRename={() => {
    /* existing rename logic, unchanged */
  }}
  onMove={() => {
    /* existing move logic, unchanged */
  }}
  onColor={() => {
    /* existing color logic, unchanged */
  }}
  canShare={isAdmin}
  onShare={() => setShareCollectionTarget(collectionContextMenu.collection)}
  canSaveAsTemplate={isAdmin}
  onSaveAsTemplate={() =>
    setSaveAsCollectionTemplateTarget(collectionContextMenu.collection)
  }
  onDelete={() => {
    /* existing delete logic, unchanged */
  }}
/>
```

NOTE: do not rewrite the existing rename/move/color/delete callbacks — they have inline logic that varies by codebase state. Only add the two new props. Read the live file before editing if unsure.

- [ ] **Step 4.2: Mount the Collection-target `SaveAsTemplateModal`**

Find the existing Board-target `<SaveAsTemplateModal>` mount (the one you updated in Step 2.8). Add a sibling mount immediately after it:

```tsx
<SaveAsTemplateModal
  isOpen={saveAsCollectionTemplateTarget !== null}
  onClose={() => setSaveAsCollectionTemplateTarget(null)}
  target={
    saveAsCollectionTemplateTarget
      ? {
          kind: 'collection',
          collection: saveAsCollectionTemplateTarget,
          boards: dashboards.filter(
            (d) => d.collectionId === saveAsCollectionTemplateTarget.id
          ),
        }
      : null
  }
/>
```

`dashboards` should already be in scope from `useDashboard()`; if not, add it to the hook destructure at the top of the component.

- [ ] **Step 4.3: Verify type-check + lint**

```
pnpm run type-check
pnpm run lint
```

Expected: 0 errors, 0 warnings.

- [ ] **Step 4.4: Commit**

```
git add components/boardsModal/BoardsModal.tsx
git commit -m "feat(boardsModal): wire Collection 'Save as Template' menu + modal

Adds saveAsCollectionTemplateTarget state, mounts a second
SaveAsTemplateModal instance with target.kind='collection', and
filters dashboards by collectionId to feed the modal."
```

---

## Task 5: Pure hydration helper

Translating a `CollectionTemplate` into the inputs `useCollections.createCollection` and `DashboardContext.createNewDashboard` need is non-trivial enough to factor into a pure helper with unit tests — no I/O, just data shaping. This isolates the riskiest logic (id remapping, order computation, `defaultBoardSnapshotId` → recipient-board-id resolution) from the modal's effect handling.

**Files:**

- Create: `utils/collectionTemplateHydration.ts`
- Test: `tests/utils/collectionTemplateHydration.test.ts`

- [ ] **Step 5.1: Write the failing test**

Create `tests/utils/collectionTemplateHydration.test.ts`:

```ts
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
```

- [ ] **Step 5.2: Run test to verify it fails**

```
pnpm vitest run tests/utils/collectionTemplateHydration.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 5.3: Write the helper**

Create `utils/collectionTemplateHydration.ts`:

```ts
import type {
  CollectionTemplate,
  Dashboard,
  BoardTemplateSnapshot,
} from '@/types';

export interface HydrateOptions {
  /** Highest existing `order` value across the recipient's dashboards. New Boards land at `existingMaxOrder + 1..N`. */
  existingMaxOrder: number;
}

export interface HydrationResult {
  /**
   * Args for `useCollections.createCollection`. `parentCollectionId` is
   * always null — templates land at the recipient's root; they can move
   * the resulting Collection after import.
   */
  collectionInput: {
    name: string;
    color?: string;
    icon?: string;
    parentCollectionId: null;
  };
  /**
   * Pre-built Dashboard payloads to pass to `createNewDashboard`.
   * Caller is responsible for stamping `collectionId` once the new
   * Collection id is known (Firestore round-trip).
   */
  boardInputs: Dashboard[];
  /**
   * If the template named a default Board snapshot, this is the freshly
   * assigned uuid of that Board in `boardInputs`. Caller passes it to
   * `useCollections.setCollectionDefaultBoard` after the Collection
   * exists. Null when the template named no default, or named one that
   * isn't present in boardSnapshots.
   */
  defaultBoardId: string | null;
}

/**
 * Pure data-shaping for a Collection template. No I/O — caller is
 * responsible for the Firestore writes via the standard
 * useCollections + DashboardContext actions. Each Board snapshot is
 * given a fresh uuid; if the snapshot named a default Board, the new
 * id of that Board is surfaced on the result so the caller can stamp
 * it after the Collection write resolves.
 *
 * Why no I/O: the existing primitives in useCollections and
 * DashboardContext already handle Firestore + permission gating + toast
 * surfacing. Reusing them keeps the import flow consistent with
 * everything else the user does (creating Collections / Boards
 * manually, importing shared Collections in Plan 3, etc.).
 */
export const hydrateCollectionTemplate = (
  template: CollectionTemplate,
  options: HydrateOptions
): HydrationResult => {
  // Map snapshot id → new uuid so we can resolve the default-board hint.
  const idRemap = new Map<string, string>();

  const boardInputs: Dashboard[] = template.boardSnapshots.map(
    (snap: BoardTemplateSnapshot, idx: number) => {
      const newId = crypto.randomUUID();
      idRemap.set(snap.id, newId);
      // Build a Dashboard — snapshot id is replaced; order is deterministic.
      // Note: collectionId is intentionally absent; caller stamps it after
      // the Collection write resolves.
      const board: Dashboard = {
        id: newId,
        name: snap.name,
        background: snap.background,
        widgets: snap.widgets,
        createdAt: Date.now(),
        order: options.existingMaxOrder + idx + 1,
        ...(snap.globalStyle !== undefined && {
          globalStyle: snap.globalStyle,
        }),
        ...(snap.settings !== undefined && { settings: snap.settings }),
        ...(snap.libraryOrder !== undefined && {
          libraryOrder: snap.libraryOrder,
        }),
        ...(snap.viewportWidth !== undefined && {
          viewportWidth: snap.viewportWidth,
        }),
        ...(snap.viewportHeight !== undefined && {
          viewportHeight: snap.viewportHeight,
        }),
      };
      return board;
    }
  );

  const defaultHint = template.collectionSnapshot.defaultBoardSnapshotId;
  const defaultBoardId =
    defaultHint !== undefined && idRemap.has(defaultHint)
      ? (idRemap.get(defaultHint) ?? null)
      : null;

  const collectionInput: HydrationResult['collectionInput'] = {
    name: template.collectionSnapshot.name,
    parentCollectionId: null,
    ...(template.collectionSnapshot.color !== undefined && {
      color: template.collectionSnapshot.color,
    }),
    ...(template.collectionSnapshot.icon !== undefined && {
      icon: template.collectionSnapshot.icon,
    }),
  };

  return { collectionInput, boardInputs, defaultBoardId };
};
```

- [ ] **Step 5.4: Run test to verify it passes**

```
pnpm vitest run tests/utils/collectionTemplateHydration.test.ts
```

Expected: 8 passed.

- [ ] **Step 5.5: Commit**

```
git add utils/collectionTemplateHydration.ts tests/utils/collectionTemplateHydration.test.ts
git commit -m "feat(templates): pure hydrateCollectionTemplate helper

Converts a CollectionTemplate doc into the inputs the existing
useCollections + DashboardContext actions consume. ID remapping keeps
the default-board hint valid across the rename; existingMaxOrder makes
ordering deterministic. No I/O — caller drives Firestore writes."
```

---

## Task 6: `CreateFromTemplateModal` picker

The picker shows all enabled templates (filtered by current user's accessLevel + building targeting), discriminates Board vs Collection visually, and on selection calls the right hydration path. For this plan we ship Collection hydration; Board hydration is wired to the existing `createNewDashboard` directly (it just clones widgets/style/background, no new helper needed).

**Files:**

- Create: `components/boardsModal/CreateFromTemplateModal.tsx`
- Test: `tests/components/boardsModal/CreateFromTemplateModal.test.tsx`

- [ ] **Step 6.1: Write the failing test**

Create `tests/components/boardsModal/CreateFromTemplateModal.test.tsx`:

```tsx
/* @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CreateFromTemplateModal } from '@/components/boardsModal/CreateFromTemplateModal';
import type { AnyTemplate } from '@/types';

const boardTemplate: AnyTemplate = {
  id: 'bt1',
  type: 'board',
  name: 'Board T',
  description: '',
  widgets: [],
  tags: [],
  targetGradeLevels: [],
  targetBuildings: [],
  enabled: true,
  accessLevel: 'public',
  createdAt: 1,
  updatedAt: 1,
  createdBy: 'a@b',
};

const collectionTemplate: AnyTemplate = {
  id: 'ct1',
  type: 'collection',
  name: 'Collection T',
  description: '',
  collectionSnapshot: { name: 'Collection T' },
  boardSnapshots: [
    {
      id: 'orig',
      name: 'Welcome',
      background: 'bg-slate-900',
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
};

let onSnapshotCallback: (snap: {
  docs: { id: string; data: () => unknown }[];
}) => void = () => undefined;

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  onSnapshot: vi.fn((_q, next) => {
    onSnapshotCallback = next;
    return () => undefined;
  }),
}));

vi.mock('@/config/firebase', () => ({
  db: {},
  isAuthBypass: false,
}));

const createCollection = vi.fn().mockResolvedValue('new-coll-id');
const setCollectionDefaultBoard = vi.fn().mockResolvedValue(undefined);
vi.mock('@/hooks/useCollections', () => ({
  useCollections: () => ({
    createCollection,
    setCollectionDefaultBoard,
  }),
}));

const createNewDashboard = vi.fn().mockResolvedValue('new-board-id');
vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({
    dashboards: [{ order: 4 }],
    createNewDashboard,
  }),
}));

beforeEach(() => {
  createCollection.mockClear();
  createNewDashboard.mockClear();
  setCollectionDefaultBoard.mockClear();
});

describe('CreateFromTemplateModal', () => {
  it('lists both Board and Collection templates with type badges', async () => {
    render(<CreateFromTemplateModal isOpen onClose={() => undefined} />);
    onSnapshotCallback({
      docs: [
        { id: 'bt1', data: () => boardTemplate },
        { id: 'ct1', data: () => collectionTemplate },
      ],
    });
    await waitFor(() => {
      expect(screen.getByText('Board T')).toBeInTheDocument();
      expect(screen.getByText('Collection T')).toBeInTheDocument();
    });
    expect(screen.getAllByText(/Board/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Collection/i).length).toBeGreaterThan(0);
  });

  it('hydrates a Collection template through createCollection + createNewDashboard', async () => {
    render(<CreateFromTemplateModal isOpen onClose={() => undefined} />);
    onSnapshotCallback({
      docs: [{ id: 'ct1', data: () => collectionTemplate }],
    });
    await waitFor(() => screen.getByText('Collection T'));
    fireEvent.click(screen.getByText('Collection T'));

    await waitFor(() => expect(createCollection).toHaveBeenCalledTimes(1));
    expect(createCollection).toHaveBeenCalledWith('Collection T', null);
    expect(createNewDashboard).toHaveBeenCalledTimes(1);
    const firstCallArgs = createNewDashboard.mock.calls[0];
    expect(firstCallArgs[0]).toBe('Welcome');
    expect(firstCallArgs[2]).toEqual({
      collectionId: 'new-coll-id',
      silent: true,
    });
  });

  it('hydrates a Board template through createNewDashboard at root', async () => {
    render(<CreateFromTemplateModal isOpen onClose={() => undefined} />);
    onSnapshotCallback({ docs: [{ id: 'bt1', data: () => boardTemplate }] });
    await waitFor(() => screen.getByText('Board T'));
    fireEvent.click(screen.getByText('Board T'));

    await waitFor(() => expect(createNewDashboard).toHaveBeenCalledTimes(1));
    expect(createCollection).not.toHaveBeenCalled();
    expect(createNewDashboard.mock.calls[0][0]).toBe('Board T');
  });

  it('skips disabled templates', async () => {
    render(<CreateFromTemplateModal isOpen onClose={() => undefined} />);
    onSnapshotCallback({
      docs: [
        {
          id: 'bt1',
          data: () => ({ ...boardTemplate, enabled: false }),
        },
      ],
    });
    await waitFor(() => {
      expect(screen.queryByText('Board T')).not.toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 6.2: Run test to verify it fails**

```
pnpm vitest run tests/components/boardsModal/CreateFromTemplateModal.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 6.3: Write the modal**

Create `components/boardsModal/CreateFromTemplateModal.tsx`:

```tsx
import React, { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { Loader2, Layout, Folder } from 'lucide-react';
import { Modal } from '@/components/common/Modal';
import { db, isAuthBypass } from '@/config/firebase';
import { useCollections } from '@/hooks/useCollections';
import { useDashboard } from '@/context/useDashboard';
import { hydrateCollectionTemplate } from '@/utils/collectionTemplateHydration';
import {
  AnyTemplate,
  Dashboard,
  isCollectionTemplate,
  DashboardTemplate,
} from '@/types';
import { logError } from '@/utils/logError';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const TEMPLATES_COLLECTION = 'dashboard_templates';

export const CreateFromTemplateModal: React.FC<Props> = ({
  isOpen,
  onClose,
}) => {
  const { t } = useTranslation();
  const { createCollection, setCollectionDefaultBoard } = useCollections();
  const { dashboards, createNewDashboard } = useDashboard();
  const [templates, setTemplates] = useState<AnyTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyTemplateId, setBusyTemplateId] = useState<string | null>(null);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    if (isAuthBypass) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const q = query(
      collection(db, TEMPLATES_COLLECTION),
      where('enabled', '==', true)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const all = snap.docs.map(
          (d) => ({ ...(d.data() as AnyTemplate), id: d.id }) as AnyTemplate
        );
        // Defensive: drop any docs that snuck through with enabled:false
        // (rule changes, race conditions) so we never instantiate a
        // disabled template.
        setTemplates(all.filter((tpl) => tpl.enabled));
        setLoading(false);
        setErrored(false);
      },
      (err) => {
        logError('CreateFromTemplateModal.subscribe', err);
        setErrored(true);
        setLoading(false);
      }
    );
    return unsub;
  }, [isOpen]);

  const baseOrder = dashboards.reduce(
    (max, d) => Math.max(max, d.order ?? 0),
    0
  );

  const pickBoardTemplate = useCallback(
    async (tpl: DashboardTemplate) => {
      setBusyTemplateId(tpl.id);
      try {
        // Board templates land at root with no collectionId. Spread the
        // template's widgets/style/background into the new Dashboard.
        const dashboard: Dashboard = {
          id: crypto.randomUUID(),
          name: tpl.name,
          background: tpl.background ?? 'bg-slate-900',
          widgets: tpl.widgets,
          createdAt: Date.now(),
          order: baseOrder + 1,
          ...(tpl.globalStyle !== undefined && {
            globalStyle: tpl.globalStyle,
          }),
        };
        await createNewDashboard(tpl.name, dashboard);
        onClose();
      } catch (err) {
        logError('CreateFromTemplateModal.pickBoard', err, {
          templateId: tpl.id,
        });
      } finally {
        setBusyTemplateId(null);
      }
    },
    [baseOrder, createNewDashboard, onClose]
  );

  const pickCollectionTemplate = useCallback(
    async (tpl: Extract<AnyTemplate, { type: 'collection' }>) => {
      setBusyTemplateId(tpl.id);
      try {
        const { collectionInput, boardInputs, defaultBoardId } =
          hydrateCollectionTemplate(tpl, { existingMaxOrder: baseOrder });
        const newCollectionId = await createCollection(
          collectionInput.name,
          collectionInput.parentCollectionId
        );
        // Fan out Board creation sequentially under the new Collection.
        // Sequential (not parallel) so the order field translates 1:1 to
        // sidebar position without ordering races between concurrent
        // createNewDashboard calls.
        for (const board of boardInputs) {
          await createNewDashboard(board.name, board, {
            collectionId: newCollectionId,
            silent: true,
          });
        }
        if (defaultBoardId !== null) {
          await setCollectionDefaultBoard(newCollectionId, defaultBoardId);
        }
        onClose();
      } catch (err) {
        logError('CreateFromTemplateModal.pickCollection', err, {
          templateId: tpl.id,
        });
      } finally {
        setBusyTemplateId(null);
      }
    },
    [
      baseOrder,
      createCollection,
      createNewDashboard,
      setCollectionDefaultBoard,
      onClose,
    ]
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('templatePicker.title', {
        defaultValue: 'Create from Template',
      })}
      maxWidth="max-w-xl"
      zIndex="z-modal-deep"
    >
      <div className="space-y-3 p-1">
        {loading && (
          <div className="flex items-center gap-2 text-slate-400 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" />
            {t('templatePicker.loading', {
              defaultValue: 'Loading templates…',
            })}
          </div>
        )}
        {!loading && errored && (
          <p className="text-sm text-rose-300/80 italic">
            {t('templatePicker.loadError', {
              defaultValue: "Couldn't load templates — refresh to retry.",
            })}
          </p>
        )}
        {!loading && !errored && templates.length === 0 && (
          <p className="text-sm text-slate-500 italic">
            {t('templatePicker.empty', {
              defaultValue: 'No templates available yet.',
            })}
          </p>
        )}
        {!loading && !errored && templates.length > 0 && (
          <ul className="divide-y divide-slate-100">
            {templates.map((tpl) => (
              <li key={tpl.id} className="py-2 flex items-center gap-3">
                {isCollectionTemplate(tpl) ? (
                  <Folder className="w-5 h-5 text-brand-blue-primary" />
                ) : (
                  <Layout className="w-5 h-5 text-brand-blue-primary" />
                )}
                <div className="flex-1">
                  <button
                    type="button"
                    onClick={() => {
                      if (isCollectionTemplate(tpl)) {
                        void pickCollectionTemplate(tpl);
                      } else {
                        void pickBoardTemplate(tpl);
                      }
                    }}
                    disabled={busyTemplateId !== null}
                    className="text-left text-sm font-bold text-slate-800 hover:text-brand-blue-primary disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {tpl.name}
                  </button>
                  <p className="text-xs text-slate-500">
                    {isCollectionTemplate(tpl)
                      ? t('templatePicker.kindCollection', {
                          count: tpl.boardSnapshots.length,
                          defaultValue: 'Collection · {{count}} board(s)',
                        })
                      : t('templatePicker.kindBoard', {
                          defaultValue: 'Board',
                        })}
                  </p>
                </div>
                {busyTemplateId === tpl.id && (
                  <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
};
```

- [ ] **Step 6.4: Run test to verify it passes**

```
pnpm vitest run tests/components/boardsModal/CreateFromTemplateModal.test.tsx
```

Expected: 4 passed.

- [ ] **Step 6.5: Commit**

```
git add components/boardsModal/CreateFromTemplateModal.tsx tests/components/boardsModal/CreateFromTemplateModal.test.tsx
git commit -m "feat(boardsModal): CreateFromTemplateModal picker

Lists enabled Board + Collection templates with a type badge.
Selecting a Board template clones widgets/style/background into a new
Board at root. Selecting a Collection template hydrates via the pure
helper (Task 5), creates the Collection, fans out Board creation
sequentially, and stamps the default-board hint if present."
```

---

## Task 7: Wire "+ from Template" entry point in `BoardsModalHeader`

**Files:**

- Modify: `components/boardsModal/BoardsModalHeader.tsx`
- Modify: `components/boardsModal/BoardsModal.tsx`

- [ ] **Step 7.1: Add the new button + prop**

Open `components/boardsModal/BoardsModalHeader.tsx`. Read the file to confirm its current button layout (existing `+ Board` and `+ Collection` triggers). Add a new prop `onCreateFromTemplate?: () => void` to the props interface, and render a button next to the existing `+ Collection` trigger:

```tsx
{
  onCreateFromTemplate && (
    <button
      type="button"
      onClick={onCreateFromTemplate}
      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-700 hover:text-brand-blue-primary border border-slate-200 hover:border-brand-blue-primary rounded-full transition-colors"
    >
      <LayoutTemplate className="w-3.5 h-3.5" />
      {t('boardsModal.header.createFromTemplate', {
        defaultValue: '+ from Template',
      })}
    </button>
  );
}
```

Add `LayoutTemplate` to the lucide-react import at the top of the file. Add `useTranslation` if not already imported.

If `BoardsModalHeader` already destructures known props from a `Props` interface, append `onCreateFromTemplate` there. Do not invent props that don't exist — keep wiring minimal and explicit.

- [ ] **Step 7.2: Mount + wire in `BoardsModal.tsx`**

Open `components/boardsModal/BoardsModal.tsx`. Near the other modal-target state declarations (around line 67, after `saveAsCollectionTemplateTarget`), add:

```ts
const [createFromTemplateOpen, setCreateFromTemplateOpen] = useState(false);
```

Find the `<BoardsModalHeader ... />` mount. Add the new prop:

```tsx
        onCreateFromTemplate={() => setCreateFromTemplateOpen(true)}
```

Below the `SaveAsTemplateModal` mounts you added in Task 4, add:

```tsx
<CreateFromTemplateModal
  isOpen={createFromTemplateOpen}
  onClose={() => setCreateFromTemplateOpen(false)}
/>
```

Add the matching import at the top of `BoardsModal.tsx`:

```ts
import { CreateFromTemplateModal } from './CreateFromTemplateModal';
```

- [ ] **Step 7.3: Verify type-check + lint + targeted tests**

```
pnpm run type-check
pnpm run lint
pnpm vitest run tests/components/boardsModal/
```

Expected: 0 errors, 0 lint warnings. Plan 3's boardsModal tests still pass (if any exist), plus the new picker test.

- [ ] **Step 7.4: Commit**

```
git add components/boardsModal/BoardsModalHeader.tsx components/boardsModal/BoardsModal.tsx
git commit -m "feat(boardsModal): + from Template trigger in modal header

Optional onCreateFromTemplate prop on BoardsModalHeader renders a third
trigger next to + Board / + Collection. BoardsModal owns the open/close
state and mounts CreateFromTemplateModal."
```

---

## Task 8: `DashboardTemplatesManager` — type badge + filter

The admin manager currently lists every template flat. Add a type badge per card and a "All | Boards | Collections" filter so admins can scope the list while they curate.

**Files:**

- Modify: `components/admin/DashboardTemplatesManager.tsx`

- [ ] **Step 8.1: Read the file to locate the list and filter region**

```
pnpm grep -n "templates.map" components/admin/DashboardTemplatesManager.tsx
```

Open the file. Find the templates-list render (around line 326–490) and any existing filter UI (look for `setAccessFilter` or similar).

- [ ] **Step 8.2: Add type-filter state**

Near the other filter `useState` declarations in the component body, add:

```ts
const [typeFilter, setTypeFilter] = useState<'all' | 'board' | 'collection'>(
  'all'
);
```

Update the `AnyTemplate` import — find the existing import of `DashboardTemplate` from `@/types` and extend it:

```ts
import {
  AnyTemplate,
  DashboardTemplate,
  CollectionTemplate,
  isCollectionTemplate,
} from '@/types';
```

Update the templates state type from `DashboardTemplate[]` to `AnyTemplate[]`. Update the `onSnapshot` mapper that builds the array to leave the union type intact (do not cast as `DashboardTemplate`).

- [ ] **Step 8.3: Add the filter UI**

Above the templates list, render a 3-button toggle:

```tsx
<div className="flex items-center gap-1.5 mb-3">
  {(['all', 'board', 'collection'] as const).map((k) => (
    <button
      key={k}
      type="button"
      onClick={() => setTypeFilter(k)}
      className={`px-3 py-1 rounded-full text-xs font-bold border transition-colors ${
        typeFilter === k
          ? 'bg-brand-blue-primary text-white border-brand-blue-primary'
          : 'bg-white text-slate-600 border-slate-200 hover:border-brand-blue-primary'
      }`}
    >
      {k === 'all' ? 'All' : k === 'board' ? 'Boards' : 'Collections'}
    </button>
  ))}
</div>
```

- [ ] **Step 8.4: Filter the list and add a type badge per card**

Find the templates loop (looks like `templates.map((t) => ...)`). Wrap the source array in a filter:

```tsx
const visibleTemplates = templates.filter((tpl) => {
  if (typeFilter === 'all') return true;
  if (typeFilter === 'collection') return isCollectionTemplate(tpl);
  return !isCollectionTemplate(tpl);
});
```

Change the loop source from `templates.map(...)` to `visibleTemplates.map(...)`.

Inside each card, near the template name, add:

```tsx
<span
  className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
    isCollectionTemplate(tpl)
      ? 'bg-amber-100 text-amber-800'
      : 'bg-sky-100 text-sky-800'
  }`}
>
  {isCollectionTemplate(tpl) ? 'Collection' : 'Board'}
</span>
```

- [ ] **Step 8.5: Guard Board-only field reads with the type guard**

Any read inside the loop that touches `tpl.widgets` or `tpl.background` (Board-only fields) must be gated. Find every `tpl.widgets.length` or `tpl.background` access in the render and wrap with `!isCollectionTemplate(tpl) && (...)`. For Collection templates, show `tpl.boardSnapshots.length` boards instead:

```tsx
{
  isCollectionTemplate(tpl) ? (
    <span className="text-xs text-slate-500">
      {tpl.boardSnapshots.length} board(s)
    </span>
  ) : (
    <span className="text-xs text-slate-500">
      {tpl.widgets.length} widget(s)
    </span>
  );
}
```

- [ ] **Step 8.6: Verify type-check + lint**

```
pnpm run type-check
pnpm run lint
```

Expected: 0 errors, 0 warnings.

- [ ] **Step 8.7: Commit**

```
git add components/admin/DashboardTemplatesManager.tsx
git commit -m "feat(admin): type badge + filter on DashboardTemplatesManager

Lists now include Collection templates (Plan 4). All/Boards/Collections
filter scopes the view; per-card badge distinguishes the two. Board-only
field reads are guarded by isCollectionTemplate."
```

---

## Task 9: i18n keys (en + de/es/fr fallbacks)

**Files:**

- Modify: `locales/en.json`
- Modify: `locales/de.json`
- Modify: `locales/es.json`
- Modify: `locales/fr.json`

- [ ] **Step 9.1: Add the keys to `en.json`**

Open `locales/en.json`. Find the `collectionMenu` namespace (around line 990) and add `saveAsTemplate`:

```json
  "collectionMenu": {
    "share": "Share Collection…",
    "saveAsTemplate": "Save as Template…"
  },
```

Add a new `templatePicker` namespace at the same nesting level (insert after `collectionMenu`):

```json
  "templatePicker": {
    "title": "Create from Template",
    "loading": "Loading templates…",
    "loadError": "Couldn't load templates — refresh to retry.",
    "empty": "No templates available yet.",
    "kindBoard": "Board",
    "kindCollection": "Collection · {{count}} board(s)"
  },
```

Find the `boardsModal.header` namespace (search for `boardsModal`). Add `createFromTemplate`:

```json
    "header": {
      ...
      "createFromTemplate": "+ from Template"
    },
```

(The exact nesting depends on the existing `boardsModal` structure — read the file and insert under whatever object holds the other header strings. If no `header` sub-namespace exists, create one.)

- [ ] **Step 9.2: Add English fallbacks to `de.json` / `es.json` / `fr.json`**

In each of `locales/de.json`, `locales/es.json`, `locales/fr.json`, mirror the additions made to `en.json` using the same English copy as fallback. This matches the precedent set by commit `48634c78` (Plan 2 i18n: en + fallback for de/es/fr) and Plan 3's locale additions.

For each file:

1. Find `collectionMenu` and add `"saveAsTemplate": "Save as Template…"`.
2. Add the full `templatePicker` namespace block (same English strings).
3. Add `"createFromTemplate": "+ from Template"` under the appropriate `boardsModal.header` location.

- [ ] **Step 9.3: Verify JSON validity + i18n tests**

```
pnpm vitest run tests/i18n
pnpm run type-check
```

Expected: i18n tests pass. JSON parses cleanly across all four locales.

- [ ] **Step 9.4: Commit**

```
git add locales/en.json locales/de.json locales/es.json locales/fr.json
git commit -m "i18n(templates): add Plan 4 keys (en + de/es/fr fallbacks)

collectionMenu.saveAsTemplate, boardsModal.header.createFromTemplate,
and the templatePicker namespace. Non-English locales reuse the
English strings, matching Plan 2/3 convention until a translation pass."
```

---

## Task 10: E2E happy path

A single Playwright spec covers the end-to-end loop: admin saves a Collection as a template → teacher (same auth-bypass user) uses the picker → new Collection materializes with the right children.

**Files:**

- Create: `tests/e2e/collection-template.spec.ts`

- [ ] **Step 10.1: Write the spec**

Create `tests/e2e/collection-template.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

/**
 * Plan 4 happy-path: save a Collection as a template, then instantiate it.
 *
 * Auth-bypass mode (`VITE_AUTH_BYPASS=true`) wires a mock-user with admin
 * privileges, mock Firestore stores, and a SessionStorage-backed mock for
 * `/dashboard_templates/` writes/reads — same harness Plan 3 uses for
 * share-collection.spec.ts. The flow is:
 *
 *   1. Pre-seed a Collection with 2 Boards under the mock user.
 *   2. Open the Boards modal, right-click the Collection, choose
 *      "Save as Template…", give it a name, save.
 *   3. Open the Boards modal again, click "+ from Template", click the
 *      new template, confirm a new Collection appears with 2 child Boards.
 */
test('admin can save a Collection as a template and instantiate it', async ({
  page,
}) => {
  await page.goto('/');
  // Wait for the auth-bypass user to render the dashboard view.
  await expect(page.getByRole('button', { name: /My Boards/i })).toBeVisible({
    timeout: 10000,
  });

  // --- 1. Seed Collection + 2 Boards via the BoardsModal UI ---
  await page.getByRole('button', { name: /My Boards/i }).click();
  await expect(page.getByRole('dialog')).toBeVisible();

  // Create the Collection.
  await page.getByRole('button', { name: /\+ Collection/i }).click();
  await page.getByPlaceholder(/Collection name/i).fill('Plan 4 Test');
  await page.getByRole('button', { name: /^Create$/i }).click();
  await expect(page.getByText('Plan 4 Test')).toBeVisible();

  // Open the Collection, add 2 Boards.
  await page.getByText('Plan 4 Test').click();
  for (const name of ['Welcome', 'Math']) {
    await page.getByRole('button', { name: /\+ Board/i }).click();
    await page.getByPlaceholder(/Board name/i).fill(name);
    await page.getByRole('button', { name: /^Create$/i }).click();
    await expect(page.getByText(name)).toBeVisible();
  }

  // --- 2. Save the Collection as a template ---
  // Go back to root view.
  await page.getByRole('button', { name: /Back/i }).click();
  // Right-click the Collection card.
  await page.getByText('Plan 4 Test').click({ button: 'right' });
  await page.getByRole('menuitem', { name: /Save as Template…/i }).click();

  // Modal should be "Save Collection as Template".
  await expect(
    page.getByRole('heading', { name: /Save Collection as Template/i })
  ).toBeVisible();

  await page
    .getByPlaceholder(/e\.g\. Morning Routine/i)
    .fill('Plan 4 Template');
  await page.getByRole('button', { name: /Save New Template/i }).click();
  await expect(
    page.getByText(/Template "Plan 4 Template" saved/i)
  ).toBeVisible();
  // Dismiss the modal.
  await page.keyboard.press('Escape');

  // --- 3. Instantiate it via + from Template ---
  await page.getByRole('button', { name: /\+ from Template/i }).click();
  await expect(
    page.getByRole('heading', { name: /Create from Template/i })
  ).toBeVisible();

  await page.getByText('Plan 4 Template').click();

  // Modal closes; a new Collection appears in the modal tree with the
  // same name. The hydration helper does not rename — admins can edit
  // after instantiation.
  await expect(
    page.locator('[role="dialog"]').getByText('Plan 4 Test')
  ).toHaveCount(2); // original + freshly hydrated
});
```

- [ ] **Step 10.2: Run the spec**

```
pnpm test:e2e tests/e2e/collection-template.spec.ts
```

Expected: 1 passing test. If a selector misses (e.g., `Back` button text differs), read the live BoardsModal source to find the actual accessible name and update the selector. Do NOT loosen assertions to make the test pass — fix the selector or the source.

- [ ] **Step 10.3: Commit**

```
git add tests/e2e/collection-template.spec.ts
git commit -m "test(e2e): Plan 4 Collection-template happy path

Single Playwright spec covers save + instantiate via auth-bypass mock
user. Uses the same mock Firestore harness Plan 3 introduced for
share-collection.spec.ts."
```

---

## Task 11: Validate, push, open PR

- [ ] **Step 11.1: Full validate**

```
pnpm run validate
```

Expected: type-check + lint + format + tests all pass. Functions tests also pass.

- [ ] **Step 11.2: Push and open the PR**

```
git push -u origin claude/collections-plan-4
gh pr create --base dev-paul --title "feat: Collection-level templates (Plan 4 of 4)" --body "..."
```

Use a body that summarizes:

- What's in (schema, save flow, picker, admin manager updates, hydration helper, tests, i18n)
- Why (closes the Plan 4 commitment from the master Collections plan; brings template parity to Collections)
- Test plan (vitest, e2e, manual smoke)
- Out of scope (per-user templates, sharing templates as live links — those are orthogonal future plans)

---

## Self-review (write-time checks)

**1. Spec coverage:**

- ✅ `type` discriminator on `/dashboard_templates/` — Task 1
- ✅ Save Collection as template — Tasks 2, 3, 4
- ✅ Save-as-template feature parity with Board context menu — Task 3
- ✅ Consumption path (the brief calls out the empty consumption gap) — Tasks 5, 6, 7
- ✅ Admin manager updates for the new type — Task 8
- ✅ Tests (unit + integration + e2e) — Tasks 0, 2, 5, 6, 10
- ✅ i18n (en + fallbacks) — Task 9
- ✅ No firestore.rules changes (existing admin-gate covers both types) — documented in "Not modified"
- ✅ Sanitization parity with Plan 3 — Task 0 extracts the helper, Tasks 2 and 5 reuse it

**2. Placeholder scan:**

- No "TBD", "TODO", "fill in details" — verified.
- No "Add appropriate error handling" — all error paths show explicit code (logError + setErrored, etc.).
- "Similar to Task N" — only in Task 3 step 3.1 referencing the Plan-1 wiring pattern as background, with full code shown.
- Step 7.1 instructs the engineer to "read the file to confirm its current button layout" before editing — this is acceptable because the header file's exact structure isn't worth pre-baking; the new button snippet is fully shown.

**3. Type consistency:**

- `CollectionTemplate.collectionSnapshot.defaultBoardSnapshotId` (Task 1) is read in `hydrateCollectionTemplate` (Task 5) and resolved into `defaultBoardId` on the result — names match.
- `SaveTemplateTarget` (Task 2) is consumed in Task 4's modal mount — discriminator `kind` is consistent across all sites.
- `isCollectionTemplate` (Task 1) is used in Tasks 2, 6, 8 — same signature throughout.
- `useCollections.createCollection(name, parentCollectionId)` (verified from the actual hook signature) matches the call in Task 6.
- `useCollections.setCollectionDefaultBoard(collectionId, boardId)` matches the call in Task 6.
- `createNewDashboard(name, dashboard, { collectionId, silent })` shape matches Plan 3's usage in `importSharedCollection`.

No gaps found.

---

## Out of scope for Plan 4 (decisions documented for future plans)

- **Per-user templates.** Templates remain admin-curated and globally readable. A "save my own private template" feature would need a per-user collection (`/users/{uid}/templates/`) with its own rules block; not part of this plan.
- **Sharing Collection templates as live links.** Plan 3 owns live-sharing semantics (host pushes updates to recipients). Templates are frozen design artifacts captured at save time. The two surfaces stay orthogonal.
- **Thumbnails / previews.** Consistent with Plan 1's deferral. Cards show name + type badge + board count; no rendered preview.
- **Substitute-mode templates.** Substitute share semantics (TTL, building gating, view-only) belong to Plan 3's `/shared_collections/` surface. Templates have no expiration.
- **Bulk import / export of templates.** Not requested.
