# Handoff: Quiz / Video Activity Monitor & Results — _real_ UX redesign

**Read this first. The goal is a genuine experience redesign, not a reskin.**

## Why this handoff exists (what went wrong)

The owner (Paul) asked to "improve the monitor and results views of the quiz/VA widget … up the UI/UX of the rest of these widget experiences by ten fold."

The previous attempt (PR #1971, branch `dev-paul`) delivered a **reskin**, not a redesign:

- It adopted the library's visual language (glassmorphism surfaces, hairline rows, segmented-pill tabs, semantic badges) and unified score colors (80/60).
- It extracted 8 shared atoms into `components/common/sessionViews/` and added a DEV harness.
- **But the information architecture / layout of the monitor content is essentially unchanged.** The KPI "rounded squares" grid, the join-code bar, the question hero, and the roster are the same structures with new paint. The only structural changes were: the header (now a shared `SessionViewHeader`), the student list (bordered cards → hairline rows), and on the **Results** side, segmented-pill tabs + a header overflow menu.

Net: a lot of hours and many subagents produced a polished version of the _same_ layout. Paul correctly called this out. **Do not repeat this.**

### Process mistakes to avoid

1. **Don't treat "improve UX 10x" as "make it match the library."** That framing caps you at a reskin. Treat it as: rethink what a teacher actually needs from these surfaces and redesign the layout/IA to serve it.
2. **Don't pour the budget into invisible plumbing first.** Shared-atom extraction + a harness consumed effort that produced nothing Paul could see. Build user-visible value first; extract shared pieces only as they fall out naturally.
3. **Don't let the PR review bot drive the agenda.** The prior attempt did ~22 review passes of micro-polish (focus rings, `aria-pressed`, motion-reduce, NaN guards). Triage real issues, batch the noise, and keep the focus on the redesign.
4. **Lead with concrete visuals.** Paul is design-literate and cares deeply about UI/UX. Put actual mockups / a couple of distinct directions in front of him and get a reaction _before_ building. Don't write a long spec/plan and disappear into implementation.

## The actual goal

Make the **live Monitor** and **post-session Results** for Quiz and Video Activity dramatically better for a **teacher running a live class on a projector** — glanceable from across the room, calm, premium (per the Design Context in `CLAUDE.md`). This is a layout/IA/interaction-design problem, not a CSS problem.

Seeds to consider (brainstorm with Paul; don't treat as final):

- **Monitor = a live control surface.** From 20 feet, a teacher needs: how many kids are done vs. stuck, the join code (large, with a QR), the current question + live answer distribution, and a fast "advance." The current small KPI bubbles + dense text roster bury all of that. Consider a hero join panel (big code + QR), one bold live-progress visualization, a current-question spotlight with live distribution, and the roster as a visual **presence board** (status-colored student tiles) instead of a text list.
- **Results = "what do I do next."** Who needs help, which questions bombed, fast paths to grade/push/export. Consider leading with the per-question and per-student signal, not a generic tab strip.

These are the four files to transform:

- `components/widgets/QuizWidget/components/QuizLiveMonitor.tsx`
- `components/widgets/VideoActivityWidget/components/VideoActivityLiveMonitor.tsx`
- `components/widgets/QuizWidget/components/QuizResults.tsx`
- `components/widgets/VideoActivityWidget/components/Results.tsx`

## Hard constraints (do not break)

- **Preserve all functionality and handlers.** Quiz monitor: pause/resume, end (confirm), advance, reveal/hide answer, live scoreboard (name/PIN + completion/per-question), period filter, unlock student, unlock results, remove student (confirm), score-display cycle, colors toggle, tab-warning toggle, audio mute, MC distribution, podium, self-paced vs teacher-paced. VA monitor: pause/resume, end, unlock, tab-warning toggle, per-question correctness strip. Results (both): export to Sheets, push grades to Classroom/Schoology, period filter, delete/unlock (quiz), grade written responses (quiz), schema-mismatch recovery (quiz), PLC tab (quiz).
- **Design system:** Lexend (UI) / Patrick Hand (accent) / Roboto Mono (data); brand blue `#2d3f89`, brand red `#ad2122`; dark-mode primary (slate-900); glassmorphism is the house style. See `CLAUDE.md` → "UI Styling" and "Design Context."
- **Container-query scaling is mandatory** on widget front-face content: `style={{ fontSize: 'min(Npx, Mcqmin)' }}`, never hardcoded Tailwind size classes (`text-sm`, `w-12`, `size={24}`). Widgets scale via container queries because they're resizable and projected. See `CLAUDE.md` → "Content Scaling with Container Queries."
- **Product decisions already made by Paul (keep):** unified 80/60 score-color scale for both widgets (`utils/scoreColor.ts`); "Push Grades" intentionally pushes **all periods** regardless of the in-view period filter.
- **Don't change** scoring math, grade-push payloads, Firestore reads/writes, or auth — these views are presentation over prop-driven data (`session`, `responses`, `quizData`/`config`, callbacks).

## What already exists you can build on (optional — don't let it cap the design)

- **Shared atoms:** `components/common/sessionViews/` — `SessionViewHeader`, `SegmentedTabs` (has `panelIdPrefix` ARIA linkage), `StatTile`, `SessionBadge`, `ScorePill`, `SessionRow`, `OverflowMenu` (portaled, full keyboard pattern), `ActionButton` (variants + `loading` + `active`). Reuse where they fit; invent new layout where they don't. The atoms are good infrastructure but they encode the _current_ layout — don't let "reuse the atoms" steer you back into the same arrangement.
- **Score util:** `utils/scoreColor.ts` (`scoreTone`, `scoreColorClasses`; 80/60).
- **DEV visual harness:** `components/dev/SessionViewsDevHarness.tsx` at route `/session-views-dev` (DEV-gated, needs `VITE_AUTH_BYPASS=true`), with mock sessions/responses in `components/dev/sessionViewsMocks.ts`. This is how you iterate visually across the 340/520/820px breakpoints and the waiting/live/paused/ended/results states.
- **Reference for the look:** `components/common/library/` (the modernized library this was meant to match).

## Environment / verification notes

- **The app cannot boot in this environment — there is no `.env.local`** (Firebase init throws; `db` is undefined). You cannot screenshot the real app or the harness here. Verify with `pnpm run type-check`, the vitest suites, and **have Paul do the visual sweep** via `/session-views-dev`. Don't waste time trying `preview_*`/Playwright against a dead server.
- **Repo enforces** zero TS errors, zero ESLint warnings (`--max-warnings 0`), Prettier formatting. Pre-commit hook (lint-staged) auto-formats staged files.
- **Windows working tree is CRLF**, so repo-wide `pnpm run lint`/`format:check` is noisy on untouched files. Judge by **scoped** `pnpm exec eslint <files>` / `prettier --check <files>` on what you changed; CI runs on Linux (LF) and is the real gate.
- pnpm; Node 24+; path alias `@/` → repo root (no `src/`).

## Current state

- PR **#1971** (branch `dev-paul`) contains the reskin and is review-approved. Decide with Paul whether the real redesign builds **on top of** #1971 (keeping the atoms + unified colors as a foundation) or supersedes parts of it.
- Two follow-up task chips exist (out of scope for the redesign itself): VA Results/Monitor parity/hardening (export-URL persistence, perf memoization, test coverage, ended→"Paused" badge); and SegmentedTabs/LibraryShell/QuizMonitor a11y (roving-tabindex tablist nav, LibraryShell `panelIdPrefix`, icon-button `aria-label`s).

## Suggested first move

1. Read the four target files and `CLAUDE.md`'s Design Context to absorb the constraints and the current layout.
2. Sketch 2–3 genuinely different layout/IA directions for the **monitor** (the area Paul flagged), as concrete mockups (inline visual mockups or a quick static prototype). Show Paul; get a direction.
3. Build the chosen direction in the real components, preserving every handler, verifying via type-check + tests, and handing Paul the harness for the visual pass.
4. Apply the same depth to Results.

The bar: when Paul opens the redesigned monitor on a projector, it should feel like a different, obviously-better product — not the same layout with new colors.
