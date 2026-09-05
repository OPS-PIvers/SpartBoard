# Widget Settings Drawer — Implementation Plan

**Date**: 2026-09-05 · **Branch**: `dev-paul` · **Status**: Revision 7 (2026-09-05) — FINAL — decisions locked via design interview, hardened by adversarial code review, revised against the graded comparison in §10, re-scoped by the product owner (§11), corrected against a third independent grading (§12), then validated against a four-variant in-app UI prototype and amended per the product owner's pick (§13: find-a-setting filter, Window-tier dedupe, darker section labels, bottom-sheet viewport fixed), then corrected by an adversarial review of the plan itself (§14: false dedupe rationale, maximized z-order, dock/sidebar coverage, resize-pan, scoped heading color, flag-path gating), then finalized after two independent reviews (§15: flag defaults that gated everyone out, per-user width store, single-bundle E2E override, read-only asymmetry corrected, local-only camera on remote flips, `activeWidgetId` state machine, host render isolation, axe scope, wave dependencies) (not started)

Replace the per-widget floating settings panel with a docked, schema-driven settings drawer so
every widget's settings look and behave the same way while the live widget stays visible on the
board (WYSIWYG preserved). Decisions in §2 were agreed in an interactive interview on 2026-09-05
and are not open for re-litigation by an implementing session; open questions are listed at the
end and must be raised, not silently answered. Every file path and line reference below was
verified against the codebase on 2026-09-05; re-verify line numbers before relying on them.

This plan is written to be executed wave-by-wave by fresh sessions. The
`pauls-skills:mass-plan-implementation` skill is the intended driver; if it is not installed, run
each wave as file-owned parallel agents with the orchestrator validating and committing between
waves, exactly as `.claude/workflows/optimize-pass.README.md` describes for its implement phase.

---

## 1. Problem statement

- `components/common/SettingsPanel.tsx` portals a 380px panel beside the widget. Its side
  (right / left / centered) and height vary per widget position and content.
- `WIDGET_SETTINGS_COMPONENTS` has 59 entries (55 lazy-loaded, `miniApp` imported directly,
  and `smartNotebook` / `traffic` / `classes` on the shared `DefaultSettings`) and
  `WIDGET_APPEARANCE_COMPONENTS` has 29 (`components/widgets/WidgetRegistry.ts`, recounted
  2026-09-05). Separately, 59 `*Settings*.tsx` files under `components/widgets/` total 14,272
  lines; the two sets of 59 are not identical (`stickers` has an appearance file but no
  settings entry; the three `DefaultSettings` widgets have no file). Each file
  each hand-rolls sections, labels, spacing, and controls. The largest run 430–940 lines (see §6).
- Measured control divergence across those 59 files: 11 use a raw `<select>`, 8 a raw range
  input, 5 a native `<input type="color">` against 20 that use a shared color picker, 4 a raw
  checkbox against 17 that use the shared `Toggle`. Only 31 use `SettingsLabel`.
- Only 4 of the 59 settings files call `t()`. The panel chrome itself hardcodes the tab names,
  the empty-state text, and the close button label.
- The Style tab writes two different models: `UniversalStyleSettings` sets window-level
  `widget.fontFamily` / `widget.baseTextSize`, while widget appearance components set
  config-level `config.fontFamily` etc. Which one a teacher gets depends on the widget.
- The same concept (color, font, size, toggle, list) is rendered with different controls in
  different widgets. The Style tab shows either `UniversalStyleSettings` or the widget's own
  appearance component, never a predictable set.
- The benefit to keep: the widget on the board updates instantly as a setting changes.

## 2. Locked decisions

| #   | Decision                        | Detail                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| --- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | **Primary pains**               | Inside-panel structure differs; same setting rendered with different controls. Placement is secondary.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| D2  | **Surface**                     | Docked **side drawer**, full viewport height, default right. Widget stays live on the board. The drawer docks on whichever side keeps the edited widget nearer and un-covered (§3 item 8); the choice is deterministic and announced.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| D3  | **Overlap handling**            | **Side selection first, then auto-pan.** Pick the side that needs no pan when one exists; otherwise pan the canvas so the widget is fully visible beside the drawer; restore camera on close. The edited widget gets a focus ring while the drawer is open. Widget `x/y` never change.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| D4  | **Drawer sizing**               | **Resizable** via a drag handle on the board-facing edge (left when docked right, right when docked left), clamped 360–560px, default 400px, width persisted per user in `/users/{uid}/userProfile/profile` (§4.6). Full viewport height. The current 380px × 80vh panel is judged cramped and overloaded by the product owner, so the larger, full-height, resizable surface is a goal of the series, not a cost of it. One widget at a time (D21).                                                                                                                                                                                                                                                                                                                                                                               |
| D5  | **Consistency depth**           | **Schema-driven fields.** Widgets declare a settings schema; a shared renderer draws it. Custom escape hatch for editors a field can't express.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| D6  | **Field kit v1**                | Everything standardized: basics, color + typography, sortable item list, pickers (see §4.2). Anything not in the kit uses the custom slot and is a tracked gap, not a permanent exception.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| D7  | **Style tab**                   | **One universal Style tab** for all widgets, built from the appearance keys the widget declares it consumes. `WIDGET_APPEARANCE_COMPONENTS` is removed at the end of the series; extra visual knobs move into the schema's `display` group or become universal keys.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| D8  | **Settings tab groups**         | Fixed order **Content → Behavior → Display**. Empty groups omitted. Style is its own tab.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| D9  | **Scope**                       | Drawer shell applies to every widget from wave 1 (unmigrated widgets render their legacy JSX inside the drawer's custom slot). **Every widget's internals migrate in this series**: the top 10 by usage in waves 2–3, the remaining 49 in waves 5–9 (§5). `LegacySettingsSlot` is deleted in wave 10, so no second settings system survives.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| D10 | **Top-10 source**               | Admin Analytics (Firestore). Wave 0 queries it and writes the list into §6. Provisional list until then: the ten largest panels.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| D11 | **Cruft cleanup in bounds**     | Remove dead/duplicate controls; rename/normalize config keys with a one-time migration; reorganize into the standard groups with i18n'd labels.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| D12 | **Rollout**                     | **Flag first, delete last.** Drawer ships behind a new global permission `settings-drawer`. Wave 4 flips the default and deletes `SettingsPanel.tsx`; wave 10 deletes the legacy slot.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| D13 | **Custom Widget Builder**       | `CustomWidgetSettingDef` becomes a subset of the new field schema so admin-built widgets render through the same drawer.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| D14 | **Mobile remote**               | `/remote` (`components/remote/`) untouched this series. Tablets using the teacher app are in scope: below 900px viewport width the drawer becomes a bottom sheet (§3 item 10).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| D15 | **Delivery**                    | One PR per wave. Each wave must leave `pnpm run validate` green.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| D16 | **Done bar per migrated panel** | Schema unit test + config-migration test + drawer E2E + i18n parity + axe pass (see §7).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| D17 | **Accessibility**               | The drawer is a non-modal `role="dialog"` with managed focus, a keyboard-operable resize handle, and an automated axe check per migrated widget (§3 item 11).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| D18 | **Style tab model**             | Two explicit tiers: **Window** (frame background, transparency, window font, window text size — `WidgetData` fields, every widget) and **Content** (declared `styleKeys` → `config`). No third path; the window-level fields are neither deleted nor duplicated.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| D19 | **z-index**                     | Drawer renders at a new `Z_INDEX.drawer = 9980` (above annotation chrome, below `modal`). Every existing modal and picker already stacks above it, so nothing opened from a drawer field needs re-layering. **Exception**: `Z_INDEX.maximized` is 10500, above the drawer; a maximized widget would cover it, which D22 handles by leaving maximize before the drawer opens.                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| D22 | **Maximized widgets**           | Opening settings on a maximized widget first restores it through the existing maximize toggle (`DraggableWindow.tsx` already writes `{ maximized: false, flipped: false }` on that path; the host flips it after the restore commits), then side selection runs normally. That toggle starts `if (isLocked) return;` and `isLocked` includes `isActiveBoardReadOnly`, so a maximized widget that is locked or on a read-only board **cannot** be restored; there the drawer refuses to open (the gear is already disabled for locked widgets) rather than rendering under `Z_INDEX.maximized`. The drawer never renders above `modal`, and the restore is the existing user-visible action, not a drawer write (§4.9 still holds: the drawer itself never touches `x/y/w/h`). **Rev 6 default, overridable by the product owner.** |
| D23 | **Dock and sidebar coverage**   | The drawer covers whatever sits under it, including the Sidebar (1200) and a side-anchored Dock (1000). Nothing lifts or moves. Side selection breaks ties away from a side-anchored dock (§3 item 8); the bottom sheet covers a bottom-anchored dock and that is accepted. The expanded dock (`critical`, 20000) still opens above the drawer. Close (button, Esc, Alt+S) is always reachable, so the teacher is never trapped. **Rev 6 default, overridable.**                                                                                                                                                                                                                                                                                                                                                                   |
| D24 | **Resize never pans**           | Dragging the drawer's resize handle changes the drawer's width only. It does not re-run side selection and does not move the camera, even if the wider drawer now covers the edited widget. Rationale: §13, a camera pan moves everything on a projected board. **Rev 6 default, overridable.**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| D20 | **Translation deferred**        | Every drawer label goes through `t()` with keys under `widgetSettings.*` in `locales/en.json` only. `de`/`es`/`fr` entries are **not** written in this series and no `tests/i18n/widgetSettings*Locales.test.ts` parity test is added. i18next falls back to English (`fallbackLng: 'en'`). Rationale: the locales exist for student-facing widget content used by world-language teachers; staff-facing settings chrome was never the target. A follow-up series owns the translations (§8).                                                                                                                                                                                                                                                                                                                                      |
| D21 | **Single widget at a time**     | The drawer edits exactly one widget. Product owner confirmation: nobody edits two widgets' settings simultaneously, so the current ability to have several panels flipped at once is not a capability to preserve. The host un-flips siblings and `migrateWidget` normalizes stored boards to at most one `flipped` widget (§3, §4.4).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

## 3. Target UX

**Drawer chrome** (shared by every widget):

1. Header: widget title (`widget.customTitle ?? title`), `WidgetBuildingToggle`, help button
   (existing `useHelpItemsForWidget` / `requestOpenHelp` wiring), close button whose tooltip **and**
   `aria-label` are `t('widgetSettings.common.close')`, and which carries
   `data-testid="settings-drawer-close"`. `tests/e2e/nexus_qr_text.spec.ts` currently selects
   `getByLabel('Close settings')`; wave 1b switches it to the test id so no string is exempt
   from `t()`. Tab names and the empty-state text move to `widgetSettings.common.*` keys.
2. **Find-a-setting filter** directly under the header, above the tab bar: a single text input
   (`aria-label` and placeholder `t('widgetSettings.common.findSetting')`, with an inline Clear
   button once non-empty). Typing filters by field label, case-insensitively, across **both**
   tabs at once: the tab bar is hidden while a query is active and the body shows the matching
   fields grouped under their section headings (Content / Behavior / Display / Style / Window).
   Clearing the query restores the tab bar and the previously selected tab. No match renders
   `t('widgetSettings.common.noMatches', { query })`. Fields rendered through the legacy slot
   (§4.1) are not indexed; while a widget is still on the slot the no-match text appends
   `t('widgetSettings.common.legacyNotIndexed')`. The filter reads the same `label` i18n keys the
   renderer resolves, so migrating a widget indexes it for free. The Window tier is not a schema,
   so `schema/windowStyle.tsx` exports `WINDOW_STYLE_LABELS` (the four i18n keys for background,
   transparency, window font, window text size) and the filter indexes that list under the
   "Window" heading; a Window match renders the whole Window tier. Fields hidden by
   `visibleWhen` are not matched; `Select`/`Segmented` option labels are not indexed, only field
   labels. **Escape in the filter**: while the input has focus, the first Escape clears the query
   (or blurs the input if already empty); only an Escape with the query empty and focus outside a
   form field closes the drawer. This is **new** behavior: today's `SettingsPanel.tsx` field guard
   simply ignores Escape from inside an input, and `utils/domHelpers.ts`
   `isEscapeFromWidgetInput` returns true for any Escape inside `[data-widget-portal]`, which a
   long tail of dialogs (`ConfirmDialog`, `PromptDialog`, `DialogContainer`, pickers) use to
   yield. The drawer's own keydown handler therefore runs on the drawer root (React handler,
   before the window-level guards see the event) and calls `stopPropagation` after handling
   Escape, so the clear/blur/close ladder is never eaten by those guards, and those guards keep
   yielding to the drawer exactly as they yield to the panel today. Rationale: the
   prototype (§13) showed the filter is the single most useful affordance against 400–940-line
   panels.
3. Tab bar pinned under the filter: **Settings** · **Style**. Same two tabs, always.
4. Scrollable body. Settings tab renders schema groups in D8 order as titled sections. Style tab
   renders the universal style fields the widget opts into (Content tier), then the Window tier.
   **The Window tier renders exactly one background control**: `UniversalStyleSettings` already
   renders the frame background picker (`WidgetBackgroundSettings`, defined in the same file), so
   the drawer never places a second one beside it. Today's `SettingsPanel.tsx` is already
   either/or (appearance component + `WidgetBackgroundSettings`, else `UniversalStyleSettings`);
   the duplicated swatch row in prototype variant A was a prototype artifact, not a production
   defect (§14). Transparency follows, moved verbatim from the current panel. **Interim
   behavior**: from wave 1b until a widget migrates, its Style tab shows the legacy appearance
   component (via the legacy slot, in place of the Content tier) **and** the Window tier, so a
   widget whose appearance component sets `config.fontFamily` shows two font controls, each
   labeled by scope. Accepted for the burndown; it disappears as each widget migrates.
5. Board-facing-edge resize handle (D4). Keyboard: Esc closes; the existing `Alt+S` handler in
   `DraggableWindow.tsx` (`if (e.altKey)` → `case 's'` → toggles `flipped`) keeps working
   unchanged.
6. **The drawer root must carry `data-widget-portal=""` and `data-widget-id={widget.id}`**,
   mirroring `SettingsPanel.tsx`. Those attributes are load-bearing: `DashboardView.tsx`
   resolves the topmost widget via `'.widget, [data-widget-portal]'`, and `DraggableWindow.tsx`
   plus `GuidedLearning/ScreenCaptureModal.tsx` use them to tell "Escape from inside our portal"
   from a global Escape; the real consumer of `data-widget-portal` is
   `utils/domHelpers.ts` `isEscapeFromWidgetInput`, used by every dialog and picker that yields
   Escape to widget portals (§3 item 2). `tests/components/common/SettingsPanel.test.tsx` asserts
   `data-widget-portal` only; the drawer tests assert both. (The `DashboardView.tsx` comment
   saying only `SettingsPanel` carries `data-widget-id` is stale: `DraggableWindow` and
   `DraggableSticker` set it too; `Embed`, `NeedDoPutThen` and `MiniApp` only read it. Carry both
   attributes regardless; do not rely on that comment.)
7. Layering (D19): add `drawer: 9980` to `config/zIndex.ts` between `annotationChrome` (9970)
   and `announcementOverlay` (9985). Every modal (`modal` 10000 and up), popover (11000), tool
   menu, tooltip, toast, and dialog already stacks above it, so a Drive picker, library modal,
   or color popover opened from a drawer field needs no change. The drawer's own in-body
   dropdowns use `popover`. Wave 1b.8 adds a unit test asserting
   `Z_INDEX.drawer < Z_INDEX.modal` and `Z_INDEX.drawer < Z_INDEX.popover`.
8. **Side selection** (D2/D3): on open, compute the widget's screen rect **from the live DOM**
   (`getBoundingClientRect()` on the edited `DraggableWindow` root), never from
   `widget.x/y/w/h`, so zoom, `panOffset` and the wrapper transform are already applied. The
   auto-pan delta is converted back through `viewportToWrapper` (`utils/zoomPanMath.ts`) before
   `clampPan`; unit tests cover zoom 0.5, 1 and 2. If the rect fits entirely in
   the band left of a right-docked drawer, dock right; else if it fits in the band right of a
   left-docked drawer, dock left; else dock right and auto-pan. When both sides fit, prefer the
   side opposite a side-anchored Dock (`dockPosition` in `Dock.tsx`), else right (D23). The side
   is chosen once per open and does not flip while the drawer stays open (swapping widgets
   re-evaluates; resizing the drawer does not, D24). The chosen side is announced through a
   visually-hidden live region (`widgetSettings.common.dockedLeft` / `dockedRight`). A
   maximized widget is restored before the drawer opens (D22), so side selection never sees one.
9. **Edited-widget focus ring**: while the drawer is open, the edited widget's `DraggableWindow`
   root carries `data-settings-target` and a 2px `ring-brand-blue-primary` outline, so on a
   projected 4K board the teacher can always find which widget the drawer controls.
10. **Responsive** (D14): below 900px viewport width the same component renders as a bottom sheet
    (full width, 50vh default, drag handle on top, 35–85vh range) and side selection / auto-pan
    are skipped. One component, one prop (`placement: 'right' | 'left' | 'bottom'`) derived from
    `useWindowSize`. Sheet height clamps against `window.visualViewport?.height ?? innerHeight`
    so the software keyboard on a tablet does not push fields off-screen, and on `focusin` the
    sheet scrolls the focused control into view inside its own scroller. Reading
    `visualViewport` is explicitly allowed by §4.9: rule 1 forbids re-flowing the **board**, not
    the drawer. The drawer E2E runs at 1280×800 (side drawer) and at 820×640 (bottom sheet).
    1024×768 is **above** the 900px breakpoint and must not be used to test the sheet.
11. **Accessibility** (D17):
    - Root: `role="dialog"`, `aria-modal="false"`, `aria-labelledby` → the header title id.
      Non-modal is deliberate: the board must stay operable while the drawer is open, so there
      is **no focus trap**.
    - Focus moves to the drawer header on open (`tabIndex={-1}` on the heading). On close, focus
      returns to the element that opened it: `DraggableWindow` passes its gear button ref via
      the host; if that element is gone, focus the widget root.
    - Resize handle: `role="separator"`, `aria-orientation="vertical"`, `aria-valuemin/max/now`
      in px, keyboard-operable with ArrowLeft/ArrowRight (16px steps, Shift = 64px), and a
      visible focus ring. The bottom-sheet handle (§3 item 10) is the same element with
      `aria-orientation="horizontal"`, ArrowUp/ArrowDown, and `aria-valuemin/max/now` in vh.
    - Every field label is a real `<label for>` or `aria-labelledby`; `help` text is linked with
      `aria-describedby`. `SettingsLabel` keeps the `as="span"` + caller-supplied `role="group"`
      pattern for chip groups (`SettingsLabel` itself renders a bare `<span id>`).
    - Open/close transitions respect `prefers-reduced-motion` (fade only, no slide). Under
      `prefers-reduced-motion: reduce` the auto-pan (D3) jumps in one frame instead of
      animating; it is the largest motion in the feature.
    - Resize-handle arrow keys map to the inline start/end axis, not physical left/right, so
      they invert correctly under `dir="rtl"`. Full RTL layout of the drawer is otherwise a
      non-goal (§9).
    - Undo (`undoWidgets` in `DashboardActions`) is not a drawer concern: the drawer is a
      controlled view of `widget.config`, so an undo repaints it; opening or closing the drawer
      is never pushed onto the undo stack.
    - Contrast: drawer surfaces are light; section headings and muted text use `text-slate-700`
      minimum (the prototype's `slate-600` headings passed AA on white but read faint on a
      projected board; `slate-600` remains acceptable only for `help` lines). Tests:
      `tests/components/settings/SettingsDrawer.a11y.test.tsx` runs `axe-core` via `jest-axe`
      (maintained and works under Vitest; add it as a dev dependency in wave 1a) against the
      empty drawer and against every migrated schema (§7 item 7). **Scope of that test**: Vitest
      runs under `jsdom` (`vitest.config.ts`), which has no layout, so axe's `color-contrast`
      rule reports "incomplete", never a violation. The axe test asserts structural rules only
      (accessible names, label association, valid aria attributes, roles). Token contrast is
      enforced by a separate static test asserting the drawer's heading/help/body classes are
      drawn from an allowlist of AA-passing tokens on white (`slate-700`, `slate-600`, …).

**Board behavior**:

- Opening pushes nothing; the drawer overlays the canvas. If side selection (§3 item 8) found
  a side that needs no pan, nothing else happens. Otherwise the canvas auto-pans so the widget's
  screen rect fits inside the free band beside the drawer (D3). If the widget is wider than that band at current zoom, pan to align its left edge and do
  not zoom out (zooming changes what the teacher is previewing). The requested offset must pass
  the existing `clampPan` / `getPanRange` in `utils/zoomPanMath.ts`; at zoom 1 the range is
  ±viewport/2, so a partial pan is the expected outcome for large widgets.
- Closing restores the pre-open `panOffset`. If the teacher panned manually while the drawer was
  open, do not restore (their explicit camera wins). **Detecting a manual pan**: the `board-pan`
  window event fires for every `panOffset` change, including the drawer's own auto-pan, so the
  camera hook sets a `pendingProgrammaticPan` ref before calling `requestPan`, consumes exactly
  one `board-pan` event against it, and treats any other `board-pan` while open as user-owned
  (unit-tested in 1b.9: auto-pan then close restores; auto-pan, wheel-pan, then close does not). A board switch or a `camera-reset` event
  while the drawer is open resets `panOffset` to `{0,0}` (`DashboardView.tsx`); in that case the
  saved camera is discarded, not restored.
- Maximized widgets: restored before open (D22); no special case in the camera hook.
- Dock and Sidebar are covered, not moved (D23). Resizing the drawer never pans (D24).
- `Embed/Widget.tsx` and `MiniApp/Widget.tsx` hide their floating toolbars while `flipped` is
  true. That stays: the widget is live beside the drawer but its hover toolbar is suppressed
  while its settings are open, which matches today's behavior with the flipped card.
- The comment at `DashboardView.tsx` (wheel-pan handler) saying the pan range collapses to
  `[0, 0]` at zoom 1 is stale: `ZOOM_MIN` is 0.5, so the range at zoom 1 is ±viewport/2 as
  stated above. 1b.2 fixes the comment.
- Drag or resize of the widget still closes the drawer: `DraggableWindow.tsx` sets
  `flipped: false` unconditionally on drag start and resize start. The host must not fight this;
  the drawer closes and does not restore the camera in that case.
- Read-only boards and teacher-locked widgets. The asymmetry in `DraggableWindow.tsx` is:
  **per-widget-locked** widgets (`isLocked` from `widget.isLocked`) cannot open settings but can
  close an already-open panel; a **read-only board** (`isActiveBoardReadOnly`) blocks both,
  because `updateWidget` returns early there (`else if (widget.flipped && !isActiveBoardReadOnly)`
  at both Escape sites). Preserve exactly that. Consequence: a shared board loaded read-only
  with a stored `flipped: true` widget would open a drawer nobody can write from. The host
  therefore renders the drawer on a read-only board with every field `disabled`, a banner
  (`widgetSettings.common.readOnly`), and a working Close that only clears the host's local
  `activeWidgetId` (no `updateWidget` call), so the teacher is never stuck.
- **Multi-tab and multi-device**: `flipped` is board state synced by `onSnapshot`, so a teacher
  opening settings on a laptop also flips the widget in a projector-attached tab of the same
  board. Today that flips a card in place; under this plan it would open a full-height drawer
  and pan the projected camera. The drawer's **visual side effects are local**: `flipped` stays
  the synced open/close signal, but auto-pan, camera restore, focus movement and the live-region
  announcement run **only in the tab that originated the open**. The host records
  `openedLocallyRef` from the gear / Alt+S handler in that tab; a `flipped: true` that arrives
  from a snapshot renders the drawer without touching camera or focus. Unit test (1b.9):
  applying a remote `flipped: true` never calls `requestPan`.
- **Close paths**: widget removal (`activeWidgetId` no longer in `activeDashboard.widgets`),
  board switch, and entering read-only each close the drawer via the `activeWidgetId` rule in
  Selection below; camera restore is skipped on board switch (`panOffset` is already reset).

**Selection**: `widget.flipped === true` remains the single source of truth for "settings open".
Today nothing unflips a sibling when another widget flips (every toggle is
`updateWidget(id, { flipped: !flipped })`; bulk unflips exist only on board switch and on the
minimize-all / restore-all paths in `DashboardContext.tsx`), so **stored boards can contain
several `flipped: true` widgets**, and a snapshot of booleans cannot tell "newly flipped" from
"was already flipped". The host therefore keeps **`activeWidgetId` in local state**, set by the
open action, not derived from `flipped` alone:

- On mount and on board switch it initializes from `normalizeFlipped(widgets)`'s winner (the
  highest-`z` flipped widget, else the first in array).
- When a widget's `flipped` transitions false → true and it is not `activeWidgetId`, the host
  sets `activeWidgetId` to it and writes `flipped: false` to the previous widget **in the same
  `updateWidgets` batch**, so two writes never race the snapshot.
- Swap, board switch, widget deletion and entering read-only each clear `activeWidgetId` and
  close the drawer; each transition gets a unit test in 1b.9.
- The one-time board-level normalization `normalizeFlipped(widgets)` (§4.4) clears `flipped` on
  all but one widget on every load path. It is board-level because `migrateWidget` is a
  per-widget mapper (`widgets.map(migrateWidget)`) and cannot see siblings.

This is a simplification, not a loss (D21).

## 4. Architecture

### 4.1 Files (new)

```
components/settings/
├── SettingsDrawer.tsx            # portal host: chrome, tabs, resize handle, Style tab
├── SettingsDrawerHost.tsx        # mounted once in DashboardView; finds the flipped widget
├── useSettingsDrawerPlacement.ts # side selection + bottom-sheet breakpoint (§3 items 8, 10)
├── useSettingsDrawerCamera.ts    # auto-pan / restore logic against panOffset + zoom
├── useSettingsDrawerFocus.ts     # focus move on open, focus return on close (§3 item 11)
├── schema/
│   ├── types.ts                  # FieldSchema, GroupSchema, WidgetSettingsSchema
│   ├── defineSettings.ts         # typed helper: defineSettings<Config>({...})
│   ├── validateSchema.ts         # dev-time + test assertions (see 4.2 rules)
│   └── styleKeys.ts              # UNIVERSAL_STYLE_FIELDS keyed by APPEARANCE_CONFIG_KEYS
├── renderer/
│   ├── SchemaRenderer.tsx        # groups → sections → fields
│   ├── FieldRenderer.tsx         # switch on field.type
│   └── fields/                   # one file per field type (see 4.3)
└── legacy/
    └── LegacySettingsSlot.tsx    # wraps WIDGET_SETTINGS_COMPONENTS[type] until migrated; deleted in wave 10
```

Also new: `scripts/new-widget-settings.ts` (run as `pnpm run new-widget-settings <type>`)
scaffolds `settings.schema.ts`, the `widgetSettings.<type>.*` keys in `locales/en.json`, the
schema test, and the migration fixture, so a new widget never starts from a
copied 400-line file. The `new-widget` skill invokes it.

Per widget: `components/widgets/<Widget>/settings.schema.ts` exporting a
`WidgetSettingsSchema<Config>`. Registered in `WidgetRegistry.ts` as
`WIDGET_SETTINGS_SCHEMAS: Partial<Record<WidgetType, () => Promise<WidgetSettingsSchema>>>`.
A schema is a module, not a component, so **`React.lazy` does not apply**: the host keeps a
memoized `import()` map and the drawer body renders a skeleton until the promise resolves.
`WidgetRenderer.tsx` already wraps legacy settings in `Suspense`; the legacy slot reuses that.

### 4.2 Schema model

```ts
type FieldBase<K> = {
  key: K; // top-level config key; nested keys via 'a.b' are NOT allowed
  label: string; // i18n key, resolved by renderer
  help?: string; // i18n key; rendered as muted line under the control
  visibleWhen?: (ctx: FieldCtx) => boolean; // pure and cheap: runs on every drawer render
  disabledWhen?: (ctx: FieldCtx) => boolean;
};

type Field =
  | Toggle
  | Text
  | Textarea
  | Number
  | Select
  | Segmented
  | Slider // basics
  | Color
  | FontFamily
  | TextSizePreset
  | AccentColor
  | SurfaceColor // color + typography
  | List<Row> // sortable rows, per-row sub-schema
  | IconPicker
  | EmojiPicker
  | ImageUpload
  | SoundPicker
  | RosterPicker // pickers
  | Custom; // { render: (ctx: FieldCtx & { updateConfig }) => ReactNode }

// FieldCtx = { config, widget, isAdmin, canAccessFeature, t }. Existing panels gate on
// isAdmin, feature flags, roster presence and WidgetData fields (maximized, isLocked); a
// config-only predicate would push all of those into Custom fields.

type Group = {
  id: 'content' | 'behavior' | 'display';
  title?: string;
  fields: Field[];
};

type WidgetSettingsSchema<C> = {
  groups: Group[];
  styleKeys?: ReadonlyArray<AppearanceKey>; // Content-tier Style fields this widget consumes (D18)
  configVersion?: number; // bumps when keys are renamed; pairs with WIDGET_CONFIG_MIGRATIONS
};
```

Rules:

- **Every field key must exist in the widget's `*Config` type in `types.ts`** (compile-time via
  `defineSettings<Config>`). `WIDGET_DEFAULTS[type].config` coverage is a **separate,
  warn-level** check, because defaults and settings already disagree today: `schedule` defaults
  hold only `items/cardColor/cardOpacity` while its Settings writes `autoProgress`,
  `autoScroll`, `expandActiveItem`, `schedules`, and more; `weather` defaults lack `fontColor`,
  `hideClothing`, `secondaryColor`; `time-tool` defaults lack `glow` even though
  `utils/migration.ts` seeds it. Wave 1a includes an explicit, reviewed backfill of missing
  default keys for the ten target widgets. It is not free: it changes new-widget initial state
  **and** the defaults layer `mergeWidgetConfig` applies on every add, paste and import. For
  each backfilled key the value must equal the front face's existing inline fallback
  (`config.x ?? literal`), the pair is recorded in the PR, and a test asserts
  `WIDGET_DEFAULTS[type].config[key]` equals that fallback, or the drawer and the front face
  would disagree on boards that omit the key.
- `Custom` fields are allowed only with a `// schema-gap:` one-line comment naming the field type
  that would replace it. The gap list is reported in the PR description of each migration wave.
  `Custom.render` receives `ctx` plus a **mount-stable** `updateConfig`; `FieldRenderer` wraps
  every `Custom` field in `React.memo` keyed on `[widget.id, field.key]`, and `render` must not
  close over per-render values, or the drawer allocates a new element tree per keystroke.
- `List<Row>` row fields address **row-object properties**, resolved relative to the row, not
  config paths. The `'a.b'` prohibition applies to the top-level `key` only. Row properties can
  never be added to `APPEARANCE_CONFIG_KEYS`, which matches top-level keys only (CLAUDE.md).
- Renderer writes via `updateWidget(widget.id, { config: { ...widget.config, [key]: value } })`.
  No field may write outside `config` except the **Window tier** of the Style tab (D18), which
  targets exactly four `WidgetData` fields: `backgroundColor`, `transparency`, `fontFamily`,
  `baseTextSize`. That tier is rendered by `schema/windowStyle.tsx` for every widget and is not
  part of any schema. It composes `UniversalStyleSettings` (which itself renders `WidgetBackgroundSettings`) plus
  the transparency slider only; nothing else in the drawer renders a background picker (§3 item
  4). `WidgetBackgroundSettings` is **not** deleted; `UniversalStyleSettings` depends on it. The Content tier (`styleKeys`) writes `config` only. A widget that consumes
  `config.fontFamily` still shows the window font control; the two are different scopes (whole
  frame vs. widget content) and both are labeled as such.
- `label` / `help` are **bare leaf keys**. The renderer resolves
  `widgetSettings.<widgetType>.<label>` first and falls back to `widgetSettings.common.<label>`;
  `validateSchema` fails when neither exists in `locales/en.json`. The find-a-setting filter (§3
  item 2) indexes the **resolved** string. Per D20, only `en.json` is written in this series;
  the other locales fall back to English.
- Board isolation is unchanged: schema keys are per-board by default. `styleKeys` may reference
  only members of `APPEARANCE_CONFIG_KEYS` in `utils/widgetConfigPersistence.ts`. Promoting a
  widget knob to a universal key (D7) means adding it to that allowlist **in the same commit**,
  and only if it is purely visual (CLAUDE.md rule).

### 4.3 Field components

Reuse, don't rebuild, where a shared component exists:

| Field                                | Backed by                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FontFamily, Color(font)              | `components/common/TypographySettings.tsx`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| TextSizePreset                       | `components/common/TextSizePresetSettings.tsx`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| SurfaceColor                         | `components/common/SurfaceColorSettings.tsx`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| AccentColor                          | `components/common/AccentColorSettings.tsx`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Color (generic)                      | `components/common/ColorPresetPicker.tsx` (today reached only through the `SurfaceColor`/`AccentColor`/`Typography` wrappers; no settings file imports it directly)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| List                                 | `components/common/SortableList.tsx`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ImageUpload                          | `components/common/DriveImagePicker.tsx` + `hooks/useStorage.ts` (mind §3 item 7 on z-index)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| RosterPicker                         | `components/common/AssignClassPicker.tsx` / `RosterModeControl.tsx`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Labels/sections                      | `components/common/SettingsLabel.tsx`, retained as the section-heading primitive. Wave 1a adds a `tone?: 'default' \| 'drawer'` prop; `'drawer'` renders `text-slate-700`, `'default'` keeps `text-slate-400`. The drawer chrome and `FieldRenderer` pass `tone="drawer"`; legacy panels inside the legacy slot inherit it through a `SettingsLabelToneContext` provided by the drawer body. **The default is not changed**: `SettingsLabel` is imported by 61 files, including admin config panels and at least five slate-800/900 modals (MiniApp editor and save modals, sticker / PDF / mini-app library modals) where `slate-700` would fail contrast. |
| IconPicker, EmojiPicker, SoundPicker | New; extracted from the first migrated widget that needs each (`TimeTool` for sounds, `Checklist`/`Stations` for icons).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |

Every field renders the same anatomy: label row (label + optional reset-to-default), control,
optional help line, with the `<label for>` / `aria-describedby` wiring from §3 item 11 built into
`FieldRenderer` so no field author can omit it. **Layout has two shapes**, chosen by
`FieldRenderer` from the field type, never by the field author:

- **Inline** (`Toggle` only): label and help stacked on the left, the switch right-aligned on
  the label's baseline, so a run of toggles reads as a scannable list. This is the layout the
  product owner approved in the prototype (§13).
- **Stacked** (every other type): label row, then the control at full drawer width, then help.

Text sizes: `text-xs` semibold `text-slate-700` field labels, `text-xxs` `text-slate-600` help
lines, `text-xxs` uppercase `text-slate-700` section headings via `SettingsLabel`. Rows within a
group are separated by `divide-slate-100`; groups by vertical space, not rules. Settings panels
are not front-face content, so Tailwind sizes are fine here.

### 4.4 Config migration

- **`migrateWidget` (`utils/migration.ts`) runs on exactly two paths today**: the server-board
  normalizer in `hooks/useFirestore.ts` and the snapshot path in `context/DashboardContext.tsx`.
  It does **not** run for shared boards (`mapSharedDocToDashboard` casts straight to
  `Dashboard`), Drive import (`utils/googleDriveService.ts`, consumed in
  `context/DashboardContext.tsx`), `hooks/useStarterPacks.ts`, or the `savedWidgetConfigs`
  merge in `utils/widgetConfigPersistence.ts` (`mergeWidgetConfig`). `hooks/useTemplateStore.ts`
  is **not** a target: it is the in-memory mock template store for auth-bypass and touches no
  widgets; wave 0.2 locates the production template read path and adds it here. Wave 1b routes
  all of those through `migrateWidget` and adds `migrateSavedWidgetConfigs` for renamed
  appearance keys. `mergeWidgetConfig` has no `WidgetData`, so it cannot stamp `configVersion`;
  saved-config merges yield `configVersion: undefined` and rely on `migrateWidget` at add time.
  Without this, a renamed key resurfaces from any of those paths.
- **Characterization first, reroute second.** Before wave 1b.6 touches a load path, it captures
  a fixture board through that path (`tests/fixtures/boards/{shared,starterPack,drive,savedConfigs}.json`, plus `template.json` once 0.2 finds the path)
  and a test asserting today's output shape. Rerouting through `migrateWidget` must leave every
  fixture byte-identical except for the added `configVersion`, cleared `flipped` flags, and the
  rewrites `migrateWidget` already performs on legacy shapes (e.g. `timer` → `time-tool`, per
  the comment in `hooks/useFirestore.ts`); the fixture test lists those expected deltas
  explicitly so any other change fails.
  `migrateWidget` is idempotent (running twice equals running once) and that is tested.
- Version stamp lives on **`WidgetData`**, not inside `config`: add
  `configVersion?: number` next to `transparency` in `types.ts`. Putting `__v` inside `config`
  would require widening every typed `*Config` interface and would leak through
  `mergeWidgetConfig` as a per-board key.
- Per-type table `WIDGET_CONFIG_MIGRATIONS: Partial<Record<WidgetType, Array<(config) => config>>>`,
  indexed by version; `migrateWidget` runs the steps from `widget.configVersion ?? 0` up to the
  schema's `configVersion`.
- Key renames (D11) copy old → new and delete old. Tests assert old-shape fixtures normalize to
  the new shape with no data loss.
- **Renaming any member of `APPEARANCE_CONFIG_KEYS` is discouraged.** The allowlist is a
  `Set<string>` of literal names; a rename without updating the Set and migrating
  `savedWidgetConfigs` silently drops a teacher's saved appearance defaults. If a rename is
  unavoidable, all three (Set, config migration, saved-config migration) land in one commit.
- Add the one-time `flipped` normalization from §3 as `normalizeFlipped(widgets: WidgetData[])`
  in `utils/migration.ts`, applied **after** `widgets.map(migrateWidget)` at both existing call
  sites (`hooks/useFirestore.ts`, `context/DashboardContext.tsx`) and at every path wave 1b
  reroutes. It clears `flipped` on all but the highest-`z` flipped widget; it is not part of
  `migrateWidget`, which sees one widget at a time.

### 4.5 Feature flag

- Add `'settings-drawer'` to `GlobalFeature` in `types.ts`. In `config/featureDefaults.ts` the
  entry shape is `{ defaultAccessLevel, defaultEnabled, missingDocPublic }`; use
  `{ defaultAccessLevel: 'admin', defaultEnabled: true, missingDocPublic: false }`.
  **`missingDocPublic: false` is mandatory**: `canAccessFeature` in `context/AuthContext.tsx`
  returns true for a missing Firestore doc when it is `true`, which would ship the unfinished
  drawer to every teacher. **But note the order of checks** (`context/AuthContext.tsx`,
  `canAccessFeature`): on the missing-doc path `if (!def.missingDocPublic) return false;` runs
  **before** `if (isAdmin) return true;`, so with these defaults and no
  `global_permissions/settings-drawer` doc the drawer is off for **everyone, admins included**.
  `defaultAccessLevel` is consumed only by the admin UI, never by the runtime gate. Wave 1b.4
  therefore also ships `scripts/init-settings-drawer-flag.js` (modeled on the existing
  global-permissions init scripts) that writes the doc with `accessLevel: 'admin'`, and the
  wave-1b exit criterion is "doc written to the dev project; an admin sees the drawer in the dev
  preview", not "default is admin". Wave 4.1 flips **both** `defaultAccessLevel: 'public'`
  **and** `missingDocPublic: true`. The `FeatureDefault` shape also has an optional
  `defaultMinTier`; the drawer deliberately omits it (no tier floor). Add a
  `config/featureDefaults.test.ts` case mirroring the `anonymous-join` one and asserting the
  wave-4 pair.
- `GLOBAL_FEATURES` in `components/admin/GlobalPermissionsManager.tsx` needs a full
  `{ id, label, icon, description }` entry, not just a label.
- **Auth bypass forces the flag on**: `canAccessFeature` returns `true` unconditionally under
  `isAuthBypass`, and `playwright.config.ts` sets `VITE_AUTH_BYPASS=true` for every E2E run. So
  from wave 1b the drawer would be the only settings surface E2E sees. Wave 1b.4 therefore adds
  `VITE_AUTH_BYPASS_FEATURE_OVERRIDES` (JSON, e.g. `{"settings-drawer":false}`), read by
  `canAccessFeature` **only** under `isAuthBypass`. **It cannot vary per Playwright project**:
  `playwright.config.ts` has one `webServer` whose `env` carries `VITE_AUTH_BYPASS`, and Vite
  inlines `import.meta.env.VITE_*` into the single bundle that server serves, so every project
  sees one value. The override is therefore a **runtime** switch: under `isAuthBypass`,
  `canAccessFeature` also consults `localStorage['authBypassFeatureOverrides']` (JSON), which a
  `legacy-settings` Playwright project sets via `storageState` / an `addInitScript` before
  running `tests/e2e/settings-legacy.spec.ts` plus the QR spec. Both surfaces stay E2E-reachable
  until wave 4 deletes the floating panel. Update
  `tests/e2e/nexus_qr_text.spec.ts` (settings button → `data-testid="settings-drawer-close"`, §3 item 1) in wave 1b.
- `WidgetRenderer.tsx`: if the flag is on, pass no settings to `DraggableWindow` and let
  `SettingsDrawerHost` handle it; else keep today's path. `settings` is a **required** prop on
  `DraggableWindow` (`settings: React.ReactNode`), so wave 1b makes it optional; full prop
  removal stays in wave 4. **Making `settings` optional is not enough**: `DraggableWindow.tsx`
  mounts `SettingsPanel` whenever `widget.flipped && isBoardActive`, regardless of the prop, so
  with the flag on it would render an empty floating panel beside the drawer. 1b.5 gates that
  mount on a new `useSettingsDrawer` prop (or the flag read via `canAccessFeature`) so exactly
  one surface renders. The same block's `onClose` sets `justClosedSettingsRef`, which the
  Escape priority chain in `handleCustomKeyboard` reads. That ref is render-scoped inside
  `DraggableWindow` and is reset unconditionally in its render body, so a host mounted in
  `DashboardView` cannot set it, and the `updateWidget(flipped: false)` the host issues
  re-renders the window and clears it anyway. 1b.5 moves the signal out: a module-level
  `settingsJustClosedAt` timestamp in `components/settings/settingsCloseSignal.ts`, written by
  both close paths, read by `handleCustomKeyboard` with a one-tick freshness window.
  `DraggableWindow` switches to the shared signal in 1b.5; 1b.9 tests Escape-after-close from
  both surfaces.
- Final wave sets the default to `public` for one release, then removes the flag and the old
  panel.

### 4.6 Drawer width persistence

`AppSettings` is the **tenant-wide admin document** (`admin_settings/app_settings`;
`updateAppSettings` in `context/AuthContext.tsx` early-returns unless `isAdmin`), so it cannot
hold a per-user width: a teacher's resize would silently no-op and an admin's would set it for
the whole tenant. Instead add `settingsDrawerWidth?: number` to the user profile document at
`/users/{uid}/userProfile/profile`, next to the other per-user preferences `AuthContext`
already reads and writes there, exposed as `updateUserPreference('settingsDrawerWidth', n)`
(debounced on resize end). Falls back to 400. Under `isAuthBypass` it stays in memory.

### 4.7 Custom Widget Builder (D13)

`CustomWidgetSettingDef` (`types.ts`) has `type: 'string' | 'number' | 'boolean' | 'select'`,
`defaultValue: string | number | boolean`, and `options?: string[]` for select. These map 1:1 to
`Text | Number | Toggle | Select`; the select adapter reads `options`. Add
`customDefsToSchema(defs)` and route `components/widgets/CustomWidget/Settings.tsx` through the
renderer. `SettingsDefEditor.tsx` in the admin builder exposes the full v1 field kit in wave 3.6.
Widening `CustomWidgetSettingDef.type` changes the shape of stored `/custom_widgets/{id}` docs,
so 3.6 also adds `migrateCustomWidgetDefs` in `context/CustomWidgetsContext.tsx` (read path):
the four legacy literals stay valid and unknown types render as a `Custom` schema-gap field
rather than crashing. Fixture test: a pre-3.6 doc loads and renders unchanged.

### 4.8 Auto-pan mechanics (D3)

`panOffset` is `React.useState` local to `DashboardView.tsx` (deliberately outside context to
avoid re-render cascades). It is clamped on every render via `getPanRange`, reset to `{0,0}` on
board switch and on the `camera-reset` event, and the existing `board-pan` window event is
**outbound only** (a notification that pan changed). There is no inbound setter today. Wave 1b
adds one **without a global event**. `DashboardCanvasStore` itself exposes only
`getState/subscribe/setStateFromRender/notify`; actions live on `DashboardActionsContext`,
typed as a `Pick` of `DashboardContextValue`, so adding `registerPanSetter` / `requestPan`
there means editing `context/DashboardContextValue.ts` and `context/DashboardContext.tsx` as
well (both orchestrator-owned in 1b.2). Alternatively use a standalone module-level registry
(`components/settings/panSetterRegistry.ts`) and touch neither; the orchestrator picks one and
records it in the 1b PR. `DashboardView`
registers `(xy) => setPanOffset(clampPan(xy))` on mount and unregisters on unmount. The camera
hook calls `store.requestPan({ x, y })`, which is a no-op when nothing is registered (fallback
hosts, tests). `panOffset` itself stays local state in `DashboardView`; only the setter is
exposed. Do not lift `panOffset` into context and do not add a window event.

The host reads the flipped widget through `useDashboardCanvasSelector` / the canvas store in
`context/dashboardCanvasStore.ts`, never the full `useDashboard()` value, per the CLAUDE.md
hot-path rule. **The slice is not narrow by itself**: `DashboardCanvasState.activeDashboard` is
replaced on every widget `x/y/config` change, so a naive subscription re-renders the entire
drawer, including a 938-line legacy `Schedule/Settings.tsx` through the slot, on every drag
frame of an unrelated widget. The selector doc comment also forbids allocating selectors. The
host therefore selects `s.activeDashboard?.widgets.find((w) => w.id === activeWidgetId)`
(returns an existing object, allocates nothing), wraps `SettingsDrawer` in `React.memo`, and
memoizes the legacy-slot element on `[widget.id, widget.config]`. 1b.9 adds a render-count
test: dragging a non-edited widget produces zero `SettingsDrawer` renders.

### 4.9 Invariant: the drawer must never move widgets

Two mechanisms reposition widgets on a `window` `resize` event, and both read
`window.innerWidth` / `window.innerHeight` directly:

- `context/DashboardContext.tsx`: proportional re-hydration recomputes every widget's pixel
  `x/y/w/h` from its stored `xProp/yProp/wProp/hProp` against the new viewport.
- `components/layout/DashboardView.tsx`: `rescueWidgets` clamps any widget outside the world
  rectangle (`clampWidgetToWorld`) and **persists** the new position via `updateWidget`.

Docking the browser devtools shrinks the window, so both fire and widgets on the right edge get
pushed inward. That is the known symptom to avoid. The drawer therefore obeys these rules:

1. **Overlay only.** The drawer is a `position: fixed` portal on `document.body`. It must not
   shrink, pad, or re-flow the board container, and must not change `window.innerWidth`.
2. **Never dispatch `resize`.** No synthetic `window.dispatchEvent(new Event('resize'))`, and no
   code path in the drawer, host, or camera hook may call `updateWidget` with `x`, `y`, `w`, or
   `h`. Auto-pan moves the camera (`panOffset`) only.
3. **No viewport substitution.** Do not introduce an "effective viewport" that subtracts the
   drawer width and feed it to re-hydration or rescue. The drawer covering part of the board is
   the accepted trade-off; the camera pan (D3) is how the widget is brought into view.
4. **Resizing the drawer** (D4) changes only the drawer's own width. It is not a viewport
   change and it does not pan (D24).

Required test (wave 1b.9): a unit test that opens the drawer, resizes it across the full
360–560px range, closes it, and asserts that no widget's `x/y/w/h` or proportional fields changed
and that `updateWidget` was never called with positional keys. The drawer E2E also asserts widget
bounding rects are identical before open and after close.

## 5. Waves

Each wave is one PR. Items within a wave are file-disjoint unless marked **orchestrator-owned**,
which means only the orchestrator edits that file after agents finish: `types.ts`,
`components/widgets/WidgetRegistry.ts`, `locales/*.json`, `components/layout/DashboardView.tsx`,
`context/DashboardContext.tsx`, `context/DashboardContextValue.ts`,
`scripts/test-count-baseline.json`, `tests/components/settings/legacySnapshots.test.tsx`,
`tests/components/widgets/legacyRegistryFreeze.test.ts`, and
`docs/plans/widget-settings-inventory.md`. Snapshot retirement, freeze-list shrink, burndown
rows and the test-count baseline are applied **once per wave by the orchestrator** after agents
finish; agents report their widget name only. Any wave that deletes tests or retires snapshots
updates `scripts/test-count-baseline.json` in the orchestrator's commit, or `pnpm run
test:counts` (inside `validate`, D15) fails the wave.
The orchestrator runs `pnpm run validate` on the whole tree after each wave, fixes anything red,
commits, pushes, opens a draft PR, and only then starts the next wave.

### Wave 0 — Discovery (no code)

- **0.1** Query Admin Analytics for widget adds in the last 90 days. Write the ranked top 10
  into §6 and commit. If analytics is empty, keep the provisional list and say so.
- **0.2** Inventory every settings component for: config keys written, controls used, `t()` vs
  hardcoded labels, duplicate-of-Style controls, keys missing from `WIDGET_DEFAULTS`. Output
  `docs/plans/widget-settings-inventory.md` (table: widget · key · control · group guess ·
  keep/remove/rename · in-defaults?). Input for every migration item and for wave 1a's backfill.
- **0.3** String count (D20): from the 0.2 inventory, count label/help strings per widget and
  write the totals into §6 (column "Strings"). This sizes the deferred translation follow-up;
  it does not gate any wave in this series.
- **0.4** Legacy render snapshots: a Vitest snapshot of every `WIDGET_SETTINGS_COMPONENTS` and
  `WIDGET_APPEARANCE_COMPONENTS` entry rendered with `WIDGET_DEFAULTS` config
  (`tests/components/settings/legacySnapshots.test.tsx`), rendered through one shared
  `renderLegacySettings(type)` harness that mounts the mocked `Dashboard` / `Auth` /
  `CustomWidgets` / `SavedWidgets` providers the panels need (the harness is the real cost of
  0.4; budget it as its own item). Only the slot content is snapshotted, never the panel or
  drawer chrome. Wave 1b's `LegacySettingsSlot` must reproduce these byte-for-byte; a migrated
  widget's schema test retires its snapshot.

### Wave 1a — Schema + field kit (pure additions)

Sequencing: **1a.1 lands first** (types + validator); every other item imports it. **1a.5 lands
second** with `FieldRenderer` built on a registry, `FIELD_COMPONENTS: Record<Field['type'],
FC<FieldProps>>`, populated from an explicit `fields/index.ts`, so field modules add one file
and one index line and never import each other or `FieldRenderer`. `List` receives `renderRow`
as a prop instead of importing `FieldRenderer`. Only then do 1a.2–1a.4 and 1a.6–1a.8 run in
parallel.

| Item                                | Files                                                                                                   | Deliverable                                                                                                                                                        |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1a.1 Schema types + validator       | `components/settings/schema/*`                                                                          | §4.2 types, `defineSettings`, `validateSchema` + a test that iterates `WIDGET_SETTINGS_SCHEMAS`.                                                                   |
| 1a.2 Field kit: basics              | `components/settings/renderer/fields/{Toggle,Text,Textarea,Number,Select,Segmented,Slider}.tsx` + tests | Shared anatomy per §4.3.                                                                                                                                           |
| 1a.3 Field kit: color + typography  | `.../fields/{Color,FontFamily,TextSizePreset,AccentColor,SurfaceColor}.tsx`                             | Thin wrappers over existing shared components.                                                                                                                     |
| 1a.4 Field kit: List + Custom       | `.../fields/{List,Custom}.tsx`                                                                          | `List` over `SortableList` with a per-row sub-schema rendered by `FieldRenderer`.                                                                                  |
| 1a.5 SchemaRenderer + FieldRenderer | `components/settings/renderer/{SchemaRenderer,FieldRenderer}.tsx`                                       | Groups in D8 order; `visibleWhen`/`disabledWhen`; i18n resolution. Also label/description wiring per §4.3.                                                         |
| 1a.6 Defaults backfill              | `config/widgetDefaults.ts` (orchestrator-owned), tests                                                  | Add the missing default keys for the ten §6 widgets per the 0.2 inventory. Waves 5–9 backfill their own widgets the same way, so done bar item 1 holds for all 59. |
| 1a.7 a11y tooling + scaffold        | `package.json` (`jest-axe`), `scripts/new-widget-settings.ts`, `.claude/skills/new-widget`              | §3 item 11 test harness; §4.1 scaffold; the skill calls the scaffold.                                                                                              |
| 1a.8 `SettingsLabel` tone           | `components/common/SettingsLabel.tsx` + test                                                            | `tone` prop and `SettingsLabelToneContext` per §4.3; default rendering unchanged (snapshot test).                                                                  |

Exit: nothing user-visible; validate green.

### Wave 1b — Drawer, host, flag, camera (behind flag, no widget migrated)

| Item                           | Files                                                                                                                                                                                                                                                                                 | Deliverable                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1b.1 Drawer chrome + Style tab | `components/settings/SettingsDrawer.tsx`                                                                                                                                                                                                                                              | Header/filter/tabs/body/resize; `data-widget-portal` + `data-widget-id` on root; ports help, building toggle, transparency from `SettingsPanel.tsx`; Style tab from `schema/styleKeys.ts` with the single-background Window tier (§3 item 4); find-a-setting filter per §3 item 2 with a unit test (matches across tabs, hides tab bar, restores tab, legacy not-indexed note).                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 1b.2 Placement, camera, focus  | `components/settings/useSettingsDrawerPlacement.ts`, `useSettingsDrawerCamera.ts`, `useSettingsDrawerFocus.ts`, `context/dashboardCanvasStore.ts` (`registerPanSetter`) or `components/settings/panSetterRegistry.ts`, `DashboardView.tsx` (orchestrator-owned: registers the setter) | §3 items 7–11, §4.8; D22–D24; fix **both** stale pan-range comments in `DashboardView.tsx` (wheel handler and render-time re-clamp).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 1b.3 Host + legacy slot        | `components/settings/SettingsDrawerHost.tsx`, `components/settings/legacy/LegacySettingsSlot.tsx`                                                                                                                                                                                     | Narrow canvas-store subscription; flipped tie-break per §3; memoized schema `import()` map.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 1b.4 Flag + legacy E2E project | `types.ts` (orchestrator-owned), `config/featureDefaults.ts` + test, `components/admin/GlobalPermissionsManager.tsx`, `context/AuthContext.tsx` (bypass overrides), `playwright.config.ts`, `scripts/init-settings-drawer-flag.js`                                                    | §4.5, including the runtime `authBypassFeatureOverrides` switch, the `legacy-settings` project, and the flag-doc init script.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 1b.5 Renderer/window wiring    | `components/widgets/WidgetRenderer.tsx`, `components/common/DraggableWindow.tsx` (`settings` optional)                                                                                                                                                                                | Flag branch; drawer host receives the widget.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 1b.6 Migration plumbing        | `utils/migration.ts`, `hooks/useFirestore.ts`, `hooks/useStarterPacks.ts`, `utils/googleDriveService.ts`, `utils/widgetConfigPersistence.ts`, `context/DashboardContext.tsx` (orchestrator-owned)                                                                                     | `configVersion` on `WidgetData`, `WIDGET_CONFIG_MIGRATIONS`, all load paths per §4.4, `flipped` normalization.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 1b.7 Width persistence         | `types.ts` (orchestrator-owned), `context/AuthContext.tsx` user-profile write path (not `updateAppSettings`)                                                                                                                                                                          | §4.6.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 1b.8 z-index                   | `config/zIndex.ts`, `tailwind.config.js`                                                                                                                                                                                                                                              | Add `drawer: 9980` per D19 plus the ordering test.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 1b.9 Tests                     | `tests/components/settings/*`, `tests/e2e/settings-drawer.spec.ts`, `tests/e2e/nexus_qr_text.spec.ts`                                                                                                                                                                                 | Port the nine `SettingsPanel.test.tsx` behaviours (portal attrs, click-outside after `onClose` identity change, dialog-click exclusion, `board-pan` re-measure, Escape-in-field, Escape propagation) to drawer tests; drawer E2E; fix the QR spec; the no-widget-movement test from §4.9. Plus: side-selection unit tests (fits-right, fits-left, needs-pan, dock-side tie-break, maximized-restores-first); a test that resizing the drawer never calls `requestPan` (D24); a test that with the flag on `SettingsPanel` does not mount and `settingsJustClosedAt` is written on drawer close (§4.5); `activeWidgetId` transition tests and the remote-`flipped`-never-pans test (§3); the render-count test (§4.8); read-only drawer renders disabled with a working Close; bottom-sheet E2E at 820×640; focus-return test; axe test on the empty drawer. |

Exit: `global_permissions/settings-drawer` doc written to the dev project by the init script and
an admin sees the drawer in the dev preview (on in the default E2E project, off in
`legacy-settings`), every widget
opens in the drawer showing its legacy panel inside the new chrome with the 0.4 snapshots still
passing, Style tab two-tier, validate green.

### Wave 2 — Pickers + migration batch A (top 1–5)

| Item                                                                       | Files                                                                                                                                                                                                                                                                                                                       |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2.1 IconPicker, EmojiPicker, SoundPicker, ImageUpload, RosterPicker fields | `components/settings/renderer/fields/*` (+ extraction from the widget that owns the current implementation). **Must land before any 2.x widget that needs them**; the orchestrator sequences 2.1 first, then the five widgets in parallel.                                                                                  |
| 2.2–2.6 Migrate widgets #1–#5                                              | `components/widgets/<W>/settings.schema.ts`; delete the widget's legacy settings file (**not always `Settings.tsx`**: e.g. `random/RandomSettings.tsx`; read `WIDGET_SETTINGS_COMPONENTS` for the real path) and its appearance export; registry entries and locale keys (orchestrator-owned); migration step; tests per §7 |
| 2.7 English keys for #1–#5                                                 | `locales/en.json` (orchestrator-owned). `de`/`es`/`fr` untouched per D20.                                                                                                                                                                                                                                                   |

Each migration item is one agent, one widget. The agent owns only that widget's folder and its
migration step; it hands registry lines and locale entries to the orchestrator as a patch.

### Wave 3 — Migration batch B (top 6–10) + Custom Widget Builder

- 3.1–3.5 Migrate widgets #6–#10 (same shape as wave 2).
- 3.6 `customDefsToSchema` adapter and `CustomWidget/Settings.tsx` through the renderer (D13),
  **and** `SettingsDefEditor.tsx` in the admin builder exposes the full v1 field kit (§8 item 1
  is resolved as "full kit now"; the four legacy def types stay readable).
- 3.7 Field-kit gap review: every `Custom` field left in migrated schemas gets a decision:
  promote to a real field type now, or record in §8.
- 3.8 English keys for #6–#10 (same shape as 2.7).

### Wave 4 — Flip default and delete the floating panel

- 4.1 `settings-drawer` defaults → `defaultAccessLevel: 'public'` **and** `missingDocPublic: true` (§4.5); update the existing Firestore doc to `public` as well.
- 4.2 Delete `components/common/SettingsPanel.tsx`, `SettingsPanel.help.test.tsx`,
  `tests/components/common/SettingsPanel.test.tsx`, the `settings` / `appearanceSettings` props
  on `DraggableWindow` (and the ~10 `DraggableWindow.test.tsx` cases that pass them), the
  `legacy-settings` Playwright project, and the bypass override env. Unmigrated widgets keep
  `WIDGET_SETTINGS_COMPONENTS` / `WIDGET_APPEARANCE_COMPONENTS` rendered via
  `LegacySettingsSlot` until their wave below.
  **Update `scripts/test-count-baseline.json`**: `pnpm run test:counts` runs inside `validate`
  and fails when suites disappear.
- 4.3 Remove the flag after one release cycle (separate tiny PR; noted here so it isn't
  forgotten).
- 4.4 Update `CLAUDE.md` "Settings Panel" section and the `new-widget` skill templates to the
  schema pattern. Add a unit test (`tests/components/widgets/legacyRegistryFreeze.test.ts`) that pins the key
  sets of `WIDGET_SETTINGS_COMPONENTS` / `WIDGET_APPEARANCE_COMPONENTS` to a frozen list that
  may only shrink, so no new legacy panel can be added while the burndown runs. (An ESLint rule
  cannot tell a new entry from an existing one.)

### Waves 5–9 — Migrate the remaining 49 widgets (D9)

Same item template as wave 2, ten widgets per wave (nine in the last), ordered by the analytics
ranking continued past #10. Each wave carries its `en.json` key item and retires its 0.4
snapshots. Widgets whose settings open an editor modal (Quiz, VideoActivity, GuidedLearning)
wrap the "open editor" button as a `Custom` field with a `// schema-gap:` note and do not inline
the editor. Keep a burndown table in `docs/plans/widget-settings-inventory.md` (widget · wave ·
PR · done) updated by every wave's orchestrator.

### Wave 10 — Delete the legacy slot

- 10.1 Delete `components/settings/legacy/LegacySettingsSlot.tsx`, `WIDGET_SETTINGS_COMPONENTS`,
  `WIDGET_APPEARANCE_COMPONENTS`, `legacySnapshots.test.tsx`, and the registry-freeze test from 4.4
  (nothing left to guard). Update `scripts/test-count-baseline.json`.
- 10.2 `WIDGET_SETTINGS_SCHEMAS` becomes `Record<WidgetType, …>` (no longer `Partial`) so a new
  widget without a schema fails type-check.

## 6. Top-10 migration list

**Status: PROVISIONAL — replace in wave 0.1 with the analytics-ranked list.**

Provisional (largest legacy settings files, verified 2026-09-05):

| #   | Widget             | Legacy settings file                                 | Lines | Strings (0.3) |
| --- | ------------------ | ---------------------------------------------------- | ----- | ------------- |
| 1   | Schedule           | `components/widgets/Schedule/Settings.tsx`           | 938   | TBD           |
| 2   | SpecialistSchedule | `components/widgets/SpecialistSchedule/Settings.tsx` | 731   | TBD           |
| 3   | RevealGrid         | `components/widgets/RevealGrid/Settings.tsx`         | 703   | TBD           |
| 4   | Poll               | `components/widgets/PollWidget/Settings.tsx`         | 650   | TBD           |
| 5   | Random             | `components/widgets/random/RandomSettings.tsx`       | 641   | TBD           |
| 6   | TimeTool           | `components/widgets/TimeTool/Settings.tsx`           | 641   | TBD           |
| 7   | Materials          | `components/widgets/MaterialsWidget/Settings.tsx`    | 572   | TBD           |
| 8   | Weather            | `components/widgets/Weather/Settings.tsx`            | 549   | TBD           |
| 9   | NumberLine         | `components/widgets/NumberLine/Settings.tsx`         | 447   | TBD           |
| 10  | NextUp             | `components/widgets/NextUp/Settings.tsx`             | 433   | TBD           |

When the analytics list arrives, keep whichever of these are in the true top 10 and drop the
rest; do not exceed 10 in this series.

## 7. Done bar (per migrated widget)

1. `settings.schema.ts` compiles against the widget's `*Config` type and passes
   `validateSchema` (group ids valid, `styleKeys` ⊆ `APPEARANCE_CONFIG_KEYS`, defaults coverage
   warning-free after the wave 1a backfill).
2. Config-migration test: a fixture of the pre-migration config shape (captured from the legacy
   settings file in wave 0.2) loads through `migrateWidget` and equals the expected new shape;
   no key lost that the front face reads.
3. Drawer E2E in `tests/e2e/settings-drawer.spec.ts`: open, change one field from each present
   group, observe the board widget update, close, **reopen the drawer and assert the values are
   still shown**. A reload cannot be asserted: `MockDashboardStore` in `hooks/useFirestore.ts`
   is an in-memory singleton and `VITE_AUTH_BYPASS` is forced for every Playwright run, so a
   reload wipes the board. Round-trip persistence is covered by a Vitest test through
   `mergeWidgetConfig` + `migrateWidget` instead.
4. Legacy settings file deleted; no `WIDGET_SETTINGS_COMPONENTS` / `WIDGET_APPEARANCE_COMPONENTS`
   entry remains for the widget.
5. All labels, including the close button's `aria-label`, through `t()` with keys present in
   `locales/en.json`. No hardcoded English JSX
   strings remain in the schema or drawer chrome. `de`/`es`/`fr` are deferred (D20); do **not**
   add a `widgetSettings` parity test to `tests/i18n/`, it would fail by design.
6. PR description lists removed controls, renamed keys, and `schema-gap` custom fields.
7. Axe: `SettingsDrawer.a11y.test.tsx` renders the widget's schema in the drawer and passes
   `axe-core` with zero violations; every field has an accessible name.
8. Focus: the drawer E2E tabs from the header through every field of the Settings tab without
   leaving the drawer unexpectedly, and closing returns focus to the gear button.
9. Bottom sheet: the schema renders inside the 820×640 bottom sheet with no horizontal scroll.
10. The widget's 0.4 legacy snapshot is deleted and the burndown table row is marked done.

## 8. Open questions (raise, don't assume)

- ~~Whether `SettingsDefEditor.tsx` should expose the full v1 field kit~~ **Resolved (rev 2):**
  full kit in wave 3.6.
- Whether analytics should rank by widget adds or by widgets present on active boards (plan
  assumes adds; both are acceptable, state which was used).
- ~~Widgets whose settings open other modals~~ **Resolved (rev 2):** they migrate in waves 5–9
  with the "open editor" button as a `Custom` field; the editor is never inlined.
- ~~z-index resolution for nested pickers~~ **Resolved (rev 2):** D19, drawer below `modal`.
- ~~Who the fluent `de`/`es`/`fr` reviewer is~~ **Resolved (rev 3):** translations deferred to
  a follow-up series (D20). The follow-up starts from the §6 "Strings" column and adds the
  parity test when it lands.
- **D22 / D23 / D24 confirmation** (rev 6): maximized widgets restore before the drawer opens;
  the drawer covers Dock and Sidebar rather than moving them; resizing the drawer never pans.
  Reviewer defaults; the product owner confirms or overrides before wave 1b.

## 9. Non-goals

- `/remote` mobile settings (D14). Note `RemoteWidgetCard.tsx` writes `flipped: false` on
  maximize; that stays compatible with the host.
- Admin-level widget configuration modals (`admin-widget-config` skill territory).
- Changing front-face widget rendering or container-query scaling.
- Inlining the Quiz / VideoActivity / GuidedLearning editors into the drawer.
- `de`/`es`/`fr` translations of settings labels (D20).
- Editing more than one widget's settings at once (D21).
- Full RTL layout of the drawer; only the resize-handle key mapping is direction-aware (§3 item 11).

## 10. Revision 2 — changes made against the graded comparison

A comparison on 2026-09-05 graded the original proposal against the current floating panel per
category. Every category below A was revised; this table records what changed and where.

| Category                           | Was | Gap                                                                                   | Fix in this revision                                                                                    |
| ---------------------------------- | --- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Panel placement                    | A-  | Right-only dock is predictable but not always near the widget.                        | Deterministic side selection, announced (D2, §3 item 8).                                                |
| Widget stays visible while editing | B+  | Drawer could sit a full projector-width from a small widget; partial pan on big ones. | Side selection before pan; focus ring on the edited widget (§3 items 8–9).                              |
| Internal structure consistency     | A-  | 49 widgets would keep hand-rolled JSX indefinitely.                                   | All 59 migrate; legacy slot deleted (D9, waves 5–10).                                                   |
| Same setting, same control         | A-  | Custom escape hatch could become permanent.                                           | Gap review per wave; `Record` type in wave 10.2 closes the door.                                        |
| Style tab predictability           | A-  | Window-level `fontFamily`/`baseTextSize` were unaddressed.                            | Two explicit tiers, Window and Content (D18, §4.2).                                                     |
| Internationalization               | B   | Hundreds of strings × 3 locales unbudgeted; chrome strings hardcoded.                 | Budget in 0.3, sized items per wave, named reviewer; chrome keys (reviewer later dropped by rev 3 D20). |
| Authoring a new widget's settings  | A-  | Still a hand-written schema plus four locale edits.                                   | `new-widget-settings` scaffold wired into the skill (§4.1, 1a.7).                                       |
| Config hygiene and migrations      | B+  | Rerouting five load paths through `migrateWidget` was a wide, untested change.        | Characterization fixtures per path before reroute; idempotence test.                                    |
| Keyboard and screen reader         | B   | Only Escape and Alt+S were specified.                                                 | Non-modal dialog, focus in/out, keyboard resize, axe per widget (D17).                                  |
| Preserving tuned behaviors         | B+  | Nine tests ported, but legacy panels had no render guard inside the new chrome.       | 0.4 snapshots of every legacy panel, byte-identical through the slot.                                   |
| Space on small screens             | B   | 360px minimum on a 1024px tablet; tablets unaddressed.                                | Bottom sheet below 900px; E2E at 820×640 (§3 item 10, corrected in rev 5).                              |
| Canvas interaction                 | B+  | New inbound global window event added coupling.                                       | Typed `registerPanSetter` on the canvas store, no event (§4.8).                                         |
| Coverage of the primary pain (D1)  | C+  | Series fixed structure for 10 of 59 widgets.                                          | Waves 5–9 migrate the rest; wave 10 removes the second system.                                          |
| Custom Widget Builder              | A-  | Admin builder stayed on four field types.                                             | Full v1 kit in 3.6.                                                                                     |
| Rollout safety                     | A-  | Legacy path unreachable by E2E while flagged.                                         | Bypass override env + `legacy-settings` Playwright project (§4.5).                                      |
| Open questions                     | —   | z-index and editor-modal widgets were unresolved and blocked wave 1b.                 | Resolved in §8; translation reviewer and analytics ranking remained open (reviewer closed by rev 3).    |

Cost of the revision: the series grows from four code waves to ten. The translation work made
explicit here was subsequently deferred in revision 3 (§11).

## 11. Revision 3 — product owner re-scope

A second independent grading on 2026-09-05 left four categories below A. The product owner ruled
on each; this table records the ruling and where the plan changed.

| Category                   | Was | Ruling                                                                                                                                    | Change                                                                                      |
| -------------------------- | --- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Space / drawer size        | A-  | The current 380px × 80vh panel is cramped and overloaded. A larger full-height surface is the point, not a cost.                          | D4 rationale; "board coverage" is an accepted trade, not a regression to grade against.     |
| Multi-widget editing       | C+  | Nobody edits two widgets' settings at once. The category is moot.                                                                         | D21 added; §3 and §9 updated. Not a graded category.                                        |
| Internationalization       | B+  | Locales exist for student-facing widget content (world-language teachers). Staff-facing settings i18n ballooned beyond intent. Defer.     | D20 rewritten; 0.3, 2.7, 3.8, waves 5–9, done bar 5, §8, §9 updated. English keys only.     |
| Scope, cost, delivery risk | C   | Removing the translation stream cuts the largest non-engineering dependency (an unnamed fluent reviewer) from every wave's critical path. | Waves keep their shape; each is now engineering-only and mergeable without external review. |

Grading instruction for future reviewers: grade the drawer's larger footprint as an improvement
over the current panel, do not grade multi-widget editing, and grade i18n on "every string goes
through `t()` with an English key" rather than on locale coverage.

## 12. Revision 4 — corrections from the third independent grading

A third grading on 2026-09-05 re-measured every §1 claim against the tree and graded both systems
per category (current overall C-, proposal A-). All measured figures held except the two counts
corrected below. This table records each factual correction and each sub-A gap with its fix.

| Item                     | Finding                                                                                                       | Change                                                                             |
| ------------------------ | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Appearance count         | `WIDGET_APPEARANCE_COMPONENTS` has 29 entries, not 21 (already 29 when rev 1 was written).                    | §1 corrected.                                                                      |
| Settings count           | `WIDGET_SETTINGS_COMPONENTS` has 59 entries, not 55; the 59 files and 59 entries are different sets.          | §1 corrected.                                                                      |
| `flipped` normalization  | Described as living in `migrateWidget`, which is a per-widget mapper and cannot pick the highest-`z` sibling. | Board-level `normalizeFlipped` at both call sites (§3, §4.4).                      |
| "Only bulk unflip"       | Minimize-all / restore-all in `DashboardContext.tsx` also unflip in bulk.                                     | §3 wording corrected; design unchanged.                                            |
| `data-widget-id` comment | The `DashboardView.tsx` comment that only `SettingsPanel` carries it is stale (five other components do).     | §3 item 6 notes it; attributes still required.                                     |
| i18n exemption           | `Close settings` was exempt from `t()` to keep an E2E selector stable.                                        | Localized; QR spec switches to `data-testid` (§3 item 1, §4.5, done bar 5).        |
| Manual-pan detection     | `board-pan` fires for the drawer's own auto-pan, so "teacher panned manually" was undetectable.               | `pendingProgrammaticPan` ref, consumed once, with a unit test (§3 Board behavior). |
| Bottom-sheet keyboard    | Only the vertical separator had keyboard operation specified.                                                 | Horizontal variant with ArrowUp/Down (§3 item 11).                                 |
| Custom-widget defs       | Widening `CustomWidgetSettingDef.type` changed stored `/custom_widgets` docs with no migration.               | `migrateCustomWidgetDefs` on the read path in 3.6 (§4.7).                          |
| Defaults backfill scope  | Only the ten §6 widgets were backfilled, but done bar item 1 applies to all 59.                               | Waves 5–9 backfill their own widgets (1a.6).                                       |
| 0.4 snapshot cost        | Snapshotting 84 lazy components under mocked providers was unbudgeted and "byte-identical" was over-broad.    | Shared `renderLegacySettings` harness as its own item; slot content only (0.4).    |
| §10 stale rows           | The i18n and open-questions rows still referenced the named reviewer after rev 3 deferred translations.       | Rows annotated.                                                                    |

Remaining below A after this revision: **scope, cost, and delivery risk (B-)**. Ten waves and 59
migrations are inherent to D9, the analytics ranking (wave 0.1) is still an external dependency,
and `pauls-skills:mass-plan-implementation` is not installed in every session. None of these
change the design; they are accepted by the product owner as the price of removing the second
settings system.

## 13. Revision 5 — UI prototype and product-owner pick

On 2026-09-05 the drawer chrome was prototyped in-app as four switchable variants on the `/`
route (throwaway branch `proto/settings-drawer-variants`, file
`components/settings/prototype/SettingsDrawerPrototype.tsx`, gated on `import.meta.env.DEV` and
`?variant=`). The clock ran on a mock schema; the timer ran through the legacy slot. Screenshots
were graded against hierarchy, consistency, accessibility, discoverability, and the design
principles in `CLAUDE.md`.

| Variant | Shape                                                                       | Grade | Why                                                                                                                                                     |
| ------- | --------------------------------------------------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A       | §3 as written: header, Settings/Style tabs, titled groups                   | B+    | Clearest hierarchy; faint `slate-600` headings; a duplicated Background Color row (a prototype artifact, §14); wide empty right half of each field row. |
| B       | Icon rail on the board-facing edge, one group at a time in a card           | B-    | Best breathing room, but truncated rail labels, hidden group count, and close/help buried at the rail's foot.                                           |
| C       | Dark glass inspector: no tabs, collapsible groups on one scroll, filter box | C+    | Filter is the best single feature; legacy content fails contrast outright, schema fields sit near 4:1, and it contradicts D17's light surface.          |
| D       | A + C's filter, Background Color deduped, headings `slate-700`              | A-    | **Picked by the product owner.** Folded into §3 items 2–4 and item 11 above.                                                                            |

What the prototype confirmed without changes to the plan:

- Side selection (§3 item 8) behaves as specified: a centred widget gets a right drawer; a widget
  on the right edge gets a left drawer with no pan. The product owner reviewed the left/right
  flip against the "always right, always pan" alternative and kept side selection, because a
  camera pan moves everything on a projected board while a drawer changing sides moves nothing.
- Live update holds in every variant; the edited-widget focus ring is enough to find the target.
- The legacy slot renders real 900-line panels inside the drawer acceptably on a light surface.

Not prototyped (still to be built to spec): auto-pan and camera restore (§3 Board behavior),
keyboard-operable resize, focus return, width persistence, the live-region announcement.

Corrections made in this revision: the bottom-sheet E2E viewport was 1024×768 in three places
while D14 sets the breakpoint at 900px; it is now 820×640 everywhere.

**Rev 5.1 alignment pass.** A second read against the prototype found three places where the
plan still described something other than what was approved:

| Gap                    | Was                                                                                   | Now                                                                                       |
| ---------------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Section heading color  | `SettingsLabel` retained unchanged, but its default is `text-slate-400`.              | Rev 5.1 moved the default; rev 6 scoped it to a `tone` prop instead (§4.3, §14).          |
| Window tier vs. filter | Filter results listed a "Window" heading, but the Window tier has no schema to index. | `WINDOW_STYLE_LABELS` static list is indexed; a match renders the whole tier (§3 item 2). |
| Toggle row layout      | One vertical anatomy for every field type.                                            | Inline layout for `Toggle` (switch right of label), stacked for everything else (§4.3).   |

## 14. Revision 6 — adversarial review of the plan against the tree

An adversarial read of revision 5.1 on 2026-09-05 checked every claim against the code. Five
claims were false or stale and three design gaps had no rule. Each is recorded with its fix.

| Finding                                                                                                                                                             | Fix                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| "Today's panel shows both background controls" was false: `SettingsPanel.tsx` is either/or, and `UniversalStyleSettings` renders `WidgetBackgroundSettings` itself. | Rationale corrected in §3 item 4 and §13; dedupe rule kept.           |
| "`WidgetBackgroundSettings` is retired in wave 4" would delete a component the Window tier depends on.                                                              | §4.2: it stays.                                                       |
| `Z_INDEX.maximized` (10500) is above the drawer (9980); "the drawer overlays the right edge of a maximized widget" was impossible.                                  | D22: restore before open. D19 notes the exception.                    |
| Changing `SettingsLabel`'s default color touched 61 files, not 31, including five slate-800/900 modals where `slate-700` fails contrast.                            | §4.3, 1a.8: `tone` prop + context, default unchanged.                 |
| Cross-references not renumbered after rev 5 (§4.1 tree, §10 row, 1b.2); status line named a dead branch; 1a.7 listed before 1a.6.                                   | Corrected.                                                            |
| Flag on: `DraggableWindow` mounts `SettingsPanel` on `flipped` regardless of the `settings` prop, and its close path owns `justClosedSettingsRef`.                  | §4.5: gate the mount; drawer close sets the ref; 1b.9 test.           |
| Drawer covers Sidebar (1200) and a side-anchored Dock (1000); bottom sheet covers a bottom dock. No rule existed.                                                   | D23: covered, not moved; side-selection tie-break away from the dock. |
| §3 item 8 fixed the side per open but §4.9 rule 4 re-panned on every resize, moving the projected board mid-edit.                                                   | D24: resize never pans.                                               |
| Escape in the filter input was unspecified (the prototype swallowed it).                                                                                            | §3 item 2: first Escape clears, then blurs, then closes.              |
| Legacy appearance component + Window tier shows two font controls for ~29 widgets until they migrate; the plan only justified this for migrated widgets.            | §3 item 4: accepted interim behavior, stated.                         |
| "Byte-identical" fixtures ignored the rewrites `migrateWidget` already performs.                                                                                    | §4.4: expected deltas listed per fixture.                             |
| An ESLint rule cannot detect "new entries" in a registry object.                                                                                                    | 4.4 / 10.1: registry-freeze unit test.                                |
| `Embed` / `MiniApp` hide toolbars while `flipped`; now visible beside the drawer.                                                                                   | §3 Board behavior: kept, stated.                                      |
| The `DashboardView.tsx` comment that pan range is `[0, 0]` at zoom 1 is wrong (`ZOOM_MIN` 0.5 gives ±viewport/2, as §3 already said).                               | 1b.2 fixes the comment.                                               |

D22, D23 and D24 are rev 6 defaults chosen by the reviewer, not product-owner rulings. They are
listed in §8 until confirmed.

## 15. Revision 7 — final pass from two independent reviews

Two independent reviewers (one checking every claim against the tree, one attacking design
consistency and delivery) read revision 6 on 2026-09-05. Findings and fixes:

| Finding                                                                                                                                                                                   | Fix                                                                                      |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `missingDocPublic: false` returns false **before** the admin check, so the rev 6 defaults gated everyone out, admins included, and wave 4.1 only touched a value the runtime never reads. | §4.5, 1b.4, wave 1b exit, 4.1: init script writes the doc; wave 4 flips both fields.     |
| `AppSettings` is the tenant-wide admin doc; `updateAppSettings` no-ops for non-admins. Width could not be per-user.                                                                       | §4.6, D4, 1b.7: user-profile document.                                                   |
| One Vite bundle, one `webServer`: a second Playwright project cannot carry a different `VITE_*` value.                                                                                    | §4.5: runtime `localStorage` override under bypass.                                      |
| Read-only asymmetry was stated backwards: locked widgets may close, read-only boards block both.                                                                                          | §3 Board behavior corrected; read-only drawer renders disabled with a local Close.       |
| `flipped` is synced across tabs and devices; the drawer would pan a projector's camera remotely.                                                                                          | §3 Board behavior: camera/focus effects run only in the originating tab.                 |
| Highest-`z` tie-break at runtime opens the wrong widget; "un-flip the previous" had no state machine.                                                                                     | §3 Selection: host-local `activeWidgetId`, batched un-flip, tested transitions.          |
| `justClosedSettingsRef` is render-scoped inside `DraggableWindow`; the host cannot set it.                                                                                                | §4.5: module-level `settingsJustClosedAt` signal.                                        |
| `activeDashboard` churns on every drag frame; a naive host re-renders the whole drawer.                                                                                                   | §4.8: identity-stable selector, `React.memo`, render-count test.                         |
| `DashboardCanvasStore` has no actions; `registerPanSetter` needs `DashboardContextValue.ts` + `DashboardContext.tsx` or a standalone registry.                                            | §4.8, 1b.2, §5 owned list.                                                               |
| D22 restore is blocked for locked / read-only widgets (`if (isLocked) return;`).                                                                                                          | D22: refuse to open there.                                                               |
| jsdom cannot run axe `color-contrast`; `vitest-axe` is unmaintained.                                                                                                                      | §3 item 11: `jest-axe`, structural rules only, static token-allowlist test for contrast. |
| E2E "reload, values persist" is impossible: bypass board store is in-memory.                                                                                                              | Done bar 3 rewritten.                                                                    |
| `hooks/useTemplateStore.ts` is the bypass mock, not a load path; Drive import had no owning file; `mergeWidgetConfig` cannot stamp `configVersion`.                                       | §4.4, 1b.6 corrected.                                                                    |
| `isEscapeFromWidgetInput` in `utils/domHelpers.ts` is the real `data-widget-portal` consumer, used by many dialogs; only two components set `data-widget-id`.                             | §3 items 2 and 6.                                                                        |
| Wave 1a items were circularly dependent (`FieldRenderer` ↔ fields ↔ `List`).                                                                                                              | Wave 1a sequencing + registry.                                                           |
| Snapshot file, freeze list, burndown table and test-count baseline are shared write targets for "parallel" agents.                                                                        | §5 owned list; per-wave orchestrator step.                                               |
| Side selection ignored zoom and the pan transform.                                                                                                                                        | §3 item 8: DOM rect + `viewportToWrapper`, zoom tests.                                   |
| Bottom sheet vs. software keyboard, reduced-motion auto-pan, RTL keys, undo, `visibleWhen` context, `Custom` re-render bound, `List` row keys, i18n key resolution were unspecified.      | §3 items 10–11, §4.2, §9.                                                                |
| 1a.6 backfill also changes `mergeWidgetConfig`'s defaults layer; drawer and front face could disagree.                                                                                    | §4.2 rules: fallback parity test.                                                        |
| Two stale pan-range comments in `DashboardView.tsx`, not one; `SettingsPanel.test.tsx` asserts only `data-widget-portal`.                                                                 | 1b.2, §3 item 6.                                                                         |

Rejected: a claim that `SettingsLabel` is imported by 172 files; a repo-wide grep of import
lines finds 58 (61 including definition and tests), so the §4.3 figure stands.

Accepted risks, unchanged: ten waves for 59 migrations (D9); two font controls on unmigrated
widgets until burndown; the drawer covering Sidebar and side dock (D23); partial pan for
widgets wider than the free band; `de`/`es`/`fr` deferral (D20).

This revision is final. Further changes require a new product-owner ruling recorded in §2.
