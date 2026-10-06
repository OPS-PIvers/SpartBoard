# Widget Quality Rubric

A rubric that grades every board widget on how it scales, handles, looks, configures, holds up and
connects, so that AI agents looping on widget improvements have a clear, measurable target.

Status: plan, not built. Decisions settled in a grill session on 2026-10-05.

## Decisions

| #   | Decision                                                                                                                                                                                                                                                                                                                         |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | **Hybrid grader.** Scripted Playwright measurements for objective criteria; an AI judge with anchored descriptors and screenshots for subjective ones. Paul can score any criterion himself.                                                                                                                                     |
| R2  | **Paul's score wins and calibrates.** A Paul score is official for that criterion and is saved with his note as a calibration example the judge reads on later runs. A disagreement of 2+ levels flags the descriptor for rewording.                                                                                             |
| R3  | **0–4 anchored scale.** 0 missing/broken, 1 poor, 2 acceptable, 3 good, 4 exemplary. Every level has a written descriptor.                                                                                                                                                                                                       |
| R4  | **Gates + weighted roll-up.** Gate failures cap the grade at D. Otherwise a weighted average of dimension scores.                                                                                                                                                                                                                |
| R5  | **Six weighted dimensions:** Layout & Scaling 25, Visual Design 20, Interaction 15, Configurability 15, Robustness 15, Ecosystem 10. A dimension's score is the mean of its applicable criteria.                                                                                                                                 |
| R6  | **Letter grades on a GPA map:** A ≥3.5, B ≥3.0, C ≥2.0, D ≥1.0, F <1.0. Any gate failure caps at D.                                                                                                                                                                                                                              |
| R7  | **Loop target:** every dimension ≥3.0 and no gate failures. Pushing a widget toward A is Paul's call per widget.                                                                                                                                                                                                                 |
| R8  | **Loop order inside a widget:** lowest dimension first, then its lowest criterion.                                                                                                                                                                                                                                               |
| R9  | **Widget order across the app:** prod usage (aggregate count of boards carrying the widget type, no user data) × distance from target. Gate failures jump the queue.                                                                                                                                                             |
| R10 | **Shared chrome is graded once.** A separate Platform scorecard covers `DraggableWindow` (edge zones, resize corners, toolbar). Per-widget criteria grade only what the widget does to the chrome.                                                                                                                               |
| R11 | **Declared size envelope.** Each widget declares a min size and supported aspect range in config. Scaling is tested inside it; a needlessly narrow envelope scores down (S7).                                                                                                                                                    |
| R12 | **Configurability rewards the right controls, layered.** More settings is not better; bloat scores down under C1 and V2.                                                                                                                                                                                                         |
| R13 | **Scope v1 = board face + settings drawer + toolbar interactions + Nexus.** Student-facing apps (`/quiz`, `/activity-wall`, `/flashcards`…) get their own scorecard later, reusing these dimensions minus window criteria.                                                                                                       |
| R14 | **Nexus is propose-only.** The grader scores Nexus and lists additions and removals for Paul. Loops never add or remove a connection.                                                                                                                                                                                            |
| R15 | **N/A is rule-based.** Each criterion has a written applicability rule; only that rule can mark it N/A. The judge cannot N/A a criterion on its own judgment.                                                                                                                                                                    |
| R16 | **Thresholds:** touch hit areas ≥44×44 CSS px at default size and ≥32 px at the envelope minimum; primary content ≥24 px and any readable text ≥14 px at default size on a 1920×1080 board; text contrast ≥4.5:1 (≥3:1 for large text) at 0.8 window transparency over the board background.                                     |
| R17 | **Harness:** a `/widget-grader-dev` route mounts one widget in the real `DraggableWindow` at a given size and fixture with no Firestore listeners. A Playwright script walks widget × size × fixture.                                                                                                                            |
| R18 | **Fixtures:** each widget ships `empty`, `typical` and `stress` configs. Scaling and clutter are graded on typical and stress; first-use clarity on empty.                                                                                                                                                                       |
| R19 | **Storage:** rubric and scorecards are committed files under `docs/widget-rubric/`, the official record. Paul grades on a Claude artifact (R27); his scores reach the JSON through `/grade-widget`.                                                                                                                              |
| R20 | **Loop output:** one widget, one dimension, one PR to `dev-paul` with before/after scorecard and screenshots. The whole widget is re-graded; the PR is rejected if any criterion drops or a gate fails.                                                                                                                          |
| R21 | **Flags:** visual and scaling fixes ship unflagged (styling exemption). Changes to what a widget does, or new settings, ship behind that widget's flag per the flag-first rule.                                                                                                                                                  |
| R22 | **Calibration gate:** loops turn on only after the norming runbook (below) passes: a 10-widget seed set, Paul's self-check, and the judge on 5 held-out widgets at ≥60% exact and ≥95% within one level, 3-run spread ≤1, every gate failure caught. Re-run on every major rubric version.                                       |
| R23 | **CI:** scripted gate checks run on affected widgets per PR (folder, registry entry or fixture changed). A change to shared code (`DraggableWindow`, `ScaledEmptyState`, widget config, the harness) runs the full sweep. A nightly run sweeps everything and opens an issue on new gate failures. Judge scores never run in CI. |
| R24 | **New widgets:** the `new-widget` skill requires a scorecard of B or better before the widget's PR.                                                                                                                                                                                                                              |
| R25 | **Runner:** a scheduled cloud routine picks the top widget from the queue, runs one loop and opens a PR. At most 3 grader PRs open at once.                                                                                                                                                                                      |
| R26 | **Versioning:** the rubric has a semver. Each scorecard records the version it was graded under. A minor change re-grades the affected criteria only. A major change (new criterion, weight change) marks every scorecard stale; the routine re-grades and re-runs calibration before any further improvement loop.              |
| R27 | **Paul grades on a Claude artifact.** `/grade-widget` runs the harness for the chosen widgets, publishes a grading page with screenshots and measurements, and records Paul's clicks in the artifact's database. When he finishes, the command writes his scores into the scorecards and commits them.                           |
| R28 | **Three grading modes:** one widget through every criterion; one criterion across many widgets (most consistent for subjective criteria); and disagreements only (script vs judge, or where Paul and the judge disagreed before).                                                                                                |
| R29 | **Blind grading.** The judge's score stays hidden until Paul picks a level. A gap of 2+ levels asks Paul one question: what did the descriptor miss? Those answers drive descriptor rewrites.                                                                                                                                    |
| R30 | **No grill-style questions for grading.** The question tool holds 4 options and no images; grading needs 5 levels and screenshots.                                                                                                                                                                                               |
| R31 | **Maker and grader are separate.** A loop's after-state is graded by a fresh judge run that sees neither the diff nor the loop's intent.                                                                                                                                                                                         |
| R32 | **Supervised start.** Paul fully reviews and blind-grades the first 10 loop PRs; lighter review once 8 of 10 are accepted without changes. A failed spot check returns the loop to full review.                                                                                                                                  |
| R33 | **Weekly spot check:** 8 random recent cards, graded blind (~10 min). Drift on a criterion pauses loops on that criterion until it is re-normed.                                                                                                                                                                                 |
| R34 | **Gaming check.** A criterion whose script or judge scores rise while Paul's spot-check scores don't is paused and its descriptor or measurement rewritten.                                                                                                                                                                      |

## Gates

Any one caps the widget at D, whatever else it scores. All four are scripted, so they can run in CI.

| Gate | Fails when                                                                                                                                                                            |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G1   | **Unreachable control.** A front-face control is clipped, hidden, overlapped, or outside the card at any size and fixture inside the envelope.                                        |
| G2   | **Clipped content.** Text or content overflows the card or is cut mid-glyph without a scroll container, at any size and fixture inside the envelope.                                  |
| G3   | **Runtime errors.** A console error or crash while adding, resizing, configuring, minimizing/maximizing or reloading the widget.                                                      |
| G4   | **Data leak or loss.** Content follows the widget type to another board, teacher content is lost on reload, or protected student data (R4 below) is on the projected face by default. |

## Test matrix

For each widget the harness renders every combination of:

- **Sizes:** envelope minimum, default (`config/widgetDefaults.ts`), large (1400×900), maximized on a 1920×1080 board, envelope widest aspect, envelope tallest aspect.
- **Fixtures:** `empty`, `typical`, `stress`. Stress means long titles, long unbroken words, a 35-student roster, 20+ items, and maximum-length settings values.

That is 18 renders per widget, about 1,200 for a full sweep.

## Criteria

Each criterion lists its **applicability** rule, its **method** (Script, Judge or both), and its
0–4 levels. Level 0 always means the thing is missing or broken. Where a gate covers the failure,
level 0 is the gate.

### Layout & Scaling (25)

**S1 Small size.** Applies to all. Method: Script (controls in bounds, hit areas, text sizes at the
envelope minimum) + Judge (did the widget choose what to keep).

- 0: Gate G1 or G2 fails at the minimum size.
- 1: Everything fits but has shrunk uniformly to the point of being unreadable or untappable.
- 2: Readable and usable, but secondary content crowds the primary content.
- 3: Secondary content collapses, hides or moves into an overflow so the primary content stays dominant and readable.
- 4: The small layout is a deliberate design of its own (a compact mode) that a teacher would choose on purpose.

**S2 Large size.** Applies to all. Method: Script (fraction of card area occupied by content, size of
the primary element) + Judge.

- 1: Content stays at its default size in a corner or the middle, leaving most of the card empty.
- 2: Content grows, but proportions break: stretched controls, giant gaps, or lines too long to read.
- 3: Content grows proportionally and fills the card; line lengths stay readable.
- 4: The large layout adds value, such as showing more items or detail, rather than only zooming.

**S3 Aspect ratio.** Applies to all. Method: Script (dead band area at the widest and tallest aspect)

- Judge.

* 1: One layout at every aspect ratio; wide or tall shapes leave large dead bands.
* 2: Content centers sensibly but does not reflow.
* 3: Layout reflows between row and column arrangements at the extremes of the envelope.
* 4: Each aspect ratio looks designed for that shape.

**S4 Scaling technique.** Applies to all. Widgets on container-query scaling (`skipScaling: true`) are scored on the levels below; widgets that keep
`transform: scale()` (drawing, seating-chart, sticker) are scored on whether that choice is still
justified. Method: Script (static scan of the front-face files for fixed Tailwind text, width, gap and
padding classes and fixed icon `size` props).

- 1: The front face mostly uses fixed sizes.
- 2: Mixed: primary content scales, many secondary elements are fixed.
- 3: All front-face sizing uses `cqmin` / `min()` / `clamp()` per `components/widgets/CLAUDE.md`; a few justified exceptions.
- 4: Fully compliant, with sizes following the hero/secondary/tertiary targets in `components/widgets/CLAUDE.md`.

**S5 Projector legibility.** Applies to all. Method: Script (computed font sizes and contrast at
default size, R16 thresholds).

- 1: Primary content under 24 px or text contrast under 3:1.
- 2: Primary content meets the threshold; some readable text under 14 px or under 4.5:1.
- 3: All thresholds met.
- 4: Thresholds met at the envelope minimum too, and the primary content is readable from across a room (≥36 px at default size).

**S6 Scrolling.** Applies when any fixture produces scrollable content. Method: Script (nested
scroll containers, end padding per `tests/e2e/helpers/scrollEndPadding.ts`, whole-card scroll).

- 1: The whole card scrolls, or scrollbars nest.
- 2: One scroller, but its last item sits flush against the bottom edge or the scroller sits under fixed content.
- 3: Scrolling is confined to the content list, keeps end padding, and fixed controls stay visible.
- 4: As 3, and the widget avoids scrolling at default size with typical content by adapting density.

**S7 Size envelope.** Applies to all. Method: Judge, against the widget's purpose and the global
150×100 floor.

- 1: The minimum size is set higher than the content needs, so small-size problems never get tested.
- 2: The minimum is somewhat higher than the content needs.
- 3: The envelope matches what the content genuinely needs.
- 4: The widget works below what one would expect for its content.

**S8 Maximized / presenting.** Applies to all. Method: Script (maximized render) + Judge.

- 1: Maximized is the default layout stretched, with the S2 level-1 problems.
- 2: Fills the screen but looks like an enlarged card.
- 3: Looks intentional at full screen: type and spacing suit presenting.
- 4: Maximized is a real presentation mode, with layout or detail changes made for presenting.

### Interaction (15)

**I1 Drag surface.** Applies to all. Method: Script (fraction of the card where a pointer-down
starts a drag at default size; whether the inner edge strips are covered by no-drag elements).

- 1: Under 15% of the card is grabbable, or the inner edge strips are covered.
- 2: 15–35% grabbable; edge strips free.
- 3: 35–60% grabbable, with an obvious grab area.
- 4: Over 60% grabbable, with no accidental drags from controls.

**I2 Touch targets.** Applies when the front face has controls. Method: Script (hit-area sizes per
R16).

- 1: Most controls under 32 px at default size.
- 2: Some controls under 44 px at default size.
- 3: All ≥44 px at default size and ≥32 px at the envelope minimum.
- 4: As 3, with spacing between adjacent targets (≥8 px) so a finger cannot hit two at once.

**I3 Finger-friendly.** Applies when the front face has controls. Method: Script (controls revealed
only on `:hover`, required double-clicks, small drag targets) + Judge.

- 1: A core action needs hover or a precise drag.
- 2: Secondary actions are hover-only.
- 3: Everything works with a single finger tap; nothing needs hover.
- 4: Large-panel gestures where they help (swipe, long-press) with tap fallbacks.

**I4 Keyboard and screen reader.** Applies when the front face has controls. Method: Script (axe
run, tab order, visible focus, accessible names).

- 1: Controls unreachable by keyboard or unnamed.
- 2: Reachable, but focus invisible or tab order illogical; axe violations.
- 3: No axe violations; logical order; visible focus.
- 4: As 3, with useful shortcuts or live-region announcements for changing values.

**I5 Reduced motion.** Applies when the widget animates. Method: Script (animations under
`prefers-reduced-motion: reduce`).

- 1: Looping animation ignores reduced motion.
- 3: Every looping or large motion has a `motion-reduce:` guard.
- 4: Reduced-motion mode is designed, not just disabled.

**I6 Feedback.** Applies when the front face has controls. Method: Judge (screenshots of pressed,
active and selected states).

- 1: Controls show no state change.
- 2: Some controls lack pressed or active states.
- 3: Every control shows hover/pressed/active/selected states consistent with shared components.
- 4: As 3, with feedback for slow actions (pending state) and success.

**I7 Toolbar.** Applies to all. Method: Script (overlap between the floating toolbar and front-face
controls when selected).

- 1: The toolbar covers a primary control.
- 2: The toolbar covers secondary controls at some sizes.
- 3: No overlap at any size in the envelope.
- 4: As 3, and the widget's own controls do not duplicate toolbar actions.

### Visual Design (20)

**V1 Modern appearance.** Applies to all. Method: Judge, against Paul's exemplar widgets for each
level and the ban list:

- heavy gradients, bevels, drop shadows on everything
- default browser controls on the front face
- gray-on-gray or tiny text
- every element boxed in a border
- emoji as icons
- everything centered
- inconsistent corner radii
- crowded rows of pills or chips
- decorative helper text

Levels:

- 1: Three or more ban-list hits; reads as 2005.
- 2: One or two ban-list hits, or clean but dated.
- 3: No ban-list hits; matches the level-3 exemplar.
- 4: Matches the level-4 exemplar: confident type, restraint, glass look per `components/CLAUDE.md`.

**V2 Clutter.** Applies to all. Method: Script proxies at default size with the typical fixture
(visible controls, distinct font sizes, distinct colors, words, borders and boxes), plus Judge: a
3-second test (can the purpose and primary action be named at a glance from the back of the room)
and a holistic busy-ness rating. Proxy thresholds are set from the first full sweep.

- 1: Fails the 3-second test; proxies far over threshold.
- 2: Passes the 3-second test but proxies over threshold.
- 3: Passes; proxies within threshold.
- 4: Passes; nothing on the face could be removed without losing function.

**V3 Hierarchy.** Applies to all. Method: Judge.

- 1: No primary element; everything competes.
- 2: A primary element exists but secondary elements are equally heavy.
- 3: One clear primary element; secondary and tertiary elements step down in size and weight.
- 4: As 3, and the eye path matches the order a teacher uses it.

**V4 Consistency.** Applies to all. Method: Script (imports of shared components for buttons, inputs,
selects, empty states, drawer sections; one-off color and radius values) + Judge.

- 1: Mostly one-off controls and styling.
- 2: Shared components in the drawer, one-off styling on the face.
- 3: Shared components and tokens throughout; few one-offs.
- 4: No one-offs; anything new was added to the shared set.

**V5 Theming.** Applies to all. Method: Script (base background transparent; global transparency,
font and window radius honored; standard appearance keys used and wired).

- 1: Ignores global style settings.
- 2: Honors some global settings; non-standard appearance keys.
- 3: Honors every global setting; uses the standard appearance controls and keys.
- 4: As 3, and looks good across the full range of transparency and surface colors.

**V6 Icons and copy.** Applies to all. Method: Script (`tests/copyGuard.test.ts` rules, icon library
use) + Judge (wording).

- 1: Copy guard violations or mixed icon styles.
- 2: Compliant but wordy or unclear labels.
- 3: Short, plain labels; one icon style.
- 4: Labels a teacher would write; icons need no label to be understood where used alone.

### Configurability (15)

**C1 Coverage.** Applies to all. Method: Judge (list every hardcoded content, structure or visual
choice on the face; decide which a teacher would plausibly vary).

- 1: Structure and content are hardcoded; settings cover little.
- 2: Main choices configurable; notable plausible ones hardcoded, or settings bloated with choices nobody needs.
- 3: Every plausible choice is configurable; no bloat.
- 4: As 3, and settings anticipate classroom variants (grade level, multiple sections, sub use).

**C2 Drawer organization.** Applies when the widget has settings. Method: Judge (drawer screenshots)

- Script (drawer schema renders, scroll end padding).

* 1: One long unordered list.
* 2: Grouped, but advanced options mixed in with common ones.
* 3: Common settings first, advanced ones collapsed; standard sections and controls.
* 4: As 3, and a teacher finds any setting in one look.

**C3 Zero-config defaults.** Applies to all. Method: Judge (the `empty` fixture and the default
config).

- 1: Unusable until configured.
- 2: Usable but defaults look unfinished.
- 3: Defaults produce a useful, good-looking widget.
- 4: Defaults adapt to context (class, grade level, time of day) where it makes sense.

**C4 No dead controls.** Applies when the widget has settings. Method: Script (toggle each setting in
the harness and diff the rendered face).

- 0: A setting changes nothing visible or behavioral.
- 3: Every setting has an effect.
- 4: As 3, and settings that only apply in some modes are hidden in the others.

**C5 First-use clarity.** Applies to all. Method: Judge (the `empty` fixture at default size).

- 1: A blank or confusing face on first drop.
- 2: An empty state exists but does not say what to do next.
- 3: `ScaledEmptyState` with a title, at most one sentence, and a clear next action.
- 4: The next action can be done right on the face, or the controls themselves are the empty state (such as lamps to tap).

**C6 Live settings preview.** Applies when the widget has settings. Method: Script (change a setting
with the drawer open; check the face updates without closing the drawer).

- 1: Changes show only after closing or saving.
- 3: Every change shows on the face immediately.
- 4: As 3, and the drawer never covers the part of the widget being changed.

### Robustness (15)

**R1 States.** Applies to all. Method: Script (forced loading, error, offline and no-roster states in
the harness) + Judge.

- 1: Raw errors, blank cards or infinite spinners.
- 2: Some states designed.
- 3: Every reachable state has a designed view using shared components.
- 4: As 3, with recovery actions (retry, reconnect, pick a class).

**R2 Data safety.** Applies to widgets that hold teacher content. Method: Script (reload keeps
content; a second board does not inherit content; destructive actions confirm or undo).

- 0: Gate G4.
- 1: Destructive actions are instant and unrecoverable.
- 3: Content persists, stays per-board, and destructive actions confirm or support undo.
- 4: As 3, and integrates with the toolbar undo.

**R3 Performance.** Applies to all. Method: Script (React Profiler in the harness).

Budgets:

- zero re-renders while a neighboring widget is dragged
- no timers faster than 1 s unless something visibly animates
- at most one Firestore listener per instance, removed on unmount
- resize settles within one frame without layout thrash
- lazy chunk within its per-widget budget (set from the baseline at build time)

Levels:

- 1: Two or more budgets missed.
- 2: One budget missed.
- 3: All budgets met.
- 4: As 3, with headroom of at least 25% on chunk size and no work at all when off-screen or minimized.

**R4 Student privacy on screen.** Applies when the widget can display roster or response data.
Method: Script (protected fields in the face DOM under the typical fixture) + Judge.

Protected data:

- scores and grades
- accommodations, IEP and 504 information
- behavior notes
- attendance flags
- per-student response correctness

Names are fine where they are the point (pickers, groups, seating).

- 0: Gate G4.
- 2: Protected data is hidden by default but reveals with one accidental tap.
- 3: Protected data lives in the drawer or behind an explicit teacher reveal.
- 4: As 3, and the revealed state is visibly marked so a teacher notices it before projecting.

**R5 Multi-instance.** Applies to all. Method: Script (two instances on one harness board, each
configured differently).

- 1: Instances share state or one breaks the other.
- 2: Independent, but Nexus links or partner lookups pick the wrong instance.
- 3: Fully independent; Nexus lets the teacher choose the partner.
- 4: As 3, and the widget makes multiple instances useful (labels, color coding).

### Ecosystem (10)

**E1 Nexus.** Applies to all; scored against `docs/nexus.md` and its Value + Feasibility − Coupling
method. Method: Judge. Output always includes a proposal list (add, remove) for Paul; loops act on
neither (R14).

- 1: Existing connections misfire or add settings noise; obvious high-value connections missing.
- 2: Connections work; one or more high-value candidates missing.
- 3: All high-value connections present and discoverable; none that only add noise.
- 4: As 3, and connections show their state on the face (what this widget is linked to).

**E2 Help and tour coverage.** Applies to all. Method: Script (a Help Center article exists for the
widget; key controls carry registered `data-tour` anchors from `config/tourAnchors.ts`).

- 1: Neither.
- 2: One of the two.
- 3: Article plus anchors on every primary control.
- 4: As 3, plus a live tour.

**E3 Code health.** Applies to all. Method: Script (tests exist for the widget folder, file sizes,
`any` count, architecture rules: canvas store not `useDashboard()` on the hot path, no derived-state
`useEffect`) + Judge.

- 1: No tests; architecture rule violations.
- 2: Some tests; large files or violations.
- 3: Tests for main behavior; no violations; files of reasonable size.
- 4: As 3, and fixtures and harness coverage make the widget safe for an agent to change.

## Platform scorecard

Graded once, not per widget. The criteria are the window chrome:

- drag edge zones
- resize corners and their hit areas
- toolbar placement and reach
- snap layouts
- touch behavior on a large panel
- minimize and maximize transitions
- settings drawer shell

Same 0–4 scale. A Platform fix lifts every widget's I1 and I7 at once, so Platform gaps are queued
ahead of per-widget work on those criteria.

## Norming runbook

What Paul does once all six PRs have merged, in order.

1. **First sweep (no Paul time).** The routine runs the scripts on all widgets, with no judge. It sets the clutter proxy thresholds and per-widget chunk budgets from the results, lists gate failures, and sends Paul a one-page summary.
2. **Pick the seed set.** 10 widgets spanning the range: two Paul rates highly, two he rates poorly, two trivial, two complex, two in between.
3. **Norming session (~2–3 h, can be split).** `/grade-widget --criterion` through every criterion across all 10. Paul picks the level exemplars for V1, V2 and V3 along the way.
4. **Self-check.** At least 2 days later, about 15 of Paul's cards come back blind. Wherever he disagrees with himself, that descriptor is rewritten before the judge is tested.
5. **Judge test.** The judge learns from Paul's scores on 5 seed widgets and is tested blind on the other 5, three runs each. It passes at ≥60% exact and ≥95% within one level, a 3-run spread of at most 1, and 100% of gate failures caught. On a miss, rewrite the failing descriptors and repeat.
6. **Supervised loops (R32).** Each loop PR shows a before/after screenshot grid, score changes and one sentence on what changed. Paul grades the after-state in disagreements-only mode (~5 min) before merging.
7. **Steady state.** Merge loop PRs and do the weekly spot check (R33). Rubric changes go through the versioning rule (R26); a major version repeats steps 4 and 5.

The routine records agreement on every check in `docs/widget-rubric/calibration/agreement.json` so trust is a number, not an impression.

## Manual grading

`/grade-widget <types…>` or `/grade-widget --criterion V2 <types…>` or `/grade-widget --disagreements`:

1. Run the harness for the chosen widgets: the 18 renders and the script measurements.
2. Publish or update the grading artifact. Upload only the screenshots each card needs as assets.
3. Paul grades. Each card is one criterion for one widget and shows:
   - the screenshots relevant to that criterion (S1 shows the minimum-size renders; V1 shows the widget beside the exemplars; C5 shows the `empty` fixture)
   - the script measurements in plain words, with the level they imply ("smallest tap target 28 px: level 1 under R16")
   - the five levels as their full descriptor sentences; Paul clicks one, or presses 0–4
   - N/A pre-filled from the applicability rule, not editable
   - a link to the live harness for that widget, size and fixture, for criteria that need a feel test (I1, I3, C6); it works only with the local dev server running
4. After each click the judge's score appears. A gap of 2+ levels asks what the descriptor missed.
5. On "Done", the command reads the artifact database, writes `source: "paul"` scores and notes into each scorecard, appends the cards to `docs/widget-rubric/calibration/`, lists descriptor-rewrite candidates from the gap answers, and commits.

The repo JSON is always the official record. The cloud routine reads only the JSON, never the artifact.

## Files

- `docs/widget-rubric/rubric.json`: the criteria above in machine-readable form, with version, weights, applicability rules, method, thresholds and descriptors. This doc stays the human copy; the JSON is generated from or checked against it.
- `docs/widget-rubric/scorecards/<widgetType>.json`: per-criterion score, source (`script`, `judge`, `paul`), evidence (measurements, screenshot paths), note, rubric version, graded-at, stale flag.
- `docs/widget-rubric/calibration/`: Paul's scores with notes, and the chosen Visual exemplars.
- `docs/widget-rubric/proposals.md`: Nexus additions and removals, and envelope changes, awaiting Paul.
- Screenshots: kept out of git. They live in CI artifacts and the grading artifact's assets; scorecards reference them by run id.

## PRs

1. **Rubric and schema.** `rubric.json`, scorecard JSON schema with a validator test, and an empty scorecard per widget type. No behavior change.
2. **Size envelopes.** A `minSize` and `aspectRange` per widget in config, starting from today's `WIDGET_MIN_SIZE_OVERRIDES`; `DraggableWindow` reads min size from it. Envelopes start generous; S7 judges them later.
3. **Grader harness.** `/widget-grader-dev` (DEV only) mounting one widget in the real `DraggableWindow` from URL params, no Firestore listeners, and `empty`/`typical`/`stress` fixtures for every widget.
4. **Measurer and CI gates.** Playwright script producing measurements for every Script criterion and the four gates; affected-widget scoping per PR, full sweep on shared-code changes, nightly full sweep that opens an issue on new gate failures.
5. **Judge, grading artifact, calibration.** Judge prompt that reads `rubric.json`, calibration examples and screenshots; the `/grade-widget` skill and its artifact with the three modes, blind reveal and exemplar picking; Platform scorecard; the calibration check.
6. **Loop routine.** Priority queue (prod usage × gap, gates first), the scheduled routine running one widget/one dimension per PR with the no-regression check and a separate grading run (R31), cap of 3 open grader PRs, supervised-start tracking, the weekly spot check with automatic pause, `agreement.json`, and the `new-widget` skill requirement (B or better).

## Open items

- Paul picks the 10 seed widgets and the Visual exemplars during the norming runbook.
- Clutter proxy thresholds and the per-widget chunk-size budgets are set from the first full sweep, not guessed now.
- Student-facing app scorecards are a later rubric version.
