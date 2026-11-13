---
paths:
  - 'firestore.rules'
  - 'tests/rules/**'
  - 'scripts/checkRulesSize.mjs'
  - 'scripts/rulesSizeBudget.mjs'
  - 'scripts/minifyRules.mjs'
  - 'scripts/releaseFirestoreRules.mjs'
---

# Firestore rules

- **Rules have two size caps**: 256 KiB of source (comments are stripped at deploy) and 256,000 bytes compiled as Firebase counts it, 2.6% to 4% above what `check:rules-size` measures, a ratio that drifts (it fails above 245,000 of its own measure; record any new refusal's "actual" bytes in `scripts/checkRulesSize.mjs`). Crossing the compiled cap makes every release fail with a bare 400. On a PR into `dev-*`, the Rules Size Budget check fails when the PR grows the compiled size more than 1,500 bytes over its base (`scripts/rulesSizeBudget.mjs`): move rare writes to a server function, or add the `rules-size-ok` label and re-run that check. Test a rules change with `node scripts/releaseFirestoreRules.mjs spartboard-dev` before it reaches `main`. Releases ship a minified copy (`scripts/minifyRules.mjs` shortens bound names and refuses to release unless the emulator's compiler proves it equivalent; repo variable `RULES_MINIFY=0` ships unminified in an incident). `pnpm run check:rules-size` measures that minified compiled size with the emulator's own compiler (needs Java); comments cost nothing, expression nodes and identifier lengths do, so write new rules with the `signedIn()`/`incoming()`/`existing()`/`authUid()`/`unchanged()`/`isStr()` shorthands, except inside `// shorthands: off` regions, which sit near Firestore's 1,000-expression evaluation limit.
