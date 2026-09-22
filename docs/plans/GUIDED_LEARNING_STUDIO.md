# Guided Learning Studio — real-player editor, calmer player, recorder and live tours

Rebuilds Guided Learning (GL) authoring and playback in three phases:

1. A full-screen **Studio** whose canvas is the actual player, with regions, pinned callouts, precision tools and inline text.
2. A **player** with Watch/Try playback, an animated cursor, calmer motion, read-aloud and step analytics.
3. A **recorder** that captures a walkthrough on a demo board once and produces both a screenshot lesson and a **live in-app tour**.

Scope was settled in a design interview with Paul on 2026-09-22. This document is the contract. Every item is self-contained: an implementer should be able to build it from the item text plus the code, without this conversation. Paul orchestrates delegation from a Claude project, so each item names its dependencies explicitly.

Out of scope: opening GL beyond admins (Paul does this himself through the existing `feature_permissions/guided-learning` doc when he chooses), live tours inside the student app, AI placement of pins on uploaded images, AI critique passes, and a bulk migration of existing sets.

## Why

- The editor only previews spotlight and the pan-zoom frame (`InteractionPreviewOverlay`, `GuidedLearningEditor.tsx:1652-1733`). Tooltips, popovers and banners are not shown on the canvas, and the zoom frame is labelled "approx" because the player's container aspect differs from the canvas.
- Tooltip placement is an enum plus an offset (`types.ts:6918-6921`). Auto placement then clamps the card inside the container (`TooltipInteraction.tsx:91-95`), which can push it over the target. Popovers are always centered and banners always sit at the top, regardless of where the target is.
- Placing a hotspot means aiming a 24px dot at a small UI element with no zoom, no nudge and no undo. Click-to-select and drag share one 4px threshold (`GuidedLearningEditor.tsx:1756-1886`), and overlapping pins cannot be reached.
- Paul only finds a bad placement after playing the activity, which means a round trip back into the editor.
- GL sets are also the Help Center walkthroughs (`building_guided_learning`). They are drafted with the `gl-author` skill from Playwright screenshots, and that skill warns that estimated pins "miss small icons about half the time." Screenshots also go stale when the UI changes.
- In the player, motion can feel too fast and disorienting. There is no outline or resume, no read-aloud, no `aria-live`, and no data on where viewers get stuck (`GuidedLearningPlayer.tsx` has no click tracking; the student app writes only `views` and a final `responses` doc).

## Product decisions (settled — do not re-litigate)

| Decision           | Answer                                                                                                                                                                                                                                                                                       |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fidelity           | The Studio canvas renders the **same stage component** the player uses, not a look-alike overlay. A device-frame switcher renders that stage at the true pixel size of each surface and scales it visually to fit.                                                                           |
| Guiding principle  | The default path costs no extra effort; precision is opt-in. The feature should eventually be smooth enough to open to all teachers.                                                                                                                                                         |
| Hotspot model      | **Click** places a pin exactly as today, and its callout auto-places so it does not cover the pin. **Click-and-drag** draws a rectangle region instead. **Dragging a callout** pins it; "Reset to auto" unpins it. Existing sets play unchanged.                                             |
| Editor shell       | Full-screen Studio: slide filmstrip (left), device-framed canvas (center), properties panel (right), step timeline (bottom). "Play from here" runs the real player in the frame.                                                                                                             |
| Text editing       | Double-click a callout on the canvas to edit its text in place. The properties panel edits the same text. Supported formatting: `**bold**` and `[text](https://…)` links only.                                                                                                               |
| Precision tools    | Arrow-key nudge (Shift for larger steps), canvas zoom and pan, undo/redo, snapping, select separate from drag, cycle through overlapping hotspots.                                                                                                                                           |
| Playback           | A learner-side **Watch / Try** toggle. Watch: an animated cursor glides to each target, clicks with a ripple, the camera eases to follow, and steps auto-advance with a scrubber. Try: the learner clicks the target themselves; the cursor appears as a hint after about 5s of no progress. |
| Pacing             | Calmer eased defaults (glides of about 600–900ms), a learner speed control (0.5× / 1× / 1.5×), a minimum duration authors cannot go below, and `prefers-reduced-motion` reduces all motion to cuts and fades.                                                                                |
| Audio              | Browser text-to-speech toggle for learners (free, instant) **and** optional generated narration per step, using Google Cloud TTS.                                                                                                                                                            |
| Analytics          | Keep the share link and view counting. Add step drop-off, a Try-mode misclick/stuck heatmap, and a Watch vs Try split.                                                                                                                                                                       |
| Live tours         | Folded into GL. **Record once, get both**: one recording produces a screenshot lesson and a live tour. In a live tour the learner performs each action and the tour waits; the tour adds any widgets it needs before starting.                                                               |
| Tour anchors       | Stable `data-tour="…"` attributes from a typed registry, with a fallback to role + accessible name. A CI test fails if a registered anchor is no longer rendered in source. Tagging key controls is part of the new-widget checklist, and the recorder warns about untagged clicks.          |
| Tour launch points | Help Center ("Show me live"), the widget settings `?` button, first-run onboarding offers, and What's New entries.                                                                                                                                                                           |
| Students           | Always get the screenshot version. Live tours are teacher-facing only.                                                                                                                                                                                                                       |
| Recording privacy  | The recorder only runs on a **demo board** with fake classes and students. Real student data cannot appear in a capture.                                                                                                                                                                     |
| AI                 | Draft step text after a recording. Keep the `gl-author` skill writing the current schema. No AI pin placement or critique in this plan.                                                                                                                                                      |
| Migration          | Existing sets play unchanged. Opening a set in the Studio and saving it stamps the new schema version; the new fields are additive. No bulk migration.                                                                                                                                       |
| Access             | Stays admin-gated through the existing permissions doc. Nothing in this plan changes access.                                                                                                                                                                                                 |

## Constraints discovered in code (do not re-derive)

| Fact                                                                                                                                                                                                                                                                                                                                                                            | Where                                                                                                                                                                                                        | Consequence                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Player props are `{ set, onClose?, onAnswer?, teacherMode?, timeMultiplier? }`. It casts `set.steps` to `GuidedLearningPublicStep[]` and has no edit hooks.                                                                                                                                                                                                                     | `GuidedLearningPlayer.tsx:66-79, 105`                                                                                                                                                                        | P1-2 extracts a stage that both the player and the Studio render.                                                                            |
| The player renders in four places with different containers: widget (`relative h-full w-full`, any aspect, registry `720×520` default, `skipScaling`), Manager preview (16:9, `containerType: size`), Help Center viewer (16:9, or `h-full` fullscreen, `containerType: size`), and the student app (`h-dvh`, **no `containerType`**, so cq units fall back to viewport units). | `Widget.tsx:1223-1239`, `WidgetRegistry.ts:822-828`, `GuidedLearningManager.tsx:1530-1553`, `components/help/HelpResourceViewer.tsx:78-94`, `components/guidedLearning/GuidedLearningStudentApp.tsx:417-427` | Device presets are defined from these. P1-8 adds `containerType: size` to the student app so all four surfaces follow the same sizing rules. |
| Image letterboxing: `calculateImageFootprint`, `toImageOffset`, `toContainerCoords`, `computePanZoomTranslate` and `computeZoomExtentRect` are shared helpers.                                                                                                                                                                                                                  | `GL/utils/imageUtils.ts`                                                                                                                                                                                     | All new geometry (regions, callouts, cursor) goes through these helpers or siblings in the same file.                                        |
| Overlays sit outside the pan-zoom layer and are mapped through `toRenderedCoords`. Pins sit inside it.                                                                                                                                                                                                                                                                          | `GuidedLearningPlayer.tsx:506-521, 779-979`                                                                                                                                                                  | Regions follow the pins' layer, and callouts follow the overlays.                                                                            |
| Tooltip default offset is 16 in code; the type doc says 12. Auto placement tries below, above, right, left; the fallback clamps into the container.                                                                                                                                                                                                                             | `TooltipInteraction.tsx:43-67, 91-95`, `types.ts:6919`                                                                                                                                                       | P1-1 replaces the placement logic with a region-aware util; P1-8 fixes the doc.                                                              |
| Banner is pinned full-width to the top; popover is centered. Neither is anchored to the hotspot.                                                                                                                                                                                                                                                                                | `BannerInteraction.tsx:19-21`, `TextPopoverInteraction.tsx`                                                                                                                                                  | P1-2 makes both avoid the region (banner flips to the bottom, popover moves off the target).                                                 |
| Every new step field must be mirrored in `toPublicStep` and in `GuidedLearningPublicStep`, or students never receive it.                                                                                                                                                                                                                                                        | `hooks/useGuidedLearningSession.ts:175-228`, `types.ts:7045-7078`                                                                                                                                            | P1-1 does this for all new fields.                                                                                                           |
| `setForPlayer` in the student app mirrors `schemaVersion`, `imageKinds`, `videoTrims`, `hotspotPulse` and `imageTransition`, but not `welcomeEnabled`/`welcomeMessage`.                                                                                                                                                                                                         | `GuidedLearningStudentApp.tsx:401-414`                                                                                                                                                                       | New set-level fields must be added here too.                                                                                                 |
| Schema versions: absent/1 is legacy; 2 means image-relative spotlight radii plus zoom that persists across steps. `GL_SET_SCHEMA_VERSION = 2`. The editor converts legacy radii at load and stamps 2 on save. The importer passes the version through; the `gl-author` validator requires exactly 2.                                                                            | `GL/utils/setMigration.ts`, `GuidedLearningEditorModal.tsx:292-379, 420-427`, `GL/utils/glTransfer.ts:185`, `.claude/skills/gl-author/scripts/validate_gl_json.mjs:31`                                       | v3 is additive (no conversion). The player treats `>= 2` as v2 semantics. The validator must accept 3.                                       |
| Editor state is about 20 `useState` calls in a controller hook, with no reducer and no undo. Autosave uses `useAutosave` (1200ms) with a `draftToken` and `persistDraft`. Both panes are `React.memo` with hand-written comparators.                                                                                                                                            | `GL/components/useGuidedLearningEditorState.ts:46-111, 141-181`, `GuidedLearningEditorModal.tsx:382-470`, `GuidedLearningEditor.tsx:416, 1399`                                                               | P1-3 moves document state into a reducer with history, keeping the controller's public shape so the save path is unchanged.                  |
| Saves: personal sets go to Drive plus Firestore metadata (`saveSet`), building sets to `building_guided_learning` (`saveBuildingSet`, admin only).                                                                                                                                                                                                                              | `hooks/useGuidedLearning.ts:169-203, 294-305`                                                                                                                                                                | The Studio reuses `onSave` exactly as the modal does.                                                                                        |
| The editor modal test replaces both panes with stubs, so the real canvas has no tests. The player test mocks Tooltip, Question and Spotlight.                                                                                                                                                                                                                                   | `GuidedLearningEditorModal.test.tsx:59`, `GuidedLearningPlayer.test.tsx`                                                                                                                                     | New geometry must be pure functions with unit tests. Studio interaction tests use RTL against the real stage.                                |
| `responses` rules allow a student to change only `answers`, `completedAt` and `pin`. `views` allows create only, with keys exactly `['viewedAt']`.                                                                                                                                                                                                                              | `firestore.rules:4525-4617`                                                                                                                                                                                  | Analytics use a new `progress/{uid}` subcollection with its own rules (P2-5), not new response fields.                                       |
| TTS already exists: `@google-cloud/text-to-speech`, `synthesizeQuizAudioV1` / `prepareQuizReadAloudV1`, MP3 cache at `quiz_tts_cache/{voice}/{sha256}.mp3`, Neural2 voices with a Standard fallback past an admin cap.                                                                                                                                                          | `functions/src/quizReadAloud.ts:29-31, 289-294, 578, 616-622, 1361-1406`                                                                                                                                     | P2-4 reuses its helpers. No new secret is needed.                                                                                            |
| AI: Gemini on Vertex via `GoogleGenAI(vertexClientOptions())`. `generateGuidedLearning` is admin-checked on the server with `resolveCallerIsAdmin` and uses `geminiConfig.advancedModel`.                                                                                                                                                                                       | `functions/src/aiGeneration.ts:46-66, 2155-2362`                                                                                                                                                             | P3-3 adds a sibling callable for drafting step text.                                                                                         |
| No tour library and no `data-tour` attributes exist. `IconButton` sets `aria-label` and `title` from translated labels, so labels are unstable across locales.                                                                                                                                                                                                                  | `package.json`, `components/common/IconButton.tsx:92-93`                                                                                                                                                     | Anchors must be `data-tour` IDs; the translated accessible name is only a fallback.                                                          |
| Help opens via `requestOpenHelp({ tab, widgetType })` and the `spart:open-help` event. The widget `?` (`CircleHelp`) appears in `SettingsPanel` and `SettingsDrawer` only when help items exist.                                                                                                                                                                                | `components/help/helpCenterState.ts:10, 23`, `DashboardView.tsx:460-467`, `components/common/SettingsPanel.tsx:261-274`, `components/settings/SettingsDrawer.tsx:506-518`                                    | Tours launch through a sibling event, `spart:start-tour`.                                                                                    |
| `addWidget(type, overrides)` returns void; it gives the widget a `crypto.randomUUID()` id and records undo. It is a no-op on read-only boards. Widgets render with `data-widget-id`.                                                                                                                                                                                            | `context/DashboardContextValue.ts:179`, `DashboardContext.tsx:5416`                                                                                                                                          | Tour setup finds added widgets by diffing `activeDashboard.widgets`.                                                                         |
| Bypass mode runs the whole dashboard on in-memory stores (`MockDashboardStore`, `MockRosterStore`, mock Drive services), but only on localhost with `VITE_AUTH_BYPASS`.                                                                                                                                                                                                         | `hooks/useFirestore.ts:50`, `hooks/useRosters.ts:385`, `config/firebase.ts:39`                                                                                                                               | Demo mode (P3-2) reuses those store classes behind a runtime flag, independent of bypass.                                                    |
| Onboarding progress is stored per board in the onboarding widget config, and "seen" flags use localStorage. `UserProfile` has no tours field, and all writes to it must use `merge: true`.                                                                                                                                                                                      | `components/widgets/Onboarding/Widget.tsx:20-59`, `hooks/useOnboardingDetectors.ts`, `types.ts:8073-8122`                                                                                                    | "Tour offered/seen" flags live in localStorage (P3-5).                                                                                       |
| What's New entries are `{ version, date, title, overview?, details }` in `public/changelog.json`, shown by `WhatsNewModal`.                                                                                                                                                                                                                                                     | `hooks/useChangelog.ts`, `components/layout/WhatsNewModal.tsx`                                                                                                                                               | P3-5 adds an optional `tourSetId`.                                                                                                           |
| The repo's widget checklist skill is `.claude/skills/new-widget/SKILL.md`. `spart-new-widget` comes from Paul's `pauls-skills` plugin in another repo.                                                                                                                                                                                                                          | `.claude/skills/new-widget/SKILL.md:8-35`                                                                                                                                                                    | P3-1 updates the in-repo skill. Paul updates the plugin copy himself (open assumption 6).                                                    |
| Local validation per CLAUDE.md: `pnpm exec vitest related --run <files>`; `pnpm run type-check` at most once per PR; never full `validate`/`lint`/`test` from a subagent. Comments are one short line.                                                                                                                                                                          | `CLAUDE.md`                                                                                                                                                                                                  | Applies to every item.                                                                                                                       |

`GL/` means `components/widgets/GuidedLearning/` below.

## Data model

### Step additions (`GuidedLearningStep` and `GuidedLearningPublicStep`)

```ts
/** Click zone / spotlight / zoom focus. Absent = default circle centred on xPct/yPct. */
region?: {
  shape: 'ellipse' | 'rect';
  /** Size as % of image width / height, centred on xPct/yPct. */
  wPct: number;
  hPct: number;
};
/** Absent = auto placement. Present = callout box centre pinned in image-%. */
calloutPin?: { xPct: number; yPct: number };
/** Watch-mode demonstration override; absent = cursor goes to region centre. */
cursor?: { hide?: boolean };
/** Generated narration (P2-4). */
narration?: { url: string; storagePath: string; voice: string; textHash: string; durationMs: number };
/** Live-tour binding (P3). */
tour?: {
  anchor: string;                 // TOUR_ANCHORS key
  fallback?: { role: string; name: string };
  action: 'click' | 'observe';    // observe = learner presses Next
};
```

- `xPct`/`yPct` stay the canonical anchor, so v2 clients render every v3 set correctly apart from the new visuals.
- **Absent `region` keeps today's behaviour exactly.** The hit target is the pin button itself (`min(32px, 8cqmin)`, container-relative, `GuidedLearningPlayer.tsx:900-930`), and spotlight uses `spotlightRadius`. `effectiveRegion` returns a container-relative circle of that pin size for hit-testing and callout keep-out, so old sets and plain-click hotspots behave as they do now.
- `tooltipPosition`/`tooltipOffset` remain readable. When `calloutPin` is absent and `tooltipPosition` is an explicit side, that side is passed as a preference to the new placement util.

### Set additions (`GuidedLearningSet`, session mirror, `setForPlayer`)

```ts
schemaVersion?: 1 | 2 | 3;
/** Minimum seconds per step in Watch mode; clamped to >= WATCH_MIN_STEP_S. */
watchPace?: 'calm' | 'standard';
/** Live tour prerequisites (P3). */
tourSetup?: { widgets: WidgetType[] };
```

`GL_SET_SCHEMA_VERSION` becomes 3. v2 to v3 needs no conversion: the Studio stamps 3 on save, following the existing rule that a set is stamped only once its spotlight radii are v2 (`GuidedLearningEditorModal.tsx:420-427`). The player keeps v2 semantics for any `schemaVersion >= 2`.

### Analytics (`guided_learning_sessions/{id}/progress/{uid}`, P2-5)

```ts
{
  mode: 'watch' | 'try';           // last mode used
  modeSwitches: number;
  furthestStepIdx: number;
  completed: boolean;
  steps: { [stepId]: { ms: number; misclicks: number; hinted: boolean; clicks?: {x: number; y: number}[] } };  // clicks capped at 20 per step, image-%
  startedAt: Timestamp;
  updatedAt: Timestamp;
}
```

The client writes at most one update every 10s plus once on `pagehide`. Doc id is `auth.uid`. The subcollection works in both assignment modes.

### Tour anchor registry (`config/tourAnchors.ts`, P3-1)

```ts
export const TOUR_ANCHORS = {
  'dock.open-tools': { label: 'Open Tools button in the dock' },
  'widget.settings-opener': {
    label: 'Widget settings button',
    perWidget: true,
  },
  // …
} as const;
export type TourAnchorId = keyof typeof TOUR_ANCHORS;
export const tourAttr = (id: TourAnchorId, widgetId?: string) => ({
  'data-tour': id,
  ...(widgetId ? { 'data-tour-widget': widgetId } : {}),
});
```

## Release gating (per CLAUDE.md "Releasing a feature")

| Surface                                                                                                           | Gate                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Why                                                                                                                                                      |
| ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Studio, recorder, demo mode, tour health (P1-3–P1-7, P3-2, P3-3, P3-6)                                            | None beyond the existing admin gates                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Admin-only tools are exempt.                                                                                                                             |
| Region-aware callout placement and rich text in the player (P1-2)                                                 | None                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Bug fix: callouts covering their target is unintended behaviour. New visuals only appear for sets that use the new fields, which only admins can author. |
| `containerType` fix and the other P1-8 fixes                                                                      | None                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Bug fixes.                                                                                                                                               |
| Player v2: Watch/Try, cursor, speed, outline, resume, read-aloud, narration playback, progress writes (P2-1–P2-5) | New `GlobalFeature` `'gl-player-v2'` (`FEATURE_DEFAULTS`: `defaultAccessLevel: 'admin'`, `defaultEnabled: true`, `missingDocPublic: false`). Students are anonymous and can't evaluate it, so the gate is stamped on the **session**: `createSession` writes `playerV2: true` when the creator passes `canAccessFeature('gl-player-v2')`. Teacher-side surfaces (widget, Manager preview, Help viewer) check the flag directly. The player takes `playerV2?: boolean` and renders today's footer and timings when it is false. | This changes behaviour that students and teachers see.                                                                                                   |
| Live tours and their launch points (P3-4, P3-5)                                                                   | New `GlobalFeature` `'gl-live-tours'`, same defaults. Every launch point and the `spart:start-tour` listener check `canAccessFeature('gl-live-tours')`.                                                                                                                                                                                                                                                                                                                                                                        | Teacher-facing.                                                                                                                                          |

The PR that adds each flag states its starting access level and the admin path to open it: Admin Settings > Access > Global Settings > set to Public. Agents never open a flag on prod. Changelog entries are written when Paul opens a flag, not at merge.

P2-1 adds `'gl-player-v2'` (types, defaults and the session stamp in `useGuidedLearningSession.ts`); P2-2 through P2-5 read it. P3-4 adds `'gl-live-tours'`.

## Phases and items

Each item has a model tier for the implementer, dependencies, key files, what to do, a done-when check, and notes. Items within a phase are file-disjoint unless a dependency is stated.

**Protected files** are owned by the orchestrator and shipped as small dedicated PRs from implementers' `concerns`: `firestore.rules`, `firestore.indexes.json`, `firebase.json`, `storage.rules`, `.github/workflows/*`.

### Phase 1 — Studio and the real-player canvas

#### P1-1 v3 types, publicStep mirroring, geometry utils — `opus`

Depends on: nothing.

Key files: `types.ts` (`GuidedLearningStep` :6893, `GuidedLearningSet` :6951, `GuidedLearningPublicStep` :7045, `GuidedLearningSession` :7081), `hooks/useGuidedLearningSession.ts:175-228` (`toPublicStep`) and the session create at :304-382, `components/guidedLearning/GuidedLearningStudentApp.tsx:401-414` (`setForPlayer`), `GL/utils/setMigration.ts`, new `GL/utils/regionGeometry.ts`, new `GL/utils/calloutPlacement.ts` and their tests.

Do:

1. Add the step and set fields from **Data model** to the set, public-step and session types; add `narration`, `tour` and `tourSetup` now so later phases need no type churn. Mirror `region`, `calloutPin`, `cursor`, `narration` (url, voice and durationMs only) and `tour` in `toPublicStep`. Mirror `watchPace` on session create and in `setForPlayer`. Also mirror `welcomeEnabled`/`welcomeMessage` in `setForPlayer`, which is currently missing.
2. Bump `GL_SET_SCHEMA_VERSION` to 3. `isGuidedLearningSetV2` stays `>= 2`. Add `isGuidedLearningSetV3`.
3. `regionGeometry.ts`: `effectiveRegion(step, geometry)` returns a container-px rect `{ cx, cy, w, h, shape }`. When `region` is set, it maps image-% through the offset and transform. When it is absent, it returns a circle the size of the pin button (`min(32, 0.08 × min(containerW, containerH))` px). Also `pointInRegion(pt, rect)` and `clampRegion`, which keeps an image-% region inside 0–100 with a minimum size of 1.5%.
4. `calloutPlacement.ts`: `placeCallout({ box: {w,h}, target: Rect, container: {w,h}, prefer?: Side, pinned?: {x,y}, padding: 12, offset: 16 })`, returning `{ left, top, side, arrow: {from, to} }` in px.
   - Auto mode scores the four sides by fit, **never overlaps the target rect**, and prefers `prefer`.
   - If no side fits, pick the side with the least overlap and shrink the width down to a minimum of 200px before accepting any overlap.
   - Pinned mode uses the pin as the box centre, clamps into the container, and returns an arrow from the nearest box edge to the nearest target edge.
   - Add `placeBanner(target, container)`, returning `'top' | 'bottom'`: bottom when the target's centre is in the top 40%.
   - Add `placePopover(box, target, container)`: centered unless that overlaps the target, otherwise the centre of the largest free quadrant.
5. Unit tests: default region matches today's hit size; a callout never overlaps its target across a grid of target positions and container aspects (property-style loop); pinned clamping; banner flip; popover avoidance; `toPublicStep` mirrors the new fields and still strips answer keys.

Done when: `pnpm exec vitest related --run` on the touched files passes, and `pnpm run type-check` passes once.

Notes: pure functions only. No component changes; P1-2 consumes these.

#### P1-2 Extract `GuidedLearningStage`; region- and callout-aware rendering — `opus`

Depends on: P1-1.

Key files: `GL/components/GuidedLearningPlayer.tsx`, new `GL/components/GuidedLearningStage.tsx`, `GL/components/interactions/TooltipInteraction.tsx`, `BannerInteraction.tsx`, `TextPopoverInteraction.tsx`, `SpotlightInteraction.tsx`, new `GL/components/interactions/CalloutArrow.tsx`, new `GL/utils/richText.tsx`, `GL/components/GuidedLearningPlayer.test.tsx`, new `GL/components/GuidedLearningStage.test.tsx`.

Do:

1. Move everything inside the `containerRef` canvas (`GuidedLearningPlayer.tsx:773-979`) into `GuidedLearningStage`: media, transitions, pan-zoom layer, pins, overlays, Reset view, and the image measurement with its ResizeObserver.
   - Props: `{ set, steps, activeStepId, currentIdx, mode, answeredSteps, teacherMode, zoomScale, onPinClick, onAnswer, onAdvance, onDismiss, renderEditLayer?: (ctx: StageGeometry) => ReactNode, forceOverlay?: boolean }`.
   - `StageGeometry` exposes `containerSize`, `imgOffset`, `renderedTransform` and the mapping helpers so the Studio edit layer uses the same maths.
   - `GuidedLearningPlayer` keeps its props and behaviour and owns step state, the timer, the footer and keyboard handling; it renders the stage. All four render sites stay unchanged.
2. Rendering changes:
   - Spotlight draws `effectiveRegion` (ellipse or rounded rect) instead of a radius circle whenever `step.region` is set. Legacy `spotlightRadius` behaviour is unchanged when `region` is absent.
   - Pan-zoom focuses on the region centre.
   - In explore mode, a step with a `region` gets a transparent button covering the region (hover outline, the step label as `aria-label`) in addition to or instead of the pin. A step without a region keeps the pin as its only target.
   - A hidden hotspot (`hotspotAlwaysHidden`) with a region renders that region as an invisible click target. Today hidden hotspots render nothing and cannot be clicked at all, which contradicts the type doc at `types.ts:6908-6913`. This makes the documented "find the click zone yourself" exercise work.
   - The tooltip uses `placeCallout` with the region rect as the target and `tooltipPosition` as the preference. It draws `CalloutArrow` (replacing the connector line at `TooltipInteraction.tsx:97-132`) and honours `calloutPin`.
   - Banner uses `placeBanner`, and popover uses `placePopover` or the pin.
   - Keep the existing size tokens (`min(Npx, Xcqmin)`).
3. `richText.tsx`: `renderStepText(text)` supports `**bold**` and `[label](https://…)` (https only, `target="_blank" rel="noopener noreferrer"`). Everything else is literal and there is no HTML injection. Use it in tooltip, popover, banner and spotlight label.
4. Add `data-gl-callout={step.id}` and `data-gl-region={step.id}` attributes so the Studio can hit-test.

Done when:

- The existing `GuidedLearningPlayer.test.tsx` passes with only import-path updates.
- New stage tests cover: region spotlight size, explore hit inside and outside an ellipse, tooltip not overlapping a region at each edge, a pinned callout rendered at the pin, banner at the bottom for a top target, and rich text rendering `<strong>` and a safe link while escaping `<script>`.
- `vitest related` passes.

Notes: no visual change for a v2 set without the new fields except that tooltips no longer cover their target. Call that out in the PR as intended.

#### P1-3 Editor document reducer with undo/redo — `sonnet`

Depends on: nothing (parallel with P1-1/P1-2).

Key files: `GL/components/useGuidedLearningEditorState.ts`, new `GL/components/editorHistory.ts` and test, `GL/components/GuidedLearningEditorModal.tsx` (only if the controller shape needs a pass-through).

Do:

1. Move the document fields (title, description, mode, `imageUrls`, `imageKinds`, `videoTrims`, `steps`, `hotspotPulse`, `imageTransition`, welcome fields, `watchPace`) into one `useReducer` with `{ past, present, future }`. UI state (selection, `addingStep`, uploads, measurements) stays in `useState`.
2. Keep the public controller interface (`:46-111`) identical so `persistDraft`, `isDirty` and autosave keep working. Add `undo`, `redo`, `canUndo`, `canRedo`, `beginGesture()` and `endGesture()`. A drag or resize commits one history entry on `endGesture`, not one per pointer move.
3. Cap history at 100 entries. Coalesce text typing into one entry per 800ms pause. Reset history when the set id changes (the existing reset at :186-209).

Done when: tests cover undo/redo of add, move (one entry per gesture), delete step, delete slide (restoring shifted `imageIndex` values), reorder, and text coalescing; `GuidedLearningEditorModal.test.tsx` still passes.

Notes: no UI in this item; the Studio wires Ctrl/⌘+Z, Ctrl/⌘+Shift+Z and Ctrl+Y.

#### P1-4 Studio shell, device frames, Play from here — `opus`

Depends on: P1-2, P1-3.

Key files: new `GL/components/studio/GuidedLearningStudio.tsx`, `studio/StudioFilmstrip.tsx`, `studio/StudioCanvas.tsx`, `studio/DeviceFrame.tsx`, `studio/devicePresets.ts`, `studio/StudioPropertiesPanel.tsx`, `studio/StudioTimeline.tsx`, `GL/Widget.tsx:1322-1358` (swap the modal for the Studio), `GL/components/GuidedLearningStepEditor.tsx` (reused in the properties panel), `GL/components/GuidedLearningEditor.tsx` (move `SettingChip`, `WelcomeChip`, `CaptureMenuButton` and `VideoTrimBar` out to `studio/` or a shared file so they are reused rather than duplicated), `locales/*.json`.

Do:

1. Full-viewport shell (portal at `Z_INDEX.modalContent`, fixed inset 0). Reuse `EditorModalShell`'s header behaviours (editable title, `AutosaveIndicator`, close flush and confirm) by extracting them into a hook or header component, not by copying.
   - Autosave uses the same `draftToken` / `persistDraft` / `onSave` path as `GuidedLearningEditorModal.tsx:382-470`. Move `persistDraft` and `isDirty` into a shared hook both can call, then delete the modal once the Studio replaces it.
   - Keep the legacy-radius conversion at load (:292-379).
2. Layout:
   - Filmstrip on the left: slide thumbnails with step-count badges, drag to reorder (`SortableList`), add/paste/capture/drop, delete.
   - Canvas in the center.
   - Properties panel on the right: set settings when nothing is selected, `GuidedLearningStepEditor` when a step is selected.
   - Timeline at the bottom: step pills for the current slide in order, reorder with `SortableList layout="grid"`, click to select.
   - Below 1024px wide the right panel collapses into a drawer.
3. `devicePresets.ts`:
   - `board` 720×520 (the widget default); `help` 1024×576 (the 16:9 Help viewer); `chromebook` 1366×657 (the full-viewport student app); `projector` 1920×1080.
   - Also `custom` with width/height inputs.
   - The last choice is remembered in localStorage (wrapped in try/catch).
4. `DeviceFrame` renders its child at the preset's **true pixel size** with `containerType: size`, then applies `transform: scale(k)` so it fits the canvas. It exposes `k` so pointer maths can divide by it. The student preset adds the student app's footer clearance so the stage area matches exactly.
5. `StudioCanvas` renders `GuidedLearningStage` inside the frame with `forceOverlay` for the selected step, so its callout, banner, popover, spotlight and zoom render exactly as in play. The edit layer arrives in P1-5; this item only renders the stage and a selection outline.
6. "Play from here" swaps the canvas to the real `GuidedLearningPlayer` in the same frame, starting at the selected step, with a floating "Back to editing" button. Escape also returns. The selection returns to whatever step was showing.
7. Keyboard: undo/redo shortcuts from P1-3; Delete removes the selected step with an undo toast; `[` and `]` go to the previous and next step.

Done when:

- RTL tests: the Studio opens for a set; switching presets changes the frame's inner size to the preset pixels; the selected tooltip step renders `data-gl-callout`; Play from here mounts the player at the selected index; undo restores a deleted step; autosave fires `onSave` after an edit (fake timers).
- A manual check in the dev harness: at each preset, a screenshot of the Studio frame and of the matching real surface show the callout in the same place. Paul's visual-verification rule is to render and screenshot before claiming it looks right.

Notes: the Studio mounts only for admins today, as the modal does. Keep AI generator access (`onAiGenerated`, the `gemini-functions` gate) in the header.

#### P1-5 Canvas editing layer: place, draw, drag, resize, pin, nudge, zoom, snap — `opus`

Depends on: P1-4.

Key files: new `GL/components/studio/StudioEditLayer.tsx`, `studio/useCanvasViewport.ts`, `studio/snapping.ts` and tests; `studio/StudioCanvas.tsx`.

Do:

1. The edit layer renders through `renderEditLayer` so it shares `StageGeometry`. All pointer maths is container px ÷ frame `k` → image-% via the imageUtils inverses.
2. **Add mode** (toolbar button or `A`):
   - A click places a point at the default region and auto callout, then selects it.
   - A drag beyond 4px draws a rectangle region (Shift gives an ellipse).
   - Coordinates are clamped to the image (not 2–98; regions may touch edges).
3. **Select vs move:**
   - A pointer-down on an unselected hotspot selects it only.
   - Moving requires the hotspot to already be selected, or a drag beyond 6px that starts on it. This removes the click/drag ambiguity.
   - Alt-click (or repeated clicks at the same spot) cycles through overlapping hotspots under the pointer.
   - Tab and Shift+Tab cycle through hotspots on the slide.
4. The selected region shows 8 resize handles plus a centre move handle, and has a shape toggle in the properties panel. Drag and resize use `beginGesture`/`endGesture`.
5. **Callout:**
   - Dragging the rendered callout of the selected step sets `calloutPin`.
   - "Reset to auto" appears in a floating mini-toolbar next to the selection and in the properties panel.
   - Callouts render at their play position because the stage renders them.
6. **Nudge:** arrows move the selected region, or the callout if it has focus, by 0.25% of the image; Shift moves 2%. One history entry per 800ms burst.
7. **Viewport:** Ctrl/⌘+wheel or pinch zooms 100–400% around the pointer; Space+drag or middle-drag pans; `0` fits; `1` shows 100%. This zoom is on the canvas wrapper, outside the device frame, so the stage size never changes.
8. **Snapping** (hold Ctrl/⌘ to disable): region edges and centre snap to other regions' edges and centres on the same slide and to the image centre lines within 6 screen px. Show guides while snapping.
9. A hover outline and a label chip show "Step N · type" on the target under the pointer.

Done when: unit tests cover snapping and viewport maths (zoom around a point, px↔image-% at k≠1 and zoom≠1). RTL tests cover: click places a default step; drag draws a rect region; clicking an unselected hotspot does not move it; Alt-click cycles overlapping hotspots; dragging a callout sets `calloutPin` and Reset clears it; ArrowRight nudges by 0.25; one undo reverts a whole drag.

#### P1-6 Inline text editing on the canvas — `sonnet`

Depends on: P1-4 (can run alongside P1-5; shares only `StudioCanvas.tsx`, so coordinate the edit-layer mount point with P1-5 or land P1-5 first).

Key files: new `GL/components/studio/InlineCalloutEditor.tsx` and test, `GL/components/GuidedLearningStage.tsx` (an `editingStepId` prop that renders the callout body as an editor slot).

Do:

1. Double-clicking a tooltip, popover, banner or spotlight label (or pressing Enter with a step selected) turns that callout's label and text into plain-text `textarea`/`input` elements styled to match. Use no `contentEditable`, so no HTML gets in. The box re-measures and re-places live as you type.
2. `Ctrl/⌘+B` wraps the selection in `**`, and `Ctrl/⌘+K` prompts for an https URL and wraps it as a link. Escape or clicking outside commits. History coalesces per P1-3.
3. The properties panel and the canvas edit the same fields. Show a soft counter when text exceeds 25 words, matching the `gl-author` guidance.

Done when: RTL tests cover double-click entering edit mode, typing updating the step, Ctrl+B wrapping, Escape committing, and a `javascript:` URL being rejected.

#### P1-7 `gl-author` skill, validator and importer on v3 — `sonnet`

Depends on: P1-1.

Key files: `.claude/skills/gl-author/SKILL.md`, `.claude/skills/gl-author/scripts/validate_gl_json.mjs`, `GL/adapters/guidedLearningImportAdapter.ts` and test, `GL/utils/glTransfer.ts` and test.

Do:

1. The validator accepts `schemaVersion` 2 or 3 and validates `region` (shape enum; `wPct`/`hPct` in (0,100], centre ± half-size inside 0–100) and `calloutPin` (0–100). It rejects `narration` (Storage-bound) and accepts `tour` only with a known anchor id if `config/tourAnchors.ts` exists; until P3-1, treat `tour` as an error.
2. The skill instructs: write v3; for app walkthroughs, set `region` from Playwright element bounds (exact, instead of estimated centre points), leave callouts on auto, and pin only when auto placement is clearly wrong in the verification render.
3. The importer validates the region and callout ranges the same way. A file with `schemaVersion > 3` fails with "made by a newer version." Legacy files without a version keep importing.

Done when: validator unit fixtures (pass and fail cases) and adapter tests pass.

#### P1-8 Pre-existing GL defects found during planning — `haiku`

Depends on: nothing.

Key files: `components/guidedLearning/GuidedLearningStudentApp.tsx:417-418`, `types.ts:6919`, `utils/ai.ts:621` and `GL/components/GuidedLearningAIGenerator.tsx:376-383`, `GL/components/GuidedLearningEditor.tsx` (`StepNavigator` :1592).

Do:

1. Add `style={{ containerType: 'size' }}` to the student player container so cq units resolve against the container as on every other surface. Check that `NAV_FOOTER_CLEARANCE_PX` still aligns.
2. Fix the `tooltipOffset` doc default to 16.
3. Remove the unreachable out-of-range `imageIndex` warning path. The server already coerces these to 0 (`functions/src/aiGeneration.ts:2342-2347`).
4. Pass `layout="grid"` to the `SortableList` in `StepNavigator` (only if P1-4 has not deleted it yet; otherwise drop this sub-step).

Done when: `vitest related` passes for the touched files and the PR lists each defect with its file:line.

### Phase 2 — Player: motion, Watch/Try, read-aloud, analytics (after Phase 1 merges)

#### P2-1 Calm motion and learner speed — `sonnet`

Depends on: P1-2.

Key files: `GL/components/GuidedLearningStage.tsx`, `GL/components/GuidedLearningPlayer.tsx`, new `GL/utils/motion.ts` and test, `tailwind.config` or the CSS file that defines `animate-gl-pulse-reminder`.

Do:

1. Centralise durations and easings in `motion.ts`:
   - `ZOOM_MS = 900` with ease `cubic-bezier(0.33, 0, 0.2, 1)` (was 600ms ease-in-out);
   - `CALLOUT_IN_MS = 280` (fade plus 6px rise, starting after the zoom settles);
   - `SLIDE_MS = 500`;
   - `CURSOR_MS(distance)` = clamp(600, 250 + distancePx × 0.9, 1100).
     All are divided by the learner speed, and all become 0 under reduced motion (cuts and fades only).
2. Callouts wait for the camera: the overlay mounts after the zoom transition ends, using `transitionend` with a timeout fallback.
3. Learner speed control in the footer for structured and guided modes (0.5× / 1× / 1.5×), remembered per viewer in localStorage (try/catch).
4. Guided and Watch step duration is `max(autoAdvanceDuration ?? readingTime(text), WATCH_MIN_STEP_S = 3)`, where `readingTime` is words ÷ 180wpm × 60 + 1.5s, then multiplied by `timeMultiplier` and divided by speed. `watchPace: 'calm'` multiplies by 1.3.

Done when: tests cover duration maths, reduced motion giving 0ms, speed persistence, and the callout mounting after the zoom ends (fake timers).

#### P2-2 Watch / Try toggle and animated cursor — `opus`

Depends on: P2-1.

Key files: new `GL/components/player/AnimatedCursor.tsx`, `player/PlaybackModeToggle.tsx`, `GL/components/GuidedLearningPlayer.tsx`, `GL/components/GuidedLearningStage.tsx`, tests.

Do:

1. **Mode mapping** (open assumption 1):
   - The author's `mode` sets the default: `guided` → Watch, `structured` → Try.
   - `explore` stays as it is and shows no toggle.
   - The toggle sits in the footer and can be switched at any time; switching keeps the current step.
2. **Watch:**
   - The cursor sprite (SVG arrow, 2px outline, drop shadow; sized `min(28px, 6cqmin)`) moves along a gentle quadratic curve from the previous target centre (or the frame centre on the first step) to the region centre, taking `CURSOR_MS`.
   - Then a click ripple, then the zoom, spotlight and callout per P2-1.
   - Auto-advances by the step duration. The footer shows a scrubber (per-step segments; dragging seeks to a step start) and Play/Pause.
   - Question steps pause until answered.
   - `cursor.hide` skips the cursor for that step, and steps without a meaningful target (popover-only with the default region, audio, video) skip it too.
3. **Try:**
   - The callout shows immediately. Clicking inside `pointInRegion` advances, with a success pulse.
   - A click outside counts as a misclick (shake the callout 150ms, no penalty).
   - After 5s without progress, or on the second misclick, the cursor appears and glides to the target as a hint and sets `hinted`.
   - Next and Prev stay available as skip.
   - Keyboard: Enter or Space activates the target when the stage has focus.
4. Emit `onStepEvent({ stepId, type: 'enter' | 'leave' | 'misclick' | 'hint' | 'complete', ms?, x?, y? })` from the player for P2-5 and P2-3. It does nothing when no handler is passed.

Done when: tests cover the default mode per author mode, the toggle keeping the index, Watch auto-advancing at the computed duration, Try advancing only on an in-region click, a misclick counting, the hint after 5s, reduced motion placing the cursor without animating it, and the event sequence for one Try step.

#### P2-3 Orientation and accessibility: outline, resume, live region, focus, read-aloud — `sonnet`

Depends on: P2-2.

Key files: new `GL/components/player/StepOutline.tsx`, `player/useResume.ts`, `player/useReadAloud.ts`, `GL/components/GuidedLearningPlayer.tsx`, interactions (focus handling), tests, `locales/*.json`.

Do:

1. **Outline:** an "N / M" button opens a list of step labels grouped by slide, showing the current step and completed marks. Clicking jumps to a step (structured and Watch only; Try allows jumping back only).
2. **Resume:** store `{ setId|sessionId, idx, mode, updatedAt }` in localStorage (try/catch). On reopen within 14 days, show "Resume at step N?" with Resume and Start over.
3. **Accessibility:**
   - A visually hidden `aria-live="polite"` region announces "Step N of M: label. text" on step change.
   - Popover, question, audio and video overlays get `role="dialog"`, `aria-labelledby` and focus moved to their first control, with focus returned to the stage on close.
   - The tooltip card gets `role="note"`.
   - The main image `alt` becomes the step label or the set title.
4. **Read-aloud:** a toggle in the footer. `speechSynthesis` reads the label and text on step enter and stops on leave. In Watch mode, the step waits for `max(duration, utterance end)`. When `step.narration` exists (P2-4), play it instead of speech synthesis. The toggle is hidden when `speechSynthesis` is unavailable and no narration exists.

Done when: tests cover the outline jump, the resume prompt, the live-region text, focus moving into a popover, and read-aloud calling `speak` and `cancel` (mock `speechSynthesis`).

#### P2-4 Generated narration (Google Cloud TTS) — `opus`

Depends on: P1-4 (Studio properties panel), P2-3 (player playback).

Key files: new `functions/src/guidedLearningNarration.ts` and test, `functions/src/index.ts` (export), `functions/src/quizReadAloud.ts` (extract a shared `synthesizeToCache(text, voice, cachePrefix)` if one does not exist; do not change quiz behaviour), `GL/components/studio/StudioPropertiesPanel.tsx`, new `GL/utils/narration.ts`, `utils/ai.ts` or a sibling client wrapper; `storage.rules` if a new prefix needs read rules (protected: draft the rule text in `concerns`).

Do:

1. `synthesizeGuidedLearningNarrationV1` (`onCall`, `ALLOWED_ORIGINS`, admin-only via `resolveCallerIsAdmin`):
   - Input `{ text, voice }`, capped at 1,500 characters.
   - Returns `{ url, storagePath, voice, textHash, durationMs }`.
   - Caches at `gl_tts_cache/{voice}/{sha256}.mp3`.
   - Neural2 voices from an allow-list, defaulting to the quiz default.
   - Reuses the quiz admin cap and fallback settings; if they are quiz-specific, read them but do not share quotas (flag in the PR).
2. Studio: "Generate narration" for the selected step, and "Generate all" (sequential, with progress). Show a stale badge when `textHash` no longer matches the current label and text, and a play preview.
3. The player plays narration per P2-3.

Done when: function unit tests (mock the TTS client) cover the cache hit, the cap, and the admin requirement. RTL tests cover the stale badge and that generate stores the `narration` field.

Notes: no new secret. Functions deploy to dev from `dev-paul` CI.

#### P2-5 Step analytics: progress docs, rules, Results view — `opus`

Depends on: P2-2. The rules part is an orchestrator PR.

Key files: new `hooks/useGuidedLearningProgress.ts` and test, `components/guidedLearning/GuidedLearningStudentApp.tsx` (wire `onStepEvent`), `GL/components/GuidedLearningResults.tsx`, new `GL/components/results/StepFunnel.tsx`, `results/MisclickHeatmap.tsx`, `firestore.rules` (protected: draft text in `concerns`), `tests/rules/guidedLearningProgress.test.ts`.

Do:

1. **Writer:** aggregate events in memory into the **Data model** shape. Throttle `setDoc(..., { merge: true })` to at most one write every 10s, plus `pagehide`/`visibilitychange` flushes. The first write sets `startedAt`. Clicks are capped at 20 per step and rounded to 0.1%. Only the student app writes (not teacher previews, Help Center or the Studio).
2. **Rules** (draft):
   - `match /guided_learning_sessions/{sessionId}/progress/{uid}`.
   - Create and update when `request.auth.uid == uid`, the session exists, the keys are a subset of the model, `furthestStepIdx` is an int from 0 to 500, and the `steps` map has at most 200 keys.
   - Honour `closeAt` with the same grace as `responses`.
   - Read by the owning teacher or an admin. Never delete by students.
   - Add rules tests for each branch and run `node scripts/releaseFirestoreRules.mjs spartboard-dev` to check the size caps.
3. **Results:** new "Engagement" section:
   - A drop-off funnel (viewers reaching each step, as a bar per step);
   - Median time per step;
   - A misclick heatmap per slide (dots over the slide image, rendered with the stage geometry helpers);
   - A Watch vs Try split with completion rate each.
     Shown for both view-only and submissions sessions. View-only sessions also keep the view count.

Done when: rules tests pass in CI; hook tests cover throttling, flush on `pagehide`, the click cap, and no writes in `teacherMode`; Results tests render the funnel and heatmap from fixture docs.

Notes: use the `dataviz` guidance for charts. Keep the design in the Results view's existing light style.

### Phase 3 — Recorder and live tours (after Phase 2 merges; P3-1 may start any time)

#### P3-1 Tour anchor registry, shell tagging, CI guard, checklist — `sonnet`

Depends on: nothing.

Key files: new `config/tourAnchors.ts`, new `tests/tourAnchors.test.ts`, `components/layout/dock/Dock.tsx`, `components/common/DraggableWindow.tsx` (settings opener :2897/:3081, close, minimise, the toolbar root), `components/common/SettingsPanel.tsx`, `components/settings/SettingsDrawer.tsx`, `components/layout/sidebar/Sidebar.tsx`, `components/layout/BoardActionsFab.tsx`, `components/layout/BoardNavFab.tsx`, `.claude/skills/new-widget/SKILL.md`, `CLAUDE.md` (one line under Layout).

Do:

1. Create the registry and `tourAttr` helper from **Data model**. Tag the app shell: dock open-tools and each dock item (per widget type: `dock.item` with `data-tour-widget-type`), widget settings opener, close, minimise, the settings panel and drawer (root, tabs, close), sidebar menu, board create, board switch, What's New, Help, and board actions FAB items. Aim for about 30 anchors.
2. **CI guard test:** for each `TOUR_ANCHORS` key, grep the source (`components/`, `context/`, `App.tsx`) for `tourAttr('key'` or `data-tour="key"`. Fail with the missing keys. Also fail if a `data-tour` literal appears in source that is not in the registry.
3. Add a new-widget skill checklist step: "Tag the widget's primary actions with `tourAttr` (add item, start, reset, main settings toggles) and register them as `<widgetType>.<action>`." Add one line to CLAUDE.md pointing to `config/tourAnchors.ts`.

Done when: the guard test passes; removing one tag locally makes it fail (describe this in the PR); the attributes do not change the DOM structure or styling.

Notes: widget-internal tagging beyond the shell happens per widget as tours are recorded. The recorder (P3-3) lists untagged clicks to drive this.

#### P3-2 Demo mode: ephemeral board with fixture classes — `opus`

Depends on: nothing (parallel with P3-1).

Key files: new `context/DemoModeContext.tsx`, new `fixtures/demoRosters.ts`, `hooks/useFirestore.ts` (`MockDashboardStore` at :50 and its uses at :326/344/402), `hooks/useRosters.ts` (`MockRosterStore` at :385 and its uses at :825-831), `components/layout/DashboardView.tsx` (the banner), `App.tsx` (the provider).

Do:

1. `DemoModeContext` exposes `{ active, enter(), exit() }`. Only admins can enter it.
   - `enter()` swaps the board and roster data sources to fresh `MockDashboardStore` and `MockRosterStore` instances seeded from fixtures. There are no Firestore reads or writes for boards and rosters while it is active.
   - It creates one demo board.
   - `exit()` discards everything and returns to the user's last real board.
   - This is a runtime flag alongside `isAuthBypass`. Refactor the hook branch conditions to `isAuthBypass || demo.active` where the mock stores are chosen, and keep bypass behaviour identical.
2. Fixtures: two classes ("Period 1 Science", "Period 3 Science"), 14 students each with clearly fake names, and two marked absent, following the gl-author runbook's fixture guidance.
3. A persistent amber banner reads "Demo board — nothing here is saved", with an Exit button. Widgets that read other personal data (Drive, quizzes, assignments) may show their empty states; list any widget that crashes or reaches real data in the PR and guard it.
4. Entry point: an admin-only "Demo board" item in the board menu and `?demo=1` for admins.

Done when: tests show that entering demo mode swaps to the fixture rosters, `addWidget` writes nothing to Firestore (spy on the Firestore setDoc/updateDoc wrappers), exit restores the real board, and non-admins cannot enter. A manual check on spartboard-dev confirms that a roster widget shows the fake names.

Notes: this is the highest-risk item. If the store swap turns out to be invasive, stop and report the blast radius in `concerns` before refactoring more than the two hooks.

#### P3-3 Recorder and AI step-text drafting — `opus`

Depends on: P3-1, P3-2, P1-4.

Key files: new `GL/components/recorder/TourRecorder.tsx`, `recorder/useTourCapture.ts`, `recorder/resolveAnchor.ts` and test, `GL/components/ScreenCaptureModal.tsx` (extract the `getDisplayMedia` and `grabFrame` helpers at :66-77 and :175-207 into `GL/utils/displayCapture.ts` and reuse them), `functions/src/aiGeneration.ts` (new callable), `functions/src/index.ts`, `utils/ai.ts`.

Do:

1. **Start:** only available in demo mode. A floating recorder pill (Record / Pause / Mark step / Finish / Discard) sits outside the captured UI and is excluded from anchor resolution via `data-tour-ignore`.
   - Calls `getDisplayMedia({ video: true, preferCurrentTab: true, selfBrowserSurface: 'include' })`.
   - Rejects the recording if the shared surface is not this tab (track settings `displaySurface !== 'browser'`), with a clear message.
2. **On each capture-phase `pointerdown`** (before the app handles it):
   - Grab a frame.
   - Resolve the anchor: nearest ancestor with `data-tour` (plus `data-tour-widget-type` for per-widget anchors); otherwise role plus accessible name (via `aria-label`, `title` or text) as the fallback, flagged "untagged".
   - Measure `getBoundingClientRect()` and convert it to image-% of the frame, using the `devicePixelRatio` and the captured frame's size.
   - Append a step: `tour: { anchor, fallback, action: 'click' }`, a `region` rect from the bounds (padded 4px), `interactionType: 'tooltip'`, and an empty label.
   - "Mark step" (hotkey Alt+M) adds an `observe` step from the currently hovered element, with no click.
3. **Finish** builds a v3 `GuidedLearningSet`:
   - Frames become slides uploaded through the normal `uploadFromFiles` path.
   - `tourSetup.widgets` is the widget types present on the demo board at record start.
   - `isBuilding: true`.
   - Then opens it in the Studio.
   - A sidebar lists untagged steps with a "copy suggested anchor id" button so Paul can tag them in code.
4. **`draftGuidedLearningStepTextV1`** (`onCall`, admin-only, `geminiConfig.advancedModel`):
   - Input: up to 20 steps of `{ imageBase64 (region crop plus 20% context, ≤ 800px), anchorLabel, accessibleName, action }` plus an optional goal sentence.
   - Output: `{ label (≤4 words), text (≤25 words, imperative, second person) }` per step, following the gl-author writing rules.
   - The Studio runs it after Finish, fills the empty fields, and shows "AI draft" chips until edited.

Done when:

- Unit tests cover `resolveAnchor` (tagged, per-widget, fallback, ignored recorder UI) and rect → image-% at DPR 1 and 2 with a letterboxed frame.
- A function test covers the admin gate and output clamping.
- A manual run on spartboard-dev records a 5-click walkthrough whose regions land on their targets in the Studio, with screenshots in the PR.

#### P3-4 Live tour runner — `opus`

Depends on: P3-1, P1-1, P2-1 (motion constants). P2-2's cursor component is reused.

Key files: new `components/tours/LiveTourRunner.tsx`, `tours/tourState.ts` (the `spart:start-tour` event, like `helpCenterState.ts`), `tours/useAnchorElement.ts`, `tours/TourSpotlight.tsx`, tests, `components/layout/DashboardView.tsx` (mount and listener, next to :460-467), `locales/*.json`.

Do:

1. `requestStartTour({ setId, fromStep? })` dispatches the event. The runner loads the set (`loadBuildingSet`), keeps only steps with `tour`, and runs them in order.
2. **Setup:**
   - For each type in `tourSetup.widgets` missing from the active board, call `addWidget(type)` and record the new ids by diffing `activeDashboard.widgets`.
   - If the board is read-only, offer "Start on a new practice board" (`createNewDashboard('Tour practice')`).
   - **Teardown:** on finish or exit, offer "Keep the widgets the tour added?" and remove them unless kept (open assumption 4).
3. **Anchor resolution per step:**
   - `document.querySelector('[data-tour="…"]')`, scoped by `data-tour-widget` to the tour-added or first matching widget, falling back to role and name.
   - Poll with `requestAnimationFrame` for up to 3s (for panels that animate open).
   - Track the element rect with a ResizeObserver plus scroll and resize listeners.
4. **Presentation:**
   - `TourSpotlight`: a full-viewport SVG mask with a rounded-rect cutout around the element; the cutout itself does not block pointer events.
   - The callout is placed with `placeCallout` in viewport px, rendered with the same callout component styles and `renderStepText`.
   - The P2-2 cursor demonstrates the move first when the learner chose Watch-style help. The default is Try: the learner does it, with the cursor hint after 5s.
   - Controls: Back, Skip, Exit, and "N / M".
5. **Advance:**
   - `click`: a capture listener on the anchor element advances after the app handles the click (the next animation frame).
   - `observe`: the Next button.
   - Escape exits.
6. **Missing anchor:** after 3s, show the step's screenshot slide in a floating mini-player (`GuidedLearningStage` in a 480×270 `DeviceFrame`) with "Couldn't find this on your screen — here's what it looks like", plus Skip and Retry. Log `{ setId, stepId, anchor }` to the console for P3-6.
7. **Reduced motion and read-aloud:** honour P2-1 and P2-3.

Done when: RTL tests on a fixture DOM cover: setup adds a missing widget and teardown removes it; the spotlight tracks a moved element; a click on the anchor advances; a click elsewhere does not; observe waits for Next; a missing anchor shows the fallback; Escape exits and offers teardown. A manual run of a P3-3 recording on spartboard-dev works end to end.

#### P3-5 Launch points — `sonnet`

Depends on: P3-4.

Key files: `types/helpCenter.ts`, `components/help/HelpGuidesTab.tsx`, `components/help/HelpResourceViewer.tsx`, `components/common/SettingsPanel.tsx:261-274`, `components/settings/SettingsDrawer.tsx:506-518`, `hooks/useHelpResources.ts`, new `components/tours/useTourOffers.ts`, `hooks/useChangelog.ts`, `components/layout/WhatsNewModal.tsx`, `public/changelog.json` (schema only), `locales/*.json`.

Do:

1. **Help Center:** GL items whose set has any `tour` steps show "Show me live" next to Play, closing Help and calling `requestStartTour`. This requires knowing whether a set has tour steps without loading it: add `hasLiveTour?: boolean` to `HelpResourceItem` and set it when an admin saves the item in `HelpItemForm` by loading the set once. Rules for this field go in `concerns` if the help rules restrict keys.
2. **Widget `?`:** when a help item for that `widgetType` has `hasLiveTour`, the `CircleHelp` button opens a two-choice popover: "Show me live" or "Open guides".
3. **Onboarding offer:** the first time a user adds a widget type that has a live tour, show a toast: "Take a 1-minute tour of <Widget>?" with Start and No thanks. Record it as offered per type in localStorage (`spart_tour_offered_<type>`) and never offer again. Skip it in demo mode and during a running tour.
4. **What's New:** add an optional `tourSetId` to the entry type. When present, the entry shows "Show me" and starts the tour.

Done when: tests cover each launch point, including the offer shown once per type.

#### P3-6 Tour health for admins — `sonnet`

Depends on: P3-4.

Key files: new `components/admin/HelpCenter/TourHealthPanel.tsx`, `components/admin/HelpCenter/HelpCenterManager.tsx`, `config/tourAnchors.ts`.

Do: list every building set with tour steps. For each step, show whether its anchor is in `TOUR_ANCHORS` (static check) and, via "Check live", whether it resolves on the current board (runs the P3-4 resolver without presenting anything). Summarise the broken anchors per set with a link that opens the set in the Studio at that step.

Done when: tests cover a set with an unknown anchor flagged by the static check and the live check reporting found or missing on a fixture DOM.

## Verification matrix (orchestrator, before each phase merge)

| Check                            | How                                                                                                                                                                                                                                              |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| v2 sets unchanged                | P1-2: existing player tests pass unmodified apart from imports. Manually open three existing building sets on spartboard-dev in the player before and after: pins, spotlight and zoom are identical, and tooltips no longer cover their targets. |
| Studio matches the real surfaces | P1-4: at each device preset, screenshot the Studio frame and the matching surface (widget at 720×520, Help viewer, student app at 1366×657, 1920×1080); callouts land in the same place.                                                         |
| Students receive new fields      | P1-1 test on `toPublicStep`; the student app renders a region spotlight and a pinned callout from a v3 session on dev.                                                                                                                           |
| No answer leakage                | P1-1 test: public steps still contain no `correctAnswer`/`matchingPairs`/`sortingItems` in their original order.                                                                                                                                 |
| Undo is one step per gesture     | P1-3/P1-5 tests.                                                                                                                                                                                                                                 |
| Motion is calm and reducible     | P2-1 tests; manual check with OS reduced motion on.                                                                                                                                                                                              |
| Analytics cannot be abused       | P2-5 rules tests: another uid denied, oversized maps denied, writes after `closeAt` denied; `releaseFirestoreRules.mjs spartboard-dev` within size caps.                                                                                         |
| No student data in recordings    | P3-2 test: no Firestore writes in demo mode; P3-3: recorder disabled outside demo mode.                                                                                                                                                          |
| Tour anchors do not rot          | P3-1 guard test in CI; P3-6 panel lists zero broken anchors for published tours before release.                                                                                                                                                  |
| Validation gate                  | Each PR: `vitest related` on the touched files; `type-check` once for shared types; CI is the full gate. Pre-existing failures surfaced in the touched area are fixed or raised to Paul, never waved off.                                        |

## Open assumptions (flag to Paul if any is wrong)

1. **Watch/Try mapping:** `guided` defaults to Watch, `structured` defaults to Try, and `explore` has no toggle. Under Try, Next still works as a skip.
2. **Default click zone:** a hotspot without a `region` stays as it is today: the pin button is the only target, and hidden hotspots stay unclickable. Plain-click hotspots in the Studio also get no `region`. Only a drawn region (or the recorder) creates one. The documented "hidden but clickable" exercise therefore needs a drawn region.
3. **Pinned callouts** are stored in image-% (they move with the image). On very different aspect ratios they are clamped into the container, which can shift them slightly. That is accepted over storing a pin per device.
4. **Tour setup** adds missing widgets to the teacher's current board and offers to remove them at the end, rather than always using a practice board.
5. **The anchor CI guard** checks registry against source, not against published tours in Firestore. Published-tour breakage is caught by the P3-6 health panel, not CI. If Paul wants CI to read `building_guided_learning`, that needs a read-only credential in CI (a separate decision).
6. **The `spart-new-widget` plugin skill** lives in Paul's `pauls-skills` repo, so P3-1 only updates the in-repo `new-widget` skill. Paul mirrors the checklist step into the plugin.
7. **Narration** reuses the quiz read-aloud voices and admin cap settings. GL may need its own cap if usage grows.
8. **Demo mode** swaps only the board and roster stores. Widgets backed by other personal data show empty states there, which is acceptable for recordings.
