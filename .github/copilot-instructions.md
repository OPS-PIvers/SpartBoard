# Copilot Instructions for SpartBoard

`CLAUDE.md` at the repo root is the maintained source of truth, and `AGENTS.md` lists the other files to read. Where this file disagrees with `CLAUDE.md`, `CLAUDE.md` wins.

SpartBoard is a classroom dashboard (React, TypeScript, Vite, Firebase). There is no `src/` directory: code lives in root-level folders and `@/` maps to the repo root.

## Working in the repo

- pnpm only, Node 24+. Install with `pnpm run install:all`.
- Every PR targets `dev-paul`, never `main`. Only release and hotfix PRs go into `main`.
- Do not run `pnpm run validate`, full `pnpm run lint`, full `pnpm run test` or `tsc` locally; CI runs them on every push. Run `pnpm exec vitest related --run <changed files>` and let the pre-commit hook lint and format staged files.
- `pnpm dev` reads the committed `.env.development` (the `spartboard-dev` project). Never commit `.env.local`.

## Writing code

- Import with the `@/` alias, not `../../` paths.
- Lint fails on warnings, on `any`, and on unhandled promises (`await` them or mark them `void`).
- Do not silence an error with `eslint-disable`, `@ts-ignore` or `@ts-nocheck`. The few sanctioned per-line disables carry a reason; see `CLAUDE.md` and `components/CLAUDE.md`.
- Code comments are one short line at most.
- `useEffect` only synchronizes with an external system, and new code never reads or writes `ref.current` during render.
- A new user-facing feature ships behind a flag that is off for teachers (`CLAUDE.md`, "Releasing a feature").
- A widget config key belongs to its board unless it is purely visual (`CLAUDE.md`, "Board isolation").

## UI and widgets

- Read `components/CLAUDE.md` before changing UI: every new control needs a live tour anchor (`tourAttr`), scroll panels keep bottom padding, and permanent helper text is not added.
- Read `components/widgets/CLAUDE.md` before changing a widget: front-face text, icons and spacing use `cqmin` container units, never fixed Tailwind sizes, and empty states use `ScaledEmptyState`.
- A new widget is registered in `types.ts`, `config/tools.ts`, `config/widgetDefaults.ts`, `config/widgetGradeLevels.ts` and `components/widgets/WidgetRegistry.ts`.
- Never set a widget's z-index by hand; use `bringToFront(id)`. Never create an `AudioContext`; use the shared one in `utils/timeToolAudio.ts`.

## Reviewing a pull request

- `public/changelog.json` is read by teachers: no flag names, Firestore paths or internal mechanisms, and a flagged feature gets its entry only when the flag opens to everyone.
- A change to `firestore.rules` follows `.claude/rules/firestore-rules.md` (size caps and shorthands).
- Rules and function changes must tolerate a teacher's already-open tab running the previous client when they reach `main`.
