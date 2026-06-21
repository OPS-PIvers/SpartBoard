# Optimize-pass — deferred work backlog

This folder holds **handoff docs** for optimization findings surfaced by an
`optimize-pass` explore sweep (read-only fan-out across UX/a11y, performance,
data-layer, correctness, and build-quality dimensions). Each doc is a
self-contained kickoff for a later agent or contributor: it states the problem,
cites current-state `file:line` evidence, proposes an approach, lists risks, and
gives acceptance criteria plus a copyable kickoff prompt.

## Already shipped (wave 1)

Committed on `claude/codebase-improvement-areas-on8n5r` (see the
`perf(data,widgets): … optimize-pass wave 1` commit):

| ID  | Area        | Summary                                                                          |
| --- | ----------- | -------------------------------------------------------------------------------- |
| F3  | data        | Paginate quiz/VA/GL `deleteAssignment` response reads via `readAllDocsPaged`     |
| F4  | data        | Paginate `useCollections` delete-all board reads; widen paging helper to `Query` |
| F14 | data        | Replace unbounded `getDocs` in `useReconcileExpiredSubShares` with paged read    |
| F13 | perf        | Memoize `WidgetRenderer` callbacks/`customStyle` so `DraggableWindow` memo holds |
| F16 | ux-a11y     | `First5` external-link icon: `aria-label`, contrast, projector-size              |
| F20 | ux-a11y     | `ClockWidget` seconds `0.7em` → `0.85em`                                         |
| F15 | correctness | Enforce lowercase org member emails in `firestore.rules`                         |
| F17 | build       | Align `functions/` devDeps (typescript 5.9.3, vitest 4.1.8) with root            |
| F19 | build       | Add conservative vitest coverage thresholds (regression floor)                   |

## Shipped (wave 2)

Committed on `claude/docs-folder-optimizations-hvbpkt` (PR #1994):

| ID  | Area        | Summary                                                                                  |
| --- | ----------- | ---------------------------------------------------------------------------------------- |
| F1  | ux-a11y     | Raise muted-text contrast to WCAG AA on dark surfaces (`ScaledEmptyState`, GL results)   |
| F22 | perf        | Memoize `BoardCanvas` `selectedGroupId`/`groupMembers` derivations                       |
| F10 | data        | Read PLC `sharedSheetUrl` from the live snapshot instead of a per-call `getDoc`          |
| F21 | data        | Drop admin `orderBy('name')` from the `/plcs` listener (client sort; no custom index)    |
| F6  | correctness | Canonicalize building IDs in the building-admin `firestore.rules` check                  |
| F24 | correctness | Bound `plc_invitations` invitee email length (`<= 255`)                                  |
| F7  | correctness | Scope quiz `deleteHistory` to the removed student's session window on PIN-collision keys |
| F12 | build       | Split the ~4337-line `functions/src/index.ts` into leaf modules + barrel (exports kept)  |
| F18 | build       | Single-source `ClassLinkClass`/`ClassLinkUser`/email-filter in `classlinkShared.ts`      |
| F11 | build       | Split type-aware ESLint into per-tsconfig passes; lower CI heap cap 6144 → 5120          |

## Still deferred

- **F2 — dual-query listener consolidation: BLOCKED.** Still gated on a Firestore
  backfill that writes `classIds` onto legacy `classId`-only session docs; collapsing
  the queries before that backfill silently drops assignments. See `02-firestore-cost.md`.
- **F9, F23, F8** — large whole-tree refactors (context-churn slice, `utils/` regroup,
  `noUnusedLocals`). Tracked for a dedicated follow-up; see `05-…` / `06-…`.

## Resolved without code change

- **F5 — per-building dock-defaults "bypass": false positive (won't-fix).** The
  reported "bypass" is the documented, tested, public-by-default contract: a
  building missing from `dockDefaults` means "no opinion → allow", and only an
  entry that is _present and explicitly_ `false` disables the widget. See
  `context/AuthContext.tsx:1950-1979` and the contract tests in
  `tests/context/AuthContext.canAccessWidgetDockDefaults.test.tsx`. Inverting this
  to deny-by-default for unconfigured buildings would be a deliberate **product**
  decision (it changes which widgets ~all users see), not a correctness fix —
  do not re-file it as a bug.

## Deferred batches (this folder)

| Doc                              | IDs                    | Theme                                  |
| -------------------------------- | ---------------------- | -------------------------------------- |
| `01-accessibility-contrast.md`   | F1                     | WCAG AA contrast sweep (design review) |
| `02-firestore-cost.md`           | F2, F10, F21           | Firestore read/listener cost           |
| `03-firestore-rules.md`          | F6, F24                | Security-rules hardening               |
| `04-quiz-history-correctness.md` | F7                     | Quiz PIN-collision history deletion    |
| `05-build-infra-monorepo.md`     | F8, F11, F12, F18, F23 | Build/CI/monorepo tech-debt            |
| `06-perf-render.md`              | F9, F22                | Render-path performance                |

Each batch is independent and file-disjoint from wave 1, so they can be picked up
in any order. Where items within a batch touch the same files, do them together.
