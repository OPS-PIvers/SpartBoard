# Handoff: F1 — Split DashboardContext to stop whole-app re-renders (+ shrink the 1.5 MB chunk)

**Status:** Deferred from the `optimize-pass` sweep (2026-06-08). Approved as a handoff, not implemented this pass, because it is a large, high-blast-radius refactor of the core render path that must run alone.

**Impact:** 9/10 · **Effort:** large · **Risk:** medium · **Behavior change:** none intended

---

## Problem

`context/DashboardContext.tsx` (~5,600 LOC) wraps its context value in a single `useMemo` whose
dependency array has **~87 entries**, so the value recomputes and invalidates on virtually every
state change. Every component that calls `useDashboard()` — every widget, plus `DashboardView`,
`Sidebar`, `Dock`, `WidgetRenderer` — re-renders on **each** dashboard mutation, even if it only
reads a single stable action. With up to ~140 widgets on a board this is the dominant runtime cost
during the live drag / resize / paste loop teachers use in class.

The same monolithic file also produces an oversized build chunk: `DashboardView` ≈ 1,574 KB and the
main `index` chunk ≈ 1,511 KB, both far over the 500 KB `chunkSizeWarningLimit` in `vite.config.ts`
— hurting first load on slow/mobile/projector connections.

## Evidence (file:line)

- `context/DashboardContext.tsx:5407-5463` — `useMemo` wrapping `contextValue`
- `context/DashboardContext.tsx:5464-5589` — the ~87-entry dependency array
- `context/DashboardContext.tsx` — 5,596 lines total
- `vite.config.ts` — `chunkSizeWarningLimit: 500` (KB); build emits DashboardView ≈1,574 KB, index ≈1,511 KB
- Consumers via `useDashboard()` across `components/widgets/*`, `components/layout/{DashboardView,Sidebar,Dock}.tsx`, `components/widgets/WidgetRenderer.tsx`

## Proposed approach

1. **Split the context into two providers** mounted together:
   - **Data context** — the frequently-changing state: `dashboards`, `activeDashboard`, `loading`,
     `toasts`, and any other values that change on mutation.
   - **Actions context** — the callbacks (`addWidget`, `updateWidget`, `removeWidget`,
     `bringToFront`, `saveCurrentDashboard`, `createNewDashboard`, `deleteDashboard`,
     `loadDashboard`, …). Make this value **referentially stable** for the provider's lifetime:
     wrap each callback in `useCallback`, and have callbacks that read current state use the
     functional-updater form (`setX(prev => …)`) or a `stateRef` assigned in render, so they don't
     need state in their dependency arrays. Collapsing the actions into a single stable `dispatch`
     is an acceptable alternative.
   - Net effect: components that consume only actions stop re-rendering when data changes.
2. **Keep the public API stable if possible.** Prefer keeping `useDashboard()` working (compose
   both contexts internally) to minimize churn, OR introduce `useDashboardState()` /
   `useDashboardActions()` and migrate call sites. Either way the observable behavior is identical.
3. **Follow-on (optional, same PR or a fast-follow):** extract logical state slices into lazy
   sub-contexts/hooks to shrink `DashboardContext.tsx`, and code-split `DashboardView` at the route
   boundary so the 1.5 MB chunks drop toward the 500 KB threshold.

## Risks

- **Blast radius is the whole app** — every `useDashboard()` consumer. A mis-split can cause stale
  reads or missed updates (e.g. a callback closing over stale state once it's removed from deps).
- The 87-dep memo mixes state and callbacks; separating them requires care that each callback's
  semantics (ordering, the value of state it reads at call time) are preserved exactly.
- Behavior-sensitive surfaces: drag/resize/paste, multi-board mounting, Firestore debounced writes.
  Requires in-app verification, not just unit tests.

## Acceptance criteria

- [ ] `DashboardContext` is split into a data/state context and a referentially-stable actions
      context (or stable `dispatch`).
- [ ] A regression test proves an **action-only** consumer does **not** re-render when only data
      changes (render-count probe component).
- [ ] No behavior change: existing `tests/context/*` and widget tests pass unchanged; manual smoke
      of add/move/resize/flip/delete widget + dashboard switch is unaffected.
- [ ] `pnpm run validate` (type-check:all + lint + format:check + tests) and `pnpm run build:all`
      are green. No suppressions (`any` / `@ts-ignore` / `eslint-disable`).
- [ ] (Stretch) DashboardView/index chunk reduced, or code-splitting introduced; if out of scope,
      say so explicitly in the PR.

## Copyable kickoff prompt

> Refactor `context/DashboardContext.tsx` (SpartBoard, a React 19 + TS + Vite app; flat repo, `@/`
> = root; pnpm) to stop every `useDashboard()` consumer re-rendering on every dashboard mutation.
> Today the context value is one `useMemo` with ~87 deps (see `context/DashboardContext.tsx:5407-5589`),
> so all ~140 widgets + layout re-render on each drag/resize/paste.
>
> Split it into a **data context** (dashboards, activeDashboard, loading, toasts) and a
> **referentially-stable actions context** (all callbacks wrapped in `useCallback`, using functional
> setState or a render-assigned `stateRef` so they need no state in their deps). Prefer keeping the
> public `useDashboard()` working by composing both internally; otherwise introduce
> `useDashboardState()`/`useDashboardActions()` and migrate call sites. Preserve behavior exactly —
> this is a perf refactor, no functional change.
>
> Add a test that an action-only consumer does NOT re-render when only data changes. Follow
> SpartBoard house rules: no suppressions, `useEffect` only for external-system sync, match existing
> style. Run `pnpm run validate` and `pnpm run build:all` until green, and smoke-test add/move/
> resize/flip/delete widget + dashboard switch in the running app before declaring done. Optionally
> code-split `DashboardView` to bring the 1.5 MB chunk under the 500 KB warning in `vite.config.ts`.
