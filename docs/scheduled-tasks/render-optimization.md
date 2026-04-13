Context & Render Optimization — Scheduled Task Journal
Audit cadence: weekly — Sunday
Last audited: 2026-04-12
Last action: 2026-04-12

## In Progress

Nothing currently in progress.

## Open

### HIGH context/DashboardContext.tsx massive provider component

- **Detected:** 2026-04-12
- **File:** context/DashboardContext.tsx
- **Detail:** DashboardContext.tsx is over 3100 lines long, which indicates a massively bloated state object that triggers widespread unnecessary re-renders. The `useMemo` block for `contextValue` (lines 3081–3157) spans approximately 156 lines, with a dependency array of roughly 77 lines — either measurement signals that too much state is bundled together into a single Context.
- **Fix:** Investigate splitting the `DashboardContext` into multiple smaller contexts to isolate state updates and prevent unnecessary re-renders of components that only consume a subset of the state. Primary extraction candidates: `ToastContext` (toast management logic, lines 149 and 223–242) and `RosterContext` (roster logic, lines 421–428) — both are distinct domains currently coupled to every dashboard update. Additional candidates once the first two land: `WidgetContext`, `BoardContext`, `DashboardActionContext`.

## Completed

No completed items yet.
