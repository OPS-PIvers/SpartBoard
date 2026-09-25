# Live Tours v2: unmapped-anchor pipeline, top toolbar, recorded widget layout, sturdier playback

Follow-up to Phase 3 of `docs/plans/GUIDED_LEARNING_STUDIO.md` (recorder and live tours). It covers three areas:

1. Unmapped anchors are saved, queued and exposed to a Claude Code routine that opens PRs to tag them.
2. The recording toolbar moves to the top of the screen.
3. Tours reproduce the recorded widget layout, and playback stops fighting the teacher's board.

Scope was settled in a design interview with Paul on 2026-09-25. This document is the contract. Each PR is self-contained: an implementer should be able to build it from the PR text plus the code, without this conversation.

**Code references** were taken at `dev-paul` commit `0154b46c8`. Symbol names are authoritative and line numbers are hints; if a line number is off, grep for the symbol. Do not stop to report line drift.

**Release:** everything user-facing is already behind `gl-live-tours` (`types.ts` `GlobalFeature`, `config/featureDefaults.ts:271`, admin-only, `missingDocPublic: false`). No new flag. The endpoint, trigger and routine are internal tooling and exempt from the flag rule. No `public/changelog.json` entry until Paul opens `gl-live-tours` to everyone.

Out of scope: opening live tours beyond admins, live tours in the student app, and AI placement of recorded steps.

## Why

- **Untagged clicks lose most of their data.** When the author clicks an element with no `data-tour` anchor, `resolveRecordedAnchor` (`components/widgets/GuidedLearning/components/recorder/resolveAnchor.ts:31-58`) returns `anchor: ''`, `untagged: true`, a `suggestedId` and a `{ role, name }` fallback. `buildRecordedSet.ts:27-37` drops `untagged` and `suggestedId`. The only list of untagged clicks is on the post-recording review screen, one frame at a time (`FrameReview.tsx:280-313`). Nothing outside the tab can see them.
- **Empty-anchor steps never spotlight.** `useAnchorElement.ts:45` and `:101` return `IDLE` when `anchor` is empty, so the saved fallback is never tried, even though `findTourAnchor` supports it (`components/tours/resolveTourAnchor.ts:85-93`). The step shows a centered callout that can only be skipped.
- **The toolbar is in the dock's way.** `TourRecorder.tsx:51` pins it at `fixed bottom-4 left-1/2`, on top of the default dock (`Dock.tsx:807-813`, `bottom-6`).
- **Recordings save only widget types.** `RecordingSession.tsx:61-68` snapshots `tourSetup.widgets` as types. `LiveTourRunner.tsx:125-142` calls `d.addWidget(type)` with no overrides, so every widget opens at 50,80 at its default size (`DashboardContext.tsx:5501-5567`). Several setup widgets stack on the same spot, and the last one covers the others' anchors.
- **Playback writes to the teacher's real board.** Tour widgets autosave immediately, with no tour marker. Closing the tab mid-tour leaves them on the board.
- **Board switches remove the wrong widgets.** `addedWidgetIds` (`tourSession.ts:28-35`) diffs by type against the original board's ids. If the teacher switches boards and picks Remove, the teacher's own widgets on the new board are deleted (`removeWidgets` acts on the active board, `DashboardContext.tsx:5832-5842`).
- **Unusable anchors are still spotlighted.** Collapsed-dock icons (`Dock.tsx:1035-1045`), minimized widgets (`DraggableWindow.tsx:2294-2295`), `display:none` elements (0×0 at the top-left) and anchors panned off-screen all get a cutout. The widget toolbar only renders while the widget is selected (`DraggableWindow.tsx:3031`). The search gives up after `ANCHOR_SEARCH_MS = 3000` (`useAnchorElement.ts:68-70`).
- **The wrong widget can be picked.** `widget.*` and `settings.*` anchors are recorded without a type, and `findTourAnchor` falls back to `tagged[0]` (`resolveTourAnchor.ts:78-83`). With two widgets on the board, "Timer settings" can land on the Clock.
- **The callout ignores surrounding UI.** `placeCallout` knows only its target and the viewport (`LiveTourRunner.tsx:299-305`), and nothing listens for window resize. The callout never takes focus, steps aren't announced to screen readers, and Esc does nothing on the teardown and practice-offer dialogs (`LiveTourRunner.tsx:262-280`, `381-386`).

## Corrections after a code re-check (2026-09-25, `f727e8917`)

The Why list above came from an older read. These items are already done or differ, so do not rebuild them:

- **Empty-anchor fallback is done.** `useAnchorElement` searches role + name when `anchor` is empty and is tested (`useAnchorElement.test.tsx`, "goes straight to the fallback"). PR 1 ships the toolbar only.
- **The MutationObserver already keeps watching** after `ANCHOR_SEARCH_MS`; only `missing` is published. PR 5 adds `isUsable` (opacity, `pointer-events`, viewport) on top of `isAnchorVisible`.
- **The type-diff `addedWidgetIds` is gone.** Teardown removes exact claimed ids (`claimTourWidgets`, `tourWidgetIds` in `tourSession.ts`). Two gaps remain for PRs 4/5: claims still match by type against the old board's `beforeIds`, so a board switch can claim the teacher's widget, and nothing watches the active board id.
- **The live region exists** ("Step N of M"). PR 5 still owes heading focus on every step (click steps included), the dialog focus trap and Esc on teardown and practice-offer, and skipping cursor autoplay (`playCursor(true)`, the hint `cursorCue`) under reduced motion.
- **The dim and cutout already follow resize** (`TourSpotlight`); only the runner's callout `viewport` goes stale.
- **`addWidget(type, overrides)` already takes layout overrides** (`AddWidgetOverrides`), but returns `void` and always records history, so `addTourWidget` still needs its own path that returns the id.
- **`widget.*` and `settings.*` anchors never carry `data-tour-widget-type`**, so no `:type` is recorded today; PR 4 must add `tourTypeAttr` (or the slot) at those call sites.

## Product decisions (settled — do not re-litigate)

| #   | Decision                   | Answer                                                                                                                                                                                                                                                                                                                                                                                                        |
| --- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Unmapped pipeline          | Firestore queue **and** a private endpoint for a Claude routine **and** a "Copy all" button as the manual fallback.                                                                                                                                                                                                                                                                                           |
| D2  | What to capture            | Structural context, text only: nearest tagged ancestor, ancestor chain (tag, `data-testid`, `aria-label`, `role` per level, capped), widget type, pathname, a trimmed `outerHTML` excerpt, plus role, name and `suggestedId`. Redacted with the recorder's roster matcher and `data-pii`. **No screenshots in the queue.**                                                                                    |
| D3  | Empty-anchor fallback      | Fixed. Empty-anchor steps resolve through role + name.                                                                                                                                                                                                                                                                                                                                                        |
| D4  | Recording toolbar          | Top-center by default, clear of the Sidebar pill. Draggable by a grip; position remembered per browser in localStorage and clamped to the viewport.                                                                                                                                                                                                                                                           |
| D5  | When layouts are captured  | At record start for every widget on the board, **and** for any widget the author opens during recording.                                                                                                                                                                                                                                                                                                      |
| D6  | What is reproduced         | Size **and** position: `xProp/yProp/wProp/hProp` plus `aspectRatio`. The existing `propToPixel` and `WIDGET_STRETCH_BEHAVIOR` handle other screen shapes.                                                                                                                                                                                                                                                     |
| D7  | Config carried by the tour | Only keys in `APPEARANCE_CONFIG_KEYS` (`utils/widgetConfigPersistence.ts`). Content never travels.                                                                                                                                                                                                                                                                                                            |
| D8  | Teacher already has one    | Temporarily move and resize it to the tour layout, then restore it exactly on end, skip or exit.                                                                                                                                                                                                                                                                                                              |
| D9  | Endpoint auth              | Bearer secret `TOUR_ANCHOR_API_TOKEN` via `defineSecret` in `functions/src/secrets.ts`, compared with `timingSafeEqual`. GET open items, POST resolutions. Nothing else.                                                                                                                                                                                                                                      |
| D10 | What wakes the routine     | A Firestore create trigger on a recording batch calls the routine's API trigger **once per recording**, and a nightly cron run of the same routine catches anything missed. Both are idempotent.                                                                                                                                                                                                              |
| D11 | Projects                   | The endpoint is deployed to `spartboard` and `spartboard-dev`, each with its own token. One routine reads both and dedupes by fingerprint.                                                                                                                                                                                                                                                                    |
| D12 | Rebinding steps            | The routine POSTs `{ anchorId, prUrl }`. Tour Health shows "Rebind N steps" only when the **running build's** `TOUR_ANCHORS` contains that id, i.e. it is deployed to that project. One click writes the anchor into every affected step. Never automatic.                                                                                                                                                    |
| D13 | PR grouping                | Items are deduped by fingerprint (widget type + pathname + ancestor chain + name), each with a list of the places it was clicked. One PR per routine run against `dev-paul`, branch `claude/tour-anchors-<date>`. The routine skips items already in an open PR, and marks items it can't place as `needs-human` with a reason.                                                                               |
| D14 | Mid-recording moves        | If a widget's props change between steps, the new layout is saved as a keyframe on the next step. The runner applies it when that step starts, only for widgets the author changed.                                                                                                                                                                                                                           |
| D15 | Existing tours             | A Studio "Capture board layout" button writes the current board's layouts into the tour setup. Tours with no layout keep today's default-size behaviour.                                                                                                                                                                                                                                                      |
| D16 | Persistence during a tour  | A transient tour layer. Widgets the tour adds are flagged transient and left out of autosave and undo history until the teacher picks **Keep**. Temporary resizes of the teacher's widgets are local overrides in the canvas store and are never written. Closing the tab leaves the board exactly as it was.                                                                                                 |
| D17 | Board switch mid-tour      | Ends the tour: transient widgets are discarded and overrides dropped. Teardown uses the exact ids the runner created, never a type diff.                                                                                                                                                                                                                                                                      |
| D18 | Unusable anchors           | Anchors declare a prerequisite in `config/tourAnchors.ts` (`dock-expanded`, `widget-selected`, `widget-restored`, `in-view`). The runner satisfies it before spotlighting. A visibility check (non-zero size, not `opacity:0`, not `pointer-events:none`, inside the viewport) replaces the plain selector hit. The runner keeps watching with a `MutationObserver` after the 3s window instead of giving up. |
| D19 | Several of a type          | The recorder always saves the widget type and a **slot** index (which setup or spawned widget it was). The runner binds each slot to the exact widget it placed or temporarily resized.                                                                                                                                                                                                                       |
| D20 | Callout                    | The Dock (any position), Sidebar pill and both FABs are passed to `placeCallout` as obstacles. A resize listener keeps the dim and cutout correct. The anchor's widget is raised to the front (a transient z) when a step starts.                                                                                                                                                                             |
| D21 | Accessibility              | Focus moves to the callout on each step. Step changes are announced through a live region. The teardown and practice dialogs trap focus, set initial focus and close on Esc. The cursor doesn't autoplay under `prefers-reduced-motion`.                                                                                                                                                                      |
| D22 | Queue UI                   | A new "Unmapped anchors" section in Admin > Help Center > Tour Health: status, where it was clicked, PR link, "Copy all", "Rebind". Frame Review gets "Copy all" too.                                                                                                                                                                                                                                         |
| D23 | Retention                  | Rebound items keep status `rebound`. A monthly scheduled sweep deletes items rebound more than 90 days ago.                                                                                                                                                                                                                                                                                                   |
| D24 | Routine ownership          | The implementer writes `docs/routines/tour-anchor-mapper.md` and creates the routine with `/schedule` (API trigger + nightly cron). Paul sets the secret values.                                                                                                                                                                                                                                              |

## Data model

### Queue: `tour_anchor_queue/{fingerprint}` (per project)

```ts
type TourAnchorQueueStatus =
  | 'open'
  | 'pr-open'
  | 'mapped'
  | 'rebound'
  | 'needs-human';

interface TourAnchorQueueItem {
  fingerprint: string; // sha-1 of widgetType|pathname|ancestorChain|name, hex
  status: TourAnchorQueueStatus;
  suggestedId: string | null;
  role: string | null;
  name: string | null; // already redacted
  widgetType: WidgetType | null;
  pathname: string;
  nearestAnchor: string | null; // closest [data-tour] ancestor id
  ancestors: Array<{
    tag: string;
    testId?: string;
    ariaLabel?: string;
    role?: string;
  }>; // ≤ 8, innermost first
  htmlExcerpt: string; // redacted outerHTML, ≤ 2 KB, attributes whitelisted
  occurrences: Array<{ setId: string; stepId: string }>; // arrayUnion
  anchorId?: string; // set by the routine
  prUrl?: string;
  reason?: string; // for needs-human
  firstSeenAt: Timestamp;
  updatedAt: Timestamp;
  reboundAt?: Timestamp;
}
```

### Batch: `tour_anchor_batches/{batchId}`

`{ setId, fingerprints: string[], createdAt }`. It is written once per saved recording that has at least one untagged step, and exists only to fire the trigger. It's pruned by the same monthly sweep.

**Rules:** both collections are admin read and write (`isAdmin()`), matching `building_guided_learning` writes at `firestore.rules:1009-1012`. The endpoint uses the Admin SDK and needs no rule. The compiled rules file is already at its 250 KB cap, so keep the new blocks minimal and run `node scripts/releaseFirestoreRules.mjs spartboard-dev` before merging.

### Tour layout: additions to `types.ts`

```ts
interface TourWidgetLayout {
  slot: number; // stable index within the tour
  type: WidgetType;
  xProp: number; yProp: number; wProp: number; hProp: number;
  aspectRatio?: number;
  appearance?: Partial<Record<AppearanceConfigKey, unknown>>; // APPEARANCE_CONFIG_KEYS only
}

// tourSetup gains:
layouts?: TourWidgetLayout[]; // setup widgets, present from record start

// GuidedLearningTourBinding gains:
slot?: number; // widget-scoped anchors
spawns?: TourWidgetLayout; // this step's action opens a widget
layoutKeyframes?: Array<Pick<TourWidgetLayout, 'slot' | 'xProp' | 'yProp' | 'wProp' | 'hProp'>>;
unmapped?: string; // queue fingerprint, cleared on rebind
```

Everything is optional. Existing sets play unchanged: no `layouts` means today's `addWidget(type)`.

## PRs

All five PRs target `dev-paul`. PR 1 can start now. PRs 2 and 4 are independent. PR 3 needs PR 2. PR 5 needs PR 4.

### PR 1: Toolbar at the top, plus the empty-anchor fallback

- `TourRecorder.tsx`: replace `bottom-4` with a top position (`top-4`, plus a safe-area inset). Add a grip handle that drags the pill with pointer events, clamped to the viewport. Store `{x, y}` in localStorage under `spart_tour_recorder_pos`, wrapped in try/catch. Double-clicking the grip resets it. The pill keeps `data-tour-ignore`, so its clicks are never captured, and it stays hidden during frame grabs.
- `useAnchorElement.ts`: when `anchor === ''` and a `fallback` exists, resolve through `findTourAnchor` instead of returning `IDLE`. Fix the stale comment at `resolveAnchor.ts:5`.
- **Tests:** `TourRecorder.test.tsx` (drag, clamp, persisted position); a `LiveTourRunner.test.tsx` case where an empty-anchor step spotlights its role + name match.

### PR 2: Capture context, the queue, Tour Health UI, copy

- `resolveAnchor.ts`: for untagged clicks, also return `ancestors`, `nearestAnchor`, `widgetType` (nearest `data-tour-widget-type` or window type) and `htmlExcerpt`. The excerpt is cloned and stripped to whitelisted attributes (`class`, `role`, `aria-*`, `data-testid`, `data-tour*`, `type`, `title`), then text is redacted with the session's roster matcher (`redaction.ts`) and `[data-pii]` subtrees are removed. Cap it at 2 KB.
- `buildRecordedSet.ts`: keep `tour.unmapped = fingerprint` on the step. Return a list of queue items alongside the set.
- On save (`RecordingSession` → `saveBuildingSet`), write the queue items with a batched `set(..., { merge: true })`: `arrayUnion` the occurrences, and don't downgrade a non-`open` status. Then write one `tour_anchor_batches` doc.
- Studio saves that delete a step remove its occurrence from the queue item.
- Tour Health (`TourHealthPanel.tsx`): add an "Unmapped anchors" section that reads `tour_anchor_queue` with status chips, occurrences linking to "Open in Studio", the PR link, and a reason for `needs-human`.
  - **Copy all** copies a Markdown block with one entry per open item, containing every captured field and a one-line instruction ("Register an id in `config/tourAnchors.ts` and tag the element with `tourAttr`").
  - **Rebind**: for items whose `anchorId` is present in the runtime `TOUR_ANCHORS`, the button writes `tour.anchor` (with `:type` where the anchor is scoped) into each affected step. It clears `tour.unmapped` and sets status `rebound` plus `reboundAt`. Items with an `anchorId` that isn't in the registry yet show "Waiting for deploy".
- `FrameReview.tsx`: add a "Copy all" button beside the per-frame list, using the same formatter.
- Rules for both collections. Run the rules release check.
- **Tests:** the resolveAnchor context and redaction (a roster name inside the excerpt is removed), fingerprint stability, the queue merge, the copy formatter, and the rebind gating on the registry.

### PR 3: Endpoint, trigger, routine (needs PR 2)

- `functions/src/secrets.ts`: add `TOUR_ANCHOR_API_TOKEN` and `CLAUDE_TOUR_ROUTINE_TRIGGER_TOKEN`, plus the routine trigger URL as a secret or param.
  - **Both secrets must exist in `spartboard` and `spartboard-dev` before this merges**, or the dev deploy fails. Paul sets the values.
- `functions/src/tourAnchorApi.ts`: `onRequest` with `invoker: 'public'` and no CORS. It checks `Authorization: Bearer` with `crypto.timingSafeEqual` over equal-length buffers, and returns 401 otherwise. It adds an `X-Request-Id` like `adminAnalyticsEndpoint.ts`.
  - `GET /` returns items with status `open`, and `pr-open` older than 7 days so abandoned PRs are retried, capped at 50.
  - `POST /resolve` takes `[{ fingerprint, status: 'pr-open' | 'needs-human', anchorId?, prUrl?, reason? }]`, validates each against the enum and the fingerprint format, and writes only those fields.
  - The routine never reads or writes anything else.
  - `pr-open` → `mapped` happens in the client: Tour Health treats `pr-open` plus an `anchorId` in the registry as mapped.
- `functions/src/tourAnchorBatchTrigger.ts`: `onDocumentCreated('tour_anchor_batches/{batchId}')` POSTs to the routine's API trigger with `{ project, batchId }`. It's safe to run twice because the routine re-reads the queue; failures are logged, not retried, since the nightly run is the backstop. Follow the shape of `rolloutRequestEmail.ts`, with a builder exported for tests.
- Add a monthly `onSchedule` sweep to delete `rebound` items older than 90 days and batch docs older than 90 days. Fold it into an existing scheduled module if one fits.
- `docs/routines/tour-anchor-mapper.md` holds the routine prompt and journal:
  1. GET both projects and dedupe by fingerprint.
  2. Check open `claude/tour-anchors-*` PRs and skip items already in one.
  3. For each item, locate the element with `nearestAnchor`, `ancestors`, `htmlExcerpt` and `widgetType`. Add an id to `TOUR_ANCHORS` using the existing naming (`area.thing`, `perWidget`/`perWidgetType` as appropriate). Tag it with `tourAttr`/`tourTypeAttr`, and add a `requires` prerequisite if PR 5 has landed.
  4. Run `pnpm exec vitest related --run tests/tourAnchors.test.ts <touched files>`.
  5. Open one PR against `dev-paul` listing every mapped item, then POST `pr-open` with `anchorId` and `prUrl`, or `needs-human` with a reason, to each project.
  6. Follow CLAUDE.md verification limits: no full lint, test or tsc.
- Create the routine with `/schedule`: an API trigger (its token becomes `CLAUDE_TOUR_ROUTINE_TRIGGER_TOKEN`) plus a nightly cron. The routine's environment holds each project's `TOUR_ANCHOR_API_TOKEN` and endpoint URL.
- **Tests:** endpoint auth (a missing, wrong or different-length token all return 401), GET filtering, POST validation, the trigger payload builder, and the sweep query.

### PR 4: Recorded layout, transient tour layer, slots, keyframes, Studio backfill

- **Recording:**
  - At record start, `RecordingSession` snapshots `layouts` from the active board. Slots are assigned in z-order, with appearance filtered through `APPEARANCE_CONFIG_KEYS`.
  - During recording, a board subscription detects new widgets (id not seen before) and attaches `spawns` to the step whose capture preceded the add, with a new slot.
  - At each step capture, any slotted widget whose props changed since the last step gets a `layoutKeyframes` entry on that step.
  - Widget-scoped anchors (`perWidget` or `perWidgetType`) always record `:type` and `slot`. Resolve the slot from the clicked element's `data-tour-widget` id through the session's id→slot map.
- **Transient layer:**
  - Add a runner-only path in `DashboardContext` (exposed through `DashboardActionsContext`): `addTourWidget(type, layout)` creates the widget with `transient: true` from the layout props and appearance, raised to the front. It's excluded from the autosave serializer and from history.
  - `commitTourWidgets(ids)` clears the flag and saves (Keep). `discardTourWidgets(ids)` removes them without history.
  - Temporary moves of the teacher's own widgets go through a `tourLayoutOverrides` map in `context/dashboardCanvasStore.ts`. `WidgetRenderer` applies it over props and it is never persisted. `clearTourLayoutOverrides()` restores.
  - A defensive load-time strip drops any widget with `transient: true`, in case of a crash between flag and save.
- **Runner:**
  - `runSetup` uses `addTourWidget` for missing slots and overrides for existing widgets of that type. It keeps a `slot → widgetId` map; the first unbound existing widget of the type wins.
  - `spawns`: when the step's action produces a new widget of that type, apply the layout as an override (the teacher opened it, so it isn't transient).
  - Keyframes apply as overrides at step start.
  - `findTourAnchor` takes the slot map, so scoped anchors resolve to the bound widget id.
  - Teardown: "Keep" commits the transient widgets, and "Remove", Exit, skip and unmount discard them. Every path clears overrides.
  - `tourSession.addedWidgetIds` is deleted in favour of the exact-id list.
- **Studio:** a "Capture board layout" action in the tour setup section overwrites `tourSetup.layouts` from the current board and confirms first.
- **Tests:** the transient widget is absent from the autosave payload and history; unmount discards it; Keep saves it; overrides never reach Firestore and are cleared on end; slot binding picks the right widget with two of a type; keyframes apply; legacy sets with no layouts still call `addWidget(type)`.

### PR 5: Runner robustness: prerequisites, visibility, board switch, callout, a11y (needs PR 4)

- `config/tourAnchors.ts`: add an optional `requires?: 'dock-expanded' | 'widget-selected' | 'widget-restored' | 'in-view'`. Tag the existing ids that need one: the dock items, the widget toolbar ids, and the settings ids that need the panel open.
  - Extend `tests/tourAnchors.test.ts` to check the value is valid, and add `requires` to the new-widget checklist (`new-widget` skill and `components/widgets/CLAUDE.md`).
- `components/tours/tourPrerequisites.ts`: one small satisfier per prerequisite.
  - `dock-expanded`: expand the dock through its existing action.
  - `widget-selected`: select the bound widget.
  - `widget-restored`: un-minimize it as a tour override, restored on end.
  - `in-view`: pan the camera so the element is on screen, and `scrollIntoView({ block: 'nearest' })` for scrolled containers.
  - Each satisfier is undone on teardown unless the teacher interacted.
- `useAnchorElement.ts`: add an `isUsable(el)` check (rect > 0, computed opacity > 0.05, `pointer-events` not `none`, intersects the viewport). An unusable match counts as searching, not found. After `ANCHOR_SEARCH_MS`, show "missing" with the slide preview but keep a `MutationObserver` running so the anchor resolves the moment it appears.
- **Board switch:** the runner watches the active board id and ends the tour on change: discard transient widgets, clear overrides, and show no keep/remove prompt.
- **Callout:** `calloutPlacement.ts` accepts `obstacles: Rect[]`. The runner collects the Dock, Sidebar pill and FAB rects through new `data-tour-obstacle` markers rather than class selectors. Add a `resize` listener that re-renders the dim, cutout and callout. At step start, raise the bound widget with a transient z override.
- **Accessibility:**
  - Focus the callout heading on each step change.
  - A visually hidden `aria-live="polite"` region announces "Step N of M: <title>".
  - The teardown and practice-offer dialogs get a focus trap, initial focus and Esc (Esc = Keep on teardown, which is non-destructive).
  - Skip cursor autoplay under `prefers-reduced-motion`.
- **Tests:** each prerequisite; unusable anchors are ignored; a late anchor resolves after 3s; switching boards discards and never removes the teacher's widgets; `calloutPlacement` avoids obstacles; the resize listener; focus moves on step change; Esc on teardown; no autoplay under reduced motion.

## PR descriptions must say

- Feature flag: `gl-live-tours`, access level `admin`. Admin path: Admin Settings > Access > Global Settings > Live tours. Admins always pass it.
- PR 3: which secrets must be set in both projects, and that Paul sets them.
- PR 2: the result of the `releaseFirestoreRules.mjs spartboard-dev` check.

## Open verification (after merge)

- Record a tour on dev with an untagged click. Confirm the queue item, the trigger firing the routine, the routine's PR, and "Rebind" appearing after the dev deploy.
- Play a tour with two Timers already on the board. Confirm the right one is resized and restored, and that closing the tab mid-tour leaves the board unchanged.
