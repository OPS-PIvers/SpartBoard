# Simplification Opportunities — Scheduled Task Journal

_Audit model: claude-sonnet-4-6_
_Action model: claude-opus-4-6_
_Audit cadence: weekly — Friday_
_Last audited: 2026-05-01_
_Last action: 2026-05-01_

---

## In Progress

_Nothing currently in progress._

---

## Open

### LOW `as unknown as BuildingConfigPanel` repeated throughout FeatureConfigurationPanel

- **Detected:** 2026-04-17
- **File:** components/admin/FeatureConfigurationPanel.tsx:94–110+
- **Detail:** At least 11 consecutive lines cast specific configuration panel components to `BuildingConfigPanel` using `as unknown as BuildingConfigPanel`. Each cast is safe (all panels conform to the expected props shape) but the double-cast pattern masks the lack of a shared generic type. If any panel's props diverge from `BuildingConfigPanel`, TypeScript will silently accept the cast rather than flag the mismatch.
- **Fix:** Introduce a typed `configPanelMap` record whose value type is a discriminated union covering all known panel prop shapes, or make each panel explicitly implement a shared `BuildingConfigPanelComponent` interface. Remove `as unknown as` casts in favor of typed entries. Alternatively, if all panels genuinely share identical props, replace the casts with a single explicit type annotation on the map object.

### LOW useQuizSession and useVideoActivitySession have high internal state density

- **Detected:** 2026-04-17
- **File:** hooks/useQuizSession.ts (18 useState/useRef calls as of 2026-04-24), hooks/useVideoActivitySession.ts (13 useState/useRef calls)
- **Detail:** Both hooks accumulate many individual `useState`/`useRef` declarations rather than grouping related values into a single state object or sub-hook. High state density increases cognitive load when tracing data flow and makes it easy to introduce stale-closure bugs via missing dependencies.
- **Fix:** Audit both hooks and group tightly-coupled state variables into sub-objects (e.g. `sessionStatus`, `studentResponses`, `timerState`) using a single `useState` or `useReducer` per group. Extract repeated logic (e.g. Firestore listener setup) into smaller helper hooks. Prioritize `useQuizSession.ts` first as it has the highest count.

### LOW useScreenRecord and useLiveSession exceed 5 state/ref calls

- **Detected:** 2026-04-24
- **File:** hooks/useScreenRecord.ts (7 useState/useRef: 3 state + 4 refs), hooks/useLiveSession.ts (7 useState/useRef calls)
- **Detail:** Both hooks exceed the 5-call threshold. `useScreenRecord` manages 3 logically-grouped pieces of UI state (isRecording, duration, error) plus 4 DOM/API refs (MediaRecorder, Blob[], timer, MediaStream). `useLiveSession` has 6 useState calls (session, students, loading, studentId, studentPin, individualFrozen, prevDeps). The refs in useScreenRecord are all distinct external resources, so grouping has lower ROI here than in the session hooks. However, they should be documented.
- **Fix:** For `useScreenRecord`, group `{ isRecording, duration, error }` into a single `useState` object to reduce the state surface. The 4 refs are all distinct external handles and should remain individual. For `useLiveSession`, group `{ studentId, studentPin }` (always set/cleared together) into a single state object. Severity is LOW because the individual state declarations are cohesive and readable.

---

## Completed

### MEDIUM Duplicated config layer-merge pattern in DashboardContext — extraction candidate

- **Detected:** 2026-04-17
- **Completed:** 2026-05-01
- **File:** context/DashboardContext.tsx (addWidget + addWidgets paths), utils/widgetConfigPersistence.ts
- **Detail:** Two `Object.assign` call sites (one in `addWidget` for single-widget adds, one in `addWidgets` for batch/AI/paste adds) implemented an identical four-layer config merge: `defaults.config → adminConfig → savedWidgetConfigs → overrides`.
- **Resolution:** Extracted `mergeWidgetConfig(defaults, adminConfig, saved, overrides)` as a pure helper in `utils/widgetConfigPersistence.ts` next to `stripTransientKeys`. The helper documents the layer order in JSDoc, calls `stripTransientKeys` internally on the saved layer, and tolerates `undefined` for any layer. Both call sites in `DashboardContext.tsx` now delegate to it; the now-redundant `stripTransientKeys` import there was removed (still imported by `AuthContext.tsx` for save-side filtering, which is unchanged). Added three unit tests covering layer ordering, transient-key stripping, and all-undefined inputs. `pnpm type-check`, `pnpm lint --max-warnings 0`, and `pnpm format:check` clean; all 1680 tests pass.
