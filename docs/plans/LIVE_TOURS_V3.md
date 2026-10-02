# Live Tours v3: a clear stage, settings that open themselves, a tethered tip, Autopilot

Follow-up to `docs/plans/shipped/LIVE_TOURS_V2.md`. It covers four areas of live-tour playback:

1. The teacher's widgets get out of the way while a tour runs and come back exactly as they were.
2. Steps that point into a widget's settings drawer open it and scroll to the setting.
3. The step callout splits into a tip tethered to the target and a top control bar.
4. **Autopilot**: a per-step button, and a whole-tour switch, that move the cursor and perform the step, including toggles, selects and typed text.

Scope was settled in a design interview with Paul on 2026-10-02. This document is the contract. Each PR is self-contained: an implementer should be able to build it from the PR text plus the code, without this conversation.

**Code references** were taken at `dev-paul` commit `ed1d81d6e`. Symbol names are authoritative and line numbers are hints; if a line number is off, grep for the symbol. Do not stop to report line drift.

**Release:** everything is behind the existing `gl-live-tours` flag (`types.ts` `GlobalFeature`, `config/featureDefaults.ts`, admin-only, stage `preview`). No new flag. No `public/changelog.json` entry until Paul opens `gl-live-tours` to everyone. The Autopilot safety setting (D12) is an admin config value, not a flag.

Out of scope: opening live tours beyond admins, live tours in the student app, a playback speed control, and Autopilot for drag gestures.

## Why

- **The teacher's board fights the tour.** Only the widgets bound to tour slots move (`planTourSetup`, `components/tours/tourSession.ts:95-122`). Everything else stays where it is, covers tour widgets and anchors, and pulls the eye. The tour also reuses the teacher's own widget of a type, so what the teacher sees depends on their data, not on what was recorded.
- **Widgets opened during a tour are saved immediately.** A `spawns` step binds the widget the app adds (`claimSpawns`, `LiveTourRunner.tsx:266-290`), but the app's `addWidget` creates an ordinary, autosaved widget. Remove at teardown can't put the board back exactly.
- **Settings anchors are below the fold.** `settings.*` anchors are `panel: true` with no `requires` (`config/tourAnchors.ts:107-143`). Nothing opens the drawer; the author has to record a gear click. `useAnchorElement` scrolls an anchor into view once, when it is first found (`components/tours/useAnchorElement.ts:156-159`), which can run before the drawer's flip finishes, and the drawer only scrolls on focus in bottom-sheet mode (`components/settings/SettingsDrawer.tsx:332-336`). Teachers end up scrolling to find a spotlit row.
- **One card does too much.** The callout (`LiveTourRunner.tsx:1229-1442`) holds title, text, read-aloud, exit, status pills, Pause/Resume/Take over, progress, Back, Show me, Retry and Next in a 320–512px box placed beside the target. It covers the area around the target, and navigation jumps around the screen with every step.
- **Autopilot is hidden and click-only.** `dispatchAutoClick` (`components/tours/autopilot.ts:39-57`) only runs when the set's `mode === 'guided'` (`LiveTourRunner.tsx:873-875`). Teachers can't ask for it on one step, and steps only record `action: 'click' | 'observe'` (`types.ts` `GuidedLearningTourBinding`), so toggles, selects and text fields can never be performed for them.

## Product decisions (settled — do not re-litigate)

| #   | Decision                   | Answer                                                                                                                                                                                                                                                                                                                                                                               |
| --- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D1  | Clearing the stage         | Every non-tour widget on the active board gets a render-only `minimized: true` patch in the canvas store, next to the existing `{ restored: true }` patch (`context/dashboardCanvasStore.ts:387-437`). Nothing is written to Firestore or history, so Done, Escape, reload, crash and board switch all leave the board exactly as it was.                                            |
| D2  | Tour widgets               | On a cleared stage the tour **always** adds its own transient widgets (`addTourWidget`) at the recorded layout and appearance. It never binds or edits the teacher's widgets. The existing Keep/Remove teardown decides what stays.                                                                                                                                                  |
| D3  | Widgets opened during tour | While a cleared-stage tour runs, any widget the app adds on the active board (a teacher click, or Autopilot) is created with `transient: true`, so it joins Keep/Remove.                                                                                                                                                                                                             |
| D4  | Opt-out                    | Clearing is on by default. The Studio tour setup gets a "Use the teacher's board as-is" checkbox (`tourSetup.useTeacherBoard: true`). Those tours keep today's behaviour exactly: no hiding, slot binding to the teacher's widgets via overrides, real spawned widgets. Autopilot follows the admin policy (D12) there.                                                              |
| D5  | Motion                     | On start, the teacher's widgets scale and fade toward their dock item with a short stagger (about 350ms in total), then tour widgets fade in. At the end the motion reverses. `prefers-reduced-motion` gets a plain cross-fade.                                                                                                                                                      |
| D6  | Settings drawer            | A new `settings-open` prerequisite on `settings.*` anchors. The runner selects the bound widget, flips it to settings, switches to the tab that holds the field (Settings or Appearance), waits for the flip, then scrolls the drawer so the anchor is centred and pulses it. It is undone at teardown like every other prerequisite.                                                |
| D7  | Drawer lifetime            | The drawer stays open while consecutive steps target the same widget's drawer. It closes when a step targets something outside it. Back into a drawer step reopens it.                                                                                                                                                                                                               |
| D8  | Tip                        | The instruction moves to a compact tip with an arrow tethered to the target. It holds the title, step text and two buttons: **Show me** (cursor glide, as today) and **Autopilot this step**. Steps with no anchor get a centred tip with no arrow.                                                                                                                                  |
| D9  | Top bar                    | A slim top-centre bar, draggable like the recorder toolbar, with its position saved in localStorage. It holds progress, Back, Next/Done, the Autopilot switch, read-aloud, Retry when the anchor is missing, and Exit. It is a `data-tour-obstacle`, so the tip never sits under it.                                                                                                 |
| D10 | Recorded values            | Steps gain `action: 'toggle' \| 'select' \| 'type'` alongside `click` and `observe`, plus a `value`. The recorder captures them. The Studio step editor shows the value as an editable field ("Autopilot types:"), and Tour Health warns when a typed value matches a roster name.                                                                                                   |
| D11 | Whole-tour Autopilot       | A switch on the top bar only; the welcome dialog doesn't change. The set's existing `mode` sets the switch's start: `guided` starts on, anything else starts off. "Take over" and Pause/Resume become the switch.                                                                                                                                                                    |
| D12 | Safety policy              | An org-wide admin setting with three values, read at tour start: **`tour-safe`** (default in both projects) blocks `destructive` and `persists` anchors; **`destructive-only`** blocks only `destructive` (today's rule); **`confirm`** performs anything, but asks first on `destructive` and `persists` anchors. Blocked steps say "You click this one".                           |
| D13 | Policy home                | A "Live tour Autopilot" dropdown in `components/admin/GuidedLearningConfigurationPanel.tsx` (Admin Settings > Widgets > Guided Learning), stored as `GuidedLearningGlobalConfig.tourAutopilotPolicy`. Absent = `tour-safe`. Not per building.                                                                                                                                        |
| D14 | `persists` tagging         | A new `persists?: true` on `TourAnchorDef` for anchors whose effect outlives the tour: assign to students, share, publish, board or account settings. The Autopilot PR audits every id in `TOUR_ANCHORS` and tags them, listing the result in the PR for Paul. A test fails when an id containing `assign`, `share`, `publish` or `delete` has neither `persists` nor `destructive`. |
| D15 | Validation                 | A `/live-tour-views-dev` harness shows the tip, bar, drawer scroll and Autopilot states with fake anchors. An `impeccable` polish pass runs over it, and Paul gets screenshots before the UI PR merges. Then a real run on spartboard-dev.                                                                                                                                           |
| D16 | Delivery                   | Five PRs to `dev-paul`, in order, below.                                                                                                                                                                                                                                                                                                                                             |

Small consequences, not separate decisions:

- Tour-hidden widgets are **not** shown as minimized on the dock (no badge, no restore chip). A dock click on one during a tour does nothing special; the widget comes back at teardown.
- `tourResume` re-applies the hide patches when a tour resumes after a reload.
- The teardown prompt names what it keeps: "Keep the N widgets from this tour?" with **Keep them** / **Put my board back**.

## Data model

```ts
// types.ts — GuidedLearningTourBinding
action: 'click' | 'observe' | 'toggle' | 'select' | 'type';
/** toggle: target state; select: option value; type: text Autopilot enters. */
value?: boolean | string;

// types.ts — GuidedLearningSet.tourSetup
useTeacherBoard?: true;

// types.ts
export type TourAutopilotPolicy = 'tour-safe' | 'destructive-only' | 'confirm';
// GuidedLearningGlobalConfig
tourAutopilotPolicy?: TourAutopilotPolicy;

// config/tourAnchors.ts — TourAnchorDef
persists?: true;
// TOUR_ANCHOR_PREREQUISITES gains 'settings-open'
```

Old sets keep working: `click` and `observe` steps behave as today, and a missing `useTeacherBoard` means the cleared stage.

## PRs

### PR 1: Cleared stage, transient spawns, opt-out, motion

- **Canvas store:** extend the tour patch in `context/dashboardCanvasStore.ts` with `hidden: true` (render-only minimize). `WidgetRenderer` / `DraggableWindow` treat it like `minimized` for rendering (`opacity: 0; pointer-events: none`, `DraggableWindow.tsx:2297-2298`) but nothing reads it on save. Add `setTourHidden(ids)` / `clearTourHidden()`.
- **Dock:** `ToolDockItem` / `Dock` ignore tour-hidden widgets when counting minimized badges and restore chips.
- **Runner (`LiveTourRunner.tsx` `runSetup`, `tourSession.ts` `planTourSetup`):**
  - Unless `tourSetup.useTeacherBoard`, hide every non-transient widget on the active board, then `addTourWidget` for every recorded layout. Slots bind only to tour widgets.
  - With `useTeacherBoard`, keep today's planning unchanged.
  - Every end path (`endTour`, board-switch teardown, unmount) calls `clearTourHidden()`. `tourResume` re-applies it.
- **Transient spawns:** add a tour-scoped flag in `DashboardContext` (set by the runner while a cleared-stage tour runs, cleared on end) that makes the normal `addWidget` path create `transient: true` widgets (the `opts.transient` branch near `DashboardContext.tsx:5798`). `claimSpawns` binds them as today, and they join the teardown id list.
- **Motion:** a `TourStageTransition` that animates hidden widgets toward their dock item rect (fallback: fade) with a stagger, and reverses on end. Use the existing motion tokens; reduced motion is a cross-fade.
- **Studio:** "Use the teacher's board as-is" checkbox in the tour setup section, with one line of help text.
- **Teardown copy:** "Keep the N widgets from this tour?", **Keep them** / **Put my board back**.
- **Tests:** hidden widgets never reach the autosave payload or history; every end path restores them; resume re-hides; tour widgets are always fresh on a cleared stage, even when the teacher has one of the type; a widget added during the tour is transient and Put my board back removes it; `useTeacherBoard` sets keep today's binding; dock badges ignore hidden widgets.

### PR 2: Settings drawer opens and scrolls itself

- `config/tourAnchors.ts`: add `'settings-open'` to `TOUR_ANCHOR_PREREQUISITES` and set it on the `settings.*` ids that live in the drawer. Update `tests/tourAnchors.test.ts` and the `new-widget` checklist.
- `components/tours/tourPrerequisites.ts`: the `settings-open` satisfier selects the bound widget (reuse `widget-selected`), flips it to settings through the same path as `widget.settings-opener` (`DraggableWindow.tsx:2932-2938`), and switches to the tab that renders the field (`perField` refs carry `#fieldKey`; resolve the tab from the widget's settings schema). Undo closes the drawer.
- **Scroll:** once the anchor resolves inside the drawer's scroll container (`SettingsDrawer.tsx:602-609`), wait for the flip transition to end, then scroll the container so the anchor is centred (`scrollTo` with smooth behaviour; instant under reduced motion), and pulse the spotlight once. This replaces the one-shot `scrollIntoView` for drawer anchors only.
- **Lifetime (D7):** the runner keeps the drawer open when the next step's anchor is in the same widget's drawer, and closes it otherwise. Back into a drawer step re-runs the satisfier.
- **Tour Health:** `needs-panel` (`components/tours/tourHealth.ts:106-136`) no longer flags `settings.*` anchors that carry `settings-open`.
- **Gl-author skill:** `.claude/skills/gl-author/references/live-tour.md` stops telling authors to add a gear-click step before settings steps.
- **Tests:** the satisfier opens the right widget's drawer and tab; the anchor ends centred after the flip; consecutive drawer steps don't close and reopen it; leaving the drawer closes it; teardown restores the closed state.

### PR 3: Tethered tip and top bar (needs PR 2 for the drawer states in the harness)

- Split the inline callout out of `LiveTourRunner.tsx` into `components/tours/TourTip.tsx` and `components/tours/TourBar.tsx`. The runner keeps state and passes props.
- **Tip:** title, step text, **Show me**, **Autopilot this step** (disabled with a tooltip until PR 5 wires it), and the "looking" status. An arrow points at the target; extend `calloutPlacement.ts` to return the arrow side and offset. Keep the obstacle and resize handling and the misclick shake.
- **Bar:** progress ("Step N of M" plus a thin progress track), Back, Next/Done, Retry when missing, Autopilot switch (placeholder until PR 5), read-aloud, Exit. Draggable by a grip, position in localStorage (`spart_tour_bar_pos`), clamped to the viewport, at `Z_INDEX.tour`, marked `data-tour-obstacle`. Share the drag helper with `TourRecorder.tsx` rather than copying it.
- **Accessibility:** heading focus moves to the tip on each step as today. The bar is a `role="toolbar"` with an accessible name; the `aria-live` announcer is unchanged; Esc behaviour is unchanged.
- **Harness:** `/live-tour-views-dev` (DEV only, like the other `*-views-dev` pages) renders the tip and bar against fake anchors: plain step, anchored step, drawer step, missing anchor, Autopilot running, Autopilot blocked ("You click this one"), confirm prompt.
- **Design pass (D15):** run `impeccable` over the harness, send Paul screenshots, and fold in the fixes before merging.
- **Tests:** the tip arrow side follows placement; the bar never overlaps the tip; the bar position persists and clamps; every former callout control is reachable from the tip or bar.

### PR 4: Recorded toggle, select and typed values

- `types.ts`: widen `GuidedLearningTourBinding.action` and add `value` (data model above). Update every `switch`/check on `action` so the new kinds are treated as `click` for completion until PR 5 (a `toggle` step advances on a click of the anchor, as today).
- **Recorder (`components/widgets/GuidedLearning/components/recorder/useTourCapture.ts`, `buildRecordedSet.ts`):**
  - A click on a `settings.toggle` anchor (or any `role="switch"` / checkbox) records `toggle` with the state **after** the click.
  - A change on a `<select>` or a listbox option records `select` with the chosen value.
  - Typing into an input or textarea records one `type` step per field on blur, with the final text. Inputs marked `data-pii` are never captured: record `type` with an empty value and a Studio warning.
- **Studio step editor:** for `toggle`, an On/Off control; for `select`, the recorded value as text; for `type`, an editable "Autopilot types:" field. Authors can change a step's action between the compatible kinds.
- **Tour Health:** warn when a `type` value matches a name in any roster the author can see (reuse the recorder's roster matcher), and when a `type` step has an empty value.
- **Gl-author skill:** document the new actions and `value` in `SKILL.md` and `references/live-tour.md`, replacing the advice to use `observe` for typing and toggles.
- **Tests:** the recorder emits each kind with the right value; `data-pii` inputs are never captured; old sets load unchanged; the roster-name warning fires.

### PR 5: Autopilot (needs PR 3 and PR 4)

- **Performing steps (`components/tours/autopilot.ts`):**
  - `click`: `dispatchAutoClick`, as today.
  - `toggle`: click only if the current state differs from `value`; read it from `aria-checked` / `checked`.
  - `select`: open and choose the option for custom listboxes; for a native `<select>`, set the value through the React-safe native setter and dispatch `input` and `change`.
  - `type`: focus, clear, then type character by character (about 35ms each, instant under reduced motion) through the native value setter with `input` events, then `change` and blur.
  - `observe`: nothing to perform; Autopilot reads the step and moves on after the reading timer (`LiveTourRunner.tsx:983-991`).
- **Completion:** add a value check for `toggle`, `select` and `type` steps so the tour also advances when the **teacher** sets the right value, not only on a click.
- **Per-step button:** **Autopilot this step** in the tip glides the cursor, performs the step with a press ripple, waits for the next anchor (`waitFor`, as autopilot does today), and advances. It's hidden on `observe` steps.
- **Whole-tour switch:** the bar's Autopilot switch. Its start value comes from `set.mode === 'guided'`. It replaces Pause/Resume/Take over (`takenOver`, `paused` in the runner). Turning it off mid-step lets the teacher finish the step.
- **Policy (D12, D13):** add `TourAutopilotPolicy` and `GuidedLearningGlobalConfig.tourAutopilotPolicy`, the dropdown in `GuidedLearningConfigurationPanel.tsx` with one line of help per option, and read it once at tour start. `teacherMustClick` (`components/tours/tourSession.ts:199-204`) takes the policy:
  - `tour-safe`: block `destructive`, `persists`, fallback-only anchors, and an explicit `teacherMustClick`.
  - `destructive-only`: today's rule.
  - `confirm`: never block; before a `destructive` or `persists` anchor, the tip asks "Autopilot will <label>. Go ahead?" with **Do it** / **I'll do it**.
  - A blocked step stops the cursor on the target and the tip says "You click this one". Under the whole-tour switch, Autopilot waits there and resumes after the teacher's click.
- **`persists` audit (D14):** add `persists?: true` to `TourAnchorDef`, tag the ids in `TOUR_ANCHORS` that assign, share, publish, or change board or account settings, and list every tagged id in the PR description. Extend `tests/tourAnchors.test.ts` with the name check, and add `persists` to the `new-widget` checklist and `components/widgets/CLAUDE.md`.
- **Tests:** each action kind is performed and skipped when already in the target state; native and custom selects; typed text fires React's `onChange`; each policy blocks or confirms the right anchors; the switch's start follows `mode`; turning the switch off mid-step hands control back; a teacher's correct toggle advances a `toggle` step.

## PR descriptions must say

- Feature flag: `gl-live-tours`, access level `admin`. Admin path: Admin Settings > Access > Previews > Live tours. Admins always pass it.
- PR 3: the harness screenshots before and after the design pass.
- PR 5: the full list of anchors tagged `persists`, and where the Autopilot policy lives (Admin Settings > Widgets > Guided Learning), defaulting to `tour-safe`.

## Open verification (after merge)

- On spartboard-dev with a busy board: start a tour, confirm every widget leaves and the tour widgets land where recorded; open a widget mid-tour; pick **Put my board back** and confirm the board is unchanged; repeat with a reload mid-tour.
- Run a tour whose step targets a toggle near the bottom of a widget's settings: the drawer opens on the right tab with the toggle centred.
- Try each Autopilot policy from the GL admin config on a tour with an assign or share step.
- Record a tour that types into a field and sets a toggle and a select, then play it with the Autopilot switch on.
