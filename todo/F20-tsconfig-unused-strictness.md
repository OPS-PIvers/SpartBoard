# Handoff: F20 — Enable `noUnusedLocals` / `noUnusedParameters` in tsconfig

**Status:** Deferred from the `optimize-pass` sweep (2026-06-08). Approved as a handoff because the
config flip is trivial but the cleanup it surfaces could be large and must all land before
`pnpm run validate` goes green.

**Impact:** 4/10 · **Effort:** small (flip) + unknown (cleanup) · **Risk:** medium · **Behavior change:** none

---

## Problem

`tsconfig.json` has `noUnusedLocals` and `noUnusedParameters` both set to `false`. Dead-code
detection therefore happens only at ESLint/CI time, not in the IDE or `pnpm run type-check`. This is
a tooling inconsistency: a developer's editor type-check stays green while CI lint flags unused
symbols, and unused locals/params can accumulate between lint runs.

## Evidence (file:line)

- `tsconfig.json:38-39` — `"noUnusedLocals": false`, `"noUnusedParameters": false`
- ESLint already enforces `no-unused-vars` with `argsIgnorePattern: '^_'` (see `eslint.config.js`),
  so intentional unused params are conventionally underscore-prefixed.

## Proposed approach

1. Set both flags to `true` in `tsconfig.json` to mirror the existing ESLint rule.
2. Run `pnpm run type-check:all` and fix every newly-surfaced `TS6133`/`TS6196` violation:
   - Remove genuinely dead locals/imports.
   - Prefix intentionally-unused parameters with `_` (matches `argsIgnorePattern: '^_'`).
   - Do **not** silence with `// @ts-ignore` / `eslint-disable` — those are forbidden by house rules.
3. Consider mirroring the change in `functions/tsconfig.json` if that tree has the same flags off
   (check first; keep root and functions consistent).

## Risks

- **Unknown cleanup volume.** A large codebase with the flags off for a long time may surface many
  violations across unrelated files; all must be fixed before `validate` passes, making the PR
  potentially wide and noisy. Scope it as its own PR so the diff is reviewable.
- Underscore-prefixing a param changes its name — verify nothing references it by the old name.
- Removing an "unused" import that has a side effect (rare) would change behavior — confirm imports
  are truly unused, not side-effecting.

## Acceptance criteria

- [ ] `tsconfig.json` (and `functions/tsconfig.json` if applicable) have `noUnusedLocals: true` and
      `noUnusedParameters: true`.
- [ ] `pnpm run type-check:all` is clean.
- [ ] `pnpm run validate` and `pnpm run build:all` are green; no suppressions introduced; intentional
      unused params use the `_` prefix.
- [ ] No behavior change — only dead-code removal and parameter renames.

## Copyable kickoff prompt

> In SpartBoard (React 19 + TS + Vite, flat repo, pnpm), enable `noUnusedLocals` and
> `noUnusedParameters` in `tsconfig.json:38-39` (and `functions/tsconfig.json` if it has them off
> too), then run `pnpm run type-check:all` and fix every surfaced violation: delete dead
> locals/imports and prefix intentionally-unused params with `_` (matches the ESLint
> `argsIgnorePattern: '^_'`). No `@ts-ignore`/`eslint-disable` — house rules forbid suppressions.
> Keep it behavior-preserving (dead-code removal + renames only). Land it as its own PR. Run
> `pnpm run validate` and `pnpm run build:all` until green before declaring done.
