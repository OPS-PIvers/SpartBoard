# Render-path performance — F9, F22

**Dimension:** perf. F22 is a quick, safe win; F9 is a large, higher-risk
architectural change to schedule deliberately. They touch different files.

---

## F22 — Memoize selected-group computation in `BoardCanvas`

**Impact:** 2 · **Effort:** small · **Risk:** low · **Behavior change:** no.

### Problem

`BoardCanvas` recomputes `selectedGroupId` / `groupMembers` via
`dashboard.widgets.find()` + `.filter()` on **every** render even when
`selectedWidgetId` and `dashboard.widgets` are unchanged. Cheap at small widget
counts, but scales poorly toward the ~100-widget ceiling.

### Evidence

- `components/layout/BoardCanvas.tsx:55-77` — the per-render `find`/`filter`.

### Approach

Wrap the `selectedGroupId` and `groupMembers` derivations in `useMemo` keyed on
`[dashboard.widgets, selectedWidgetId]`. (Derived-during-render is fine per house
rules; `useMemo` here is the "expensive derived value" case, not a `useEffect`.)

### Acceptance criteria

- Identical selection/group behavior; the derivation no longer recomputes when its
  inputs are unchanged. Add/extend a test if a `BoardCanvas` harness exists nearby.

---

## F9 — Reduce `DashboardContext` consumer churn (large)

**Impact:** 5 · **Effort:** large · **Risk:** high · **Behavior change:** no.

### Problem

The `DashboardContext` value object exposes ~100 properties, so **any** field
change (e.g. a `loading` flip) re-renders every consumer of the full context. The
hot canvas slice is already split out into `DashboardCanvasStoreContext` /
`DashboardActionsContext`, but legacy sidebar/config consumers still read the full
value and churn.

### Evidence

- `context/DashboardContext.tsx:5484-5746` — the ~100-property value object.
- `context/dashboardCanvasStore.ts:1-50` — the existing canvas-slice store
  (the pattern to extend).

### Approach (measure first)

1. **Measure before touching anything** — use the existing perf harness
   (`tests/perf/`, React Profiler commit counts are the deterministic metric) to
   capture a baseline of which consumers re-render on representative actions.
   Per the repo's `perf-ux-pass` discipline, do not claim improvement without
   before/after numbers from the same harness.
2. Identify which components genuinely need the full legacy context vs. a narrow
   slice. Extract stable sub-contexts (e.g. a sidebar/tool-visibility slice:
   `visibleTools`, `dockItems`, `gradeFilter`) the same way the canvas store was
   carved out.
3. Re-measure; the diff must not increase Firestore/Storage/AI cost.

### Risks

- High blast radius — many consumers. Easy to introduce stale-render or
  missed-update bugs. Stage it; keep each extraction behavior-identical and
  individually reviewable.

### Acceptance criteria

- Measured reduction in consumer re-renders on a representative action (Profiler
  commit-count delta from the same harness, before vs after).
- No behavior change; `pnpm run validate` green; no added backend cost.

### Kickoff prompt

> Tackle F9 from `docs/optimize-pass/06-perf-render.md` using the `perf-ux-pass`
> discipline: first commit a React-Profiler baseline of `DashboardContext`
> consumer re-renders on representative actions, then extract a stable sidebar/
> tool-visibility slice out of the ~100-prop context value
> (`context/DashboardContext.tsx:5484-5746`) following the existing
> `dashboardCanvasStore` pattern. Re-measure and prove a commit-count reduction
> with no behavior change and no added Firestore/Storage/AI cost.
