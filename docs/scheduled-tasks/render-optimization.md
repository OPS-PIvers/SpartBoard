Context & Render Optimization — Scheduled Task Journal
Audit cadence: weekly — Sunday
Last audited: 2026-04-12
Last action: 2026-04-12
## In Progress
Nothing currently in progress.
## Open
[HIGH] context/DashboardContext.tsx massive provider component
Detected: 2026-04-12
File: context/DashboardContext.tsx
Detail: DashboardContext.tsx is over 3100 lines long, which indicates a massively bloated state object that triggers widespread unnecessary re-renders. The `useMemo` dependency array for `contextValue` spans over 150 lines, suggesting that too much state is bundled together into a single Context.
Fix: Investigate splitting the `DashboardContext` into multiple smaller contexts (e.g., `WidgetContext`, `BoardContext`, `DashboardActionContext`) to isolate state updates and prevent unnecessary re-renders of components that only consume a subset of the state.

## Completed
No completed items yet.
