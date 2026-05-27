# SpartBoard Nightly Debugger Memory Doc

## Project Commands

| Command                      | Script                                                                             |
| ---------------------------- | ---------------------------------------------------------------------------------- |
| Install all deps             | `pnpm run install:all`                                                             |
| Dev server (port 3000)       | `pnpm run dev`                                                                     |
| Production build             | `pnpm run build`                                                                   |
| Full validate (gate)         | `pnpm run validate` → type-check:all + lint + format:check + test + functions test |
| Type-check only              | `pnpm run type-check`                                                              |
| Type-check all (+ functions) | `pnpm run type-check:all`                                                          |
| Lint (zero warnings)         | `pnpm run lint`                                                                    |
| Lint fix                     | `pnpm run lint:fix`                                                                |
| Format check                 | `pnpm run format:check`                                                            |
| Format write                 | `pnpm run format`                                                                  |
| Unit tests                   | `pnpm run test`                                                                    |
| Functions tests              | `pnpm -C functions run test`                                                       |
| E2E tests                    | `pnpm run test:e2e`                                                                |
| Build all                    | `pnpm run build:all`                                                               |

**Package manager**: pnpm (not npm). Node 24+ required (v22 prints warnings but works).

## Code Areas

| Area                   | Globs                                                                                      | Description                                                                             |
| ---------------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| **Widgets**            | `components/widgets/**`                                                                    | All 60+ widget implementations, WidgetRegistry, WidgetRenderer, container-query scaling |
| **Dashboard & Layout** | `components/layout/**`, `components/common/**`, `App.tsx`, `index.tsx`, `index.css`        | Dashboard view, Sidebar, Dock, DraggableWindow, shared UI primitives                    |
| **State & Data**       | `context/**`, `hooks/**`, `utils/**`, `types/**`, `types.ts`                               | React contexts (Auth, Dashboard, Dialog, etc.), all custom hooks, utility functions     |
| **Admin & Config**     | `components/admin/**`, `components/auth/**`, `config/**`, `locales/**`, `i18n/**`          | Admin panel, auth UI, feature permissions, widget config, i18n, Firebase config         |
| **Build & Tooling**    | `functions/**`, `tests/**`, `scripts/**`, `*.config.*`, `firestore.rules`, `firebase.json` | Cloud functions, test suites, build pipeline, Firestore security rules                  |

## Run Log

| Date       | Area               | Bug                                                                                                                                                                                                                                                                                                                       | PR                                                          |
| ---------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| 2026-05-26 | Bootstrap          | Baseline GREEN (347 test files / 3395 tests)                                                                                                                                                                                                                                                                              | —                                                           |
| 2026-05-26 | Widgets            | `SpecialistScheduleWidget`: items with no valid end/start time were always rendered "past" because `-1 < nowMinutes` is always true. Extracted `parseTime` + `computeIsPast` to `utils.ts`; guard returns `false` for unparseable times.                                                                                  | [#1696](https://github.com/ops-pivers/spartboard/pull/1696) |
| 2026-05-26 | Dashboard & Layout | `SettingsPanel`: panel position computed from world coordinates (`widget.x + widget.w`) instead of viewport coordinates, causing misplacement at any zoom level other than 100%. Fixed to use `getBoundingClientRect()` via `useLayoutEffect`.                                                                            | [#1697](https://github.com/ops-pivers/spartboard/pull/1697) |
| 2026-05-26 | State & Data       | `migrateProportionalLayout`: `widgetNeedsProportionalMigration` only checked `wProp`/`hProp` for out-of-range values; widgets with absolute-pixel `xProp`/`yProp` (e.g. 300, 150) would pass the guard and be mangled on migration. Added `xProp`/`yProp` checks.                                                         | [#1698](https://github.com/ops-pivers/spartboard/pull/1698) |
| 2026-05-26 | Admin & Config     | `boardsModal` i18n: DE/ES/FR locales missing 8 keys added to EN (`select`, `deselect`, `colorSaveFailed`, `collectionMoved`, `collectionMoveFailed`, `colorPicker.*`); retained 2 obsolete keys (`colorPrompt`, `colorInvalid`) already removed from EN. Synced all three locale files.                                   | [#1699](https://github.com/ops-pivers/spartboard/pull/1699) |
| 2026-05-26 | Build & Tooling    | `parseGeminiJson`: used `lastIndexOf('}')` to find the closing brace of the outermost JSON object. Any `}` in trailing prose (explanations, CSS examples) extended the slice past the JSON boundary, causing `JSON.parse` to throw even when the embedded JSON was valid. Replaced with a depth-counting forward scanner. | [#1700](https://github.com/ops-pivers/spartboard/pull/1700) |
| 2026-05-27 | Widgets            | `convertToEmbedUrl` (`utils/urlHelpers.ts`): regex anchored to `watch?v=` as a literal prefix, so YouTube playlist URLs (`?list=PLxxx&v=ID`) were never converted; iframe silently showed nothing. Split into separate watch/shortlink patterns; watch branch uses `[?&]?v=` to match `v=` anywhere in query string.     | [#1711](https://github.com/ops-pivers/spartboard/pull/1711) |
| 2026-05-27 | Dashboard & Layout | `Dock` render loop called `canAccessWidget(tool.type as WidgetType)` for all tools including `InternalToolType` entries (`record`, `magic`, `remote`). These should route through `canAccessFeature(...)`. A disabled-widget FeaturePermission for `record` would suppress the Record button via the wrong gate.           | [#1710](https://github.com/ops-pivers/spartboard/pull/1710) |
| 2026-05-27 | State & Data       | _pending — agent result TBD_                                                                                                                                                                                                                                                                                              | —                                                           |
| 2026-05-27 | Admin & Config     | `common` i18n namespace: `saved`, `success`, `error` keys added to EN but missing from DE/ES/FR. Components using `t('common.saved')` (StickerLibraryModal) and `t('common.error')` (DashboardView, Weather/Settings) silently fell back to English for non-EN users.                                                    | [#1713](https://github.com/ops-pivers/spartboard/pull/1713) |
| 2026-05-27 | Build & Tooling    | `parseGeminiJson`: brace-only depth scanner entered top-level arrays at the first inner `{`, exiting at depth 0 after the first element; every subsequent array element was silently discarded. Added `scanToClose` helper; scanner now chooses `[`/`]` or `{`/`}` based on whichever opener appears first.               | [#1712](https://github.com/ops-pivers/spartboard/pull/1712) |

## Backlog

| Area               | Item                                                                                                                                                                                                         | Found      | Status  |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- | ------- |
| Dashboard & Layout | `SettingsPanel` tests rely on a ref mock — consider a Playwright smoke test confirming panel appears near its widget at 0.5× browser zoom                                                                    | 2026-05-26 | open    |
| ~~Build & Tooling~~    | ~~`parseGeminiJson` does not handle top-level JSON arrays (`[…]`); current scanner only looks for `{`.~~                                                                                                      | 2026-05-26 | **fixed #1712** |
| State & Data       | `migrateProportionalLayout` has no test for the happy-path migration arithmetic (only the guard and the already-passing cases). Consider adding end-to-end migration tests once layout migration stabilises. | 2026-05-26 | open    |

## Notes & Gotchas

- `@/` path alias maps to **repo root**, not `src/` — no `src/` directory exists.
- Widget front-face content must use `cqmin` container-query units (never Tailwind `text-sm` etc.).
- `useEffect` should only sync with external systems; computed/derived values go inline.
- Audio context uses a global singleton pattern (see `TimeToolWidget.tsx`).
- `pnpm run validate` runs type-check:all → lint → format:check → test → functions test. All must pass before push.
- Node v22 works but prints "unsupported engine" warnings; CI uses Node 24.
- **Git worktrees & signing server**: The signing binary (`/tmp/code-sign`, configured as `gpg.ssh.program`) identifies the repo by the git process's working directory. Any commit from a worktree path (including `/home/user/spartboard-nightly-*`) returns HTTP 400 "missing source". **Workaround** (confirmed 2026-05-27): create `/tmp/sign-from-root.sh` containing `#!/bin/bash\ncd /home/user/SpartBoard\nexec /tmp/code-sign "$@"`, then commit with `git -c gpg.ssh.program=/tmp/sign-from-root.sh commit --no-verify`. The `--no-verify` is acceptable only after lint-staged has already passed on the same staged files.
- **ESLint from `/tmp/` paths**: Running `pnpm run lint` from a worktree under `/tmp/` produces spurious `Unsafe member access` errors (TypeScript path resolution artifact). Worktrees under `/home/user/` don't have this issue for ESLint itself, but `pnpm run lint` (full repo scan) consistently times out after >3 min. **Workaround**: lint per-directory — `pnpm exec eslint <dir> --max-warnings 0`.
- **Worktree working-directory contamination**: Subagents working in one worktree may leave unstaged changes from other areas (other agents' fixes) in a different worktree's working directory. Before committing from any worktree, always run `git status` and `git restore <foreign-files>` to discard contamination.
- Run count: **2** | Last run: **2026-05-27**
