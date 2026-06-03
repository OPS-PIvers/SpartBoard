# Simplification Opportunities — Scheduled Task Journal

_Audit model: claude-sonnet-4-6_
_Action model: claude-opus-4-6_
_Audit cadence: weekly — Friday_
_Last audited: 2026-06-03_
_Last action: 2026-05-01_

---

## In Progress

_Nothing currently in progress._

---

## Open

### MEDIUM `as unknown as` double-casts in `utils/ai_security.ts` mask structuredClone type loss

- **Detected:** 2026-05-27
- **File:** utils/ai_security.ts (7 instances at lines approximately 51, 56, 62, 88, 110, 144, 174)
- **Detail:** The `sanitizeAIConfig` function calls `structuredClone(config)` to deep-copy widget config objects before sanitization. `structuredClone` returns `unknown`, and the function then casts back to specific config types with `as unknown as Partial<MiniAppConfig>` (and similar). The `as unknown as` bridges hide the fact that the clone lost its type — if `structuredClone` is ever replaced or a partial type guard is added, the double-cast will silently accept an incompatible type. This is the same anti-pattern tracked in the existing LOW item for `FeatureConfigurationPanel.tsx`, extended to a utility with 7 occurrences.
- **Fix:** Replace `structuredClone(config) as unknown as T` with a type-preserving helper: `function typedClone<T>(v: T): T { return structuredClone(v) as T; }`. This single-cast form is safer — it preserves the input type through the round-trip without the unsafe `unknown` bridge. Alternatively, replace `structuredClone` with a typed JSON round-trip: `JSON.parse(JSON.stringify(config)) as T` (acceptable for plain widget config objects). Add the helper to `utils/typeUtils.ts` if that file exists, or inline it in `ai_security.ts`.

### LOW `as unknown as BuildingConfigPanel` repeated throughout FeatureConfigurationPanel

- **Detected:** 2026-04-17
- **File:** components/admin/FeatureConfigurationPanel.tsx:94–110+
- **Detail:** At least 11 consecutive lines cast specific configuration panel components to `BuildingConfigPanel` using `as unknown as BuildingConfigPanel`. Each cast is safe (all panels conform to the expected props shape) but the double-cast pattern masks the lack of a shared generic type. If any panel's props diverge from `BuildingConfigPanel`, TypeScript will silently accept the cast rather than flag the mismatch.
- **Fix:** Introduce a typed `configPanelMap` record whose value type is a discriminated union covering all known panel prop shapes, or make each panel explicitly implement a shared `BuildingConfigPanelComponent` interface. Remove `as unknown as` casts in favor of typed entries. Alternatively, if all panels genuinely share identical props, replace the casts with a single explicit type annotation on the map object.

### LOW useQuizSession and useVideoActivitySession have high internal state density

- **Detected:** 2026-04-17
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

_2026-06-03: Audited Object.assign patterns (DashboardContext has zero Object.assign calls — mergeWidgetConfig extraction complete), as unknown as casts (2 new instances in VideoActivityWidget/Results.tsx at lines 210 and 216 — both class (c) generics workarounds for shared exporter function; code comment documents intent), hook complexity (useQuizSession: 22 calls up from 21; useVideoActivitySession: 18 calls up from 17 — small growth, existing open item still valid), new utility files from merge (studentJoinRouting.ts, runClassroomGradePush.ts, quizCode.ts — all stateless pure utilities, no state density concern), nested ternaries (1 pre-existing 4-level ternary in QuizResults.tsx — no new instances). One new LOW item added for VideoActivity casts._

_2026-05-27: Audited Object.assign patterns (mergeWidgetConfig helper already extracted — no new duplication), as unknown as casts (7 new instances in ai_security.ts added as MEDIUM item above), hook complexity (useQuizSession 21 calls / useVideoActivitySession 17 calls — unchanged from prior audits; useSpotifyWebPlayback added at 14 calls), prop drilling (minimal, context APIs used correctly), nested ternaries (~15 instances in admin UI labels — LOW severity, unchanged). One new MEDIUM item added._

## Completed

### MEDIUM Duplicated config layer-merge pattern in DashboardContext — extraction candidate

- **Detected:** 2026-04-17
- **Completed:** 2026-05-01
- **File:** context/DashboardContext.tsx (addWidget + addWidgets paths), utils/widgetConfigPersistence.ts
- **Detail:** Two `Object.assign` call sites (one in `addWidget` for single-widget adds, one in `addWidgets` for batch/AI/paste adds) implemented an identical four-layer config merge: `defaults.config → adminConfig → savedWidgetConfigs → overrides`.
- **Resolution:** Extracted `mergeWidgetConfig(defaults, adminConfig, saved, overrides)` as a pure helper in `utils/widgetConfigPersistence.ts` next to `stripTransientKeys`. The helper documents the layer order in JSDoc, calls `stripTransientKeys` internally on the saved layer, and tolerates `undefined` for any layer. Both call sites in `DashboardContext.tsx` now delegate to it; the now-redundant `stripTransientKeys` import there was removed (still imported by `AuthContext.tsx` for save-side filtering, which is unchanged). Added three unit tests covering layer ordering, transient-key stripping, and all-undefined inputs. `pnpm type-check`, `pnpm lint --max-warnings 0`, and `pnpm format:check` clean; all 1680 tests pass.
