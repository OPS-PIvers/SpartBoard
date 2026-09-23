# Guided Learning Studio — real-player editor, calmer player, recorder and live tours

Rebuilds Guided Learning (GL) authoring and playback in three phases:

1. A full-screen **Studio** whose canvas is the actual player, with regions, pinned callouts, precision tools and inline text.
2. A **player** with Watch/Try playback, an animated cursor, calmer motion, read-aloud and step analytics.
3. A **recorder** that captures a walkthrough on a demo board once and produces both a screenshot lesson and a **live in-app tour**.

Scope was settled in a design interview with Paul on 2026-09-22 and revised after a code review the same day. This document is the contract. Every item is self-contained: an implementer should be able to build it from the item text plus the code, without this conversation. Paul orchestrates delegation from a Claude project, so each item names its dependencies explicitly.

**Code references** were taken at `dev-paul` commit `e8aac8288`. Symbol names are authoritative and line numbers are hints: if a line number is off, grep for the symbol. Do not stop to report line drift.

Out of scope: opening GL beyond admins (Paul does this himself through the existing `feature_permissions/guided-learning` doc when he chooses), live tours inside the student app, AI placement of pins on uploaded images, AI critique passes, and a bulk migration of existing sets.

## Why

- The editor only previews spotlight and the pan-zoom frame (`InteractionPreviewOverlay`, `GuidedLearningEditor.tsx:1652-1733`). Tooltips, popovers and banners are not shown on the canvas, and the zoom frame is labelled "approx" because the player's container aspect differs from the canvas.
- Tooltip placement is an enum plus an offset (`types.ts:6918-6921`). Auto placement then clamps the card inside the container (`TooltipInteraction.tsx:91-95`), which can push it over the target. Popovers are always centered and banners always sit at the top, regardless of where the target is.
- Placing a hotspot means aiming a 24px dot at a small UI element with no zoom, no nudge and no undo. Click-to-select and drag share one 4px threshold (`GuidedLearningEditor.tsx:1756-1886`), and overlapping pins cannot be reached.
- Paul only finds a bad placement after playing the activity, which means a round trip back into the editor.
- GL sets are also the Help Center walkthroughs (`building_guided_learning`). They are drafted with the `gl-author` skill from Playwright screenshots, and that skill warns that estimated pins "miss small icons about half the time." Screenshots also go stale when the UI changes.
- In the player, motion can feel too fast and disorienting. There is no outline or resume, no read-aloud, no `aria-live`, and no data on where viewers get stuck (`GuidedLearningPlayer.tsx` has no click tracking; the student app writes only `views` and a final `responses` doc).

## Product decisions (settled — do not re-litigate)

| Decision           | Answer                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fidelity           | The Studio canvas renders the **same stage component** the player uses, not a look-alike overlay. A device-frame switcher renders that stage at the true pixel size of each surface and scales it visually to fit.                                                                                                                                                                                                                        |
| Guiding principle  | The default path costs no extra effort; precision is opt-in. The feature should eventually be smooth enough to open to all teachers.                                                                                                                                                                                                                                                                                                      |
| Hotspot model      | **Click** places a pin exactly as today, and its callout auto-places so it does not cover the pin. **Click-and-drag** draws a rectangle region instead. **Dragging a callout** pins it; "Reset to auto" unpins it. Existing sets play unchanged. Drawn regions can be a rectangle (adjustable corner radius), an ellipse or a polygon, for spotlighting irregular shapes such as map regions or parts of a diagram.                       |
| Editor shell       | Full-screen Studio: slide filmstrip (left), device-framed canvas (center), properties panel (right), step timeline (bottom). "Play from here" runs the real player in the frame.                                                                                                                                                                                                                                                          |
| Text editing       | Double-click a callout on the canvas to edit its text in place. The properties panel edits the same text. Supported formatting: `**bold**` and `[text](https://…)` links only.                                                                                                                                                                                                                                                            |
| Precision tools    | Arrow-key nudge (Shift for larger steps), canvas zoom and pan, undo/redo, snapping, select separate from drag, cycle through overlapping hotspots.                                                                                                                                                                                                                                                                                        |
| Playback           | A learner-side **Watch / Try** toggle. Watch: an animated cursor glides to each target, clicks with a ripple, the camera eases to follow, and steps auto-advance with a scrubber. Try: the learner clicks the target themselves; the cursor appears as a hint after about 5s of no progress.                                                                                                                                              |
| Pacing             | Calmer eased defaults (glides of about 600–900ms), a learner speed control (0.5× / 1× / 1.5×), a minimum duration authors cannot go below, and `prefers-reduced-motion` reduces all motion to cuts and fades.                                                                                                                                                                                                                             |
| Audio              | Browser text-to-speech toggle for learners (free, instant), **plus** an optional per-step narration track from either Google Cloud TTS or the author's own recorded voice. A recorded voice takes priority over generated narration.                                                                                                                                                                                                      |
| Analytics          | Keep the share link and view counting. Add step drop-off, a Try-mode misclick/stuck heatmap, and a Watch vs Try split.                                                                                                                                                                                                                                                                                                                    |
| Live tours         | Folded into GL. **Record once, get both**: one recording produces a screenshot lesson and a live tour. In a live tour the learner performs each action and the tour waits; the tour adds any widgets it needs before starting.                                                                                                                                                                                                            |
| Tour anchors       | Stable `data-tour="…"` attributes from a typed registry, with a fallback to role + accessible name. A CI test fails if a registered anchor is no longer rendered in source. Tagging key controls is part of the new-widget checklist, and the recorder warns about untagged clicks.                                                                                                                                                       |
| Tour launch points | Help Center ("Show me live"), the widget settings `?` button, first-run onboarding offers, and What's New entries.                                                                                                                                                                                                                                                                                                                        |
| Students           | Always get the screenshot version. Live tours are teacher-facing only.                                                                                                                                                                                                                                                                                                                                                                    |
| Recording privacy  | Two options. The default is a **demo board** with fake classes and students. The alternative is recording on the **real board with auto-redaction**: student names from the teacher's rosters and anything tagged `data-pii` (webcam feeds, photos) are blurred into the pixels before a frame leaves the browser, and every frame gets a mandatory blur review before upload. The Studio also has a manual blur tool for any screenshot. |
| AI                 | Draft step text after a recording. Keep the `gl-author` skill writing the current schema. No AI pin placement or critique in this plan.                                                                                                                                                                                                                                                                                                   |
| Migration          | Existing sets play unchanged. Opening a set in the Studio and saving it stamps the new schema version; the new fields are additive. No bulk migration.                                                                                                                                                                                                                                                                                    |
| Access             | Stays admin-gated through the existing permissions doc. Nothing in this plan changes access.                                                                                                                                                                                                                                                                                                                                              |

## Constraints discovered in code (do not re-derive)

| Fact                                                                                                                                                                                                                                                                                                                                                                            | Where                                                                                                                                                                                                        | Consequence                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Player props are `{ set, onClose?, onAnswer?, teacherMode?, timeMultiplier? }`. It casts `set.steps` to `GuidedLearningPublicStep[]` and has no edit hooks.                                                                                                                                                                                                                     | `GuidedLearningPlayer.tsx:66-79, 105`                                                                                                                                                                        | P1-2a extracts a stage that both the player and the Studio render.                                                                           |
| The player renders in four places with different containers: widget (`relative h-full w-full`, any aspect, registry `720×520` default, `skipScaling`), Manager preview (16:9, `containerType: size`), Help Center viewer (16:9, or `h-full` fullscreen, `containerType: size`), and the student app (`h-dvh`, **no `containerType`**, so cq units fall back to viewport units). | `Widget.tsx:1223-1239`, `WidgetRegistry.ts:822-828`, `GuidedLearningManager.tsx:1530-1553`, `components/help/HelpResourceViewer.tsx:78-94`, `components/guidedLearning/GuidedLearningStudentApp.tsx:417-427` | Device presets are defined from these. P1-1 adds `containerType: size` to the student app so all four surfaces follow the same sizing rules. |
| Image letterboxing: `calculateImageFootprint`, `toImageOffset`, `toContainerCoords`, `computePanZoomTranslate` and `computeZoomExtentRect` are shared helpers.                                                                                                                                                                                                                  | `GL/utils/imageUtils.ts`                                                                                                                                                                                     | All new geometry (regions, callouts, cursor) goes through these helpers or siblings in the same file.                                        |
| Overlays sit outside the pan-zoom layer and are mapped through `toRenderedCoords`. Pins sit inside it.                                                                                                                                                                                                                                                                          | `GuidedLearningPlayer.tsx:506-521, 779-979`                                                                                                                                                                  | Regions follow the pins' layer, and callouts follow the overlays.                                                                            |
| Tooltip default offset is 16 in code; the type doc says 12. Auto placement tries below, above, right, left; the fallback clamps into the container.                                                                                                                                                                                                                             | `TooltipInteraction.tsx:43-67, 91-95`, `types.ts:6919`                                                                                                                                                       | P1-1 replaces the placement logic with a region-aware util and fixes the doc.                                                                |
| Banner is pinned full-width to the top; popover is centered. Neither is anchored to the hotspot.                                                                                                                                                                                                                                                                                | `BannerInteraction.tsx:19-21`, `TextPopoverInteraction.tsx`                                                                                                                                                  | P1-2b makes both avoid the region (banner flips to the bottom, popover moves off the target).                                                |
| Every new step field must be mirrored in `toPublicStep` and in `GuidedLearningPublicStep`, or students never receive it (teacher-only fields such as `tour` are deliberately not mirrored).                                                                                                                                                                                     | `hooks/useGuidedLearningSession.ts:175-228`, `types.ts:7045-7078`                                                                                                                                            | P1-1 does this for all new fields.                                                                                                           |
| `setForPlayer` in the student app mirrors `schemaVersion`, `imageKinds`, `videoTrims`, `hotspotPulse` and `imageTransition`, but not `welcomeEnabled`/`welcomeMessage`.                                                                                                                                                                                                         | `GuidedLearningStudentApp.tsx:401-414`                                                                                                                                                                       | New set-level fields must be added here too.                                                                                                 |
| Schema versions: absent/1 is legacy; 2 means image-relative spotlight radii plus zoom that persists across steps. `GL_SET_SCHEMA_VERSION = 2`. The editor converts legacy radii at load and stamps 2 on save. The importer passes the version through; the `gl-author` validator requires exactly 2.                                                                            | `GL/utils/setMigration.ts`, `GuidedLearningEditorModal.tsx:292-379, 420-427`, `GL/utils/glTransfer.ts:185`, `.claude/skills/gl-author/scripts/validate_gl_json.mjs:31`                                       | v3 is additive (no conversion). The player treats `>= 2` as v2 semantics. The validator must accept 3.                                       |
| Editor state is about 20 `useState` calls in a controller hook, with no reducer and no undo. Autosave uses `useAutosave` (1200ms) with a `draftToken` and `persistDraft`. Both panes are `React.memo` with hand-written comparators.                                                                                                                                            | `GL/components/useGuidedLearningEditorState.ts:46-111, 141-181`, `GuidedLearningEditorModal.tsx:382-470`, `GuidedLearningEditor.tsx:416, 1399`                                                               | P1-3 moves document state into a reducer with history, keeping the controller's public shape so the save path is unchanged.                  |
| Saves: personal sets go to Drive plus Firestore metadata (`saveSet`), building sets to `building_guided_learning` (`saveBuildingSet`, admin only). Slide images are Drive-first (`uploadGuidedLearningImage` returns `https://lh3.googleusercontent.com/d/{id}`), with Storage only when Drive is unavailable; AV media is always Storage (`uploadGuidedLearningMedia`).        | `hooks/useGuidedLearning.ts:169-203, 294-305`                                                                                                                                                                | The Studio reuses `onSave` exactly as the modal does.                                                                                        |
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
  shape: 'rect' | 'ellipse' | 'polygon';
  /** Bounding-box size as % of image width / height, centred on xPct/yPct. */
  wPct: number;
  hPct: number;
  /** rect only: corner radius as % of the shorter side (0–50). */
  cornerPct?: number;
  /** polygon only: 3–24 vertices in image-%. The bbox fields and xPct/yPct are derived from them. */
  points?: { x: number; y: number }[];
};
/** Absent = auto placement. Present = callout box centre pinned in image-%. */
calloutPin?: { xPct: number; yPct: number };
/** Watch-mode demonstration override; absent = cursor goes to region centre. */
cursor?: { hide?: boolean };
/** Narration track (P2-4): generated TTS or the author's recorded voice. */
narration?: { source: 'generated' | 'recorded'; url: string; storagePath: string; durationMs: number; voice?: string; textHash?: string };
/** Live-tour binding (P3). Teacher-only: never mirrored to public steps. */
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
/** Watch-mode pacing. 'calm' multiplies step durations by 1.3; absent = 'standard'. */
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
| Studio, blur tool, recorder, redaction, demo mode, tour health (P1-3–P1-7, P1-9, P1-10, P3-2, P3-3, P3-6, P3-7)   | None beyond the existing admin gates                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Admin-only tools are exempt.                                                                                                                             |
| Region-aware callout placement and rich text in the player (P1-2a, P1-2b)                                         | None                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Bug fix: callouts covering their target is unintended behaviour. New visuals only appear for sets that use the new fields, which only admins can author. |
| `containerType` fix (P1-1) and the P1-8 fixes                                                                     | None                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Bug fixes.                                                                                                                                               |
| Player v2: Watch/Try, cursor, speed, outline, resume, read-aloud, narration playback, progress writes (P2-1–P2-5) | New `GlobalFeature` `'gl-player-v2'` (`FEATURE_DEFAULTS`: `defaultAccessLevel: 'admin'`, `defaultEnabled: true`, `missingDocPublic: false`). Students are anonymous and can't evaluate it, so the gate is stamped on the **session**: `createSession` writes `playerV2: true` when the creator passes `canAccessFeature('gl-player-v2')`. Teacher-side surfaces (widget, Manager preview, Help viewer) check the flag directly. The player takes `playerV2?: boolean` and renders today's footer and timings when it is false. | This changes behaviour that students and teachers see.                                                                                                   |
| Live tours and their launch points (P3-4, P3-5)                                                                   | New `GlobalFeature` `'gl-live-tours'`, same defaults. Every launch point and the `spart:start-tour` listener check `canAccessFeature('gl-live-tours')`.                                                                                                                                                                                                                                                                                                                                                                        | Teacher-facing.                                                                                                                                          |

The PR that adds each flag states its starting access level and the admin path to open it: Admin Settings > Access > Global Settings > set to Public. Agents never open a flag on prod. Changelog entries are written when Paul opens a flag, not at merge.

P2-1 adds `'gl-player-v2'` (types, defaults and the session stamp in `useGuidedLearningSession.ts`); P2-2 through P2-5 read it. P3-4 adds `'gl-live-tours'`.

## Shared interfaces (frozen — P1-1 creates these verbatim)

P1-1 writes this file exactly as below. Every later item imports from it. Changing a shape needs a plan edit that Paul approves; an implementer who needs a change stops and reports it in `concerns` instead of editing the file.

```ts
// GL/types/stage.ts
import type React from 'react';
import type {
  GuidedLearningMode,
  GuidedLearningPublicStep,
  GuidedLearningSet,
  GuidedLearningStep,
} from '@/types';
import type { ImageOffset } from '../utils/imageUtils';

export type StageStep = GuidedLearningStep | GuidedLearningPublicStep;
export type Side = 'top' | 'bottom' | 'left' | 'right';
export interface PctPoint {
  xPct: number;
  yPct: number;
}
/** Container px, top-left origin. */
export interface PxRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A step's hit / spotlight / keep-out area in container px (after pan-zoom). */
export interface EffectiveRegion {
  cx: number;
  cy: number;
  w: number;
  h: number;
  /** 'pin' = no drawn region: the pin button's footprint (today's behaviour). */
  shape: 'pin' | 'rect' | 'ellipse' | 'polygon';
  cornerPx?: number;
  points?: { x: number; y: number }[];
}

export interface StageGeometry {
  containerSize: { w: number; h: number };
  imgOffset: ImageOffset;
  /** Pan-zoom transform currently painted. */
  renderedTransform: { scale: number; tx: number; ty: number };
  imagePctToContainerPx: (p: PctPoint) => { x: number; y: number };
  containerPxToImagePct: (x: number, y: number) => PctPoint;
  /**
   * The only pointer→image conversion anyone may use. Reads the stage image
   * element's getBoundingClientRect, so DeviceFrame scale, Studio canvas zoom
   * and pan-zoom are all accounted for in one place.
   */
  clientToImagePct: (clientX: number, clientY: number) => PctPoint;
  regionFor: (step: StageStep) => EffectiveRegion;
}

export interface GuidedLearningStageProps {
  set: GuidedLearningSet;
  /** Steps as the player narrows them (public shape in student mode). */
  steps: GuidedLearningPublicStep[];
  imageIndex: number;
  /** Step whose overlay is showing; null = none. */
  activeStepId: string | null;
  /** The author's set.mode. Not the learner's Watch/Try choice (that is PlaybackMode). */
  authorMode: GuidedLearningMode;
  answeredStepIds: ReadonlySet<string>;
  teacherMode: boolean;
  /** Persisted v2 zoom level. */
  zoomScale: number;
  /** Studio: render the active step's overlay even when play logic would hide it. */
  forceOverlay?: boolean;
  /** P1-6: step whose callout body renders `renderCalloutEditor` instead of text. */
  editingStepId?: string | null;
  renderCalloutEditor?: (step: StageStep, g: StageGeometry) => React.ReactNode;
  /** Studio edit layer, rendered above overlays with the same geometry. */
  renderEditLayer?: (g: StageGeometry) => React.ReactNode;
  onGeometry?: (g: StageGeometry) => void;
  onPinClick: (stepId: string) => void;
  onAnswer?: (
    stepId: string,
    answer: string | string[],
    isCorrect: boolean | null
  ) => void;
  onAdvance: () => void;
  onDismiss: () => void;
}

// ---- Editor controller additions (P1-3). The existing controller interface is unchanged.
export interface EditorHistoryApi {
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  /** Start a drag/resize; all edits until endGesture form one history entry. */
  beginGesture: () => void;
  endGesture: () => void;
  /** Storage paths / Drive ids to delete after the next successful save on close (P1-9, P2-4). */
  queueMediaDeletion: (ref: {
    storagePath?: string;
    driveFileId?: string;
  }) => void;
}

// ---- Player events (P2-2 emits, P2-5 / P2-3 consume).
export type PlaybackMode = 'watch' | 'try';
export interface StepEvent {
  stepId: string;
  type: 'enter' | 'leave' | 'misclick' | 'hint' | 'complete';
  mode: PlaybackMode | null; // null in explore
  /** ms since the step was entered. */
  ms: number;
  /** Click position in image-%, for misclick/complete. */
  xPct?: number;
  yPct?: number;
}

// ---- Studio frame (P1-4a).
export interface DevicePreset {
  id: 'board' | 'help' | 'chromebook' | 'projector' | 'custom';
  w: number;
  h: number;
  /** Space reserved below the stage (the student app footer). */
  footerPx: number;
}
export interface DeviceFrameContextValue {
  preset: DevicePreset;
  /** Visual scale applied to the true-size frame. */
  k: number;
}
```

## Definition of done

**Every item PR**

- Implements the item's **Do** list and nothing in its **Don't touch** list.
- `pnpm exec vitest related --run <touched files>` passes; `pnpm run type-check` passes once; CI is green on the PR.
- New user-facing strings are added to **all four** locale files (`locales/en.json`, `de.json`, `es.json`, `fr.json`) with real translations, never raw keys or English copies in the other files.
- The PR description lists each **Done when** bullet with a ✅ and the test name or screenshot that proves it.

**Additionally, by item type**

| Type                 | Marked     | Extra proof                                                                                                                                                                                                                                                                                                                 |
| -------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Logic                | _(logic)_  | Nothing further.                                                                                                                                                                                                                                                                                                            |
| Visual / interaction | _(visual)_ | Merged to `dev-paul` and deployed to spartboard-dev. The PR includes Playwright screenshots of the change at each device preset (`board`, `help`, `chromebook`, `projector`), taken by the implementer on localhost in auth-bypass mode (agents never sign in). The orchestrator reviews them before marking the item done. |
| Rules                | _(rules)_  | Rules tests pass in CI and `node scripts/releaseFirestoreRules.mjs spartboard-dev` reports the ruleset within the size caps.                                                                                                                                                                                                |
| Proof                | _(proof)_  | An outcome run, recorded in the item's PR or issue with screenshots.                                                                                                                                                                                                                                                        |

**A phase** is done when every row of the verification matrix for that phase passes on spartboard-dev and the phase's proof item is complete. Promoting to production is Paul's call and sits outside this plan.

**Integration:** every item PR targets `dev-paul` directly. Teacher- and student-visible behaviour is behind the `gl-player-v2` / `gl-live-tours` flags; Studio work is admin-only.

**Parallelism rule:** items in the same phase can run in parallel only when their **Key files** do not overlap. Where they do, the later item lists the earlier one under **Depends on**. All Phase 2 items that edit `GuidedLearningPlayer.tsx` or `GuidedLearningStage.tsx` run one at a time in numeric order.

## Phases and items

Each item has a model tier, a type (see **Definition of done**), dependencies, key files, what to do, what not to touch, a done-when check, and notes.

**Protected files** are owned by the orchestrator and shipped as small dedicated PRs from implementers' `concerns`: `firestore.rules`, `firestore.indexes.json`, `firebase.json`, `storage.rules`, `.github/workflows/*`. After this revision only P2-5 needs one (`firestore.rules`).

### Phase 1 — Studio and the real-player canvas

#### P1-0 Demo board spike (read-only report) — `opus` _(proof)_

Depends on: nothing. Time-box: one session.

Key files (read only): `hooks/useFirestore.ts` (`MockDashboardStore`), `hooks/useRosters.ts` (`MockRosterStore`), `config/firebase.ts` (`isAuthBypass`), `context/DashboardContext.tsx`, and every other place that branches on `isAuthBypass`.

Do: find every code path that would have to switch to the mock stores for P3-2's demo mode to work at runtime (not only at startup), and every widget that reads personal data outside the board and roster stores. Produce a report: the list of call sites, whether the stores can be swapped after sign-in without remounting the app, the widgets that would crash or reach real data, and an estimate in files touched.

Don't touch: any source file. This item writes only the report.

Done when: the report is posted as a comment on the plan PR thread (or a GitHub issue linked from it) and ends with one of two recommendations — **"Proceed with P3-2"** (swap is confined to the two hooks plus a context) or **"Drop demo mode"**. Paul makes the call. If demo mode is dropped: P3-2 is removed, P3-7 (real-board recording with redaction) becomes the only recording path, and P3-3 depends on P3-7 instead of P3-2.

#### P1-1 v3 types, shared interfaces, publicStep mirroring, geometry utils — `opus` _(logic)_

Depends on: nothing.

Key files: new `GL/types/stage.ts`, `types.ts` (`GuidedLearningStep` :6893, `GuidedLearningSet` :6951, `GuidedLearningPublicStep` :7045, `GuidedLearningSession` :7081), `hooks/useGuidedLearningSession.ts:175-228` (`toPublicStep`) and the session create at :304-382, `components/guidedLearning/GuidedLearningStudentApp.tsx:401-414` (`setForPlayer`), `GL/utils/setMigration.ts`, new `GL/utils/regionGeometry.ts`, new `GL/utils/calloutPlacement.ts` and their tests.

Do:

0. Create `GL/types/stage.ts` exactly as in **Shared interfaces**.
1. Add the step and set fields from **Data model** to the set, public-step and session types; add `narration`, `tour` and `tourSetup` now so later phases need no type churn. Mirror `region`, `calloutPin`, `cursor` and `narration` (url, voice and durationMs only) in `toPublicStep`. **Do not** mirror `tour` or `tourSetup`: students never run live tours. Mirror `watchPace` on session create and in `setForPlayer`. Also mirror `welcomeEnabled`/`welcomeMessage` in `setForPlayer`, which is currently missing.
   - Absorbed from the old P1-8 (same files): add `style={{ containerType: 'size' }}` to the student player container (`GuidedLearningStudentApp.tsx:417-418`) and check that `NAV_FOOTER_CLEARANCE_PX` still aligns; fix the `tooltipOffset` doc default to 16 (`types.ts:6919`).
2. Bump `GL_SET_SCHEMA_VERSION` to 3. `isGuidedLearningSetV2` stays `>= 2`. Add `isGuidedLearningSetV3`.
3. `regionGeometry.ts`: `effectiveRegion(step, geometry)` returns an `EffectiveRegion`. When `region` is set, it maps image-% through the offset and transform. When it is absent, it returns `shape: 'pin'`, a circle the size of the pin button (`min(32, 0.08 × min(containerW, containerH))` px). Also `pointInRegion(pt, rect)` (including point-in-polygon), `regionPath(region, geometry)` (an SVG path for a rounded rect, ellipse or polygon, used by the spotlight mask and outlines), `polygonBBox(points)`, and `clampRegion`, which keeps an image-% region inside 0–100 with a minimum size of 1.5%.
4. `calloutPlacement.ts`: `placeCallout({ box: {w,h}, target: Rect, container: {w,h}, prefer?: Side, pinned?: {x,y}, padding: 12, offset: 16 })`, returning `{ left, top, side, arrow: {from, to} }` in px.
   - Auto mode scores the four sides by fit, **never overlaps the target rect**, and prefers `prefer`.
   - If no side fits, pick the side with the least overlap and shrink the width down to a minimum of 200px before accepting any overlap.
   - Pinned mode uses the pin as the box centre, clamps into the container, and returns an arrow from the nearest box edge to the nearest target edge.
   - Add `placeBanner(target, container)`, returning `'top' | 'bottom'`: bottom when the target's centre is in the top 40%.
   - Add `placePopover(box, target, container)`: centered unless that overlaps the target, otherwise the centre of the largest free quadrant.
5. Unit tests: default region matches today's hit size; `stage.ts` compiles and matches the plan verbatim (the orchestrator diffs it); a callout never overlaps its target across a grid of target positions and container aspects (property-style loop); pinned clamping; banner flip; popover avoidance; `toPublicStep` mirrors the new fields, omits `tour`, and still strips answer keys.

Done when: `pnpm exec vitest related --run` on the touched files passes, and `pnpm run type-check` passes once.

Don't touch: any component other than the one-line student-app container fix.

Notes: pure functions only; P1-2a/P1-2b consume these.

#### P1-2a Extract `GuidedLearningStage` (no behaviour change) — `opus` _(logic)_

Depends on: P1-1.

Key files: `GL/components/GuidedLearningPlayer.tsx`, new `GL/components/GuidedLearningStage.tsx`, new `GL/components/GuidedLearningStage.test.tsx`, new `tests/utils/mockStageLayout.ts`.

Do:

1. Move everything inside the `containerRef` canvas (`GuidedLearningPlayer.tsx:773-979`) into `GuidedLearningStage`: media, transitions, pan-zoom layer, pins, overlays, Reset view, and the image measurement with its ResizeObserver. Its props are exactly `GuidedLearningStageProps`.
2. Build a `StageGeometry` from the existing maths (`toContainerStep`, `toRenderedCoords`, `renderedTransform`, imageUtils) and pass it to `renderEditLayer`, `renderCalloutEditor` and `onGeometry`. `clientToImagePct` uses the stage `<img>`/`<video>` element's `getBoundingClientRect()`.
3. `GuidedLearningPlayer` keeps its props and behaviour and owns step state, the timer, the footer and keyboard handling; it renders the stage. All four render sites stay unchanged.
4. `tests/utils/mockStageLayout.ts`: a helper that stubs `getBoundingClientRect`, `clientWidth/Height`, `naturalWidth/Height` and fires the ResizeObserver for a stage of a given container size and image size, so jsdom tests can do geometry. Every later stage/Studio test uses it.

Don't touch: interaction components, rendering logic, styles. This is a move-only refactor.

Done when:

- `GuidedLearningPlayer.test.tsx` passes **with no changes at all** (not even imports).
- New stage tests, using `mockStageLayout`, cover: `clientToImagePct` round-trips `imagePctToContainerPx` at zoom 1 and 2.5 with a letterboxed image; `renderEditLayer` receives the geometry; `onGeometry` fires after measurement.
- `tests/perf/editorPerf.test.tsx` still passes.

#### P1-2b Region- and callout-aware rendering, rich text — `opus` _(visual)_

Depends on: P1-2a.

Key files: `GL/components/GuidedLearningStage.tsx`, `GL/components/interactions/TooltipInteraction.tsx`, `BannerInteraction.tsx`, `TextPopoverInteraction.tsx`, `SpotlightInteraction.tsx`, new `GL/components/interactions/CalloutArrow.tsx`, new `GL/utils/richText.tsx` and test, `GL/components/GuidedLearningStage.test.tsx`, `GL/components/GuidedLearningPlayer.test.tsx` (only the mocked interaction props, if their signatures change).

Do:

1. Rendering changes:
   - Spotlight cuts out `regionPath` (a rounded rect, ellipse or polygon) instead of a radius circle whenever `step.region` is set. Callout keep-out uses the region's bounding box. Legacy `spotlightRadius` behaviour is unchanged when `region` is absent.
   - Pan-zoom focuses on the region centre.
   - In explore mode, a step with a `region` gets a transparent button covering the region (hover outline, the step label as `aria-label`) in addition to the pin. A step without a region keeps the pin as its only target.
   - A hidden hotspot (`hotspotAlwaysHidden`) with a region renders that region as an invisible click target. Today hidden hotspots render nothing and cannot be clicked at all, which contradicts the type doc at `types.ts:6908-6913`.
   - The tooltip uses `placeCallout` with the region rect as the target and `tooltipPosition` as the preference. It draws `CalloutArrow` (replacing the connector line at `TooltipInteraction.tsx:97-132`) and honours `calloutPin`.
   - Banner uses `placeBanner`, and popover uses `placePopover` or the pin.
   - Keep the existing size tokens (`min(Npx, Xcqmin)`).
2. `richText.tsx`: `renderStepText(text)` supports `**bold**` and `[label](https://…)` (https only, `target="_blank" rel="noopener noreferrer"`). Everything else is literal and there is no HTML injection. Use it in tooltip, popover, banner and spotlight label.
3. Add `data-gl-callout={step.id}` and `data-gl-region={step.id}` attributes so the Studio can hit-test.

Don't touch: `GuidedLearningPlayer.tsx` step/timer logic; the Studio (does not exist yet).

Done when:

- `GuidedLearningPlayer.test.tsx` passes; any edit is limited to interaction mock props, and the PR lists each edit.
- New stage tests (with `mockStageLayout`) cover: region spotlight size, explore hit inside and outside an ellipse and a polygon, a hidden region clickable, tooltip not overlapping a region at each edge, a pinned callout rendered at the pin, banner at the bottom for a top target, and rich text rendering `<strong>` and a safe link while escaping `<script>` and rejecting `javascript:`.
- _(visual)_ screenshots: one v2 set (no new fields) before/after at each preset showing only the tooltip-overlap fix; one fixture v3 set with a rect, an ellipse and a polygon region.

Notes: no visual change for a v2 set without the new fields except that tooltips no longer cover their target. Call that out in the PR as intended.

#### P1-3 Editor document reducer with undo/redo — `sonnet` _(logic)_

Depends on: P1-1 (imports `EditorHistoryApi` from `GL/types/stage.ts`; otherwise parallel with P1-2a/b).

Key files: `GL/components/useGuidedLearningEditorState.ts`, new `GL/components/editorHistory.ts` and test, `GL/components/GuidedLearningEditorModal.tsx` (only if the controller shape needs a pass-through).

Do:

1. Move the document fields (title, description, mode, `imageUrls`, `imageKinds`, `videoTrims`, `steps`, `hotspotPulse`, `imageTransition`, welcome fields, `watchPace`) into one `useReducer` with `{ past, present, future }`. UI state (selection, `addingStep`, uploads, measurements) stays in `useState`.
2. Keep the public controller interface (`:46-111`) identical so `persistDraft`, `isDirty` and autosave keep working. `setSteps` must keep its `React.Dispatch<SetStateAction>` signature, including functional updaters. Extend the controller with `EditorHistoryApi` (from `GL/types/stage.ts`). A drag or resize commits one history entry on `endGesture`, not one per pointer move.
3. Cap history at 100 entries. Coalesce text typing into one entry per 800ms pause. Reset history when the set id changes (the existing reset at :186-209).
4. `queueMediaDeletion` keeps a pending list in a ref (not in history). Expose `flushMediaDeletions(deleteFile, deleteDriveFile)` for the save-on-close path. Undoing the edit that queued a deletion removes it from the list (store the ref on the history entry).

Don't touch: `GuidedLearningEditor.tsx` and the modal's UI.

Done when: tests cover undo/redo of add, move (one entry per gesture), delete step, delete slide (restoring shifted `imageIndex` values), reorder, a functional `setSteps` updater, text coalescing, and a queued deletion being dropped by undo; `GuidedLearningEditorModal.test.tsx` and `tests/perf/editorPerf.test.tsx` still pass.

Notes: no UI in this item; the Studio wires Ctrl/⌘+Z, Ctrl/⌘+Shift+Z and Ctrl+Y.

#### P1-4a Studio shell, device frames, canvas, shortcuts — `opus` _(visual)_

Depends on: P1-2b, P1-3.

Key files: new `GL/components/studio/GuidedLearningStudio.tsx`, `studio/StudioCanvas.tsx`, `studio/DeviceFrame.tsx`, `studio/devicePresets.ts`, `studio/useStudioShortcuts.ts`, new `GL/components/useSetDraftPersistence.ts` (extracted), new `GL/components/EditorHeader.tsx` (extracted), `GL/components/GuidedLearningEditorModal.tsx` (switch to the extracted hook and header; add the v3 notice), `GL/Widget.tsx:1322-1358`, `locales/*.json`.

Do:

1. **Extract, don't copy.** Move `persistDraft`, `isDirty`, the `draftToken`/autosave wiring and the legacy-radius conversion at load (`GuidedLearningEditorModal.tsx:292-470`) into `useSetDraftPersistence`, and the header (editable title, `AutosaveIndicator`, close flush and confirm, AI generator button behind `gemini-functions`) into `EditorHeader`. The modal switches to both with no behaviour change. On a successful save **that closes the editor**, call `flushMediaDeletions` (P1-3).
2. **Shell:** full-viewport portal at `Z_INDEX.modalContent`, fixed inset 0, with `EditorHeader`, a left column placeholder, the canvas in the centre, and a right column placeholder (P1-4b fills both). The Widget opens the Studio by default; the Studio header has an **"Open classic editor"** link that closes it and opens the modal on the same set.
3. **Classic editor and v3 sets:** the modal keeps `region`, `calloutPin`, `cursor`, `narration`, `tour` and `tourSetup` untouched on save and shows a notice when any step has them: "This activity uses Studio features. Edit regions and callouts in the Studio." Add a round-trip test: load a v3 fixture in the modal, edit a title, save, and assert every v3 field is deep-equal.
4. `devicePresets.ts` exports `DevicePreset[]`: `board` 720×520 (the widget default), `help` 1024×576 (the 16:9 Help viewer), `chromebook` 1366×657 with the student app's footer clearance in `footerPx`, `projector` 1920×1080, and `custom` (width/height inputs). The last choice is remembered in localStorage (try/catch).
5. `DeviceFrame` renders its child at the preset's **true pixel size** with `containerType: size`, applies `transform: scale(k)` to fit, and provides `DeviceFrameContextValue`. No pointer maths may use `k` directly: use `StageGeometry.clientToImagePct`.
6. `StudioCanvas` renders `GuidedLearningStage` inside the frame with `forceOverlay` for the selected step, so its callout, banner, popover, spotlight and zoom render exactly as in play, plus a selection outline.
7. `useStudioShortcuts(keymap)`: **the single table of every Studio shortcut** (later items add rows rather than new listeners). It ignores events when focus is in an `input`, `textarea`, `select` or `[contenteditable]`, or while inline editing (P1-6) is active, and calls `stopPropagation` on handled keys so dashboard shortcuts never fire. This item registers undo (Ctrl/⌘+Z), redo (Ctrl/⌘+Shift+Z, Ctrl+Y), Delete (removes the selected step with an undo toast), and `[` / `]` (previous/next step).

Don't touch: `GuidedLearningEditor.tsx` beyond what the extraction strictly needs; `tests/perf/editorPerf.test.tsx` (it must keep passing against the modal).

Done when:

- RTL tests: the Studio opens for a set; switching presets changes the frame's inner size to the preset pixels; the selected tooltip step renders `data-gl-callout`; undo restores a deleted step; autosave fires `onSave` after an edit (fake timers); a shortcut typed inside an input does nothing; "Open classic editor" opens the modal on the same set; the v3 round-trip test above.
- `GuidedLearningEditorModal.test.tsx` and `tests/perf/editorPerf.test.tsx` pass unchanged.
- _(visual)_ at each preset, a screenshot of the Studio frame and of the matching real surface (widget at 720×520, Help viewer, student app at 1366×657, 1920×1080) show the callout in the same place.

#### P1-4b Filmstrip, properties panel, timeline, Play from here — `opus` _(visual)_

Depends on: P1-4a.

Key files: new `studio/StudioFilmstrip.tsx`, `studio/StudioPropertiesPanel.tsx`, `studio/StudioTimeline.tsx`, `studio/StudioPlayMode.tsx`, `studio/GuidedLearningStudio.tsx`, `GL/components/GuidedLearningStepEditor.tsx` (reused in the properties panel), new `GL/components/editorShared/` (moved from `GuidedLearningEditor.tsx`: `SettingChip`, `WelcomeChip`, `CaptureMenuButton`, `VideoTrimBar`), `GL/components/GuidedLearningEditor.tsx` (import the moved components), `locales/*.json`.

Do:

1. **Filmstrip** (left): slide thumbnails with step-count badges, drag to reorder (`SortableList`), add/paste/capture/drop, delete.
2. **Properties panel** (right): set settings when nothing is selected, `GuidedLearningStepEditor` when a step is selected. Below 1024px wide it collapses into a drawer.
3. **Timeline** (bottom): step pills for the current slide in order, reorder with `SortableList layout="grid"`, click to select.
4. Move the four shared components into `editorShared/` so the modal and the Studio import the same code. The modal renders identically.
5. **Play from here** (button and `useStudioShortcuts` row `Shift+Space`) swaps the canvas to the real `GuidedLearningPlayer` in the same frame, starting at the selected step, with a floating "Back to editing" button. Escape also returns. Selection returns to whatever step was showing.

Don't touch: `GuidedLearningStage.tsx`; the modal's behaviour.

Done when: RTL tests cover reordering slides and steps (one undo each), selecting a step from the timeline, the properties panel showing set settings with nothing selected, Play from here mounting the player at the selected index and returning selection on Escape; modal tests pass unchanged; _(visual)_ screenshots of the full Studio at 1440×900 and at 1000px wide (drawer collapsed).

Notes: the Studio mounts only for admins today, as the modal does.

#### P1-5 Canvas editing layer: place, draw, drag, resize, pin, nudge, zoom, snap — `opus` _(visual)_

Depends on: P1-4b.

Key files: new `GL/components/studio/StudioEditLayer.tsx`, `studio/useCanvasViewport.ts`, `studio/snapping.ts` and tests; `studio/StudioCanvas.tsx`, `studio/useStudioShortcuts.ts` (add rows).

Do:

1. The edit layer renders through `renderEditLayer` so it shares `StageGeometry`. **All pointer maths goes through `clientToImagePct`**; never divide by `k` or the canvas zoom by hand. All shortcuts below are rows in `useStudioShortcuts`.
2. **Add mode** (toolbar button or `A`):
   - A click places a point at the default region and auto callout, then selects it.
   - A drag beyond 4px draws a region using the current shape tool: Rectangle (`R`, the default), Ellipse (`E`), or Polygon (`P`). For a polygon, click to add vertices; Enter, a double-click or clicking the first vertex closes it; Escape cancels. Shift constrains a rect to a square or an ellipse to a circle.
   - Coordinates are clamped to the image (not 2–98; regions may touch edges).
3. **Select vs move:**
   - A pointer-down on an unselected hotspot selects it only.
   - Moving requires the hotspot to already be selected, or a drag beyond 6px that starts on it. This removes the click/drag ambiguity.
   - Alt-click (or repeated clicks at the same spot) cycles through overlapping hotspots under the pointer.
   - Tab and Shift+Tab cycle through hotspots on the slide.
4. Moving a polygon translates every vertex by the same delta and recomputes `xPct`/`yPct`/`wPct`/`hPct` from `polygonBBox`; clamping keeps the whole polygon inside the image. A selected rect or ellipse shows 8 resize handles plus a centre move handle. A selected polygon shows a handle per vertex: drag moves a vertex, Alt-click on an edge inserts one, and Delete on a focused vertex removes it (minimum 3). The properties panel has a shape switcher (converting rect or ellipse to polygon seeds 4 or 12 vertices) and, for rects, a corner-radius slider. Drag and resize use `beginGesture`/`endGesture`.
5. **Callout:**
   - Dragging the rendered callout of the selected step sets `calloutPin`. **Drag vs double-click:** movement beyond 4px between pointer-down and pointer-up is a drag (pins the callout, one history entry); otherwise a double-click enters inline editing (P1-6).
   - "Reset to auto" appears in a floating mini-toolbar next to the selection and in the properties panel.
   - Callouts render at their play position because the stage renders them.
6. **Nudge:** arrows move the selected region, or the callout if it has focus, by 0.25% of the image; Shift moves 2%. One history entry per 800ms burst.
7. **Viewport:** Ctrl/⌘+wheel or pinch zooms 100–400% around the pointer; Space+drag or middle-drag pans; `0` fits; `1` shows 100%. This zoom is on the canvas wrapper, outside the device frame, so the stage size never changes.
8. **Snapping** (hold Ctrl/⌘ to disable): region edges and centre snap to other regions' edges and centres on the same slide and to the image centre lines within 6 screen px. Show guides while snapping.
9. A hover outline and a label chip show "Step N · type" on the target under the pointer.

Don't touch: `GuidedLearningStage.tsx` (extend only through `renderEditLayer`); the modal.

Done when: unit tests cover snapping and viewport maths (zoom around a point, `clientToImagePct` at k≠1 and canvas zoom≠1). RTL tests (with `mockStageLayout`) cover: click places a default step; drag draws a rect region; clicking an unselected hotspot does not move it; Alt-click cycles overlapping hotspots; dragging a polygon moves all vertices; dragging a callout sets `calloutPin` and Reset clears it; a 3px callout wiggle plus double-click enters editing rather than pinning; ArrowRight nudges by 0.25; one undo reverts a whole drag. _(visual)_ screenshots of a selected rect, ellipse and polygon with handles, and snapping guides.

#### P1-6 Inline text editing on the canvas — `sonnet` _(visual)_

Depends on: P1-5 (both edit `StudioCanvas.tsx` and the shortcut table).

Key files: new `GL/components/studio/InlineCalloutEditor.tsx` and test, `GL/components/GuidedLearningStage.tsx` (wire the existing `editingStepId` / `renderCalloutEditor` props into each interaction's body), `studio/StudioCanvas.tsx`, `studio/useStudioShortcuts.ts` (Enter, Ctrl/⌘+B, Ctrl/⌘+K rows; suppress other rows while editing).

Do:

1. Double-clicking a tooltip, popover, banner or spotlight label (or pressing Enter with a step selected) turns that callout's label and text into plain-text `textarea`/`input` elements styled to match. Use no `contentEditable`, so no HTML gets in. The box re-measures and re-places live as you type.
2. `Ctrl/⌘+B` wraps the selection in `**`, and `Ctrl/⌘+K` prompts for an https URL and wraps it as a link. Escape or clicking outside commits. History coalesces per P1-3.
3. The properties panel and the canvas edit the same fields. Show a soft counter when text exceeds 25 words, matching the `gl-author` guidance.

Don't touch: the placement utilities; the edit layer's pointer handling.

Done when: RTL tests cover double-click entering edit mode, typing updating the step, `R`/`E`/`Delete` typed while editing going into the text rather than firing tools, Ctrl+B wrapping, Escape committing, and a `javascript:` URL being rejected. _(visual)_ screenshots of a tooltip and a banner mid-edit.

#### P1-7 `gl-author` skill, validator and importer on v3 — `sonnet` _(logic)_

Depends on: P1-1.

Key files: `.claude/skills/gl-author/SKILL.md`, `.claude/skills/gl-author/scripts/validate_gl_json.mjs`, `GL/adapters/guidedLearningImportAdapter.ts` and test, `GL/utils/glTransfer.ts` and test.

Do:

1. The validator accepts `schemaVersion` 2 or 3 and validates `region` (shape enum; `wPct`/`hPct` in (0,100], centre ± half-size inside 0–100; `cornerPct` 0–50; polygon `points` 3–24 within 0–100 and consistent with the bbox) and `calloutPin` (0–100). It rejects `narration` (Storage-bound) and accepts `tour` only with a known anchor id if `config/tourAnchors.ts` exists; until P3-1, treat `tour` as an error.
2. The skill instructs: write v3; for app walkthroughs, set `region` from Playwright element bounds (exact, instead of estimated centre points), leave callouts on auto, and pin only when auto placement is clearly wrong in the verification render.
3. The importer validates the region and callout ranges the same way. A file with `schemaVersion > 3` fails with "made by a newer version." Legacy files without a version keep importing.

Don't touch: the Studio and player.

Done when: validator unit fixtures (pass and fail cases, including a polygon and a `tour` rejection) and adapter tests pass; an exported v3 fixture re-imports deep-equal.

#### P1-8 Pre-existing GL defects found during planning — `haiku` _(logic)_

Depends on: nothing.

Key files: `utils/ai.ts:621` and `GL/components/GuidedLearningAIGenerator.tsx:376-383`, `GL/components/GuidedLearningEditor.tsx` (`StepNavigator` :1592).

Do:

(The student-app `containerType` fix and the `tooltipOffset` doc fix moved into P1-1, which edits the same files.)

1. Remove the unreachable out-of-range `imageIndex` warning path. The server already coerces these to 0 (`functions/src/aiGeneration.ts:2342-2347`).
2. Pass `layout="grid"` to the `SortableList` in `StepNavigator` (the modal lives until P1-10).

Don't touch: `types.ts`, the student app.

Done when: `vitest related` passes for the touched files and the PR lists each defect with its file:line.

#### P1-9 Blur tool for slides — `sonnet` _(visual)_

Depends on: P1-4b (and P1-3 for `queueMediaDeletion`).

Key files: new `GL/components/studio/BlurTool.tsx`, new `GL/utils/redactImage.ts` and test, new `GL/utils/fetchSlideBlob.ts` and test, `GL/components/studio/StudioCanvas.tsx`, `studio/useStudioShortcuts.ts` (`B` row), `GL/components/useGuidedLearningEditorState.ts` (a `replaceSlideImage(index, blob)` action), `hooks/useStorage.ts` (read only: `uploadGuidedLearningImage`, `deleteDriveFile`, `deleteFile`).

Do:

1. A Blur tool (`B`) in the Studio toolbar. Drag rectangles over the slide, which show as a translucent overlay while editing. "Apply blur" bakes them in.
2. **Load pixels as a Blob, never through an `<img>` URL.** Most slides are Drive-hosted (`https://lh3.googleusercontent.com/d/{id}`), and drawing a cross-origin image taints the canvas so it cannot be exported. `fetchSlideBlob(url)` downloads through the Drive API for `lh3` URLs (extract the file id; use the Drive service's download method, adding one if missing) and through the Firebase Storage SDK (`getBlob`) for Storage URLs.
3. `redactImage(blob, rects, { mode: 'blur' | 'solid' })` decodes with `createImageBitmap`, draws at natural size, and applies a strong blur (at least 16px radius, applied twice so text can't be recovered) or a solid fill to each rect. It returns a PNG `Blob`.
4. Apply: upload with `uploadGuidedLearningImage` (Drive-first, same as other slides), replace the slide URL and `imagePaths`/Drive id, and `queueMediaDeletion` the old image. The original is deleted by the save-on-close flush (P1-4a), so **undo works for the whole editing session**, and the original never outlives it. The confirm text says: "The unblurred original is deleted when you close the editor."
5. Video slides are not supported; the tool is disabled on them.

Don't touch: the upload helpers' behaviour; the player.

Done when: unit tests for `redactImage` (pixels inside a blurred rect differ from the source, pixels outside are unchanged) and `fetchSlideBlob` (lh3 URL → Drive download called with the id; Storage URL → `getBlob`); RTL tests that applying replaces the slide URL and queues the old image, that undo restores the old URL and un-queues it, and that closing after save calls the delete helper once. _(visual)_ before/after screenshots of a blurred slide on a Drive-hosted image on spartboard-dev.

#### P1-10 Retire the classic editor — `sonnet` _(logic)_

Depends on: P1-5, P1-6, P1-9.

Key files: `GL/components/GuidedLearningEditorModal.tsx` and test (delete), `GL/components/GuidedLearningEditor.tsx` (delete what nothing else imports), `GL/Widget.tsx` (remove the lazy import and the "Open classic editor" path), `tests/perf/editorPerf.test.tsx`, `GL/components/studio/GuidedLearningStudio.tsx` (remove the link).

Do:

1. **Parity checklist** in the PR, each line proven by a Studio test or screenshot: AI generator; capture menu (screen snap, recording); video slides and trim; welcome message; hotspot pulse and image transition settings; paste, drop and upload of slides; slide reorder and delete; question steps (every question type); audio and video step media; import/export (`glTransfer`); folder picker; legacy-radius conversion at load; autosave and close-confirm. Any missing item blocks the deletion and is reported in `concerns`.
2. **Port the perf test** (`tests/perf/editorPerf.test.tsx`) to the Studio with the same scenario (mount, type ×25, switch slides ×10, add step). Before deleting the modal, record the modal's numbers on the same machine in the PR; the Studio must be no slower on each metric.
3. Add a perf scenario for dragging a region across 60 pointer moves: one stage render per animation frame at most, and exactly one history entry.
4. Delete the modal, its test, the "Open classic editor" link, and editor code nothing else imports.

Don't touch: the player, the stage.

Done when: the parity checklist is complete; both perf scenarios pass with the budgets above; `type-check` passes; no import of the deleted files remains (`grep`).

#### P1-11 Proof: rebuild the hardest Help walkthrough in the Studio — orchestrator + Paul _(proof)_

Depends on: P1-10, P1-7.

Do: the orchestrator lists the building sets (`building_guided_learning`) and picks the one with the most steps whose targets are small UI controls (icon buttons, tabs, toggles). Open it in the Studio and rebuild its placement: a drawn region on every target, callouts on auto unless auto is clearly wrong, rich text where it helps. **Do not use Play from here to check placement**; the canvas is the check.

Done when: at all four presets, every region fits its target and no callout covers any target (screenshots of each step at `board` and `chromebook`, and the full set at `help` and `projector`); Paul plays the set once on spartboard-dev and confirms it matches the Studio. Anything that needed Play to get right is written up as a follow-up.

### Phase 2 — Player: motion, Watch/Try, read-aloud, analytics

P2-1 may start once P1-2b merges; it does not wait for the rest of Phase 1. P2-1 → P2-2 → P2-3 run one at a time because they all edit the player and stage. P2-4's Cloud Function and P2-5's rules can be built alongside; their player wiring waits for P2-3.

#### P2-1 Calm motion and learner speed — `sonnet` _(visual)_

Depends on: P1-2b.

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

Don't touch: Studio files.

Done when: tests cover duration maths, reduced motion giving 0ms, speed persistence, the callout mounting after the zoom ends (fake timers), and today's timings with `playerV2` false. _(visual)_ a short screen recording or frame sequence of one zoom step at 1× and 0.5×.

#### P2-2 Watch / Try toggle and animated cursor — `opus` _(visual)_

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
4. Emit `onStepEvent(e: StepEvent)` (from `GL/types/stage.ts`) from the player for P2-5 and P2-3. It does nothing when no handler is passed.

Don't touch: Studio files; the student app (P2-5 wires it).

Done when: tests cover the default mode per author mode, the toggle keeping the index, Watch auto-advancing at the computed duration, Try advancing only on an in-region click, a misclick counting, the hint after 5s, reduced motion placing the cursor without animating it, the event sequence for one Try step, and no toggle or cursor when `playerV2` is false. _(visual)_ screenshots of Watch mid-glide and Try with the hint cursor.

#### P2-3 Orientation and accessibility: outline, resume, live region, focus, read-aloud — `sonnet` _(visual)_

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

Don't touch: Studio files.

Done when: tests cover the outline jump, the resume prompt, the live-region text, focus moving into a popover, and read-aloud calling `speak` and `cancel` (mock `speechSynthesis`). _(visual)_ screenshots of the outline open and the resume prompt.

#### P2-4 Narration: generated (Google Cloud TTS) or your own recorded voice — `opus` _(visual)_

Depends on: P1-4b (Studio properties panel) and P1-3 (`queueMediaDeletion`). The function (step 1) can start any time; the player side waits for P2-3.

Key files: new `functions/src/guidedLearningNarration.ts` and test, `functions/src/index.ts` (export), `functions/src/quizReadAloud.ts` (extract a shared `synthesizeToCache(text, voice, cachePrefix)` if one does not exist; do not change quiz behaviour), `GL/components/studio/StudioPropertiesPanel.tsx`, new `GL/utils/narration.ts`, `utils/ai.ts` or a sibling client wrapper. No `storage.rules` change: the cache path below already has read rules.

Do:

1. `synthesizeGuidedLearningNarrationV1` (`onCall`, `ALLOWED_ORIGINS`, admin-only via `resolveCallerIsAdmin`):
   - Input `{ text, voice }`, capped at 1,500 characters.
   - Returns `{ url, storagePath, voice, textHash, durationMs }`.
   - Caches at the **existing** `quiz_tts_cache/{voice}/{sha256}.mp3` (the key is the same voice + text hash, so quiz and GL share hits and the existing storage rule covers reads).
   - Neural2 voices from an allow-list, defaulting to the quiz default.
   - Reuses the quiz admin cap and fallback settings; if they are quiz-specific, read them but do not share quotas (flag in the PR).
2. Studio: "Generate narration" for the selected step, and "Generate all" (sequential, with progress). Show a stale badge when `textHash` no longer matches the current label and text, and a play preview.
3. **Record your own voice:** a "Record voice" button next to Generate in the properties panel.
   - Reuse `hooks/useAudioRecording.ts` and the `components/quiz/recording/AudioResponseCapture` UI (record, stop, play back, re-record) rather than writing a new recorder.
   - Save uploads the take through `uploadGuidedLearningMedia` (`hooks/useStorage.ts:156`) and stores `narration: { source: 'recorded', url, storagePath, durationMs, textHash }`.
   - A recorded take replaces generated narration for that step. Deleting it leaves the step with no narration, and the author can generate again. Instead of the stale badge, show "Text changed since recording" when the current label and text hash differs from the saved one.
   - "Generate all" skips steps with a recorded take.
   - Replacing or deleting a recorded take calls `queueMediaDeletion({ storagePath })` for the old file. **Only `source: 'recorded'` files are ever deleted**; generated files live in the shared cache and are never deleted by GL. (There is no existing cleanup for `audioStoragePath` to copy; this is new.)
4. The player plays either source the same way, per P2-3.

Done when: function unit tests (mock the TTS client) cover the cache hit, the cap, and the admin requirement. RTL tests cover the stale badge, that generate stores the `narration` field, that a recorded take (mock `AudioRecordingDeps`) stores `source: 'recorded'`, that Generate all skips it, that replacing a recorded take queues the old file, and that removing generated narration queues nothing. _(visual)_ screenshots of the properties panel with generated, recorded and stale states.

Notes: no new secret. Functions deploy to dev from `dev-paul` CI.

#### P2-5 Step analytics: progress docs, rules, Results view — `opus` _(rules + visual)_

Depends on: P2-2. The rules part is an orchestrator PR.

Key files: new `hooks/useGuidedLearningProgress.ts` and test, `components/guidedLearning/GuidedLearningStudentApp.tsx` (wire `onStepEvent`), `GL/components/GuidedLearningResults.tsx`, new `GL/components/results/StepFunnel.tsx`, `results/MisclickHeatmap.tsx`, `firestore.rules` (protected: draft text in `concerns`), `tests/rules/guidedLearningProgress.test.ts`.

Do:

1. **Writer:** aggregate events in memory into the **Data model** shape. Throttle `setDoc(..., { merge: true })` to at most one write every 10s, plus `pagehide`/`visibilitychange` flushes. The first write sets `startedAt`. Clicks are capped at 20 per step and rounded to 0.1%. Only the student app writes (not teacher previews, Help Center or the Studio).
2. **Rules** (draft):
   - `match /guided_learning_sessions/{sessionId}/progress/{uid}`.
   - Mirror the `responses` block (`firestore.rules`, `match /guided_learning_sessions/{sessionId}` → `match /responses/{studentUid}`) and reuse its helper functions by moving them up to the session scope.
   - Create and update when `request.auth.uid == uid`, the session exists, the keys are a subset of the model, `furthestStepIdx` is an int from 0 to 500, and the `steps` map has at most 200 keys.
   - **Submissions mode:** also require `passesStudentClassGateCompat(glSessionClassIds(), glSessionClassId())`, `glWithinSessionOpenWindow()` and `glWithinSessionCloseWindow()`, exactly as `responses` does.
   - **View-only (share link) mode:** skip the class gate (share-link viewers have no class), keep the close window.
   - `startedAt` is immutable after create.
   - Read (get **and** list) by the owning teacher or an admin; a student may get their own doc. Never delete by students.
   - Add rules tests for each branch and run `node scripts/releaseFirestoreRules.mjs spartboard-dev` to check the size caps.
3. **Results:** new "Engagement" section:
   - A drop-off funnel (viewers reaching each step, as a bar per step);
   - Median time per step;
   - A misclick heatmap per slide (dots over the slide image, rendered with the stage geometry helpers);
   - A Watch vs Try split with completion rate each.
     Shown for both view-only and submissions sessions. View-only sessions also keep the view count.

Don't touch: `responses` or `views` rule behaviour (only move shared helpers).

Done when: rules tests pass in CI, including: other uid denied; class gate denied in submissions mode; share-link write allowed without a class; write before `openAt` and after `closeAt` + grace denied; oversized map denied; `startedAt` change denied. Hook tests cover throttling, flush on `pagehide`, the click cap, and no writes in `teacherMode`; Results tests render the funnel and heatmap from fixture docs. _(visual)_ screenshot of the Engagement section from fixture data.

Notes: use the `dataviz` guidance for charts. Keep the design in the Results view's existing light style.

#### P2-6 Proof: play one set in Watch and Try — Paul _(proof)_

Depends on: P2-5.

Do: with `gl-player-v2` on for admins on spartboard-dev, Paul assigns one set (the P1-11 set is a good choice) through a share link, then plays it himself with a test student account: once in Watch, once in Try (including at least two misclicks and one hint), and once with OS reduced motion on.

Done when: Paul confirms Watch feels calm, Try waits for him and hints, and reduced motion only cuts and fades; the Engagement view shows both runs in the funnel, the misclicks on the heatmap and a Watch/Try split. Screenshots go in the tracking issue.

### Phase 3 — Recorder and live tours (after Phase 2 merges; P3-1 may start any time)

#### P3-1 Tour anchor registry, shell tagging, CI guard, checklist — `sonnet` _(logic)_

Depends on: nothing.

Key files: new `config/tourAnchors.ts`, new `tests/tourAnchors.test.ts`, `components/layout/dock/Dock.tsx`, `components/common/DraggableWindow.tsx` (settings opener :2897/:3081, close, minimise, the toolbar root), `components/common/SettingsPanel.tsx`, `components/settings/SettingsDrawer.tsx`, `components/layout/sidebar/Sidebar.tsx`, `components/layout/BoardActionsFab.tsx`, `components/layout/BoardNavFab.tsx`, `.claude/skills/new-widget/SKILL.md`, `CLAUDE.md` (one line under Layout).

Do:

1. Create the registry and `tourAttr` helper from **Data model**. Tag the app shell: dock open-tools and each dock item (per widget type: `dock.item` with `data-tour-widget-type`), widget settings opener, close, minimise, the settings panel and drawer (root, tabs, close), sidebar menu, board create, board switch, What's New, Help, and board actions FAB items. Aim for about 30 anchors.
2. **CI guard test:** for each `TOUR_ANCHORS` key, grep the source (`components/`, `context/`, `App.tsx`) for `tourAttr('key'` or `data-tour="key"`. Fail with the missing keys. Also fail if a `data-tour` literal appears in source that is not in the registry.
3. Add a new-widget skill checklist step: "Tag the widget's primary actions with `tourAttr` (add item, start, reset, main settings toggles) and register them as `<widgetType>.<action>`." Add one line to CLAUDE.md pointing to `config/tourAnchors.ts`.

Don't touch: component structure or styling; only add attributes.

Done when: the guard test passes; removing one tag locally makes it fail (describe this in the PR); an unregistered `data-tour` literal makes it fail; existing snapshot tests pass unchanged.

Notes: widget-internal tagging beyond the shell happens per widget as tours are recorded. The recorder (P3-3) lists untagged clicks to drive this.

#### P3-2 Demo mode: ephemeral board with fixture classes — `opus` _(visual)_

Depends on: P1-0 recommending **Proceed**. If P1-0 recommended dropping demo mode and Paul agreed, this item is removed (see P1-0).

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

Don't touch: anything outside the call sites the P1-0 report listed; if more are needed, stop and report in `concerns`.

Notes: this is the highest-risk item, which is why P1-0 scopes it first.

#### P3-3 Recorder and AI step-text drafting — `opus` _(visual)_

Depends on: P3-1, P3-2 (or P3-7 if demo mode was dropped), P1-4b.

Key files: new `GL/components/recorder/TourRecorder.tsx`, `recorder/useTourCapture.ts`, `recorder/resolveAnchor.ts` and test, `GL/components/ScreenCaptureModal.tsx` (extract the `getDisplayMedia` and `grabFrame` helpers at :66-77 and :175-207 into `GL/utils/displayCapture.ts` and reuse them), `functions/src/aiGeneration.ts` (new callable), `functions/src/index.ts`, `utils/ai.ts`.

Do:

1. **Start:** available in demo mode only. (P3-7 later adds the real-board option; until it lands the recorder refuses to start outside demo mode.) Chrome only: `preferCurrentTab` is Chromium-specific, so other browsers see "Recording needs Chrome." A floating recorder pill (Record / Pause / Mark step / Finish / Discard) is excluded from anchor resolution via `data-tour-ignore`.
   - Calls `getDisplayMedia({ video: { cursor: 'never' }, preferCurrentTab: true, selfBrowserSurface: 'include' })` so the real mouse pointer is not baked into frames (the animated cursor replaces it).
   - Rejects the recording if the shared surface is not this tab (track settings `displaySurface !== 'browser'`), with a clear message.
2. **On each capture-phase `pointerdown`** (before the app handles it):
   - Set the recorder pill (and any recorder toast) to `visibility: hidden`, wait one `requestAnimationFrame`, grab a frame, then restore it, so the recorder never appears in a slide.
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

- Unit tests cover `resolveAnchor` (tagged, per-widget, fallback, ignored recorder UI), rect → image-% at DPR 1 and 2 with a letterboxed frame, and the pill being hidden during the grab.
- A function test covers the admin gate and output clamping.
- A manual run on spartboard-dev records a 5-click walkthrough whose regions land on their targets in the Studio, with screenshots in the PR.

#### P3-4 Live tour runner — `opus` _(visual)_

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

#### P3-5 Launch points — `sonnet` _(visual)_

Depends on: P3-4.

Key files: `types.ts` (`GuidedLearningSet`: add `hasLiveTour?: boolean`), `GL/components/useSetDraftPersistence.ts` (stamp it on save), `components/help/HelpGuidesTab.tsx`, `components/help/HelpResourceViewer.tsx`, `components/common/SettingsPanel.tsx:261-274`, `components/settings/SettingsDrawer.tsx:506-518`, `hooks/useHelpResources.ts`, new `components/tours/useTourOffers.ts`, `hooks/useChangelog.ts`, `components/layout/WhatsNewModal.tsx`, `public/changelog.json` (schema only), `locales/*.json`.

Do:

1. **Help Center:** GL items whose building set has `hasLiveTour: true` show "Show me live" next to Play, closing Help and calling `requestStartTour`. `useSetDraftPersistence` stamps `hasLiveTour = steps.some(s => s.tour)` on every building-set save, so the flag is always current. The Help Center reads it from the building set doc it already loads for Play (or a single `getDoc` if it doesn't). No Help item schema or rules change. Existing tour sets get the flag the next time they are saved in the Studio.
2. **Widget `?`:** when a help item for that `widgetType` points at a set with `hasLiveTour`, the `CircleHelp` button opens a two-choice popover: "Show me live" or "Open guides".
3. **Onboarding offer:** the first time a user adds a widget type that has a live tour, show a toast: "Take a 1-minute tour of <Widget>?" with Start and No thanks. Record it as offered per type in localStorage (`spart_tour_offered_<type>`) and never offer again. Skip it in demo mode and during a running tour.
4. **What's New:** add an optional `tourSetId` to the entry type. When present, the entry shows "Show me" and starts the tour.

Don't touch: the runner (P3-4).

Done when: tests cover each launch point, including the offer shown once per type and `hasLiveTour` flipping when a tour step is added and saved.

#### P3-6 Tour health for admins — `sonnet` _(visual)_

Depends on: P3-4.

Key files: new `components/admin/HelpCenter/TourHealthPanel.tsx`, `components/admin/HelpCenter/HelpCenterManager.tsx`, `config/tourAnchors.ts`.

Do: list every building set with tour steps. For each step, show whether its anchor is in `TOUR_ANCHORS` (static check) and, via "Check live", whether it resolves on the current board (runs the P3-4 resolver without presenting anything). Summarise the broken anchors per set with a link that opens the set in the Studio at that step.

Done when: tests cover a set with an unknown anchor flagged by the static check and the live check reporting found or missing on a fixture DOM.

#### P3-7 Real-board recording with auto-redaction — `opus` _(visual)_

Depends on: P3-3, P1-9 (`redactImage`). If demo mode was dropped at P1-0, this item lands **before** P3-3's recorder can be used and P3-3 depends on it instead.

Key files: new `GL/components/recorder/redaction.ts` and test, `GL/components/recorder/TourRecorder.tsx`, new `GL/components/recorder/FrameReview.tsx`, `hooks/useRosters.ts` (read only), `components/widgets/Webcam/Widget.tsx` and other widgets that show student media (add `data-pii`), `config/tourAnchors.ts` (document `data-pii` next to `data-tour`), `.claude/skills/new-widget/SKILL.md`.

Do:

1. **Name index:** before recording starts, build a matcher from the teacher's rosters (first, last, and "first last" names, plus nicknames and pseudonyms where present). Match case-insensitively on word boundaries, and ignore names shorter than 3 characters unless they are part of a full-name match.
2. **At each captured frame**, before anything leaves memory:
   - walk visible text nodes (a `TreeWalker` over `document.body`, skipping the recorder UI) and collect `Range.getClientRects()` for every roster-name match;
   - add the rects of every element with `data-pii` (webcam `<video>`, student photos, drawing canvases that may contain names);
   - add the rects of any `<input>`/`<textarea>` whose value matches a name;
   - pad each rect by 4px, convert it to frame pixels (same DPR maths as P3-3), and bake it in with `redactImage` (the frame is already a Blob, so there is no canvas-taint issue).
     The raw frame is discarded immediately.
3. **Mandatory review:** on Finish, `FrameReview` shows every frame with its blur boxes highlighted. The author can draw extra boxes before anything uploads; these run `redactImage` on the already-redacted frame, because the raw frame is gone. Upload stays disabled until every frame has been viewed.
4. **Tagging `data-pii`:** add it to Webcam and to any widget that shows student photos or free-form student content, and list the tagged widgets in the PR. Add one line to the new-widget skill: "Tag elements that show student faces, photos or free-form student content with `data-pii`."
5. **Choice at start:** this item lifts P3-3's demo-only restriction. The recorder's start dialog offers "Demo board (recommended)" or "My board, with names blurred", and the second option states the review requirement up front. Remember the choice in localStorage (try/catch).

Done when: unit tests cover name matching (full name, first name only, boundary cases such as "Al" inside "Alice", nicknames) and rect collection from a fixture DOM (text match, `data-pii` element, input value). An RTL test shows upload stays disabled until every frame is reviewed. A manual run on spartboard-dev with the mock test class shows every visible name blurred; put before/after screenshots of the review screen in the PR, never raw frames.

Notes: names drawn onto a canvas (for example inside a drawing) can't be found from the DOM. That is why whole `data-pii` canvases are blurred and why the review step is mandatory.

#### P3-8 Proof: three live tours, published — orchestrator + Paul _(proof)_

Depends on: P3-4, P3-5, P3-6 (and P3-7 if demo mode was dropped).

Do: record, edit in the Studio and publish three tours as building sets with Help items: **create a board**, **add a widget**, **open a widget's settings**. Tag any untagged anchor the recorder lists (in a small P3-1-style PR). Attach each to its launch points: Help Center "Show me live", the widget `?` for the added widget, and one What's New entry.

Done when: with `gl-live-tours` on for admins on spartboard-dev, Paul starts each tour from each of its launch points and completes it; the P3-6 panel shows zero broken anchors; the screenshot version of each tour plays in the student app. Screenshots in the tracking issue.

## Verification matrix (orchestrator, before each phase merge)

| Check                            | How                                                                                                                                                                                                                                                                                                               |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| v2 sets unchanged                | P1-2a: existing player tests pass with no edits at all; P1-2b: edits limited to interaction mocks. Manually open three existing building sets on spartboard-dev in the player before and after: pins, spotlight and zoom are identical, and tooltips no longer cover their targets.                               |
| Studio matches the real surfaces | P1-4a: at each device preset, screenshot the Studio frame and the matching surface (widget at 720×520, Help viewer, student app at 1366×657, 1920×1080); callouts land in the same place.                                                                                                                         |
| Students receive new fields      | P1-1 test on `toPublicStep`; the student app renders a region spotlight and a pinned callout from a v3 session on dev.                                                                                                                                                                                            |
| No answer leakage                | P1-1 test: public steps still contain no `correctAnswer`/`matchingPairs`/`sortingItems` in their original order.                                                                                                                                                                                                  |
| Undo is one step per gesture     | P1-3/P1-5 tests; P1-10 drag perf scenario (exactly one history entry).                                                                                                                                                                                                                                            |
| Classic editor keeps v3 fields   | P1-4a round-trip test; P1-10 parity checklist before deletion.                                                                                                                                                                                                                                                    |
| Studio is not slower             | P1-10: ported perf scenario no slower than the modal's recorded numbers; drag scenario within one render per frame.                                                                                                                                                                                               |
| Blurred originals don't linger   | P1-9: old image queued, deleted exactly once on save-and-close; undo un-queues it. Generated narration is never deleted (P2-4).                                                                                                                                                                                   |
| Strings translated               | Every PR: new keys present in en, de, es and fr.                                                                                                                                                                                                                                                                  |
| Proof items                      | Phase 1: P1-11. Phase 2: P2-6. Phase 3: P3-8.                                                                                                                                                                                                                                                                     |
| Motion is calm and reducible     | P2-1 tests; manual check with OS reduced motion on.                                                                                                                                                                                                                                                               |
| Analytics cannot be abused       | P2-5 rules tests: another uid denied, class gate enforced in submissions mode, share-link writes allowed, oversized maps denied, writes outside the open/close window denied; `releaseFirestoreRules.mjs spartboard-dev` within size caps.                                                                        |
| No student data in recordings    | P3-2 test: no Firestore writes in demo mode. P3-3: the recorder refuses to start outside demo mode until P3-7, and hides its own UI and the pointer in frames. P3-7: name and `data-pii` redaction tests; upload blocked until review; the upload spy only ever receives `redactImage` output, never a raw frame. |
| Tour anchors do not rot          | P3-1 guard test in CI; P3-6 panel lists zero broken anchors for published tours before release.                                                                                                                                                                                                                   |
| Validation gate                  | Each PR: `vitest related` on the touched files; `type-check` once for shared types; CI is the full gate. Pre-existing failures surfaced in the touched area are fixed or raised to Paul, never waved off.                                                                                                         |

## Open assumptions (flag to Paul if any is wrong)

1. **Watch/Try mapping:** `guided` defaults to Watch, `structured` defaults to Try, and `explore` has no toggle. Under Try, Next still works as a skip.
2. **Default click zone:** a hotspot without a `region` stays as it is today: the pin button is the only target, and hidden hotspots stay unclickable. Plain-click hotspots in the Studio also get no `region`. Only a drawn region (or the recorder) creates one. The documented "hidden but clickable" exercise therefore needs a drawn region.
3. **Pinned callouts** are stored in image-% (they move with the image). On very different aspect ratios they are clamped into the container, which can shift them slightly. That is accepted over storing a pin per device.
4. **Tour setup** adds missing widgets to the teacher's current board and offers to remove them at the end, rather than always using a practice board.
5. **The anchor CI guard** checks registry against source, not against published tours in Firestore. Published-tour breakage is caught by the P3-6 health panel, not CI. If Paul wants CI to read `building_guided_learning`, that needs a read-only credential in CI (a separate decision).
6. **The `spart-new-widget` plugin skill** lives in Paul's `pauls-skills` repo, so P3-1 and P3-7 only update the in-repo `new-widget` skill. Mirroring the `data-tour` and `data-pii` checklist steps into the plugin is a separate follow-up Claude session.
7. **Narration** reuses the quiz read-aloud voices and admin cap settings. GL may need its own cap if usage grows. Authors can record their own voice instead (P2-4), and a recorded take wins.
8. **Demo mode** is conditional on the P1-0 spike. If it proceeds, it swaps only the board and roster stores, so widgets backed by other personal data show empty states there. For anything the demo board can't show, record on the real board with auto-redaction (P3-7). Redaction covers roster names in DOM text and inputs plus `data-pii` elements, and the mandatory review step catches the rest.
9. **Studio perf budget** is "no slower than the classic editor" on the existing scenario, measured on the same machine in the P1-10 PR, rather than absolute millisecond targets.
