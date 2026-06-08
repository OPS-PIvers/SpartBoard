# `optimize-pass` — repeatable codebase optimization workflow

A reusable, SpartBoard-specific multi-agent workflow that encodes the 4-phase optimization
process (explore → plan → implement → ship). It is **phase-dispatched** rather than one
autonomous run, because the process has human review gates that a single background workflow
can't honor — you (or the orchestrating agent) drive it one phase at a time and approve between
phases.

Script: [`optimize-pass.js`](./optimize-pass.js). Invoke with the `Workflow` tool:
`Workflow({ name: 'optimize-pass', args: { phase: '…', … } })`.

All agents are pre-loaded with SpartBoard's house rules (pnpm, flat structure / `@/` = root,
no suppressions, `useEffect`-as-escape-hatch, container-query widget scaling, Firestore
cost-consciousness, conventional commits). Keep the `REPO` constant in the script in sync with
`CLAUDE.md`.

---

## Phase 1 — Explore & analyze (read-only)

```
Workflow({ name: 'optimize-pass', args: { phase: 'explore' } })
```

Optional args:

- `dimensions: ['perf','data',…]` — subset of `ux-a11y | perf | data | correctness | build-quality`.
- `depth: 'thorough'` — adds a completeness-critic pass (auto-on when the turn's token budget > 600k).
- `scope: 'components/widgets/**'` — restrict analysis to part of the tree.

Fans out one read-only `Explore` agent per dimension (each citing `file:line`), optionally runs a
completeness critic, then a synthesis agent that **merges duplicates and ranks by impact**.

**Returns** `{ ranked: [ { id, title, problem, evidence, fix, effort, risk, impact, files, behaviorChange, rationale } ] }`.

➡️ **The orchestrator presents this list and STOPS for your review.** You approve a subset.

---

## Phase 2 — Plan the rollout

Feed the **approved** items back in:

```
Workflow({ name: 'optimize-pass', args: { phase: 'plan', items: [ …approved ranked items… ] } })
```

Bins items into **waves** where, within a wave, no two items touch the same file (so parallel
agents never collide). Invasive / `behaviorChange` / large-refactor / global-type items are
flagged `runsAlone: true` and sequenced **last**.

**Returns** `{ waves: [ { name, rationale, runsAlone, items:[{id,title,files,fix}] } ] }`.

➡️ For any architecturally-significant or ambiguous item, **ask Paul before implementing** rather
than guessing (per the orchestration prompt).

---

## Phase 3 — Implement, one wave at a time

First establish a green baseline:

```
pnpm run install:all
pnpm run type-check:all && pnpm run lint && pnpm run test && pnpm run build:all
```

Then, **for each wave in order**:

```
Workflow({ name: 'optimize-pass', args: { phase: 'implement', wave: { name:'wave-1', items:[…] } } })
```

Dispatches one implementer per file-disjoint item group (items sharing a file are auto-bundled
into a single agent). Each agent owns an explicit file set, matches house style, adds/extends
vitest tests, and introduces no suppressions.

**Returns** `{ results: [ { ids, status, filesChanged, testsAddedOrUpdated, summary, notes } ] }`.

➡️ **The orchestrator — not the subagents — independently verifies the whole tree after each wave:**

```
pnpm run type-check:all
pnpm run lint            # eslint . --max-warnings 0  (warnings fail)
pnpm run format:check
pnpm run test            # or test:all if functions/ changed
pnpm run build           # or build:all
```

Fix anything the full lint/build surfaces, then commit + push that wave before starting the next.
Never leave the tree red between waves. Conventional-commit style, e.g.:

```
perf(widgets): memoize hot widget render paths (optimize-pass wave 1)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
```

Work on `dev-paul` (or a feature branch off it). Do **not** push to `main` directly.

---

## Phase 4 — Docs, handoff, ship

1. Update `CLAUDE.md` so it reflects the post-change codebase.
2. For any deferred item, drop a self-contained handoff doc under `todo/` (problem,
   current-state `file:line` refs, proposed approach, risks, acceptance criteria) and hand Paul a
   copyable kickoff prompt.
3. Open a draft PR with a wave-by-wave summary; mark ready when green; merge per repo style
   (feature → `dev-paul` squash OK; `dev-paul` → `main` is a **regular merge commit, never
   squash**). Watch CI and the auto-deploy to a terminal state before declaring done.

---

## Why phase-dispatched (not one autonomous run)

A `Workflow` run executes in the background and returns only when complete — it can't pause
mid-run to collect your approval, and verification/commit/push is explicitly the orchestrator's
job. Splitting on `args.phase` keeps the human gates (review after explore, ask-before-ambiguous
in plan, verify-and-commit between implement waves) intact while still getting parallel fan-out
within each phase. To re-run the whole sweep later, just start again at `phase: 'explore'`.
