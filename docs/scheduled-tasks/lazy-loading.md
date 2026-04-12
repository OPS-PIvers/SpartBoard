Lazy Loading Verification — Scheduled Task Journal
Audit cadence: weekly — Sunday
Last audited: 2026-04-12
Last action: 2026-04-12
## In Progress
Nothing currently in progress.
## Open
[MEDIUM] lazy() used instead of lazyNamed()
Detected: 2026-04-12
File: components/widgets/WidgetRegistry.ts
Detail: Found direct `lazy()` imports for `traffic` and `classes` widgets which violates the standard pattern of using `lazyNamed()`.
Fix: Update the imports to use `lazyNamed()` and export named components from the respective files instead of default exports.
## Completed
No completed items yet.
