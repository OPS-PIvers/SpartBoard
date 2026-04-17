# Simplification Opportunities — Scheduled Task Journal

_Audit model: claude-sonnet-4-6_
_Action model: claude-opus-4-6_
_Audit cadence: weekly — Friday_
_Last audited: 2026-04-17_
_Last action: never_

---

## In Progress

_Nothing currently in progress._

---

## Open

### MEDIUM Duplicated config layer-merge pattern in DashboardContext — extraction candidate

- **Detected:** 2026-04-17
- **File:** context/DashboardContext.tsx:2464, :2543
- **Detail:** Two `Object.assign` call sites (one for the widget-open path at line 2464, one for the add-widget path at line 2543) implement an identical four-layer config merge: `defaults.config → adminConfig → savedWidgetConfigs → overrides`. The pattern and argument list are visually identical; only variable names differ. Any change to the merge order or the inclusion of a new layer (e.g. user preferences) must be made in two places.
- **Fix:** Extract a helper function such as `mergeWidgetConfig(defaults, adminConfig, saved, overrides)` that performs the `Object.assign` and documents the layer order. Call it from both sites. The function is a pure utility — no hook dependencies — and belongs in utils/ or as a module-level function in DashboardContext.tsx.

### LOW `as unknown as BuildingConfigPanel` repeated throughout FeatureConfigurationPanel

- **Detected:** 2026-04-17
- **File:** components/admin/FeatureConfigurationPanel.tsx:94–110+
- **Detail:** At least 11 consecutive lines cast specific configuration panel components to `BuildingConfigPanel` using `as unknown as BuildingConfigPanel`. Each cast is safe (all panels conform to the expected props shape) but the double-cast pattern masks the lack of a shared generic type. If any panel's props diverge from `BuildingConfigPanel`, TypeScript will silently accept the cast rather than flag the mismatch.
- **Fix:** Introduce a typed `configPanelMap` record whose value type is a discriminated union covering all known panel prop shapes, or make each panel explicitly implement a shared `BuildingConfigPanelComponent` interface. Remove `as unknown as` casts in favor of typed entries. Alternatively, if all panels genuinely share identical props, replace the casts with a single explicit type annotation on the map object.

### LOW useQuizSession and useVideoActivitySession have high internal state density

- **Detected:** 2026-04-17
- **File:** hooks/useQuizSession.ts (17 useState/useRef calls), hooks/useVideoActivitySession.ts (13 useState/useRef calls)
- **Detail:** Both hooks accumulate many individual `useState`/`useRef` declarations rather than grouping related values into a single state object or sub-hook. High state density increases cognitive load when tracing data flow and makes it easy to introduce stale-closure bugs via missing dependencies.
- **Fix:** Audit both hooks and group tightly-coupled state variables into sub-objects (e.g. `sessionStatus`, `studentResponses`, `timerState`) using a single `useState` or `useReducer` per group. Extract repeated logic (e.g. Firestore listener setup) into smaller helper hooks. Prioritize `useQuizSession.ts` first as it has the highest count.

---

## Completed

_No completed items yet._
