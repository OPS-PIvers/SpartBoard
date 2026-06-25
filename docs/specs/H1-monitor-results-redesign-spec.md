# H1 — Real Monitor & Results Redesign for Quiz + Video Activity

## Codebase State Audit (Verified Against Code, Not the Handoff Doc's Checklist)

### Backlog Claim: "still just a reskin"

**Confirmed correct.** Code inspection of the four target files as of HEAD (`dev-paul`) reveals:

**`components/widgets/QuizWidget/components/QuizLiveMonitor.tsx`** (2,979 lines): The PR #1971 atoms (`SessionViewHeader`, `StatTile`, `ActionButton`, `SessionRow`, `ScorePill`, `SessionBadge`) are imported and used. The layout is a single scrolling flex column: header → question hero → stat tiles (3-col grid) → join code bar → roster with show/hide toggle. The question hero occupies a fraction of a mid-widget; the join code is a compact inline bar next to Copy/Open/Preview buttons; the stat tiles are small KPI squares. No QR code in this view, no visual presence board, no two-pane projector layout. The "Roster" toggle defaults to visible but renders as a max-h-60 scrollable text list. The MC answer distribution is collapsed behind a `showStats` toggle button. No structural change from a vertical list of sections.

**`components/widgets/VideoActivityWidget/components/VideoActivityLiveMonitor.tsx`** (637 lines): Mirrors the Quiz monitor shape — `SessionViewHeader` + 3-col `StatTile` grid + roster as `SessionRow` list inside a `rounded-2xl bg-white/50` card. The per-question correctness strip is a horizontal sequence of `CheckCircle2`/`XCircle` icons per student row. No QR, no presence board, no hero panel.

**`components/widgets/QuizWidget/components/QuizResults.tsx`** (2,979+ lines): `SegmentedTabs` with Overview/Questions/Students/PLC tabs, `OverflowMenu` for export actions, `SessionViewHeader`. The Overview tab is a 2-col `StatTile` grid + a score distribution bar chart + a per-question accuracy bar chart. The Students tab is a `SessionRow` list. The QuestionsTab is a `SessionRow` list. Structurally identical to the pre-#1971 layout with new atoms; no IA rethink.

**`components/widgets/VideoActivityWidget/components/Results.tsx`**: Same SegmentedTabs/Overview/Questions/Students shape as Quiz Results. VA-specific: overview tab shows per-question accuracy bars directly without score distribution buckets.

**`components/common/sessionViews/`**: Contains 9 atoms — `SessionViewHeader`, `SegmentedTabs`, `StatTile`, `SessionBadge`, `ScorePill`, `SessionRow`, `OverflowMenu`, `ActionButton`, plus `index.ts`. All fully operational. The atoms encode the current layout vocabulary; they do not constrain the layout itself.

**Concepts from the handoff doc that exist nowhere in code**: `HeroJoinPanel`, `PresenceBoard`, QR code in monitor context, question-spotlight layout, two-column projector/laptop split, split hero/roster pane. None of these strings or patterns appear in any file.

**QR code infrastructure confirmed available**: `api.qrserver.com` is the existing pattern (used by `QRWidget`, `PollWidget`, `RemotePollControl`, `RemoteActivityWallControl`). No npm QR library; the `<img src={qrUrl}>` pattern is the established approach.

**Dev harness confirmed**: `components/dev/SessionViewsDevHarness.tsx` at `/session-views-dev`, with mock factories in `components/dev/sessionViewsMocks.ts`. Covers all 4 views × lifecycle states. This is the correct iteration surface — Paul visual-sweeps via this harness since Firebase is not available in the dev environment.

### Conclusion

The handoff doc's claim is accurate and verified. No partial implementation of the redesign exists. This spec covers the full redesign starting from the current codebase state.

---

## Design Context (Constraints That Drive Every Decision)

These are binding, not aspirational:

- **Primary use case**: Teacher monitoring a live class on a **projected screen from 20+ feet**. Content must be legible at projection distance. This is the north star for every layout choice.
- **Widget sizing**: These views render inside `DraggableWindow`, which is a CSS container (`container-type: size`). The dev harness tests at 340 / 520 / 820px widths. All sizing uses `min(Npx, Mcqmin)` with `cqmin` as the base unit.
- **No Firestore/API changes**: All four views receive fully-derived props (`session`, `responses`, `quizData`/`config`, callbacks). No data model changes, no new Firestore reads, no new collections.
- **No handler changes**: Every existing callback — advance, end, pause, resume, reveal/hide answer, remove student, unlock student, unlock results, score display cycle, colors toggle, tab warnings, live scoreboard, period filter, push grades, export to Sheets, scoreboard, delete response, written grader — must be preserved with identical signatures.
- **Design system**: Glassmorphism surfaces (`bg-white/70 border border-slate-200/60 rounded-2xl backdrop-blur-sm shadow-sm`), brand blue `#2d3f89`, brand red `#ad2122`, dark-mode primary (slate-900), Lexend font.
- **Score color system**: `utils/scoreColor.ts` with 80/60 thresholds — do not modify.
- **`cqmin` scaling**: ALWAYS use `cqmin` for sizing in front-face content. Never `text-sm`, `w-12`, or `size={24}`.

---

## Architectural Diagnosis: Why the Current Layout Fails Projector Use

The current monitor layout stacks elements vertically in order of creation priority (code first, then stats, then roster). For a teacher standing 20 feet from a screen this produces:

1. The join code is displayed in a `min(13px, 3.5cqmin)` monospace badge — unreadable at distance.
2. The 3-col StatTile grid shows values at `min(22px, 7cqmin)` — visible but not glanceable without reading.
3. The current question occupies the TOP of the scrolling area but its text is `min(28px, 12cqmin)` in a compact card — a fraction of the available vertical space is used.
4. The MC answer distribution is hidden by default behind a toggle — it requires a click to see, which is the exact moment during a live class when the teacher needs it immediately.
5. The roster is a vertical text list at `min(13px, 4cqmin)` — scanning it for a specific student requires reading every row.

The redesign addresses each of these in sequence.

---

## Recommended Architecture: Spatial Zones Instead of a Scroll Stack

The core IA change: **replace the vertical scroll-stack with spatial zones that have independent purposes and read at different distances.**

### Monitor Layout: Two-Zone Design

```
┌─────────────────────────────────────────────────────────────┐
│ HEADER STRIP  [Live •] Quiz Title    [Pause] [End]          │  ← shared atom, unchanged
├──────────────────────────┬──────────────────────────────────┤
│                          │                                  │
│  HERO PANEL (left/top)   │  CONTROL SIDEBAR (right/bottom)  │
│                          │                                  │
│  • QR + join code        │  • Advance button                │
│    (projector-scale)     │  • Period filter                 │
│                          │  • Roster toolbar                │
│  • Live progress ring    │                                  │
│    (% done, big number)  │                                  │
│                          │                                  │
├──────────────────────────┴──────────────────────────────────┤
│ PRESENCE BOARD — status-tinted student tiles (not text rows)│  ← replaces the roster list
├─────────────────────────────────────────────────────────────┤
│ QUESTION SPOTLIGHT (active only) — Q text + MC distribution  │  ← full-width, never collapsed
└─────────────────────────────────────────────────────────────┘
```

At **narrow widths (340–520px)** — the widget is on the teacher's laptop/tablet alongside the board — the layout collapses to the current vertical stack but with the new proportions: QR+code hero, progress ring, presence board, question spotlight, advance button pinned to bottom. The sidebar column merges into the main flow.

At **wide widths (520px+)** — the widget is expanded on a projected display — the two-column split activates. The hero panel and presence board dominate. The control sidebar is secondary.

This approach uses a CSS container query breakpoint (`@container (min-width: 520px)`) implemented via a `min-width` check on the container in the JSX (the `cqmin` pattern already in use). Since Tailwind container queries are not used directly in this codebase (no `@tailwind/container-queries` plugin confirmed), the breakpoint is implemented via a `useRef`+`ResizeObserver` or via a CSS variable injection — see Phase 1 implementation note below.

### Results Layout: Lead With Signal, Not Tabs

The current Results view opens to a generic "Overview" tab. The IA change: **open to the Questions tab by default** (it answers "where did students struggle?" immediately) and rename tabs to reflect teacher mental models:

- **Questions** (default) — per-question accuracy bars, sorted by struggle (lowest accuracy first); replaces "Overview" as default
- **Overview** — class average + score distribution (demoted; useful but not the first question after a quiz)
- **Students** — per-student rows with score pills
- **PLC** — unchanged

Within the Questions tab, add a **dominant question row** for the hardest question (lowest accuracy): full-width card, larger typography, signals "this is where you intervene first."

---

## Component Decomposition

### New Components to Create

**`components/common/sessionViews/MonitorHeroPanel.tsx`**

Responsibility: Renders the projector-facing hero zone — QR code, join code at projector scale, and live progress ring. Used by both `QuizLiveMonitor` and `VideoActivityLiveMonitor`.

Props interface:

```typescript
interface MonitorHeroPanelProps {
  joinUrl: string;
  joinCode: string;
  onCopy: () => void;
  copied: boolean;
  /** 0–100, drives the progress ring fill */
  progressPct: number;
  /** Count displayed in the ring center */
  doneCount: number;
  /** Total joined students — denominator label */
  totalCount: number;
  /** Whether to show the QR. True when the session is waiting/active; false when ended. */
  showQr: boolean;
}
```

The QR code uses the established `api.qrserver.com` pattern at `size=400x400`, rendered as `<img>` with `alt="Join QR code"`. The join code is rendered at `min(40px, 18cqmin)` in `font-mono font-black tracking-[0.2em]` — legible at projection distance. The progress ring is an SVG circle with `stroke-dashoffset` animation.

**`components/common/sessionViews/PresenceBoard.tsx`**

Responsibility: Renders students as status-tinted square tiles instead of text rows. Each tile shows a student's abbreviated name or PIN, colored by status (joined=slate, active=amber, finished=emerald, locked=red). Tapping a tile opens a popover with the student's details and available actions (unlock, remove). Used by `QuizLiveMonitor`.

Props interface:

```typescript
interface PresenceBoardProps {
  students: PresenceTile[];
  /** Show score color tinting when true (gated by scoreRevealApproved) */
  colorsEnabled: boolean;
  onTileAction: (
    studentKey: string,
    action: 'unlock' | 'remove' | 'unlockResults'
  ) => void;
}

interface PresenceTile {
  key: string;
  displayName: string;
  status: 'joined' | 'in-progress' | 'completed' | 'locked';
  /** Score 0–100, only shown when colorsEnabled */
  score?: number;
  /** Whether a tab-switch warning lock is active */
  isLocked?: boolean;
  /** Period label for multi-period sessions */
  period?: string;
}
```

The tile grid uses `display: grid; grid-template-columns: repeat(auto-fill, min(56px, 14cqmin))`. Each tile is a rounded square with a 2px status border and the student's initials or PIN truncated to fit. This replaces the `max-h-60 overflow-y-auto` roster entirely for the active monitor state.

**`components/common/sessionViews/QuestionSpotlight.tsx`**

Responsibility: Full-width current question display with always-visible MC distribution (no toggle). The MC bars are horizontal percentage bars, one per answer choice, color-coded correct/incorrect after answer reveal. Used only by `QuizLiveMonitor` (VA has no per-question advance).

Props interface:

```typescript
interface QuestionSpotlightProps {
  question: QuizQuestion;
  questionIndex: number;
  totalQuestions: number;
  answeredCount: number;
  totalCount: number;
  autoCountdown: number | null;
  revealedAnswer?: string;
  onRevealAnswer?: () => void;
  onHideAnswer?: () => void;
  sessionMode: 'teacher' | 'student' | 'auto';
  responses: QuizResponse[];
}
```

The question text renders at `min(32px, 14cqmin)` — significantly larger than the current `min(28px, 12cqmin)`. The MC distribution bars are always visible (no `showStats` toggle) and render at `min(12px, 4.5cqmin)` with answer-choice letter labels.

**`components/common/sessionViews/ResultsQuestionCard.tsx`**

Responsibility: Per-question card in Results Questions tab, sized by visual hierarchy. The hardest question (lowest accuracy) renders as a `ResultsQuestionCard variant="dominant"` at full-width with larger typography and a call-to-action banner ("Consider reviewing this"). Other questions render as `variant="standard"` (matching the current QuestionsTab row style but with the bar chart below the text instead of beside it).

Props interface:

```typescript
interface ResultsQuestionCardProps {
  question: QuizQuestion;
  questionIndex: number;
  stats: { answered: number; correct: number; graded: number };
  responses: QuizResponse[];
  variant: 'dominant' | 'standard';
}
```

**Export addition to `components/common/sessionViews/index.ts`**: Add exports for `MonitorHeroPanel`, `PresenceBoard`, `QuestionSpotlight`, `ResultsQuestionCard`.

### Existing Components to Modify

**`components/widgets/QuizWidget/components/QuizLiveMonitor.tsx`**

Major structural surgery. Keep every handler, hook, derived state calculation, and callback intact. Replace the render return with the new spatial-zone layout:

1. `SessionViewHeader` — unchanged
2. Container-query breakpoint detection (see Phase 1 note)
3. Wide layout: `flex-row` split — left hero zone (60%) + right control zone (40%)
4. Hero zone: `MonitorHeroPanel` when waiting/active; ended-state completion card when ended
5. Control zone: Period filter chips + advance button + toolbar controls (scoreboard, pause, colors, score display)
6. `QuestionSpotlight` — full width below the hero/control split, always visible when `isActive && currentQ && sessionMode !== 'student'`
7. `PresenceBoard` — replaces the `max-h-60` roster list for active state; existing `StudentRow` component retained for the detail popover within `PresenceBoard`
8. Narrow layout: same zones stacked vertically, progress ring replaced by the 3-col `StatTile` grid (it's more readable than a ring at 340px)

The `PodiumView` and `LiveScoreboardSetupPopup` sub-components are kept unchanged.

Remove: the `showStats` state and toggle button; the `showRoster` state and eye toggle button; the `max-h-60 overflow-y-auto` roster scroll container. The MC distribution and roster are always visible in the redesign (distribution via `QuestionSpotlight`, roster via `PresenceBoard`).

**`components/widgets/VideoActivityWidget/components/VideoActivityLiveMonitor.tsx`**

Lighter touch than Quiz — VA has no per-question advance, so there is no `QuestionSpotlight`. The redesign replaces the roster `SessionRow` list with `PresenceBoard` (VA-specific tile variant: the trailing per-question correctness strip moves into the tile popover rather than the main tile face). The hero panel shows join URL and progress ring but no QR code for VA (VA students access via assignment link distributed by the teacher, not a join code typed from a board — confirm this decision in Open Decisions).

**`components/widgets/QuizWidget/components/QuizResults.tsx`**

IA changes only; all handler logic unchanged:

1. Change `useState<'overview' | 'questions' | 'students' | 'plc'>('overview')` default to `'questions'`
2. Rename tab labels: "Questions" → "By Question", "Overview" → "Summary", "Students" → "By Student" (conveys purpose)
3. Reorder tabs: By Question | Summary | By Student | PLC
4. Replace `QuestionsTab` internal rendering: use `ResultsQuestionCard` — sort questions by accuracy ascending (hardest first), render the first one as `variant="dominant"`, rest as `variant="standard"`
5. The period filter `<select>` element replaces with a pill-chip row matching the monitor's `PeriodChipFilter` component (same visual language)
6. The `OverviewTab` 2-col StatTile grid changes to a 3-col grid: Class Average | Finished | Median Score (add median computation inline)

**`components/widgets/VideoActivityWidget/components/Results.tsx`**

Same tab default/rename changes as Quiz Results. VA Results does not have a "dominant question" card because VA accuracy bars already sort naturally by timeline position — keep the existing `QuestionsTab` structure but apply the `ResultsQuestionCard` visual language for consistency.

**`components/dev/sessionViewsMocks.ts`**

Add mock data for wider widget widths (the harness already has WIDTHS=[340,520,820] but mock data may need richer student counts to make the `PresenceBoard` tile grid meaningful at 820px). Add 20+ students with mixed statuses.

---

## Data Flow: Verified Unchanged

The redesign is entirely presentational. The data flow for both monitors is:

```
Firestore (quiz_sessions/{id}/responses/*)
  → useQuizSession hook (real-time onSnapshot with leading-trailing throttle)
  → QuizManager.tsx → QuizLiveMonitor props
  → [new layout components] — read-only derived props
```

No new Firestore reads, no new collection writes, no auth changes. The one write path that remains (live leaderboard broadcast via `updateDoc(sessionRef, { liveLeaderboard: entries })` in `QuizLiveMonitor`'s `useEffect`) is left in `QuizLiveMonitor` untouched — it is an external-system sync and is correctly placed there.

---

## Build Sequence

### Phase 1 — Width Detection Utility (Independent, Required by Phase 2)

**Task**: Add a `useContainerWidth` hook to `hooks/useContainerWidth.ts` that accepts a `React.RefObject<HTMLElement>` and returns the current width via `ResizeObserver`. This replaces the need for Tailwind container-query classes (which are not in the current plugin set) and follows the codebase pattern of explicit measurement.

```typescript
// hooks/useContainerWidth.ts
import { useState, useEffect } from 'react';

export function useContainerWidth(
  ref: React.RefObject<HTMLElement | null>
): number {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setWidth(entry.contentRect.width);
    });
    ro.observe(el);
    setWidth(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, [ref]);
  return width;
}
```

This hook reads the DOM (external system) — `useEffect` is correct here per CLAUDE.md guidelines.

**Files to create**: `/hooks/useContainerWidth.ts`
**Files to modify**: None
**Shippable alone**: Yes — no visible change.

### Phase 2 — New Shared Atoms (Independently Shippable)

Build the four new shared components without touching the four target files. Wire them into the dev harness with a new "components" panel for isolated visual review.

**Checklist**:

- [ ] Create `components/common/sessionViews/MonitorHeroPanel.tsx` — QR image, join code at projector scale, progress ring SVG, copy button
- [ ] Create `components/common/sessionViews/PresenceBoard.tsx` — tile grid, status colors, popover for actions
- [ ] Create `components/common/sessionViews/QuestionSpotlight.tsx` — question text, MC distribution always-visible, answer reveal button
- [ ] Create `components/common/sessionViews/ResultsQuestionCard.tsx` — dominant + standard variants, accuracy bar below question text
- [ ] Update `components/common/sessionViews/index.ts` — add four new exports
- [ ] Update `components/dev/SessionViewsDevHarness.tsx` — add a "Atoms" panel that renders the new components with mock data at 340/520/820px
- [ ] Update `components/dev/sessionViewsMocks.ts` — enrich student count, add tile-ready data

**Paul visual checkpoint**: Paul should approve the atom renders at `/session-views-dev` (Atoms panel) before Phase 3 begins. This is the design gate.

### Phase 3 — Quiz Monitor Redesign

Replace `QuizLiveMonitor`'s render return. All handlers and hooks remain unchanged — this is a render-only replacement.

**Checklist**:

- [ ] Add `containerRef = useRef<HTMLDivElement>(null)` and `containerWidth = useContainerWidth(containerRef)` at the top of `QuizLiveMonitor`
- [ ] Define `isWide = containerWidth >= 520` derived constant (inline during render — no state or effect)
- [ ] Replace the render return with the new layout. Wide mode: `flex-row` container → left `MonitorHeroPanel` (60%) + right control column (40%) → full-width `QuestionSpotlight` → full-width `PresenceBoard`. Narrow mode: stack vertically with `MonitorHeroPanel` on top (QR hidden on narrow), then 3-col `StatTile` grid, then `QuestionSpotlight`, then `PresenceBoard`
- [ ] Remove `showStats`, `showRoster`, `expandedStat` state — no longer needed
- [ ] Remove `StatTileStudentList` sub-component — superseded by `PresenceBoard`
- [ ] Remove `RosterToolbar` from the main flow — fold its controls (colors toggle, score display cycle, tab warnings) into a compact icon-button strip in the control column
- [ ] Keep `PodiumView` and `LiveScoreboardSetupPopup` sub-components unchanged
- [ ] Keep `PeriodChipFilter` sub-component, move it into the control column
- [ ] Keep the advance button, pinned to the bottom of the control column (wide) or bottom of the scroll area (narrow)
- [ ] Type-check: `pnpm run type-check`
- [ ] Lint/format: scoped `pnpm exec eslint components/widgets/QuizWidget/components/QuizLiveMonitor.tsx` + Prettier

**Paul visual checkpoint**: Paul reviews the Quiz Monitor at `/session-views-dev` across all 3 widths and live states (waiting/live/paused/ended) before Phase 4.

### Phase 4 — VA Monitor Redesign

Mirrors Phase 3 for `VideoActivityLiveMonitor.tsx`. Lighter — no `QuestionSpotlight`, simpler presence board variant.

**Checklist**:

- [ ] Add `containerRef`/`useContainerWidth`/`isWide` same as Phase 3
- [ ] VA-specific: no QR code in `MonitorHeroPanel` (assignment URL is shared via link, not a code typed from a board — see Open Decisions)
- [ ] Replace roster `SessionRow` list with `PresenceBoard`; per-question correctness strip moves to tile popover
- [ ] Keep all existing handlers unchanged
- [ ] Type-check + lint/format scoped

### Phase 5 — Results Redesign (Both)

**Checklist**:

- [ ] `QuizResults.tsx`: Change default tab to `'questions'`, rename tabs to "By Question" / "Summary" / "By Student" / "PLC", reorder, sort questions by accuracy ascending, render dominant + standard `ResultsQuestionCard` variants, change period filter to pill chips, add median to Overview StatTile grid
- [ ] `VideoActivityResults.tsx` (Results.tsx): Same tab default/rename changes; apply `ResultsQuestionCard` visual language to QuestionsTab without sorting (VA questions are chronological)
- [ ] Both: Remove the plain `<select>` period filter, replace with pill chips matching `PeriodChipFilter`
- [ ] Type-check + lint/format scoped

### Phase 6 — Test Coverage

**Checklist**:

- [ ] Add unit tests for `MonitorHeroPanel` — QR renders with correct `src` containing join URL, progress ring arc calculation
- [ ] Add unit tests for `PresenceBoard` — tile renders for each status, popover opens on click, actions fire correct callback
- [ ] Add unit tests for `QuestionSpotlight` — MC distribution renders all choices, reveal button fires `onRevealAnswer`
- [ ] Add unit tests for `ResultsQuestionCard` — dominant variant shows call-to-action banner, standard variant does not
- [ ] Update `tests/components/widgets/` — add Quiz monitor + VA monitor tests for the new layout zones
- [ ] Add harness coverage: extend `SessionViewsDevHarness` to exercise `PresenceBoard` tile popover open/close

Test location: colocated as `*.test.tsx` files next to each new component in `components/common/sessionViews/`.

---

## Open Decisions (Need Paul)

### 1. QR Code in VA Monitor

**Question**: Should the VA monitor `MonitorHeroPanel` show a QR code and large join code?

**Context**: Quiz sessions have an explicit join code students type from the board at `/quiz?code=XXXX`. VA sessions distribute a URL link via the assignment system — students click it from a notification or shared link, not from a code on the board. The VA monitor has no `session.code` field analog. Showing a QR in the VA monitor would require using the session's assignment URL (which exists on `session.assignmentUrl` or constructed from session ID), but this may not be a URL students would typically type from a board.

**Options**:

- **A (recommended)**: Show QR + assignment URL in VA monitor. Teacher may share the screen via AirPlay/Chromecast, and the QR removes the need to type. Low implementation risk — the URL exists, the QR pattern is established.
- **B**: No QR in VA monitor; show only the large assignment name + progress ring in the hero zone. Simpler, accurate to how VA assignments work.
- **C**: Make QR optional per-widget via a VA settings toggle.

**Recommendation**: Option A, using the existing `api.qrserver.com` pattern. The additional weight (one `<img>` tag per session) is negligible. If Paul disagrees, Option B requires a simple prop to `MonitorHeroPanel` (`showQr: boolean`).

### 2. Presence Board vs Roster Text List Toggle

**Question**: Should the `PresenceBoard` tile view completely replace the roster text list, or should there be a toggle between them?

**Context**: The presence board (status-tinted tiles, grid layout) is optimal for projector use — 30 students at a glance. But teachers managing a locked student or triaging tab-switch warnings need to find a specific student and read their detail, which is faster in a named text list. The current roster is the text-list approach; the presence board is the new approach. The two are not redundant — they serve different tasks.

**Options**:

- **A (recommended)**: Presence board as default; tile tap opens a detail popover with the student's name, status, score, and action buttons (unlock, remove). Eliminates the toggle; the popover handles detail retrieval.
- **B**: Toggle button between board view and list view; board is default; teachers who prefer text list can switch. More surface area, two code paths.
- **C**: Always show both: small presence board tiles on top, compact text list below (with `max-h-40` scroll). More vertical space consumed, less gain.

**Recommendation**: Option A. The popover pattern gives teachers the detail they need without a mode switch. The `PresenceBoard` tile popover contains the `SessionBadge` + `ScorePill` + unlock/remove buttons that currently live in the `StudentRow`.

### 3. Results Default Tab and Tab Names

**Question**: Should the default Results tab be "By Question" (hardest-question-first, action-oriented) or stay as "Overview" (current)?

**Context**: The handoff doc's stated goal is "what do I do next." Hardest questions immediately visible supports that. But some teachers may open Results to copy the class average into a gradebook — the Overview tab serves that case better as default.

**Options**:

- **A (recommended)**: Default to "By Question". Teachers who want the average click one tab. The hardest-question dominant card is the first thing visible; this is the 10x UX improvement.
- **B**: Keep "Overview" as default but put the hardest question in the Overview tab as a "Needs Attention" callout card above the distribution chart.
- **C**: Remember the last active tab in `localStorage` per widget/session.

**Recommendation**: Option A. The average is a secondary signal; intervention priority is the primary one. If Paul prefers Option B, `ResultsQuestionCard variant="dominant"` is still implemented — just placed in `OverviewTab` instead of `QuestionsTab`.

---

## Critical Implementation Details

### Container Query Units in New Components

All new components follow CLAUDE.md mandatory rules:

- Text: `style={{ fontSize: 'min(Npx, Mcqmin)' }}`
- Icons: `style={{ width: 'min(Npx, Mcqmin)', height: 'min(Npx, Mcqmin)' }}`
- Gaps/padding: `style={{ gap: 'min(Npx, Mcqmin)', padding: '...' }}`
- Zero hardcoded Tailwind size classes in front-face content

**Projector-scale sizing targets for `MonitorHeroPanel`**:

- Join code: `min(48px, 20cqmin)` — readable at 20 feet on a 70" display at standard widget size
- Progress ring diameter: `min(120px, 30cqmin)` SVG
- Progress number: `min(40px, 18cqmin)` centered in ring
- QR code image: `min(200px, 45cqmin)` square

**`PresenceBoard` tile sizing**:

- Tile: `min(56px, 14cqmin)` square, `border-radius: min(8px, 2cqmin)`
- Initials/PIN text in tile: `min(13px, 4cqmin)`
- Status indicator: 3px border on tile edge (color encodes status, not text)

### Score Reveal Privacy Gate

The `scoreRevealApproved` state and `requestScoreReveal()` flow in `QuizLiveMonitor` must be preserved unchanged. The `PresenceBoard`'s `colorsEnabled` prop bridges this gate — tiles show score color tinting only when `effectiveColorsEnabled` is true. The default is no score color (projector privacy).

### QR Code `<img>` Accessibility

Add `alt="Join QR code — scan to join or visit [joinUrl]"` on the QR `<img>` element in `MonitorHeroPanel`. The URL is already in the join code display below, so this is redundant but correct for screen readers.

### Motion: Progress Ring and Presence Board

The SVG progress ring uses `transition: stroke-dashoffset 0.5s ease` for smooth updates as students complete. This is a functional state-change transition, not a decorative animation, and is not affected by `prefers-reduced-motion` gating.

The `PresenceBoard` tile popover uses `animate-in fade-in slide-in-from-top-2 duration-200` (Tailwind animation already in the codebase pattern). Wrap with `motion-reduce:animate-none` per CLAUDE.md policy.

### ESLint and Prettier

The four target files already pass CI on the current branch. The build agent must run scoped checks after each phase:

```bash
pnpm exec eslint components/common/sessionViews/MonitorHeroPanel.tsx components/common/sessionViews/PresenceBoard.tsx components/common/sessionViews/QuestionSpotlight.tsx components/common/sessionViews/ResultsQuestionCard.tsx
pnpm exec prettier --check components/common/sessionViews/MonitorHeroPanel.tsx
```

Full `pnpm run validate` before any PR.

### Firestore Rules and Cost

No new Firestore reads or writes. The one existing Firestore write in `QuizLiveMonitor` (live leaderboard broadcast) is unchanged. No cost impact. No FERPA surface change — the presence board displays the same student identifiers (name or PIN) as the existing roster, gated by the same `scoreRevealApproved` privacy check.

### Testing Strategy

**Unit tests** (Vitest, colocated `*.test.tsx`):

- `MonitorHeroPanel.test.tsx`: Render with `joinUrl="https://example.com/quiz?code=ABCD"`, assert `<img src>` contains `qrserver.com` and `encodeURIComponent(joinUrl)`; assert join code text is "ABCD"; assert `progressPct=75` sets SVG `stroke-dashoffset` correctly
- `PresenceBoard.test.tsx`: Render 3 students with statuses joined/in-progress/completed; assert 3 tiles; click tile → popover appears with student name; click unlock → `onTileAction` called with correct key and 'unlock'
- `QuestionSpotlight.test.tsx`: Render MC question; assert all 4 answer choices are visible without any click; assert `onRevealAnswer` called when reveal button clicked; assert correct answer highlighted when `revealedAnswer` is set
- `ResultsQuestionCard.test.tsx`: Render `variant="dominant"` → "Consider reviewing" banner present; render `variant="standard"` → no banner

**Integration**: The dev harness (`/session-views-dev`) serves as the integration test surface. Paul's visual sweep across 340/520/820px and all lifecycle states (waiting/live/paused/ended for monitors; populated/empty for results) is the acceptance test.

**No E2E tests needed** for this feature — the app cannot boot in CI without `.env.local` and the monitors require a live Firestore session.

---

## Files Summary

### Create

| Path                                                           | Purpose                                                     |
| -------------------------------------------------------------- | ----------------------------------------------------------- |
| `/hooks/useContainerWidth.ts`                                  | ResizeObserver-based container width hook                   |
| `/components/common/sessionViews/MonitorHeroPanel.tsx`         | QR + join code + progress ring hero zone                    |
| `/components/common/sessionViews/PresenceBoard.tsx`            | Status-tinted student tile grid with detail popover         |
| `/components/common/sessionViews/QuestionSpotlight.tsx`        | Current question + always-visible MC distribution           |
| `/components/common/sessionViews/ResultsQuestionCard.tsx`      | Per-question card in Results (dominant + standard variants) |
| `/components/common/sessionViews/MonitorHeroPanel.test.tsx`    | Unit tests                                                  |
| `/components/common/sessionViews/PresenceBoard.test.tsx`       | Unit tests                                                  |
| `/components/common/sessionViews/QuestionSpotlight.test.tsx`   | Unit tests                                                  |
| `/components/common/sessionViews/ResultsQuestionCard.test.tsx` | Unit tests                                                  |

### Modify

| Path                                                                              | Change                                                                                                                                  |
| --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `/components/common/sessionViews/index.ts`                                        | Add 4 new exports                                                                                                                       |
| `/components/widgets/QuizWidget/components/QuizLiveMonitor.tsx`                   | Layout replacement (render return only); add `containerRef`/`useContainerWidth`; remove `showStats`, `showRoster`, `expandedStat` state |
| `/components/widgets/VideoActivityWidget/components/VideoActivityLiveMonitor.tsx` | Layout replacement; add `containerRef`/`useContainerWidth`                                                                              |
| `/components/widgets/QuizWidget/components/QuizResults.tsx`                       | Default tab change; tab rename/reorder; `ResultsQuestionCard` in Questions tab; pill-chip period filter; median in Overview grid        |
| `/components/widgets/VideoActivityWidget/components/Results.tsx`                  | Default tab change; tab rename/reorder; `ResultsQuestionCard` visual language; pill-chip period filter                                  |
| `/components/dev/SessionViewsDevHarness.tsx`                                      | Add Atoms panel; add wider width testing (1200px)                                                                                       |
| `/components/dev/sessionViewsMocks.ts`                                            | Enrich student count to 25+; add locked/completed/in-progress mix                                                                       |
| `/hooks/useContainerWidth.ts`                                                     | (new — listed above)                                                                                                                    |

### Do Not Modify

- `utils/scoreColor.ts` — 80/60 thresholds are locked
- Any hook (`useQuizSession`, `useVideoActivitySession`, `useLiveSession`)
- Any Firestore collection, document, or security rule
- Any auth or permission check
- Widget Registry, widget defaults, or tools config
- The `SessionViewHeader`, `SegmentedTabs`, `StatTile`, `SessionBadge`, `ScorePill`, `SessionRow`, `OverflowMenu`, `ActionButton` atoms — these are correct as-is; reuse them
