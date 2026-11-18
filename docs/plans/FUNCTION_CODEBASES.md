# Function codebases: deploy Cloud Functions in independent groups

Status: planned (2026-11-18). Lead thread: "Split functions into separately deployed groups".

## Goal

Make a release redeploy only the Cloud Functions it actually changed, and stop every function
instance from loading all ~277 functions at cold start. No teacher or student may see a failed call,
a missed trigger or a double-fired trigger while this rolls out. The web app stays one bundle.

## What the data says (read this first)

Google allows 60 Cloud Functions changes a minute per region, so a release that touches every
function spends 5 or more minutes waiting on quota. #6089 already deploys only the affected
functions on `dev-paul` and `main`. Replaying the last three releases through
`.github/scripts/affected-functions.mjs`:

| Release     | Function files changed | Functions redeployed                  |
| ----------- | ---------------------- | ------------------------------------- |
| 2026.11.17  | 92                     | all (275 of 282 affected, over 75%)   |
| 2026.11.17b | 21                     | all (`functions/package.json` bumped) |
| 2026.11.17c | 20                     | 164                                   |

The big numbers come from a few hub modules that almost every function imports, not from how
many features changed:

| Module                        | Functions that import it | Why                                                                                                             |
| ----------------------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `firebaseAdmin.ts`            | 276                      | init; rarely changes, fine                                                                                      |
| `authz.ts`, `viewAsGuard.ts`  | 253, 248                 | real shared auth                                                                                                |
| `featureMissingDoc.ts`        | 148                      | edited by almost every new flag                                                                                 |
| `studentAssignmentTargets.ts` | 146                      | 1,857-line module; a lazy `import('./quizReadAloud')` pulls in quiz media, Drive upload and paper transcription |
| `paperWrittenTypes.ts`        | 146                      | reached only through the edge above                                                                             |
| `quizSessionContent.ts`       | 172                      | shared quiz content reader                                                                                      |

**Conclusion: codebases on their own would not have shortened any of these releases**, because
these hubs cross every sensible grouping. A change to `featureMissingDoc.ts` redeploys 148 functions
whether they sit in one codebase or seven. So the plan has two parts that run in parallel:

1. **Untangle the hubs** (Wave 1, slice C). This is what shrinks release deploys. Pure refactors, no
   deploy risk.
2. **Codebases** (Waves 1 and 2). These give smaller cold starts (an instance loads only its group),
   per-group deploys, and per-group failure isolation. They do not change the quota maths.

## How Firebase moves a function between codebases (verified in firebase-tools 15.36 source)

- Each codebase needs its own `source` directory (`functions/projectConfig.js` rejects two configs
  with the same source and prefix, and a prefix renames functions, so we never use one).
- `groupEndpointsByCodebase` (`deploy/functions/functionsDeployHelper.js`) gives a live function to
  whichever codebase being deployed **exports that name**, before looking at its codebase label. So
  when the new codebase is in the deploy, the function is an **update** (one PATCH that rewrites the
  `firebase-functions-codebase` label), not a delete and create. Same as any normal deploy: the new
  revision rolls out with no gap.
- The danger is a deploy of the **old** codebase alone after the name left it: the function still
  carries the old label, so that codebase plans a **delete**.
- `promptForFunctionDeletion` throws without `--force` in non-interactive mode, but so do several
  unrelated prompts (retried triggers, min-instances cost, missing artifact cleanup policy, unsafe
  event-type changes), and storage and indexes release earlier in the same command. So "deploy
  without `--force`" is **not** our safety net. CI keeps `--force` and runs its own pre-deploy delete
  check instead (slice B).
- A missing `firebase-functions-codebase` label means `default` (`gcp/cloudfunctionsv2.js` strips
  the label for `default`).
- A plain `functions:<name>` filter means codebase `default` (`parseFunctionSelector`). After the
  split, targets must be written `functions:<codebase>:<name>`.
- Unchanged functions are skipped by hash, and the hash is the codebase's whole uploaded source plus
  env and secrets (`cache/applyHash.js`). So a codebase directory must hold only its own import
  closure, or any change anywhere changes every hash. A `functions:<codebase>` filter turns skipping
  off for that whole codebase (`prepare.js`), and named targets set `targetedByOnly`.

## Groups

Seven codebases. Membership lives in one manifest, `functions/codebases.json`; anything not listed
stays in `default`, so a new function needs no manifest edit until someone chooses to move it.

| Codebase       | ~Count | What goes there                                                                                                                              | Move order |
| -------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| `admin`        | 34     | organization*, permission mirrors, analytics, View as, dev sync, org admin, sub portal, course                                               | 1          |
| `integrations` | 64     | LTI, MCP, Classroom add-on, ClassLink, Google OAuth and Tasks, Spotify, Schoology, import, web and live tours                                | 2          |
| `plc`          | 37     | PLC membership, sync groups, norming, meeting notes and recording, assessments recompute, digests                                            | 3          |
| `content`      | ~45    | AI generation, read aloud, translation, pronunciation, paper transcription, quiz and wall media archive, embed proxy, link preview, GL media | 4          |
| `gradebook`    | 32     | `gradeIndex*` triggers, `quizAttemptGradeWrite`, gradebook roster                                                                            | 5          |
| `default`      | ~52    | assignments: quiz, writing, flashcards, mini apps, video activity, projects, focus sessions, cleanup                                         | stays      |
| `student`      | 14     | student sign-in, PIN login, pseudonyms, poll codes, load-issue report, focus student endpoints                                               | 6 (last)   |

Assignments stay in `default` so the busiest classroom paths are never moved. Slice A writes the
exact manifest; the counts above come from a first pass by module path and may shift by a few.

Manifest format (fixed now so slices A and B can work in parallel):

```json
{ "codebases": { "admin": ["orgAdminV1", "..."], "plc": ["..."] } }
```

Rules a test enforces: every name is a real export of `functions/src/index.ts`; no name is in two
codebases; no codebase is named `default`; test-only `__` exports are never listed.

## Wave 1: three parallel slices, no function moves

### Slice A: codebase build (functions tooling)

- Add `functions/codebases.json` with every codebase present but **empty lists**, so the first
  deploy is a no-op for every live function.
- A build step (`functions/scripts/build-codebases.mjs`, run after `tsc`) writes one source
  directory per codebase under `functions/deploy/<name>/` (gitignored; no leading dot, because
  `upload-artifact` skips dot folders, and it must stay under `functions/` because the CLI finds
  `firebase-functions` by walking up parent folders). Each holds:
  - `package.json` copied byte for byte except `main: "index.js"` (the pnpm `overrides` and
    `onlyBuiltDependencies: ["ffmpeg-static"]` must survive), and the lockfile;
  - only that codebase's compiled import closure from `lib/` (same relative paths), plus `data/`
    when a module in the closure reads it (cmudict reads `__dirname/../../data`);
  - an `index.js` that first requires `./lib/functionsInit` (26 exported modules never import it,
    and it also installs the dev Drive write guard), then re-exports only that codebase's names.
    `default` gets everything not claimed. Only the selected modules load, which is the cold-start win.
- `firebase.json` `functions` becomes an array, one entry per codebase, each with its own `source`.
  `default` keeps the codebase name `default`; only its source path changes, so live functions keep
  their label.
- Emulator (`serve` must run the build step), `pnpm -C functions build` and the functions tests still work. Tests import from
  `src/index.ts` as before.
- **Slice A also owns the deploy-job step** that runs `build-codebases` after the artifact download
  in both `firebase-deploy.yml` and `firebase-dev-deploy.yml` (the generated folders are gitignored
  and the artifact holds only `dist` and `functions/lib`). Without it, A's `firebase.json` change
  breaks every functions deploy until B lands.
- Tests: manifest rules above; the union of all generated `index.js` exports equals the `lib/index.js`
  exports exactly (nothing dropped, nothing doubled); each generated dir loads with `require`, holds every
  relative file its closure imports, and building twice gives byte-identical folders.

### Slice B: CI per codebase

- `affected-functions.mjs` / `plan-deploy.sh` / `function-targets.mjs` emit
  `functions:<codebase>:<name>` using the manifest. Plain `functions` still means every codebase.
  `function-targets.mjs` must strip the codebase part before looking up the export (today it only
  strips `functions:`, so a qualified name would fall back to deploying everything).
- `firebase-deploy-with-retry.sh` retries failed functions as bare `functions:<name>`, which the CLI
  reads as codebase `default`; after a half-failed move that retry would delete the function.
  Qualify retried names from the manifest.
- **Pre-deploy delete check (the safety net).** Before every functions deploy, list live functions
  (Cloud Functions v2 API) and mirror `groupEndpointsByCodebase`: a live function is claimed by any
  codebase in this deploy that exports its name, whatever its label, so a move is never counted as a
  delete. Only an unclaimed function whose label (no label = `default`) is a codebase in this deploy
  is a delete. Fail the job before any `firebase deploy` if such a delete hits a name that the
  manifest or `functions/src/index.ts` still exports somewhere (an old codebase deployed without its
  new owner). Other deletes (a function removed from the code, or on spartboard-dev a function only a
  `/preview` branch deployed) go ahead as today. Key it on live labels, not on a file diff, so dev
  branches that diff against the merge base are covered. CI keeps `--force` so the unrelated prompts
  above never block a release.
- Any change to `functions/codebases.json` or `firebase.json` deploys every function (all codebases
  in one command, so every moved name is claimed by its new codebase).
- After a deploy, a label check lists live functions and fails if any label differs from the manifest
  (missing label counts as `default`) or if a moved function's `createTime` changed (recreated).
- `full_backend` keeps deploying every codebase. An optional `codebase` input deploys one codebase
  in full; it runs the same delete check first.
- Smoke test unchanged (it calls functions by name, which never change).
- Extend `tests/ci.affectedFunctions.test.ts`, `tests/ci.planDeploy.test.ts` and
  `tests/ci.firebaseDeployRetry.test.ts`, and add tests for the delete check and `function-targets`.
- Lands after slice A on `dev-paul` (it reads the manifest); can be built in parallel against the
  fixed format.

### Slice C: untangle the hubs (biggest deploy-time win)

Refactors only; no behaviour change, no new exports, no renamed functions.

1. `studentAssignmentTargets.ts`: the lazy `import('./quizReadAloud')` sits inside
   `setAssignmentTargetsV1` itself. Move that callable into its own module (keep its export name) so
   the 145 functions that only need the helpers stop depending on quiz media. Check the other heavy
   imports the same way.
2. `featureMissingDoc.ts`: teach `affected-functions.mjs` that adding a new id to the lists changes
   nothing for functions that never ask about that id, while editing or removing an entry still
   affects every importer. An add still counts as affecting (a) every importer whose import closure
   contains the added id as a quoted string (a caller that already checks it flips from false to
   true), and (b) callers that compute the id at runtime (`aiGeneration.ts` request types,
   `quizMediaArchive.ts`). Test all three cases.
3. Type-only imports: `import type` and modules that export only types never reach runtime JS.
   Make `affected-functions.mjs` skip `import type` edges and keep the parity test against
   TypeScript passing.
4. Re-run the replay of the last three releases and put the before and after counts in the PR.

Target: release 2026.11.17c drops from 164 functions to under 60.

## Wave 2: moves (after A and B are on `dev-paul` and their first dev deploy passed)

Each move is a PR that only edits `functions/codebases.json` (plus its test fixture). One thread per
codebase; threads may prepare PRs in parallel, but **merge one move at a time on `dev-paul`** and wait
for that dev deploy and its label check to pass before the next merge.

On dev, each move thread proves:

1. The dev deploy log shows the moved functions as updates, no creates and no deletes.
2. The label check passes and `createTime` is unchanged for every moved function.
3. One callable and one trigger from the group still work (call the callable from the dev site; write
   a doc that fires the trigger and confirm exactly one run in the function logs).

Order: admin, integrations, plc, content, gradebook, student. Student goes last and alone.

## Production

- Prod changes only go through Paul's `/promote`; no thread deploys prod.
- A and B were proven a no-op on dev (empty manifest) before any move merged. The first release that
  carries them may also carry moves already proven on dev, but only admin, integrations and plc.
- Each later release may carry any moves already proven on dev. The release thread confirms the prod
  delete check and label check passed, and the smoke test passed.
- Promote releases with moves **after school** (after 4 PM Central on a school day, or any time on a
  weekend). The student move rides a release of its own.
- Rollback: revert the manifest PR and release; the reverse move is the same in-place update.

## Not in scope

- Splitting the web app.
- Separate `package.json` dependencies per codebase (a later step if dependency bumps keep forcing
  full deploys; every codebase shares the one lockfile for now).
- Changing regions, memory, or function names.

## Slices for threads

| Slice | Thread brief                                                         | Depends on                                           |
| ----- | -------------------------------------------------------------------- | ---------------------------------------------------- |
| A     | Codebase build, empty manifest, firebase.json array                  | none                                                 |
| B     | CI per codebase, delete check, label check                           | A's manifest format (fixed above); merges after A    |
| C     | Untangle hubs in affected-functions and modules                      | none                                                 |
| D1-D6 | One move each: admin, integrations, plc, content, gradebook, student | A and B merged on `dev-paul`; D merges one at a time |
