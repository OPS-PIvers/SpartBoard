# Simplification Opportunities — Scheduled Task Journal

_Audit model: claude-sonnet-4-6_
_Action model: claude-opus-4-6_
_Audit cadence: weekly — Friday_
_Last audited: 2026-06-19_
_Last action: 2026-05-01_

---

## In Progress

_Nothing currently in progress._

---

## Open

### LOW `utils/dashboardPII.ts` and `utils/smartPaste.ts` use `as WidgetConfig` single-casts that may mask type mismatches

- **Detected:** 2026-06-12
- **File:** utils/dashboardPII.ts (lines 48, 102), utils/smartPaste.ts (multiple instances including lines 182, 199, 261, 278 approx)
- **Detail:** Both utility files cast plain objects to `WidgetConfig` using single-cast `as WidgetConfig` (not `as unknown as`). Unlike the existing tracked `as unknown as` items, these single-casts are only safe if the object's runtime shape is a known-good superset of `WidgetConfig` at every call site. `dashboardPII.ts` scrubs sensitive fields from widget configs and then casts the result back — if a new required field is added to `WidgetConfig`, the scrubbed object may silently fail to satisfy the type. `smartPaste.ts` casts plain-object widget configs from clipboard data, where the shape is entirely user-controlled and not validated. Classified as class (b) for smartPaste.ts (masking possible mismatch on untrusted input) and class (a) for dashboardPII.ts (likely safe but not provably so).
- **Fix:** For `smartPaste.ts`: introduce a runtime schema validator (zod or a hand-written guard) that narrows the clipboard object to `WidgetConfig` before the cast. For `dashboardPII.ts`: replace `as WidgetConfig` with a strongly-typed scrub function that returns the correct type through structural manipulation rather than casting.

### LOW `QuizWidget/Widget.tsx` has high component-level state density (12 useState + 5 useRef)

- **Detected:** 2026-06-12
- **File:** components/widgets/QuizWidget/Widget.tsx (lines 227-281 approx for useState, lines 453-482 approx for useRef)
- **Detail:** The QuizWidget component declares 12 separate `useState` calls and 5 `useRef` calls at the top level of a single component. Related groups: editing state (`editingQuiz`, `editingAssignment`, `editingMeta`, `shareWithPlcTarget`), load state (`loadedQuizData`, `loadingQuizData`, `dataError`), and navigation state (`prevView`, `resultsEnterToken`, `assigningToClassroom`). This is distinct from the hook-level state density tracked for `useQuizSession` — this is a rendering component accumulating orchestration state that logically belongs in a custom hook or sub-component. High state density makes effect dependency arrays large and error-prone.
- **Fix:** Extract quiz orchestration state into a `useQuizWidgetState` hook that encapsulates the editing, load, and navigation groups. This reduces the component to a view layer with a single hook import, makes state transitions testable in isolation, and shrinks effect dependency arrays. Follow the pattern used in `SpecialistScheduleWidget` which delegates session state to `useSpecialistSchedule`. Prioritize the edit-state group (4 state items that always change together) as the first extraction.

### MEDIUM `as unknown as` double-casts in `utils/ai_security.ts` mask structuredClone type loss

- **Detected:** 2026-05-27
- **File:** utils/ai_security.ts (7 instances at lines approximately 51, 56, 62, 88, 110, 144, 174)
- **Detail:** The `sanitizeAIConfig` function calls `structuredClone(config)` to deep-copy widget config objects before sanitization. `structuredClone` returns `unknown`, and the function then casts back to specific config types with `as unknown as Partial<MiniAppConfig>` (and similar). The `as unknown as` bridges hide the fact that the clone lost its type — if `structuredClone` is ever replaced or a partial type guard is added, the double-cast will silently accept an incompatible type. This is the same anti-pattern tracked in the existing LOW item for `FeatureConfigurationPanel.tsx`, extended to a utility with 7 occurrences.
- **Fix:** Replace `structuredClone(config) as unknown as T` with a type-preserving helper: `function typedClone<T>(v: T): T { return structuredClone(v) as T; }`. This single-cast form is safer — it preserves the input type through the round-trip without the unsafe `unknown` bridge. Alternatively, replace `structuredClone` with a typed JSON round-trip: `JSON.parse(JSON.stringify(config)) as T` (acceptable for plain widget config objects). Add the helper to `utils/typeUtils.ts` if that file exists, or inline it in `ai_security.ts`.

### LOW `CustomWidget/BlockRenderer.tsx` has 18 consecutive `as unknown as <BlockConfig>` casts — no shared discriminated union

- **Detected:** 2026-06-19
- **File:** components/widgets/CustomWidget/BlockRenderer.tsx (lines 1353–1504 approx)
- **Detail:** The block renderer dispatches to 18 block-type renderers, each receiving its config via a double-cast: `cfg as unknown as TextBlockConfig`, `cfg as unknown as HeadingBlockConfig`, etc. There is no shared `BlockConfig` discriminated union — each cast is independent. If any block's props shape diverges from the expected type, the cast will succeed silently and a runtime error will occur instead of a TypeScript error. This is class (b): masking potential mismatch across 18 sites. Each addition of a new block type copies the pattern without improving type safety. The parallel with `FeatureConfigurationPanel` (34 panel casts) makes this a systemic simplification opportunity.
- **Fix:** Define a `BlockConfig` discriminated union type with a `type` discriminant field (matching the existing block-type string constants) and a `config` payload typed per block. Replace the per-block `as unknown as XBlockConfig` casts with a typed switch/narrowing that TypeScript can verify. Alternatively, define a `BlockComponent<T extends BaseBlockConfig>` interface that each block component explicitly implements, making the renderer generic over the block type and eliminating all casts.

### LOW Icon registry cast `as unknown as Record<string, React.ElementType>` in 3 files

- **Detected:** 2026-06-19
- **File:** components/widgets/InstructionalRoutines/Widget.tsx (lines 175, 486), components/widgets/InstructionalRoutines/IconPicker.tsx (lines 22, 26, 52), components/widgets/MaterialsWidget/constants.ts (line 5)
- **Detail:** All three files import `Icons` from lucide-react and cast it as `as unknown as Record<string, React.ElementType>` in order to perform dynamic icon lookups by string key. The double-cast hides the fact that `Icons` doesn't have a static type matching `Record<string, React.ElementType>`. If lucide-react changes its export shape (as it has in past major versions), these casts will silently succeed but fail at runtime when `Icons[step.icon]` returns `undefined`. Classified as class (c): a workaround for the missing explicit `Record<string, ElementType>` type on the lucide-react namespace export.
- **Fix:** Create a typed icon-map constant once and share it: `const LucideIconMap: Record<string, React.ElementType> = Icons as Record<string, React.ElementType>` — a single `as` cast (not double-cast) in a shared constant at `utils/iconMap.ts`. All three files import from this constant. Alternatively, if only a fixed subset of icons is used, build an explicit `const ICON_MAP = { Star, Clock, ... }` record to eliminate the cast entirely and make dynamic lookups fully type-safe.

### LOW `as unknown as BuildingConfigPanel` repeated throughout FeatureConfigurationPanel

- **Detected:** 2026-04-17
- **File:** components/admin/FeatureConfigurationPanel.tsx:94–110+
- **Detail:** At least 11 consecutive lines cast specific configuration panel components to `BuildingConfigPanel` using `as unknown as BuildingConfigPanel`. Each cast is safe (all panels conform to the expected props shape) but the double-cast pattern masks the lack of a shared generic type. If any panel's props diverge from `BuildingConfigPanel`, TypeScript will silently accept the cast rather than flag the mismatch.
- **Fix:** Introduce a typed `configPanelMap` record whose value type is a discriminated union covering all known panel prop shapes, or make each panel explicitly implement a shared `BuildingConfigPanelComponent` interface. Remove `as unknown as` casts in favor of typed entries. Alternatively, if all panels genuinely share identical props, replace the casts with a single explicit type annotation on the map object.

### LOW useQuizSession and useVideoActivitySession have high internal state density

- **Detected:** 2026-04-17
- **Updated:** 2026-06-08 — counts: `useQuizSession.ts` 22 (unchanged from 2026-06-03); `useVideoActivitySession.ts` 18 (up from 17 in 2026-06-03 audit). New hooks in this merge: none.
- **Updated:** 2026-05-18 — counts unchanged: `useQuizSession.ts` has 21 useState/useRef calls; `useVideoActivitySession.ts` has 17. New hooks added since 2026-05-13 reviewed: `useSharedCollection.ts` (0 state calls — uses Firestore SDK directly), `useCollections.ts` (6 calls — at threshold but borderline), `useActivityWallLibrary.ts` (5 calls — at threshold). No new hooks exceed the 5-call flag threshold requiring addition to this item.
- **Updated:** 2026-05-13 — counts updated: `useQuizSession.ts` now has 21 useState/useRef calls; `useVideoActivitySession.ts` has 17 (both grew). Also newly flagged: `usePlcOverviewLayout.ts` (9 calls), `useScreenRecord.ts` (8), `useLiveSession.ts` (8), `useStudentAssignments.ts` (7), `useRosters.ts` (7), `useOrgMembers.ts` (7), `useGuidedLearning.ts` (7).
- **File:** hooks/useQuizSession.ts (21 useState/useRef calls as of 2026-05-13), hooks/useVideoActivitySession.ts (17 useState/useRef calls)
- **Detail:** Both hooks accumulate many individual `useState`/`useRef` declarations rather than grouping related values into a single state object or sub-hook. High state density increases cognitive load when tracing data flow and makes it easy to introduce stale-closure bugs via missing dependencies.
- **Fix:** Audit both hooks and group tightly-coupled state variables into sub-objects (e.g. `sessionStatus`, `studentResponses`, `timerState`) using a single `useState` or `useReducer` per group. Extract repeated logic (e.g. Firestore listener setup) into smaller helper hooks. Prioritize `useQuizSession.ts` first as it has the highest count.

### LOW `as unknown as` double-casts in FeatureConfigurationPanel repeated for new widget (stations)

- **Detected:** 2026-05-13
- **File:** components/admin/FeatureConfigurationPanel.tsx (lines 96-142)
- **Detail:** The pattern `XConfigurationPanel as unknown as BuildingConfigPanel` is used for 11 existing panels. When `StationsConfigurationPanel` is added (see ui-unification.md), it will be added with the same double-cast, further extending this pattern. The root issue (noted in the existing LOW item below) is that no shared interface for building config panels exists. Each new widget addition copies the pattern without improving type safety.
- **Fix:** When adding StationsConfigurationPanel, simultaneously fix the existing LOW item — define a `BuildingConfigPanelComponent` interface and have each panel implement it explicitly, eliminating `as unknown as`. This upgrades the safety of the entire map.

### LOW `as unknown as` double-casts in VideoActivityWidget/Results.tsx — generics workaround for exporter

- **Detected:** 2026-06-03
- **File:** components/widgets/VideoActivityWidget/components/Results.tsx:210, :216
- **Detail:** Two `as unknown as` casts were added in the June 3 merge: `questions as unknown as Parameters<typeof drive.exportResultsToSheet>[2]` and `gradeVideoActivityAnswer as unknown as NonNullable<ExporterOptions>['gradeFn']`. Both are class (c) — workarounds for the shared `exportResultsToSheet` function not being generic over question/grading types. A code comment at :205 already documents the intent: "function become generic too and remove the cast." Severity is LOW because the types do conform at runtime and the casts are documented.
- **Fix:** Make `exportResultsToSheet` generic over the question type and grading function type so the casts become unnecessary. This is a refactor of the drive export utility (likely `hooks/useGoogleDrive.ts` or similar), not just the call site.

### LOW useScreenRecord and useLiveSession exceed 5 state/ref calls

- **Detected:** 2026-04-24
- **File:** hooks/useScreenRecord.ts (7 useState/useRef: 3 state + 4 refs), hooks/useLiveSession.ts (7 useState/useRef calls)
- **Detail:** Both hooks exceed the 5-call threshold. `useScreenRecord` manages 3 logically-grouped pieces of UI state (isRecording, duration, error) plus 4 DOM/API refs (MediaRecorder, Blob[], timer, MediaStream). `useLiveSession` has 6 useState calls (session, students, loading, studentId, studentPin, individualFrozen, prevDeps). The refs in useScreenRecord are all distinct external resources, so grouping has lower ROI here than in the session hooks. However, they should be documented.
- **Fix:** For `useScreenRecord`, group `{ isRecording, duration, error }` into a single `useState` object to reduce the state surface. The 4 refs are all distinct external handles and should remain individual. For `useLiveSession`, group `{ studentId, studentPin }` (always set/cleared together) into a single state object. Severity is LOW because the individual state declarations are cohesive and readable.

---

_2026-06-19: Full weekly audit pass (Friday). New commits since 2026-06-12: fix(Modal), fix(i18n), fix(widgets), fix(lti), fix(quizMaxPoints), pr-review batch. No new Object.assign config merge patterns. Existing `as unknown as` items re-confirmed. New findings: (1) `CustomWidget/BlockRenderer.tsx` has 18 consecutive `as unknown as <BlockConfig>` casts with no shared discriminated union — added as new LOW item; (2) 3 files cast lucide-react `Icons` object as `unknown as Record<string, ElementType>` — added as new LOW item. Hook complexity: useQuizSession 22 calls (unchanged), useVideoActivitySession 18 calls (unchanged). No new pass-through prop issues or nested ternary violations. 2 new LOW open items added._

_2026-06-12: Audited new code from dev-paul rebase (docs/unifier run 13, D4 @/ alias in tests/, perf baseline, fix DraggableWindow, debugger run 14). No new Object.assign or config-merge duplication patterns in changed files. No new `as unknown as` casts. Hook complexity: useQuizSession.ts and useVideoActivitySession.ts counts unchanged from 2026-06-08 (22 and 18 respectively). New findings: (1) utils/dashboardPII.ts (line 48, 102) and utils/smartPaste.ts (multiple instances) use `as WidgetConfig` single-casts that may mask type mismatches — these are distinct from the `as unknown as` double-casts already tracked; added as new LOW item. (2) QuizWidget/Widget.tsx has 12 useState calls (plus 5 useRef) — high component-level state density distinct from the hook-level state density already tracked for useQuizSession. 2 new LOW open items added._

_2026-06-08: Audited new code from dev-paul merge. Object.assign: DashboardContext still has zero Object.assign calls. `as unknown as` casts: no new ones in this merge (diff shows only `specificFeatureId` string assignments in functions/src/index.ts — no TypeScript changes in frontend code). Hook complexity: `useQuizSession.ts` unchanged at 22 useState/useRef calls; `useVideoActivitySession.ts` grew from 17 to 18 calls (minor growth, existing open item still valid and counts are current). New hooks: none added in this merge. Nested ternaries: no new complex ternary chains in changed files. Zero new simplification items._

_2026-06-03: Audited Object.assign patterns (DashboardContext has zero Object.assign calls — mergeWidgetConfig extraction complete), as unknown as casts (2 new instances in VideoActivityWidget/Results.tsx at lines 210 and 216 — both class (c) generics workarounds for shared exporter function; code comment documents intent), hook complexity (useQuizSession: 22 calls up from 21; useVideoActivitySession: 18 calls up from 17 — small growth, existing open item still valid), new utility files from merge (studentJoinRouting.ts, runClassroomGradePush.ts, quizCode.ts — all stateless pure utilities, no state density concern), nested ternaries (1 pre-existing 4-level ternary in QuizResults.tsx — no new instances). One new LOW item added for VideoActivity casts._

_2026-05-27: Audited Object.assign patterns (mergeWidgetConfig helper already extracted — no new duplication), as unknown as casts (7 new instances in ai_security.ts added as MEDIUM item above), hook complexity (useQuizSession 21 calls / useVideoActivitySession 17 calls — unchanged from prior audits; useSpotifyWebPlayback added at 14 calls), prop drilling (minimal, context APIs used correctly), nested ternaries (~15 instances in admin UI labels — LOW severity, unchanged). One new MEDIUM item added._

## Completed

### MEDIUM Duplicated config layer-merge pattern in DashboardContext — extraction candidate

- **Detected:** 2026-04-17
- **Completed:** 2026-05-01
- **File:** context/DashboardContext.tsx (addWidget + addWidgets paths), utils/widgetConfigPersistence.ts
- **Detail:** Two `Object.assign` call sites (one in `addWidget` for single-widget adds, one in `addWidgets` for batch/AI/paste adds) implemented an identical four-layer config merge: `defaults.config → adminConfig → savedWidgetConfigs → overrides`.
- **Resolution:** Extracted `mergeWidgetConfig(defaults, adminConfig, saved, overrides)` as a pure helper in `utils/widgetConfigPersistence.ts` next to `stripTransientKeys`. The helper documents the layer order in JSDoc, calls `stripTransientKeys` internally on the saved layer, and tolerates `undefined` for any layer. Both call sites in `DashboardContext.tsx` now delegate to it; the now-redundant `stripTransientKeys` import there was removed (still imported by `AuthContext.tsx` for save-side filtering, which is unchanged). Added three unit tests covering layer ordering, transient-key stripping, and all-undefined inputs. `pnpm type-check`, `pnpm lint --max-warnings 0`, and `pnpm format:check` clean; all 1680 tests pass.
