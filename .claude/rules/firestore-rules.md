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
- **Compile work is a third limit.** Google's rules compiler re-expands a helper's whole body at every call site and returns 503 UNAVAILABLE once a compile runs past about 5.2 s (deploys then pass only on lucky retries). `check:rules-size` prints the compile work in units (expanded nodes + 3 per expanded helper call; Google takes about 0.66 s + 18.4 µs per unit on a typical day), fails above `COMPILE_COST_CEILING`, and fails a PR that adds more than 2,000 units unless it has the `rules-compile-ok` label. `java -cp <emulator jar> scripts/rulesAst/RulesAst.java cost <rules> 15` shows the heaviest collections. Keep helpers called by authUid(), notDeactivated() and isAdmin() free of further helper calls, and don't add new calls to them where one per rule will do. For one authUid() per rule, write `allow m: if fooOk(authUid());` with `function fooOk(u)` and pass `u` to helpers that take it (`liveU`, `mySidU`, `plcMemberU`, `seatOpen`, `isSubMonitor`); an argument that errors only denies where it is used.
