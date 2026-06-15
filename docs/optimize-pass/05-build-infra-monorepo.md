# Build / CI / monorepo tech-debt — F8, F11, F12, F18, F23

**Dimension:** build-quality. These are independent; sequence by ROI. F11 (CI cost)
and F18 (monorepo sharing) are the best value; F8/F12/F23 are large refactors to
schedule deliberately.

---

## F11 — Type-aware ESLint needs a 6GB heap in CI

**Impact:** 4 · **Effort:** medium · **Risk:** medium · **Behavior change:** no.

### Problem

Every CI job must cap Node heap at `--max-old-space-size=6144` to avoid OOM during
lint, because `eslint.config.js` runs type-aware rules across **both** tsconfigs
(root + functions) as one monolithic pass. This is slow and costly CI.

### Evidence

- `.github/workflows/pr-validation.yml:37`,
  `.github/workflows/firebase-deploy.yml:40`,
  `.github/workflows/firebase-dev-deploy.yml:25` — all set
  `NODE_OPTIONS=--max-old-space-size=6144`.
- `eslint.config.js:46` — loads both tsconfigs with type-aware rules enabled.

### Approach

Split linting so root and `functions/` use separate ESLint type-aware passes
(separate `projectService`/`parserOptions.project` scopes), or lint `functions/`
with its own config/command. Measure peak heap after; aim to drop the 6GB override.
Do **not** disable type-aware rules to "fix" memory.

### Acceptance criteria

- `pnpm run lint` passes without the 6GB `NODE_OPTIONS` override (or a clearly
  lower cap), with identical rule coverage. CI workflows updated.

---

## F18 — `functions/` can't share root types; duplicated definitions

**Impact:** 3 · **Effort:** small · **Risk:** medium · **Behavior change:** no.

### Problem

Root `tsconfig.json` defines `@/*` → root, but `functions/tsconfig.json` has no
equivalent, so functions can't import shared types/utils and re-declare them. E.g.
`ClassLinkUser` is duplicated in functions instead of imported from root
`types.ts`, risking drift.

### Evidence

- `tsconfig.json:21-22` — `@/*` alias for root
- `functions/tsconfig.json` — no path alias; `rootDir` hardcoded to `src`
- `functions/src/index.ts:76-81` — duplicates `ClassLinkUser` (exists in root `types.ts`)

### Approach

Add a path alias in `functions/tsconfig.json` mapping to the shared root types,
then import the shared definition and delete the duplicate. Verify the functions
build (`tsc`) still emits correctly with the alias (may need `tsc-alias` or a
relative import if the emit doesn't rewrite paths — confirm before committing).

### Acceptance criteria

- `ClassLinkUser` (and any other duplicated shared type found) is defined once and
  imported by functions. `pnpm run build:all` green.

---

## F8 — Re-enable `noUnusedLocals` / `noUnusedParameters` (large)

**Impact:** 5 · **Effort:** large · **Risk:** medium · **Behavior change:** no.

### Problem

`tsconfig.json:38-39` disables both checks despite strict mode, letting dead
locals/params/exports accumulate silently across the tree.

### Approach

Flip both to `true`, then do a dead-code sweep to clear the resulting errors
(prefix intentionally-unused params with `_`, delete genuinely dead code). This is
large and noisy — schedule as its own PR, ideally split per directory to keep
review tractable. No suppressions.

### Acceptance criteria

- Both flags `true`; `pnpm run type-check:all` green with no new suppressions.

---

## F12 — Split monolithic `functions/src/index.ts` (large)

**Impact:** 4 · **Effort:** large · **Risk:** medium · **Behavior change:** no.

### Problem

`functions/src/index.ts` is ~4336 lines exporting 42 functions/interfaces (Google
OAuth, Spotify OAuth, LTI, analytics, …), hurting review/test/circular-import risk.

### Approach

Extract each logical group into its own leaf module (`googleOAuth.ts`,
`spotifyOAuth.ts`, `lti.ts`, …) and reduce `index.ts` to a thin barrel of
re-exports. Keep deployed function names/exports byte-identical so Firebase deploy
targets don't change. Verify `pnpm -C functions run build` and that the exported
function set is unchanged.

### Acceptance criteria

- Same set of exported Cloud Functions (names unchanged); `index.ts` is a barrel;
  functions build green; tests still pass.

---

## F23 — Group the 144 flat `utils/` files (large, low priority)

**Impact:** 2 · **Effort:** medium · **Risk:** low · **Behavior change:** no.

### Problem

`utils/` has ~144 flat files with no namespacing, hurting discovery and inviting
duplicate helpers.

### Approach

Group by domain (`utils/date/`, `utils/format/`, `utils/firestore/`, …) with
per-folder barrels, update imports (`@/utils/...`). Purely mechanical but
wide-reaching; coordinate to avoid colliding with other in-flight branches. Lowest
priority of this batch.

### Acceptance criteria

- Files grouped, imports updated, `pnpm run validate` green. No behavior change.
