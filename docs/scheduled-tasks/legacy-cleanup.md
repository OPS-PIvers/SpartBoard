# Legacy Code & Cleanup — Scheduled Task Journal

_Audit model: claude-sonnet-4-6_
_Action model: claude-opus-4-6_
_Audit cadence: weekly — Thursday_
_Last audited: 2026-04-26_
_Last action: never_

---

## In Progress

_Nothing currently in progress._

---

## Open

### LOW scripts/tools/\*.py — 8 deprecated manual-testing scripts with no automated role

- **Detected:** 2026-04-16
- **File:** scripts/tools/ (verify_routines_manager.py, verify_dock_icons.py, verify_routines.py, verify_lunch_count.py, refactor_manager.py, fix_buttons.py, inspect_buttons.py, debug_admin_settings.py, debug_landing.py)
- **Detail:** The `scripts/tools/` directory contains 9 Python/Playwright scripts. All are either one-off refactoring tasks that have already been executed (refactor*manager.py, fix_buttons.py) or manual test/debug inspection scripts (verify*\_.py, inspect\_\_.py, debug\_\*.py). None are wired into any CI pipeline, build step, or npm script. They provide no automated value and their presence in the repository creates confusion about what testing tools are canonical.
- **Fix:** Delete `scripts/tools/` directory entirely. Ongoing E2E testing is handled by `tests/e2e/` via Playwright and pnpm test:e2e.

---

## Clean (no issues found)

Migration code audit (2026-04-26):

- Old type strings 'timer', 'stopwatch': Only referenced in `utils/migration.ts` migrateWidget() handler — correct. `utils/migration.ts:71-80` transforms to 'time-tool'.
- Old type string 'workSymbols': Only referenced in `utils/migration.ts:93` — transforms to 'expectations'. Zero usage elsewhere.
- `migrateLocalStorageToFirestore()`: Actively called in `context/DashboardContext.tsx:1092-1094` with proper guard. Still needed.

Commented-out code (2026-04-26): No blocks of 10+ consecutive commented lines found in components/, context/, hooks/, or utils/.

Dead exports (2026-04-26): No new abandoned exports found.

console.log() calls (2026-04-26): Zero `console.log()` calls in components/, context/, hooks/, utils/. Clean.

---

## Completed

_No completed items yet._
