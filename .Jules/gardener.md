## 2026-03-13 - Refactored RecessGearWidget

**Weed:** Monolithic Widget Structure (>300 lines mixing widget and settings components).
**Root Cause:** Early development pattern of grouping all logic per widget into a single file, leading to poor separation of concerns and maintainability issues as widgets grow.
**Plan:** Decompose the monolithic file into a modular directory structure (Widget.tsx, Settings.tsx, Widget.test.tsx, index.ts). Update WidgetRegistry.ts to load the separate files, preventing unnecessary bundling.

# Gardener's Journal

## 2025-06-04 - Refactor LunchCountWidget

**Weed:** `LunchCountWidget.tsx` was ~1000 lines, mixing UI components (Widget, Settings, Modal) with complex API fetching logic.
**Root Cause:** "God Component" pattern; new features (Nutrislice sync, reporting modal) were added inline over time.
**Plan:** Decomposed into `components/widgets/LunchCount/` with `Widget.tsx`, `Settings.tsx`, `SubmitReportModal.tsx`, and extracted API logic to `useNutrislice.ts` hook.

## 2025-06-03 - Refactor InstructionalRoutinesWidget

**Weed:** `InstructionalRoutinesWidget.tsx` was >1000 lines, containing the main widget, settings, library manager, and helper components.
**Root Cause:** "God Component" pattern where multiple distinct UI views (Student, Teacher/Settings, Admin/Library) were co-located.
**Plan:** Decomposed into `components/widgets/InstructionalRoutines/` directory with separate files for `Widget`, `Settings`, `LibraryManager`, `IconPicker`, and `constants`. Added basic unit tests.

## 2025-05-30 - Extract Roster Logic from DashboardContext

**Weed:** `DashboardContext.tsx` was over 1400 lines (God Object), mixing global app state with specific Roster management logic (including a mock implementation).
**Root Cause:** Roster features were added directly to the main context provider, coupling distinct domains.
**Plan:** Extracted all roster-related state, effects, and the `MockRosterStore` singleton into a dedicated `useRosters` hook.

## 2025-05-27 - Refactor Dock and Extract Modals

**Weed:** `Dock.tsx` was over 700 lines and contained multiple internal modal components (`WidgetLibrary`, `RenameFolderModal`).
**Root Cause:** Features were added directly to the main file for convenience, leading to a "God Component".
**Plan:** Extracted `WidgetLibrary` and `RenameFolderModal` to `components/layout/dock/` to reduce complexity and file size.

## 2025-02-18 - [Extracted Complex Audio Logic from TimeToolWidget]

**Weed:** Complex logic (audio synthesis with `AudioContext`) mixed with UI component logic (`TimeToolWidget`).
**Root Cause:** Feature grew over time; audio logic is verbose and was implemented inline.
**Plan:** Extracted to `utils/timeToolAudio.ts` with Singleton pattern and SSR safety.

## 2024-05-23 - Refactor Sidebar and Extract SortableDashboardItem

**Weed:** `Sidebar.tsx` was over 1400 lines and contained a large inner component definition (`SortableDashboardItem`) and duplicated background fetching logic found in `useBackgrounds`.
**Root Cause:** Component grew organically as features were added (boards, backgrounds, widgets) without separating concerns.
**Plan:** Extract sub-components and leverage existing hooks to reduce file size and improve readability/maintainability.

## 2025-06-05 - Extract ScoreboardSettings

**Weed:** `ScoreboardWidget.tsx` contained multiple components (`ScoreboardWidget`, `ScoreboardSettings`, `TeamNameInput`) and misplaced imports.
**Root Cause:** Component grew over time, likely started small but expanded with settings logic.
**Plan:** Extracted `ScoreboardSettings` and `TeamNameInput` to `components/widgets/ScoreboardSettings.tsx` to separate concerns and fix import structure.

## 2025-06-05 - Refactor ClassesWidget

**Weed:** `ClassesWidget.tsx` contained multiple components (`ClassesWidget`, `RosterEditor`) and complex string manipulation logic for parsing names.
**Root Cause:** "Complexity Trap"; UI and business logic were mixed, making it hard to test the parsing logic.
**Plan:** Extracted `RosterEditor` to its own component, moved parsing logic to `rosterUtils.ts` with unit tests, and reorganized file structure into `components/widgets/Classes/`.

## 2025-06-06 - Refactor Sidebar

**Weed:** `Sidebar.tsx` was ~1300 lines, acting as a "God Component" that managed boards, backgrounds, widgets, and settings all in one file.
**Root Cause:** Features were added incrementally to the sidebar over time without separating concerns, leading to a massive file with mixed responsibilities.
**Plan:** Decomposed into `SidebarBoards.tsx`, `SidebarBackgrounds.tsx`, `SidebarWidgets.tsx`, and `SidebarSettings.tsx`. Extracted relevant state and logic to each component. Used `createPortal` for modals within the sub-components to handle stacking context issues.

## 2025-06-07 - Extract MiniAppWidget

**Weed:** `MiniAppWidget.tsx` was over 1000 lines, mixing UI components (SortableItem, GlobalAppRow, MiniAppEditor) with complex API fetching logic.
**Root Cause:** "God Component" pattern where the feature was built in a single file over time.
**Plan:** Decomposed into `components/widgets/MiniApp/` with `Widget.tsx`, `components/SortableItem.tsx`, `components/GlobalAppRow.tsx`, `components/MiniAppEditor.tsx`, and extracted API logic to `hooks/useMiniAppSync.ts` hook.

## 2025-03-04 - [Refactor `generateWithAI` function] **Weed:** [Deeply nested if/else statements (Arrow code)] **Root Cause:** [The `generateWithAI` function had a long and repetitive `if / else if` chain defining system and user prompts depending on `genType`.] **Plan:** [Refactored to use a dictionary map (`promptMap`) mapping generation types to a lazy-evaluated function `() => ({ systemPrompt, userPrompt })`. This encapsulates the logic, scales well, and is immune to nullish properties on uncalled types.]

## 2025-06-08 - Refactor AnnouncementsManager

**Weed:** `AnnouncementsManager.tsx` was over 1700 lines, mixing UI components (`TextConfigEditor`, `EmbedConfigEditor`, `AnnouncementsManager`) and complex configuration types.
**Root Cause:** "God Component" pattern where multiple distinct UI views and logic were co-located in a single file as the feature grew.
**Plan:** Decomposed into `components/admin/Announcements/` directory with separate files for `Widget`, `TextConfigEditor`, `EmbedConfigEditor`, and `types`.

## 2024-03-13 - Decomposed Scoreboard Widget

**Weed:** Monolithic files holding multiple components and settings (`ScoreboardWidget.tsx`, `ScoreboardItem.tsx`, `ScoreboardSettings.tsx` scattered in the root widgets folder).
**Root Cause:** Fast iteration led to grouping disparate logic (main widget UI, individual items, settings panels) loosely in the same directory, violating separation of concerns.
**Plan:** Created a `components/widgets/Scoreboard` directory. Moved the main widget, settings, and sub-components into this logical directory structure and created an `index.ts` to cleanly export the primary interfaces. Updated the WidgetRegistry to use the clean entry point.

## 2026-03-14 - Decomposed MathToolInstanceWidget

**Weed:** Monolithic files holding multiple components and settings (`MathToolInstanceWidget.tsx` contained `MathToolInstanceWidget`, `MathToolInstanceSettings`, and `RotationOverlay`).
**Root Cause:** The `MathToolInstanceWidget` became too large over time as more configuration types, modes, and display options were added to mathematical tools (ruler, protractor, number-line, etc.), making it hard to navigate.
**Plan:** Created a `components/widgets/MathToolInstance` directory. Moved the main widget, settings, internal overlay component, and shared constants into this logical directory structure and created an `index.ts` to cleanly export the primary interfaces. Updated the WidgetRegistry to use the clean entry point.

## 2026-03-14 - Refactored MathToolsWidget

**Weed:** Monolithic Widget Structure (MathToolsWidget.tsx mixed widget, settings, and constants).
**Root Cause:** Early development pattern of grouping all logic per widget into a single file, leading to poor separation of concerns and maintainability issues as widgets grow.
**Plan:** Decompose the monolithic file into a modular directory structure (Widget.tsx, Settings.tsx, constants.ts, index.ts). Update WidgetRegistry.ts to load the separate files, preventing unnecessary bundling and improving readability.

## 2025-06-09 - Extracted TimeToolSettings

**Weed:** Monolithic files holding multiple components and settings (`TimeToolWidget.tsx` scattered in the root widgets folder).
**Root Cause:** Component grew organically as features were added (visuals, sounds, widget settings) without separating concerns.
**Plan:** Extracted `TimeToolSettings` and `TimeToolAppearanceSettings` to `components/widgets/TimeTool/Settings.tsx` to reduce file size and improve readability/maintainability.

## 2026-03-23 - Extracted SortableScheduleItem

**Weed:** `ScheduleSettings` component in `components/widgets/Schedule/Settings.tsx` was over 1100 lines and contained a complex inner component `SortableScheduleItem` along with large constant arrays like `AVAILABLE_WIDGETS`.
**Root Cause:** "God Component" pattern where the settings UI for the Schedule widget grew organically, mixing the main settings list view with the complex rendering and editing logic of individual sortable schedule items.
**Plan:** Extracted `SortableScheduleItem` and `AVAILABLE_WIDGETS` into a dedicated `components/widgets/Schedule/components/SortableScheduleItem.tsx` file, reducing the size and complexity of `Settings.tsx`.

## 2026-03-26 - Unused Variables in Utils

**Weed:** `eslint-disable-next-line @typescript-eslint/no-unused-vars`
**Root Cause:** Bypassing linter for intentionally unused destructured variables instead of using the configured `^_` prefix.
**Plan:** Rename unused destructured variables with a leading underscore (e.g. `id` -> `_id`).

## 2026-04-18 - Refactored ScheduleWidget

**Weed:** `ScheduleWidget.tsx` was over 900 lines long, containing multiple internal components (`CountdownDisplay`, `ScheduleRow`) and numerous helper functions, acting as a "God Component" for the scheduling logic.
**Root Cause:** "God Component" pattern where the feature was built out incrementally over time, mixing UI, time parsing, formatting, and complex layout logic into a single file without separating concerns.
**Plan:** Extracted the utility functions (`parseScheduleTime`, `formatCountdown`, `hexToRgba`, etc.) into `components/widgets/Schedule/utils.ts`. Extracted the internal sub-components (`ScheduleRow`, `CountdownDisplay`) into `components/widgets/Schedule/components/ScheduleRow.tsx`. Kept the main orchestration logic in `ScheduleWidget.tsx`.

## 2026-04-02 - Refactored useEffect prop-sync anti-pattern

**Weed:** Using `useEffect` to mirror external component props (`firstNames`, `lastNames`) into local state after commit, causing an avoidable extra render. There was also a separate concern around keeping `useRef` writes out of the render body.
**Root Cause:** Component grew over time and developers defaulted to `useEffect` for prop-to-state synchronization instead of using React's derived state pattern when state must immediately reflect changed props. That post-commit syncing introduced unnecessary double-renders. Separately, writing to refs in render violates React's pure rendering expectations in newer versions.
**Plan:** Removed the prop-syncing `useEffect` hooks in `components/widgets/random/RandomSettings.tsx`. Implemented the derived state pattern using `prevProps` stored in `useState`, updating local state synchronously inside an `if` block during render so prop changes are handled without the extra effect-driven render. Kept ref mutations out of the render body by performing them in `useEffect` where needed.

## 2025-02-18 - Refactor useEffect prop synchronization

**Weed:** Using `useEffect` to synchronize `diceCount` with the local `values` array in `DiceWidget`.
**Root Cause:** The `useEffect` hook causes an avoidable, post-commit extra render when adjusting state to match props.
**Plan:** Replaced the `useEffect` block with the derived state pattern (`if (diceCount !== prevDiceCount)`) to conditionally update the state synchronously during the render phase. Also refactored the array initialization to use `Array.from` for better readability.
