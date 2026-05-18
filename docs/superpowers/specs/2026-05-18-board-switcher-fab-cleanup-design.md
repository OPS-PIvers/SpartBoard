# Board Switcher FAB Cleanup — Design

## Goal

Reclaim usable board space by removing the always-visible Collection › Board breadcrumb pill, and make the two most common navigation actions — switching Collections and picking a specific Board — each reachable in a single tap from the FAB row.

## Motivation

The current pill is on-screen 100% of the time but is only useful at the moment a user switches context. Meanwhile, the kebab in the FAB row hides both pickers behind a generic icon: switching Collections is two taps (kebab → "Switch Collection…"), and picking a non-adjacent Board is one tap to open and another to choose. Splitting the kebab into a dedicated Collections button and a dedicated Boards button makes each path one tap, and converting the pill from persistent to transient gives the same navigational confirmation without the permanent visual cost.

## Current state

- `components/layout/BoardNavFab.tsx` — `[<] [kebab] [>]`. Renders only when the active Collection has 2+ Boards. The kebab opens a lightweight in-place menu listing Boards in the current Collection, with a "Switch Collection…" item at top (when any Collections exist) that swaps in `CollectionSwitcherMenu`.
- `components/layout/BoardBreadcrumb.tsx` — always-visible pill (`📁 <Collection> › <Board>`) anchored above the FAB row. Click opens the heavyweight `BoardsModal` (manage/rename/reorder/delete). This is the only direct entry point to the modal.
- `components/layout/CollectionSwitcherMenu.tsx` — flat list of Collections (depth-indented) plus a "Root" entry. Only reachable today through the kebab's "Switch Collection…" item.

## Proposed design

### FAB row

```
[<]  [📁 Collections]  [▦ Boards]  [>]
```

- `[<]` `[>]` — unchanged prev/next within the active Collection.
- `[📁 Collections]` — opens `CollectionSwitcherMenu` directly. Hidden when `collections.length < 2` (with only one named Collection, there's nothing meaningful to "switch between" from this FAB — Root↔single-Collection traversal in that edge case goes through `Manage all boards…`). Other buttons reflow naturally to fill the gap.
- `[▦ Boards]` — opens the lightweight Board switcher (today's kebab menu), with two changes:
  - The "Switch Collection…" item at the top is removed (the new Collections button replaces it).
  - A `⚙ Manage all boards…` item is appended at the bottom; opens the full `BoardsModal`. Visually separated by a top border, same pattern as the existing "Switch Collection…" bottom border.

The boards button icon is `LayoutGrid` from lucide-react.

**FAB row visibility:** today the entire row hides when the active Collection has fewer than 2 Boards. After this change, that guard becomes more permissive — the row renders whenever there is anything navigable from it:

- Renders when `dashboards.length > 1` OR `collections.length > 0`
- Inside the row:
  - `[<]` / `[>]` render only when `boardsInCollection.length >= 2` (no point if there's nothing to flip to)
  - `[📁 Collections]` renders only when `collections.length >= 2` (matches the per-button rule above; remaining buttons reflow naturally via flex layout)
  - `[▦ Boards]` always renders when the row is up — it owns the only path to `BoardsModal` from this surface now that the persistent pill is gone

This preserves access to `BoardsModal` and Collections-switching even when the user has a single Board in the active Collection.

### Transient breadcrumb pill

Reuse `BoardBreadcrumb`'s existing visual design (`bg-slate-900/70 backdrop-blur-md`, folder icon + Collection name + chevron + Board name). Change it from always-visible to transient:

- **Trigger:** appears whenever `activeDashboard.id` OR `activeDashboard.collectionId` changes. Also appears on first mount so users land with their location grounded.
- **Display window:** visible for 3 seconds, then fades out via CSS opacity transition (~250ms).
- **Debounce:** if both the Board and Collection change in the same render (user picks a Board in a different Collection from the BoardsModal), it's one logical event — the pill shows once for 3s, not twice.
- **Click behavior:** during its display window, clicking the pill opens `BoardsModal` (preserves the current affordance for users who've learned it).
- **Reduced motion:** when `prefers-reduced-motion` is set, skip the fade — just show, then hide after 3s.

### "Manage all boards" item placement

Appended at the bottom of the Boards menu with a top divider, matching the visual treatment of the current "Switch Collection…" item that lives at the top with a bottom divider. Uses the `Settings` lucide icon.

## Behavior matrix

| User intent                                  | Today                                             | After                                                                                |
| -------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Flip to adjacent Board                       | `[<]` / `[>]`                                     | unchanged                                                                            |
| Jump to specific Board in current Collection | `[kebab]` → tap Board                             | `[Boards]` → tap Board                                                               |
| Switch to a different Collection             | `[kebab]` → "Switch Collection…" → tap Collection | `[Collections]` → tap Collection                                                     |
| Open full BoardsModal                        | Tap always-visible pill                           | `[Boards]` → "Manage all boards…", OR tap transient pill while visible               |
| Confirm "where am I"                         | Glance at always-visible pill                     | Glance at transient pill (auto-shows on change + first mount), or open either picker |

## Code touch points

- **`components/layout/BoardNavFab.tsx`**
  - Add a Collections button (between `[<]` and the boards button) that toggles `isCollectionMenuOpen`. Hidden when `collections.length === 0`.
  - Rename the existing kebab button to a Boards button; swap `MoreVertical` for `LayoutGrid`.
  - In the boards menu, remove the "Switch Collection…" item entirely. Append a "Manage all boards…" item that opens `BoardsModal`.
  - Update `itemRefs` indexing — no more `switchSlot` offset since the in-menu collection trigger goes away. Add a slot for the "Manage all boards…" item at the end.
  - State: add a `isBoardsModalOpen` (or lift to existing BoardsModal owner if cleaner).

- **`components/layout/BoardBreadcrumb.tsx`**
  - Add transient-display state. `useEffect` watching `activeDashboard?.id` + `activeDashboard?.collectionId` → set `visible=true`, schedule a timer to set `visible=false` after 3s. Cleanup clears the timer on re-trigger.
  - First-mount: same effect fires on mount, so first-mount display falls out naturally.
  - Render `null` when not visible (keep the click handler logic gated on `visible`).
  - Apply CSS transition for opacity; honor `prefers-reduced-motion` (skip transition, just toggle visibility).

- **`components/layout/CollectionSwitcherMenu.tsx`**
  - No internal change. Just opened from a new direct trigger on the FAB row.

- **`components/boardsModal/BoardsModal.tsx`**
  - No structural change. May need to lift its mounted/unmounted control if `BoardNavFab` becomes a second owner — easiest path is to keep ownership in `BoardBreadcrumb` for click-to-open and add a sibling owner in `BoardNavFab` for the menu-item path. (Two callers, both render the modal locally; existing modal already handles close cleanup.)

## Tests

- **`tests/components/layout/BoardBreadcrumb.test.tsx`** — replace persistent-render assertions with:
  - Renders on mount (within display window)
  - Disappears after timeout fires
  - Re-appears on `activeDashboard.id` change
  - Re-appears on `activeDashboard.collectionId` change
  - Single appearance when both change in same render (debounce)
  - Click during display window opens `BoardsModal`
  - `prefers-reduced-motion` path skips the transition class

- **`tests/components/layout/CollectionSwitcherMenu.test.tsx`** — existing behavior unchanged; add a test that asserts it can be triggered directly (not only from the kebab path) — or just rely on `BoardNavFab.test.tsx` to cover the new trigger.

- **New: `tests/components/layout/BoardNavFab.test.tsx`** (or extend if it exists)
  - Collections button hidden when `collections.length < 2`; visible when `collections.length >= 2`
  - With 1 collection, the row still renders (so users have a path to BoardsModal via the Boards menu) but Collections button is omitted and siblings reflow
  - Collections button click opens `CollectionSwitcherMenu`
  - Boards button click opens the boards menu
  - Boards menu no longer contains "Switch Collection…"
  - Boards menu contains "Manage all boards…" as the last item
  - "Manage all boards…" click opens `BoardsModal`
  - Keyboard navigation: ArrowDown/Up wraps across Boards + the "Manage all boards…" item

## Non-goals

- No change to the underlying `BoardsModal` UI or behavior.
- No change to `CollectionSwitcherMenu` content/visuals.
- No change to prev/next semantics.
- No new "current location" indicator beyond the transient pill (sidebar already shows the active dashboard).

## Accessibility

- Both new buttons get `aria-label`, `title`, `aria-haspopup="menu"`, and `aria-expanded`.
- `prefers-reduced-motion` is honored for the pill's fade.
- The pill's click target stays within its display window — out-of-window clicks pass through to the underlying board surface.
- Keyboard: each picker is independently focus-trappable; Escape closes; Tab exits and closes (matches current pattern).

## Migration / rollout

No data migration. Pure UI refactor. The transient pill's i18n keys (`boardBreadcrumb.root`, `boardBreadcrumb.openManager`) are reused as-is; no locale changes needed unless we add a new key for "Manage all boards…" — which we will (`boardNav.manageAllBoards`), added to `en.json` with a sensible default for the other locales via i18next fallback.
