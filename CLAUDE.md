# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

SpartBoard is a classroom management dashboard (React 19, TypeScript, Vite, Firebase) where teachers
place drag-and-drop widgets on boards, plus student-facing apps (quiz, video activity, guided learning,
activity wall, mini-apps), an admin panel, PLCs, and a substitute portal. Widget-specific guidance lives
in `components/widgets/CLAUDE.md`; UI design context in `components/CLAUDE.md`.

## Layout

- **No `src/` directory.** All code lives in root-level directories (`components/`, `context/`, `hooks/`, `config/`, `utils/`, `functions/`). The `@/` alias maps to the repo root, not `src/`.
- **No react-router.** `App.tsx` switches on `window.location.pathname` and mounts only the providers each route needs, so anonymous/student routes don't boot teacher Firestore listeners.
- A widget type is registered in several places: `types.ts` `WidgetType`, `config/tools.ts`, `config/widgetDefaults.ts`, `config/widgetGradeLevels.ts`, and `components/widgets/WidgetRegistry.ts`. Use the `new-widget` skill.
- Live-tour anchors are `data-tour` ids from the typed registry in `config/tourAnchors.ts`; tag with `tourAttr`, and `tests/tourAnchors.test.ts` fails on a registered id that is no longer rendered or an unregistered one.

## Commands

- **pnpm only** — never `npm install`. **Node 24+** (`functions/` is pinned to 24).
- Install with `pnpm run install:all` (root + `functions/`), not bare `pnpm install`.
- `pnpm run test:rules` boots the Firestore emulator (`vitest.rules.config.ts`, `tests/rules/`).
- `pnpm run test:counts` fails if Vitest silently collected fewer suites than baseline. CI shards with `test:shard --shard=N/3`, then `test:merge-reports` before `test:counts`.
- `pnpm run changelog:draft` prints a draft `public/changelog.json` entry. Every bullet must be rewritten before committing — the rules are in [docs/DEV_WORKFLOW.md](docs/DEV_WORKFLOW.md#how-to-write-a-release-note), and both `overview` and `details` are shown to every user.
- `pnpm run <script> -- <flags>` forwards a literal `--` and Vitest then ignores the flags. Omit the `--`.
- Claude Code dev servers (`.claude/launch.json`): `vite-dev` (3000), `vite-dev-bypass` (56300, `VITE_AUTH_BYPASS=true`), `functions-emulator` (5001).

## Local verification — scope checks to what you changed

CI runs the full type-check, lint, format, unit-test, rules and build gates on every push to `dev-*`
and every PR, and the dev-branch `deploy` job depends on all of them, so a broken push never deploys.
Do not duplicate that locally.

- **Tests:** `pnpm exec vitest related --run <changed source and test files>` runs only the suites that import them.
- **Lint + format:** the Husky pre-commit hook runs `eslint --fix --max-warnings 0` and `prettier --write` on staged files, so a successful commit is the lint gate. Lint is type-aware and takes about a minute; don't run it separately per file or per iteration.
- **Types:** the TypeScript language server reports errors in files you edit. Run `pnpm run type-check` at most once per PR, from the main session, and only when the change touches shared types or exported signatures (`types.ts`, `context/*Value.ts`, anything imported across folders).
- **Never** run `pnpm run validate`, full `pnpm run lint`, full `pnpm run test`, or `tsc` unless the user asks, and never from a subagent — parallel full-repo runs have crashed this machine.
- After pushing, read the CI result before merging and fix anything it reports.

## Environment

- Firebase config goes in `.env.local` (see `.env.example`). Never commit `.env.local`. It points local dev servers at prod (`spartboard`) unless swapped for the `spartboard-dev` web config.
- `VITE_AUTH_BYPASS='true'` signs in a mock admin (`mock-user-id`) and skips Auth/permission listeners. It is disabled in production builds and is client-side only — it does **not** bypass Firestore security rules.

## Firebase projects: `spartboard` (prod) and `spartboard-dev`

| Branch  | Firebase project | Gets                                                        | URL                            |
| ------- | ---------------- | ----------------------------------------------------------- | ------------------------------ |
| `dev-*` | `spartboard-dev` | hosting, Firestore rules, indexes, Storage rules, functions | https://spartboard-dev.web.app |
| `main`  | `spartboard`     | the same, and nothing else writes to prod                   | https://spartboard.web.app     |

Since 2026-09-21 a push to `dev-paul` never touches production. Plan and decisions: `docs/plans/DEV_FIREBASE_PROJECT.md`.

- **Compatibility is a release-time rule now, not a per-merge rule.** Merges into `dev-paul` no longer need gating on a marker only the new client writes. At a `main` release, rules and function changes still have to tolerate a teacher's already-open tab running the previous client, and read-rule tightening still needs that marker.
- **CLI and MCP default to prod.** `.firebaserc` `default` (and the Firebase MCP's active project) is `spartboard`. Pass `--project dev` for any ad-hoc deploy, rules release, log read or data change, and never deploy to prod by hand unless Paul asks.
- **Verify on dev.** Browser checks of unreleased work go to https://spartboard-dev.web.app, not prod or a `spartboard--*` preview channel (preview channels are retired).
- **Dev data is config only.** Admins, admin settings, feature/global permissions, standards, buildings, help content and the mock test class, copied by `node scripts/dev-seed/copy-config-from-prod.mjs` (`--dry-run` first; read-only on prod, top-level docs only). Never copy student-bearing collections (sessions, responses, rosters, `users`) into dev. Student sign-in on dev uses the mock class (`organizations/orono/testClasses`).
- **Credentials.** Prod scripts use `scripts/service-account-key.json`; dev uses `gcloud auth application-default login`. CI deploys dev with keyless Workload Identity Federation (`github-deploy@spartboard-dev`, only `dev-*` refs); prod CI still uses the `FIREBASE_SERVICE_ACCOUNT` key.
- **New function secrets go in both projects.** A `defineSecret` missing from `spartboard-dev` fails the dev deploy. Paul sets real values; ClassLink and Spotify are placeholders in dev (ClassLink nightly sync is off there).
- **Shared Drive app.** Dev reuses prod's Google OAuth client (`drive.file` is per client), so a dev bug can still edit Paul's real Drive files. AI runs on Vertex billed to the dev project.
- **Rules have two size caps**: 256 KiB of source (comments are stripped at deploy) and 250 KB compiled. Crossing the compiled cap makes every release fail with a bare 400. Test a rules change with `node scripts/releaseFirestoreRules.mjs spartboard-dev` before it reaches `main`. `pnpm run check:rules-size` measures the compiled size with the emulator's own compiler (needs Java); comments cost nothing, expression nodes do, so write new rules with the `incoming()`/`existing()`/`authUid()`/`unchanged()`/`isStr()` shorthands, except inside `// shorthands: off` regions, which sit near Firestore's 1,000-expression evaluation limit.
- A new `admin_settings` kill switch ships off in both projects; toggle it on dev through the admin panel to test.
- **"Sync from prod" button** (sidebar footer, dev site only, admins only): replaces the signed-in admin's dev boards (including Drawing widget canvases), folders, quizzes, guided learning, notebooks, rubrics and other authored materials with a fresh copy of their prod ones via `syncMyMaterialsFromProdV1` (`functions/src/devSyncFromProd.ts`). One-way and read-only on prod; it borrows the `prod-reader@spartboard-dev` identity, which has read-only Firestore access to prod. Rosters, OAuth tokens, assignments and PLC state are never copied. Nothing flows dev → prod, by design: never build a two-way sync.

## Releasing a feature: behind a flag, on for Paul first

Every new user-facing feature or behaviour change reaches `main` switched **off for teachers** and switched on only for Paul, who uses it in prod on his real account before it opens to everyone. Paul tests on `spartboard-dev` while building; the flag is how he tests in prod after release.

- **Non-widget features:** add an id to `GlobalFeature` (`types.ts`) and a `FEATURE_DEFAULTS` entry in `config/featureDefaults.ts` with `defaultAccessLevel: 'admin'`, `defaultEnabled: true`, `missingDocPublic: false`, so nobody outside admins gets it before a doc exists. Gate every entry point with `canAccessFeature('<id>')`.
- **New widgets / internal tools:** the same idea through `feature_permissions` (`canAccessWidget`): ship at access level `admin` (or `beta` with Paul's email).
- **Org-wide rollout switches** (`admin_settings/*`, the Rollouts panel) have no per-user targeting; when one is needed, AND it with a `global_permissions` gate, as the Quiz widget does with `paperSheetsRollout.enabled && canAccessFeature('paper-answer-sheets')`.
- **Admins always pass admin/beta gates**, so "on for Paul" really means Paul plus the other `/admins`. Say so in the PR if that matters for the feature.
- **The PR description must say** which flag gates the feature, its starting access level, and the admin path to open it: Admin Settings > Access > Global Settings (or Feature Permissions for widgets) > set to Public. Paul flips it after testing in prod; agents never open a flag to Public on prod themselves.
- **Exempt:** bug fixes that restore intended behaviour, copy and styling tweaks, internal/admin-only tools, and dev-only tooling. When in doubt, flag it.
- **Changelog:** a flagged feature gets its `public/changelog.json` entry when the flag opens to everyone, not when the code merges.

## Architecture gotchas

- Canvas hot path (BoardCanvas → WidgetRenderer → DraggableWindow) must use `DashboardActionsContext` / the canvas store from `context/dashboardCanvasStore.ts`, not the full `useDashboard()` value, which re-renders on every provider commit.
- `useToolVisibility()` throws outside `DashboardProvider`. Subs portal and student apps don't mount it — guard or avoid it there.
- `isAdmin` is `null` while loading, `true`/`false` when loaded. Admin status = a document exists at `/admins/{email}`.
- Feature permissions default to public when no `feature_permissions` record exists; `enabled: false` disables a widget for everyone, admins included.
- Dashboard IDs are UUIDs, not Firestore auto-IDs. Always check `user?.uid` before Firestore operations, and return the unsubscribe function from real-time listeners.
- Collections and access rules: read `firestore.rules`. Students use anonymous Firebase Auth with a PIN.
- `firebase.json` has no hosting `predeploy` hook. Run `pnpm run build` before a manual `firebase deploy --only hosting`.
- **useEffect is an escape hatch, not a default**: Only use `useEffect` to synchronize with an external system (Firestore, Firebase Auth, DOM events, timers, Web Audio API, localStorage, etc.). Do NOT use it to compute derived state, sync refs, reset state on prop changes, or chain state updates — these all cause extra render passes and subtle bugs. Instead:
  - Compute derived values inline during render (or with `useMemo` if expensive).
  - Assign refs directly in the render body: `myRef.current = value` — no effect needed.
  - Reset state on prop change using a `key` prop or the "adjusting state while rendering" pattern (store the previous prop value in state, compare during render, call the setter immediately if they differ).
  - Move event-triggered logic into the event handler, not an effect.

## Board isolation: config keys are per-board unless explicitly allowlisted

**Every widget config key belongs to its board and only its board.** A teacher running a
separate board per class section must be able to keep a different To-Do list, link set,
roster, or note on each one. Content must never follow a widget type across boards.

The one exception is **visual appearance**, which persists per-user so a teacher who picks
a font once doesn't re-pick it on every board. That carry-over is driven by the closed
`APPEARANCE_CONFIG_KEYS` allowlist in `utils/widgetConfigPersistence.ts`.

Rules when adding or changing a widget config:

- **The allowlist is closed by default.** A new config key is automatically per-board. You
  do not need to register anything to keep data isolated — that is the default and it is
  the safe one.
- **Only add a key to the allowlist if it is purely visual** and carries no lesson content,
  student names, or teacher-authored text. If you are unsure, leave it off: the cost of
  omitting a key is "styling didn't stick," while the cost of adding a content key is a
  teacher's data leaking between class sections.
- **Never add a nested key.** The allowlist only matches top-level keys. Per-item colors
  inside `cards`, `nodes`, or custom-widget blocks travel with their content and need no
  entry.
- **Explicit "save as preset" features do not use this path.** Stations presets and the
  Hotspot Image library write to `savedWidgetPresets`, a separate profile field the
  defaults machinery never touches.

This inverts an earlier blocklist design that leaked Checklist `items` and Links `urls`
across every board on the account. Deny-by-omission fails toward data leakage; the
allowlist fails toward a cosmetic annoyance.

## CI and conventions

- Pushes to `dev-*` deploy to `spartboard-dev`; pushes to `main` deploy production. See "Firebase projects" above.
- `pr-validation.yml` has a `preflight` job: if `firebase-dev-deploy.yml` already passed on the PR's head SHA, everything except E2E is skipped.
- **Release notes**: `public/changelog.json` is read by teachers, not developers. Never name a feature flag, a Firestore path or an internal mechanism in it, and check every claim against what admin settings actually enable rather than what the code defines. See [docs/DEV_WORKFLOW.md](docs/DEV_WORKFLOW.md#how-to-write-a-release-note).
- **Comments**: One short line max — never multi-paragraph docstrings or multi-line comment blocks. Root-cause narrative and verification rationale belong in the PR description, not the diff. Exception: match the surrounding file's convention where one already differs consistently (e.g. `firestore.rules`). Enforced in review; see [docs/routines/debugger.md](docs/routines/debugger.md).
- TypeScript strict mode; no `any` without explicit annotation. ESLint fails on warnings.
- Widgets are not virtualized — keep dashboards to about 20 widgets.

### Editing a plan in `docs/plans/`

**Before rewriting or substantially revising any `docs/plans/*.md`, list open PRs that touch that
file and rebase onto them instead of rewriting from the version on `main`.** These docs get multiple
agent passes, and two sessions revising the same plan in parallel produces a conflict that has to be
resolved by hand, decision by decision — the losing pass's work is silently discarded if whoever
resolves it does not read both. A rewrite that never checked cannot know what it is dropping.

This applies to a rewrite, an audit pass, or a resequencing. Appending one decision to a plan you
just read does not need the check.
