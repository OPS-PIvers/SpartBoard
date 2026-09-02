# Rich-response implementer conventions

Read this before your item brief. It overrides nothing in `CLAUDE.md`; it adds the
rules specific to this run.

## Branch, PR, merge

- Base branch and PR target: **`dev-paul`**, never `main`.
- Branch name: `feat/rr-<id>-<slug>` (e.g. `feat/rr-1.2-takeindex-ordering`).
- Open the PR with `gh pr create --base dev-paul --body-file <file>`; never merge it.
- One PR per item. Keep the PR body: what / why / how verified / protected-file needs.
- Commit trailer: `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- PR body footer: `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.

## Machine limits — HARD RULES

This machine runs several agents at once and has crashed under full-repo checks.

- NEVER run `pnpm run validate`, `pnpm run test`, `pnpm run test:all`, `pnpm run lint`,
  `pnpm run type-check`, `pnpm run build`, `vitest run` with no file argument, or
  `tsc --noEmit`. CI is the authoritative gate and will run them on your PR.
- Allowed verification, and only on the files you touched:
  - `pnpm vitest run <path/to/one.test.ts> [more files]`
  - `npx eslint <changed files> --max-warnings 0`
  - `npx prettier --check <changed files>`
  - functions: `pnpm -C functions vitest run <file>` and
    `pnpm -C functions exec eslint <file> --max-warnings 0`
- The pre-commit hook runs lint-staged on staged files. That is expected; let it run.
- Never `git stash` (shared across worktrees). Never write to `/tmp`; use a file inside
  your own worktree (delete it before committing) for commit and PR bodies.

## Production safety — zero regressions for users signing in tomorrow

**Every push to `dev-paul` deploys `firestore.rules`, `firestore.indexes.json`,
`storage.rules` AND `functions/` to the shared production project** (see
`.github/workflows/firebase-dev-deploy.yml`, step "Deploy Firebase Rules, Indexes,
Functions, Storage"). Only hosting is isolated to a preview channel. Therefore:

- A change to an EXISTING Cloud Function's behaviour goes live for production clients
  immediately. Any such change must be gated on a marker that only the new client
  writes (a session/quiz/assignment field that production clients never set), so
  documents produced by the old client are handled exactly as today.
- NEW callables are safe (nothing in production calls them) but must fail closed on
  missing or malformed input.
- Rules changes must be purely additive: a new path or a new optional field, never a
  tightened condition on a path production clients already write.

Production and `dev-paul` share the same Firestore project, rules, Storage bucket and
Cloud Functions deployment.

- Every new Firestore field is **optional at read time**. A document written by the
  current production client, with none of your fields, must behave exactly as today.
- Never change the meaning of an existing field. Add beside, never repurpose.
- Never write a new field to a document unless the feature that needs it is active on
  that document (a quiz with no recording block writes nothing new).
- Protected files you must NOT edit: `firestore.rules`, `storage.rules`,
  `firestore.indexes.json`, `firebase.json`, `.github/workflows/*`,
  `functions/package.json` dependency changes other than what your brief names.
  Describe the exact needed change under "Protected-file change needed" in your PR
  body and in `concerns`; the orchestrator ships it separately.
- Cloud Functions: new callables only. Do not change the signature or behaviour of an
  existing callable. Fail closed on missing input.

## Locked product decisions for this run (2026-09-01)

- **Audio only.** Video stays a peer mode in the data model; build no video UI.
- **No AI transcription.** No transcript artifacts, no Gemini calls.
- **Gating is fail-closed.** New `GlobalFeature` id `'quiz-media-response'`. Recording
  controls in the editor, capture in the student app, and playback surfaces render only
  when a permission record explicitly grants access (`canAccessFeature` true AND the
  record exists). No record means hidden. Item 3.1 introduces the id; siblings consume
  the same helper.
- **Drive-only persistence.** Student audio persists only in the assigning teacher's
  Drive. Firebase Storage is a transit buffer: deleted on successful archive; a failed
  archive is retried and shown to the student as not yet submitted; the straggler sweep
  runs in hours, not days.
- **Transcode server-side.** `ffmpeg-static` in the archival Cloud Function; output
  M4A/AAC. (Item 3.3 only.)
- District posture is settled: no allowlist checks, no alternate-format policy, no
  consent gate beyond the Tennessen notice the map specifies.

## Quality bar — the orchestrator reviews every UI change visually

- Follow `CLAUDE.md` "Design Context" and "Widget Appearance Standard". Teacher surfaces
  are dark glass; the student quiz app is light and calm. No placeholder-looking UI, no
  default-browser controls where the app has a styled equivalent, no emoji as icons,
  no `alert()`/`confirm()`.
- Widget front faces use container-query units per `CLAUDE.md`. Settings panels and
  student/admin pages use normal Tailwind.
- Every new string goes through i18n (`locales/en/*.json`; add the key to `de`, `es`,
  `fr` with the English text as a placeholder value).
- Loading, empty, error and disabled states exist for every new surface.
- Keyboard reachable, labelled icon buttons, `prefers-reduced-motion` respected.
- Comments: one short line max. Narrative goes in the PR body.
- Tests: colocate `*.test.ts(x)` next to the source; extend existing test files where
  they exist. Test the decision the brief quotes, not the implementation detail.

## When to stop and ask

Return `status: "blocked"` with the precise question if the brief and the code
disagree, if a decision above would have to be violated, or if a sibling item's output
is missing and you would have to invent it. Do not guess and do not shrink scope.
