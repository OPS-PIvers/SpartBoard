# CSS Scaling Patterns — Scheduled Task Journal

_Audit model: claude-sonnet-4-6_
_Action model: claude-opus-4-6_
_Audit cadence: daily_
_Last audited: 2026-05-30_
_Last action: 2026-05-23_

---

## Audit guidance — `cqmin` is not always the right answer

The CLAUDE.md scaling rules recommend `cqmin` for consistency. **However**, `cqmin` (and `clamp(…, Xpx)` caps) can leave large amounts of empty space on widgets that get resized aggressively — especially short/wide layouts where the height-driven `cqh` axis would have filled the widget. User preference: widget content should **logically fill the widget window**. If a widget already uses a `cqh`/`cqw` mix (or `min(Acqh, Bcqw)`) that fills better than the equivalent `cqmin` form, **leave it**. Do not propose `cqmin` conversions for widgets where the existing formula visibly fills the widget at a wider range of aspect ratios. When in doubt, audit visually before flagging.

---

## In Progress

_Nothing currently in progress._

---

## Open

_2026-05-30: Scanned widget files changed in dev-paul since last merge (DiceWidget/Widget.tsx, QuizWidget/Widget.tsx, VideoActivityWidget/Widget.tsx, random/RandomSettings.tsx) for anti-patterns. New dev-paul commits (classroom-addon x10: VA grade push, grade passback, assignment settings, PLC parity, link-to-Classroom button) do not touch any widget front-face content. DiceWidget/Widget.tsx: verified no new className violations — `px-3 pb-3` and `py-4 px-6 gap-3` on footer wrapper and Roll Dice button remain the same tracked items (already in group open item). QuizWidget/Widget.tsx: git diff shows no new className or style changes from dev-paul. VideoActivityWidget/Widget.tsx: same — no new front-face styling changes. random/RandomSettings.tsx: settings panel (back-face), scaling rules do not apply. Note: prior journal entry (2026-05-22) stated QuizWidget and VideoActivityWidget have `skipScaling:false` — this is INCORRECT. Both have `skipScaling: true` in WIDGET_SCALING_CONFIG. This note has been corrected here; however, neither widget has new violations in the current diff. All pre-existing open items remain valid. Zero new anti-patterns detected._
_2026-05-29: Scanned all 49 Widget.tsx files for anti-patterns. New dev-paul commits absorbed via merge since 2026-05-28 (see widget-registry log for full list) — none introduce new front-face widget changes beyond those already reviewed. THREE NEW LOW items detected: (1) CarRiderPro/Widget.tsx:62 — hardcoded `top-2 right-2 p-1.5` on external-link overlay button (absolute-positioned, skipScaling:true context); (2) First5/Widget.tsx:56 — identical hardcoded overlay button pattern, same snippet copy-pasted; (3) GraphicOrganizer/Widget.tsx:79 — EditableNode contenteditable uses `min-h-[50px]` as a fixed minimum height cap inside the skipScaling:true container-query context (this is a NEW sub-item from EditableNode specifically, not covered by the prior Completed entries which addressed outer structural padding). Also re-found Countdown/TrafficLight/LunchCount using cqh/cqw separately — confirmed these are intentional "fill-better" formulas per journal guidance (same reasoning as ClockWidget WON'T FIX and Checklist WON'T FIX; `min(42cqh, 55cqw)` on countdown number and `min(28cqh, 80cqw)` on traffic-light circles are portrait-fill choices, not anti-patterns). MusicWidget cqh-only sizing also exempt per guidance. Weather/hideClothing compact branch cqh/cqw exempt (portrait orientation sub-mode). No action required for those re-found items._
_2026-05-28: Scanned all Widget.tsx / index.tsx files for anti-patterns. New dev-paul commits since 2026-05-27: feat(scoreboard) ScoreboardItem ±buttons layout change (ScoreboardItem.tsx), fix(random,stations) restore widget floors + size result (Stations/Widget.tsx, random/RandomWidget.tsx — both skipScaling:true). Stations/Widget.tsx: change is data/logic only (floor values), no new className violations. random/RandomWidget.tsx: result text sizing change — verified inline style still uses cqmin. MaterialsWidget/index.tsx reviewed — top-level `overflow-hidden` on `h-full w-full flex flex-col` container (line 124) is acceptable; content has `flex-1 min-h-0` at line 140. NEW LOW: PollWidget/Widget.tsx:161 progress bar uses `h-[min(5cqmin)] min-h-[16px]` — uncapped upper bound means bar can grow excessively large at big widget sizes (e.g., 50px tall at 1000px width). See new open item below._
_2026-05-27: Scanned recently changed Widget.tsx files for anti-patterns. New dev-paul commits since 2026-05-26 touching widget content: feat(drawing-widget) toolbar redesign + eraser modes + page titles (DrawingWidget has `skipScaling: false` — CSS transform scaling, not container queries; hardcoded Tailwind sizes in the toolbar are not CQ violations). feat(smart-notebook) multiple sub-component updates — SmartNotebook sub-components verified clean (no hardcoded Tailwind text-size classes in front-face content; `max-w-[240px] min-w-[160px]` on assets side-panel previously documented as acceptable structural constraint). Stations and RevealGrid widgets unchanged. QRWidget (positive reference) still clean. No new anti-patterns detected. All pre-existing open items remain valid._
_2026-05-26: Scanned all Widget.tsx / index.tsx files for anti-patterns. New dev-paul commits merged since 2026-05-24: refactor(effects) (#1689) touched DiceWidget/Widget.tsx and Checklist/Settings.tsx; perf(qr) (#1688) rewrote QRWidget/Widget.tsx. QRWidget/Widget.tsx verified clean — all sizing uses cqmin inline styles, no hardcoded Tailwind text/size classes in front-face content. DiceWidget/Widget.tsx: new cqmin additions added to the grid div (`gap: '4cqmin', padding: '6cqmin'`) and Roll Dice button (`style={{ fontSize: 'min(20px, 5cqmin)' }}`), but the footer wrapper `className="px-3 pb-3"` and button `py-4 px-6 gap-3` remain hardcoded — group open item still valid for those specific violations. MiniApp portaled toolbar fix (commit 74ff0f94 on scheduled-tasks) confirmed merged into dev-paul via PR #1684 (`7145b53d`) — moving to Completed. No new anti-patterns detected. All remaining pre-existing open items valid._

_2026-05-24: Scanned all Widget.tsx / index.tsx files for anti-patterns. New dev-paul commits since 2026-05-23: feat(plc) remove Assignments page + unify quiz library, feat(notebook) place assets on page + rename notebooks. Neither touches widget front-face content. ActivityWall/Widget.tsx:2101-2110 `max-h-[75vh]` usage confirmed inside a `<Modal>` overlay (viewport-constrained media preview for full-screen submission viewing) — not inside the widget's CSS container-query context; acceptable. MusicWidget/Widget.tsx:570 `max-w-[85%]` is a structural truncation constraint on a flex-child label, not a content-cap violation. RecessGear/Widget.tsx:341 `max-w-[70%]` same pattern — truncation guard on a text label inside a row. MiniApp portaled toolbar fix still in scheduled-tasks branch (commit 74ff0f94) pending merge to dev-paul. All pre-existing open items remain valid. Zero new anti-patterns detected._

_2026-05-23: Scanned all Widget.tsx / index.tsx files and new sub-components for anti-patterns. New dev-paul commits since 2026-05-22: feat(notebook)×4 + fix(notebook)×2 adding new SmartNotebook sub-components (PageCanvas.tsx, PageEditor.tsx, PageEditorOverlay.tsx). All three new sub-components: zero hardcoded Tailwind text-size classes, fixed icon sizes, or pixel-capped max-h/max-w constraints. PageCanvas and PageEditor are canvas-manipulation surfaces; PageEditorOverlay is a transparent interaction layer — none render front-face text in container-query context. Viewer.tsx existing `max-w-[240px] min-w-[160px]` on assets side-panel remains documented as acceptable structural constraint (per 2026-05-22 note). feat(widget) FAB kebab commit changes only DraggableWindow.tsx and Dock.tsx — not widget front-face content. QuizWidget/Widget.tsx and VideoActivityWidget/Widget.tsx changes are in skipScaling:false widgets (CSS transform scaling), so hardcoded Tailwind text sizes there are not CQ violations. No new anti-patterns detected. All pre-existing open items remain valid._

_2026-05-22: Scanned all Widget.tsx / index.tsx files and new sub-components for anti-patterns. New dev-paul commits merged: feat(smart-notebook) high-fidelity SMART Notebook import — SmartNotebook/components/Library.tsx and Viewer.tsx both use cqmin units throughout (all headers, buttons, icons, text, spacing); no hardcoded Tailwind text-size or pixel-size classes in front-face content. Viewer.tsx uses `max-w-full max-h-full object-contain` on the notebook image (correct image-fill pattern per audit guidance) and `w-1/3 max-w-[240px] min-w-[160px]` on the assets side-panel (structural layout constraint on a supplementary drawer, not the main content area — acceptable). QuizBehaviorSettingsPanel and VideoActivityBehaviorSettingsPanel added to components/common/library/ — use text-sm/text-xs throughout but are settings/editor-context components rendered inside modals, not inside widget canvas container-query contexts — no violation. No new front-face scaling violations detected. All pre-existing open items remain valid._

_2026-05-21: Scanned all Widget.tsx / index.tsx files for anti-patterns. New dev-paul commits merged: feat(settings) Settings modal refactor (no widget front-face changes), refactor(admin) AdminSettings vertical nav (no widget front-face changes), fix/feat(spotify) 18 commits adding 9 new Spotify sub-components (PersonalSpotifyAdaptiveLayout, PersonalSpotifyCompactBar, PersonalSpotifyDefaultTabBar, PersonalSpotifyLibraryTab, PersonalSpotifyListState, PersonalSpotifyMinimalView, PersonalSpotifyNowPlayingTab, SpotifyResultRow, SpotifyTransportControls) — all use cqmin/cqh/cqw units throughout; no hardcoded Tailwind text-size or pixel-size classes in widget front-face content. MusicWidget continues using cqh-based sizing for its short/wide layout (documented as acceptable in journal guidance). No new violations. All pre-existing open items remain valid._

_2026-05-20: Scanned all Widget.tsx / index.tsx files for anti-patterns. Recent commits since 2026-05-19: fix(deps) lodash-es override (dependency only), docs(changelog) release entry (docs only). Neither introduced new widget front-face changes. Two percentage-based `max-w-[%]` occurrences noted (MusicWidget line 570: `max-w-[85%]`; RecessGear line 341: `max-w-[70%]`) — these are container-relative, not pixel caps, and do not violate the anti-pattern rule. Pre-existing open items remain valid. No new violations detected._

_2026-05-19: Scanned all Widget.tsx / index.tsx files for anti-patterns. New commits since 2026-05-18: Sidebar Cohesion Pass (89b66431 — modal/sidebar UI only, no widget canvas changes), feat(music) 94f21d0f (Spotify Web Playback SDK in MusicWidget). MusicWidget changes: uses cqh-based sizing throughout per the widget's short/wide layout (baseHeight: 80). Pre-existing `size="40%"` and `size="30%"` on `PlayButton` are explicitly documented in the component's interface as valid CSS dimension strings; the primary play-button correctly uses `size="min(56px, 40cqh)"`. DrawingWidget's `size="icon"` on buttons is irrelevant — `skipScaling: false` uses CSS `transform: scale()`, not container queries. ActivityWall `max-h-[75vh]` at 2101/2107/2110 is inside a fullscreen submission-preview overlay outside the widget canvas container query context — confirmed valid per 2026-05-14/16 investigations. No new Widget.tsx front-face scaling violations. All pre-existing open items remain valid._

_2026-05-18: Scanned all Widget.tsx / index.tsx files for anti-patterns. New commits since 2026-05-17: feat(whats-new) 8e86f851 (new changelog modal in Sidebar — not a widget file), fix(soundwidget) 6bf370df (AudioContext resume path split — logic only, no className changes), fix(quiz) 0f81a137 (results-protection error paths — not a widget front-face), fix(number-line) 8b91d650 (the cqmin hover-hint fix already marked completed 2026-05-16), feat(collection-level-templates) 516ab8dc. None introduced new Widget.tsx front-face scaling violations. All pre-existing open items remain valid. No new anti-patterns detected._

_2026-05-17: Scanned all Widget.tsx / index.tsx files for anti-patterns. Recent commits since 2026-05-16: Collection-level sharing plan 2–3 (2f8d6751/debe426f), quiz screenshot protection (2bf54e9d), collections polish (6dccd37a/e490fa79). None introduced new Widget.tsx front-face changes. All pre-existing open items remain valid. No new anti-patterns detected._

_2026-05-16: Scanned all Widget.tsx / index.tsx files for anti-patterns. New commits since 2026-05-15: fix(activity-wall-gallery) 6b6b77c1, fix(text-widget) f4a8315b, fix(embed) 1894d043, fix(subs) 08f13588, feat(Collections+Boards) f691e285, quiz/grader fixes. ActivityWall `max-h-[75vh]` at lines 2101/2107/2110 re-examined — these are inside a fullscreen submission-preview overlay shown at the teacher level, rendered outside the widget canvas container query context; viewport-height units remain correct for this use case (confirmed 2026-05-14 investigation). Embed fix (1894d043) added provider-allowlist logic; the existing portaled zoom toolbar open item unchanged. All pre-existing open items remain valid. No new anti-patterns detected._

_2026-05-15: Scanned all Widget.tsx / index.tsx files for anti-patterns. NEW LOW item detected: MiniApp portaled active-app toolbar (lines 1054–1191, rendered via createPortal to document.body) introduced in `feat(library): preview pane + Duplicate polish` (2026-05-12, f043df3e) — uses hardcoded `text-xs`, `h-8`, `w-3.5 h-3.5` icon sizes in a portaled element outside the container query context. See new open item below. Also: RandomWidget redesign (`feat(random)` commits b0b11656, f8fb1e6b) converted all previously-tracked hardcoded spacing to `cqmin` — random/RandomWidget.tsx entries removed from the group item. Existing open MiniApp item line numbers are stale (save form shifted from lines 848–874 to 1191–1228 as file grew — same UI, different lines). SpecialistSchedule new timer-launch icon (1b946b67) correctly uses `cqmin`. All other existing open items remain valid._

_2026-05-14: Scanned Widget.tsx files for anti-patterns. Investigated four potential new issues: (1) ActivityWall `max-h-[75vh]` at lines 2080/2086/2089 — inside a fullscreen submission-preview modal overlay rendered via DraggableWindow `variant="bare"`; viewport-height units are correct for viewport-bounded modal content, not a widget canvas violation. (2) Stations `maxHeight: '40cqh'` at line 435 — cq-relative (not pixel), intentionally caps the unassigned-students sub-section to prevent it from dominating the layout; design intent, not an anti-pattern. (3) InstructionalRoutines `height: '18.8cqh'` at line 498 — has explicit math comment `(100 - (4 * 1gap) - (2 * 1pad)) / 5 = 18.8`; deliberately sized to guarantee 5 cards fit; cqh is appropriate here. (4) MusicWidget cqh/cqw mixing — per journal guidance, leave fill-better formulas. No new open items._

_2026-05-13: Scanned all 50 Widget.tsx files for hardcoded text-size classes, fixed icon sizes, and max-h/max-w pixel caps. No new items beyond existing open. New notes: (1) ActivityWall `text-base` at line 1868 is inside a fullscreen modal overlay (not the widget canvas surface) — low impact. (2) RevealGrid `text-xs` at lines 164/170 are in interactive overlay controls inside the widget's container-query context — confirmed as existing open item. (3) Embed `text-xs` at line 446 is in the portaled zoom toolbar — confirmed as existing open item. (4) NumberLine `text-xs` at line 339 hover hint — confirmed existing open item. (5) MiniApp has 22 `text-sm`/`text-xs`/`text-base` occurrences — confirmed as existing open item. No new violations introduced._

_2026-05-12: Scanned all Widget.tsx and index.tsx files for hardcoded text-size classes and Tailwind pixel-cap violations. No new issues since 2026-05-06. `CatalystInstructionWidget.tsx:48` (`text-xs`) confirmed to be in the Settings component (back-face), not the front-face widget content — not a violation. All existing open items remain valid._

_2026-05-05: New widgets from dev-paul merge audited — BlendingBoard/Widget.tsx and UrlWidget/Widget.tsx both use `cqmin` units throughout; no new scaling violations introduced._

### LOW CarRiderPro and First5 share a hardcoded external-link overlay button (group)

- **Detected:** 2026-05-29
- **File:** components/widgets/CarRiderPro/Widget.tsx:62, components/widgets/First5/Widget.tsx:56
- **Detail:** Both widgets render an absolute-positioned external-link overlay button with the className `"absolute top-2 right-2 z-10 bg-white/80 ... rounded-lg p-1.5 ..."`. Both have `skipScaling: true`. The `top-2`, `right-2`, and `p-1.5` classes produce fixed-pixel positioning (8 px, 8 px, 6 px) that does not scale with the container, causing the button to appear disproportionately small at large widget sizes and potentially clipping at small sizes. This is an identical copy-pasted snippet in both files.
- **Fix:** Replace the three fixed-pixel Tailwind utilities with inline `cqmin` equivalents: `top-2 right-2` → `style={{ top: 'min(8px, 2cqmin)', right: 'min(8px, 2cqmin)' }}`, `p-1.5` → `style={{ padding: 'min(6px, 1.5cqmin)' }}`. Apply the same fix to both files. The visual/color Tailwind classes (`bg-white/80`, `backdrop-blur-sm`, `hover:bg-white`, etc.) do not carry pixel sizes and can remain on `className`.

### LOW GraphicOrganizer EditableNode uses min-h-[50px] fixed minimum height on contenteditable

- **Detected:** 2026-05-29
- **File:** components/widgets/GraphicOrganizer/Widget.tsx:79
- **Detail:** The internal `EditableNode` component renders a `contenteditable` div with `className="... min-h-[50px] ..."`. This sets a fixed 50 px minimum height on every editable node inside the graphic organizer (Frayer, T-chart, Venn, KWL, Cause-Effect layouts). Widget has `skipScaling: true`. At small widget sizes this 50 px floor can crowd out other content; at large widget sizes it looks sparse. Note: the prior Completed entries for GraphicOrganizer addressed outer structural padding (`p-4` on Frayer cells, `w-32 h-32` center circle, etc.) — this specific EditableNode `min-h-[50px]` was not covered.
- **Fix:** Replace `min-h-[50px]` with a `cqmin` inline style: add a `minHeight` key to the existing `style` prop on the contenteditable div → `style={{ ..., minHeight: 'min(50px, 10cqmin)' }}`. This caps the floor at 50 px on large widgets while allowing proportional reduction at small sizes. Alternatively, `min-h-0` with `flex-1` on the parent cell could let the node fill available space.

### LOW PollWidget progress bar has no upper size cap — grows excessively at large widget sizes

- **Detected:** 2026-05-28
- **File:** components/widgets/PollWidget/Widget.tsx:161
- **Detail:** The poll results progress bar uses `className="h-[min(5cqmin)] min-h-[16px] ..."`. The `h-[min(5cqmin)]` is effectively `height: 5cqmin` (single-argument `min()` is valid CSS but unusual). The `min-h-[16px]` adds a 16px floor. There is no upper cap, so at large widget sizes (e.g., 1000px wide) the bar becomes ~50px tall, taking up a disproportionate amount of the widget area. Widget has `skipScaling: true`.
- **Fix:** Replace both Tailwind classes with a single inline style using the recommended cap pattern: `style={{ height: 'clamp(16px, 5cqmin, 24px)' }}`. This gives a 16px floor (bar never invisible), scales with `5cqmin`, and caps at 24px (bar never oversized).

### LOW EmbedWidget zoom toolbar uses hardcoded sizes — portaled outside container query context

- **Detected:** 2026-04-28
- **File:** components/widgets/Embed/Widget.tsx:443 (zoom reset button), :437 (ZoomOut icon), :457 (ZoomIn icon), :426 (toolbar gap)
- **Detail:** The hover-visible zoom toolbar uses `text-xs font-mono` on the percentage reset button (line 443), `className="w-4 h-4"` on ZoomOut/ZoomIn icons (lines 437, 457), `p-2` on the zoom buttons, and `gap: 4` (hardcoded pixels) on the toolbar flex container (line 426). Widget has `skipScaling: true`. Critically, the entire toolbar is rendered via `createPortal` to `document.body` (line 393) with `position: fixed` — it lives **outside** the widget's container query context, so `cqmin` units will not resolve against the widget size. The hardcoded sizes will not scale with the widget, but cqmin is not a straightforward fix either.
- **Fix:** Two options: (a) Remove the portal if the toolbar doesn't need to escape the iframe stacking context — then convert to `cqmin` as normal: `text-xs` → `style={{ fontSize: 'min(11px, 4cqmin)' }}`, icons `w-4 h-4` → `style={{ width: 'min(16px, 4cqmin)', height: 'min(16px, 4cqmin)' }}`, `gap: 4` → `style={{ gap: 'min(4px, 1cqmin)' }}`; (b) Keep the portal and pass the widget's computed `cqmin`-equivalent pixel size down as a prop derived from the widget's `rect` dimensions, then use those pixel values directly in the portaled toolbar's styles.

### LOW QuizResults period-filter `<select>` uses hardcoded `text-sm`

- **Detected:** 2026-04-27
- **File:** components/widgets/QuizWidget/components/QuizResults.tsx:968 (line shifted from :607 as of 2026-05-05 merge)
- **Detail:** The period filter `<select>` in the quiz results view uses `text-sm` (hardcoded Tailwind). The QuizWidget has `skipScaling: true`, so this element is inside a CSS container-query context. Introduced by the 2026-04-26 commit `fix(quiz): persist Results export URL on assignment doc (#1419)`. QuizResults grew significantly in the 2026-05-05 merge (matching/ordering editor addition) — line number has shifted.
- **Fix:** Replace `text-sm` with an inline style: `style={{ fontSize: 'min(14px, 5.5cqmin)' }}`. The surrounding `px-2 py-1` padding on the same element should also be converted: `style={{ padding: 'min(4px, 1.5cqmin) min(8px, 2.5cqmin)' }}`.

### LOW RevealGridWidget has additional hardcoded spacing beyond `text-xs` labels

- **Detected:** 2026-04-12 (expanded 2026-04-14)
- **File:** components/widgets/RevealGrid/Widget.tsx:159, :164, :170, :185
- **Detail:** In addition to the previously noted `text-xs` on control labels (lines 164, 170), the widget also has: `gap-2` on the header controls row (line 159), `py-1 px-3` on the "Start Over" button (line 164), and `gap-4` on the main card grid (line 185). Widget has `skipScaling: true`.
- **Fix:** Convert all noted Tailwind sizing classes to inline `cqmin` equivalents per project pattern. See prior entry for text-xs fix guidance.

### LOW Multiple widgets with hardcoded gap/padding/icon-size spacing (group)

- **Detected:** 2026-04-14
- **File:** (see per-widget details below)
- **Detail:** The following widgets have `skipScaling: true` and contain hardcoded Tailwind spacing utilities (`gap-N`, `p-N`, `px-N py-N`, `mb-N`) or icon size classes (`w-N h-N`) in their front-face content. These cause fixed-pixel spacing that does not respond to container query scaling, creating density mismatches at large widget sizes. None affect text legibility directly (no Tailwind text-size classes), so severity is LOW.
  - `CatalystWidget/Widget.tsx:88` — `mr-2` on back button
  - `DiceWidget/Widget.tsx:109, :113-116` — `px-3 pb-3` footer, `py-4 px-6 gap-3` Roll Dice button
  - `GuidedLearning/Widget.tsx:231` — `w-8 h-8` on Loader2 loading icon
  - `NextUp/Widget.tsx:295, :331, :344, :346, :360, :409, :425, :430` — `p-6`, `gap-2`, `p-1`, `px-3 py-1`, `mb-2 px-1`, `space-y-2`, `py-8`
  - ~~`random/RandomWidget.tsx:711, :750, :752`~~ — resolved by random redesign (2026-05-15; commits b0b11656, f8fb1e6b converted all to `cqmin`)
  - `SoundWidget/Widget.tsx:182, :210, :212` — `p-2` content wrapper, `pb-3` footer, `px-6 py-2` level label
  - `SoundboardWidget/Widget.tsx:391, :402` — `mb-2` Music icon, `gap-2` selection bar
  - `SpecialistSchedule/SpecialistScheduleWidget.tsx:234, :314` — `mb-2 pb-2` header row, `px-2 py-1` "Now" badge
  - `TalkingTool/Widget.tsx:80, :109, :135` — `p-2 space-y-2`, `mb-2`, `mb-4`
  - `Webcam/Widget.tsx:457, :470, :480, :497, :527, :531, :542, :547, :558` — `p-6`, `p-6 mb-4`, `px-4 py-2`, `gap-2`, `p-4` (multiple), `gap-3`, `gap-2` (multiple)
- **Fix:** For each widget, convert hardcoded spacing and icon-size Tailwind classes to inline `cqmin` equivalents. Example: `gap-2` → `style={{ gap: 'min(8px, 2cqmin)' }}`, `w-8 h-8` → `style={{ width: 'min(32px, 8cqmin)', height: 'min(32px, 8cqmin)' }}`. Prioritize widgets visible in default-size teacher dashboards (DiceWidget, NextUp, SoundWidget) over utility widgets.

### LOW MiniApp internal dialog overlays use hardcoded Tailwind text sizes

- **Detected:** 2026-04-26
- **File:** components/widgets/MiniApp/Widget.tsx:134, :138, :142, :148, :166, :177, :187, :194, :204, :219, :226, :237, :253, :260, :848, :866, :874
- **Detail:** The widget has two internal overlay dialogs rendered inside the container-query context: (1) the "Start Live Session" / "Share Link" dialog shown when the user launches a live session (lines 120–260), and (2) the "Save to Library" overlay shown when pasting HTML into the widget (lines 848–880). Both use hardcoded Tailwind classes `text-base`, `text-sm`, `text-xs` on labels, body text, code blocks, and buttons. Widget has `skipScaling: true`. At small widget sizes these overlays will show unscaled text and potentially overflow the widget bounds. The prior 2026-04-14 completion entry "MiniAppWidget uses hardcoded Tailwind text sizes — Resolved outside journal workflow" was inaccurate; these overlay states were not assessed.
- **Fix:** For both overlay dialogs, replace `text-base` → `style={{ fontSize: 'min(16px, 6cqmin)' }}`, `text-sm` → `style={{ fontSize: 'min(14px, 5.5cqmin)' }}`, `text-xs` → `style={{ fontSize: 'min(11px, 4cqmin)' }}`. Also convert any `w-4 h-4` icon sizes and `gap-2`, `p-3`/`p-5` spacing to `cqmin` equivalents.

---

## Completed

### LOW MiniApp active-app toolbar uses hardcoded sizes — portaled outside container query context

- **Detected:** 2026-05-15
- **Completed:** 2026-05-26
- **File:** components/widgets/MiniApp/Widget.tsx (createPortal block around lines 1060–1235)
- **Detail:** The "active app overlay toolbar" rendered via `createPortal` to `document.body` lived outside the widget's CSS container-query context, so `cqmin` units could not resolve against the widget's size. Toolbar used hardcoded Tailwind sizing: `text-xs`, `text-[10px]`, `h-8`, `w-3.5 h-3.5`, `gap-1.5`, `px-2`, `py-1.5`, `px-3`, `w-px h-5 mx-0.5`.
- **Resolution:** Fix delivered on `scheduled-tasks` branch (commit `74ff0f94`) — computed JS-side `cqmin` from `widgetRect` with zero-guard, `px(cap, factor)` helper, and a `sz` object matching every original utility at default 500×600 widget size. Merged into `dev-paul` via PR #1684 (commit `7145b53d`, 2026-05-26). `pnpm type-check`, `pnpm lint`, and `pnpm format:check` all clean.

### LOW NumberLineWidget hover hint `text-xs` still present — prior completion was inaccurate

- **Detected:** 2026-04-26 (re-flagged; originally detected 2026-04-12, incorrectly closed 2026-04-14)
- **Completed:** 2026-05-16
- **File:** components/widgets/NumberLine/Widget.tsx:339
- **Detail:** The hover-visible tooltip hint at the bottom-left of the number-line content area used `text-xs` plus `bottom-2 left-4` as hardcoded Tailwind classes inside a `skipScaling: true` widget — they did not respond to widget size. The 2026-04-14 completion was inaccurate; the classes were never removed.
- **Resolution:** Replaced the hardcoded Tailwind sizing classes with inline `cqmin` styles per the journal entry: `text-xs` → `fontSize: 'min(12px, 6cqmin)'`, `bottom-2` → `bottom: 'min(8px, 4cqmin)'`, `left-4` → `left: 'min(16px, 8cqmin)'`. Other Tailwind utility classes (`absolute`, `text-slate-400`, `pointer-events-none`, `opacity-0`, `group-hover:opacity-100`, `transition-opacity`) were preserved on `className` — they don't carry pixel sizing. `pnpm exec tsc --noEmit`, `pnpm exec eslint components/widgets/NumberLine/Widget.tsx --max-warnings 0`, and `pnpm exec prettier --check` on the changed files all clean.

### MEDIUM StarterPackWidget has hardcoded icon size and spacing in addition to text sizes

- **Detected:** 2026-04-12 (expanded 2026-04-14)
- **Completed:** 2026-04-25
- **File:** components/widgets/StarterPack/Widget.tsx
- **Detail:** Outer wrapper used `p-4`, empty-state used `gap-2` + `w-8 h-8` on the Wand2 icon, the template grid used `gap-4`, and card titles/descriptions used `text-sm`/`text-xs`. Button cards also carried hardcoded `gap-3 p-4`, inner icon chip `p-3`, inner `IconComponent` `w-8 h-8`, and title `mb-1`. Widget has `skipScaling: true`, so none of this responded to container size.
- **Resolution:** Converted all hardcoded front-face Tailwind sizing to inline `cqmin` styles:
  - outer wrapper `p-4` → `padding: 'min(16px, 3.5cqmin)'`
  - empty-state hand-rolled markup replaced with the shared `ScaledEmptyState` component (Wand2 icon, "No starter packs available" title)
  - grid `gap-4` → `gap: 'min(16px, 3cqmin)'`
  - button `gap-3 p-4` → `gap: 'min(12px, 2.5cqmin)'` / `padding: 'min(16px, 3.5cqmin)'`
  - inner icon chip `p-3` → `padding: 'min(12px, 2.5cqmin)'`; inner `IconComponent` `w-8 h-8` → `width/height: 'min(32px, 8cqmin)'` (added `style?: React.CSSProperties` to the LucideIcons cast so the dynamic component accepts inline styles)
  - title `text-sm mb-1` → `fontSize: 'min(14px, 5.5cqmin)'` + `marginBottom: 'min(4px, 1cqmin)'`; description `text-xs` → `fontSize: 'min(11px, 4cqmin)'`.

### MEDIUM GraphicOrganizerWidget has hardcoded padding throughout node layouts (post-text-fix)

- **Detected:** 2026-04-14
- **Completed:** 2026-04-25
- **File:** components/widgets/GraphicOrganizer/Widget.tsx
- **Detail:** Structural padding and sizing remained hardcoded after the 2026-04-13 text-size fix: `p-4` on Frayer cell divs (×4), `w-32 h-32` on the Frayer center circle, `pb-2 mb-4` / `text-xl` on T-chart headers, plus `p-3`/`p-4`/`p-6` across Venn, KWL, and Cause-Effect layouts. Widget has `skipScaling: true`.
- **Resolution:** Converted all hardcoded structural Tailwind classes to inline `cqmin` styles across all five layout renderers:
  - Frayer: outer `gap-2 p-2` → inline `min(8px, 1.5cqmin)`; four cell `p-4` → `min(16px, 3cqmin)`; absolute `top-2 left-2` header pins converted to inline `cqmin` values; four `mt-4` EditableNode margins → inline `min(16px, 3cqmin)`; center circle `w-32 h-32 p-4` → `min(128px, 22cqmin)` / `min(16px, 3cqmin)`.
  - T-chart: container `p-4` and both cell `p-4` → `min(16px, 3cqmin)`; both headers' `pb-2 mb-4 text-xl` → inline `min(20px, 7cqmin)` / `min(8px, 1.5cqmin)` / `min(16px, 3cqmin)`.
  - Venn: container `p-4` and three column `p-4` → `min(16px, 3cqmin)`; three header `mb-2` → `min(8px, 1.5cqmin)`.
  - KWL: three header `p-3` → `min(12px, 2.5cqmin)`; three content `p-4` → `min(16px, 3cqmin)`.
  - Cause-Effect: container `p-6 gap-4` → `min(24px, 4.5cqmin)` / `min(16px, 3cqmin)`; both header `p-2` → `min(8px, 1.5cqmin)`; both content `p-4` → `min(16px, 3cqmin)`; arrow SVG `width/height="48"` → inline `min(48px, 10cqmin)`.
    All 1423 unit tests pass; `pnpm type-check`, `pnpm lint --max-warnings 0`, and prettier check on the changed file all clean.

### MEDIUM MathToolsWidget uses `h-32` to cap an empty-state content container

- **Detected:** 2026-04-14
- **Completed:** 2026-04-19
- **File:** components/widgets/MathTools/Widget.tsx
- **Detail:** The empty-state container for the math tool list used `h-32` — a fixed 128 px height cap. Widget has `skipScaling: true`. When the widget grew large, this truncated the empty state and wasted space. The tab bar and grade-selector pill also had hardcoded `gap-2`, `gap-1.5`, `px-3 py-1.5`, `px-1.5 py-0.5` Tailwind spacing.
- **Resolution:** Made the scrollable content wrapper a flex column (`flex-1 min-h-0 overflow-y-auto custom-scrollbar flex flex-col`) and replaced `h-32` on the empty-state container with `flex-1 min-h-0` so it now fills the available content area. Marked the subtitle row `shrink-0` so it does not collapse. Converted the header row's `gap-2` to inline `gap: 'min(8px, 2cqmin)'`. Converted the grade-selector pill's `gap-1.5 px-1.5 py-0.5` to inline `gap: 'min(6px, 1.2cqmin)'` and `padding: 'min(2px, 0.5cqmin) min(6px, 1.2cqmin)'`. Converted each tab button's `px-3 py-1.5` to inline `padding: 'min(6px, 1.2cqmin) min(12px, 2.5cqmin)'`. Also covers the corresponding MathTools entries from the LOW group "Multiple widgets with hardcoded gap/padding" item, which were removed. `pnpm type-check`, `pnpm lint --max-warnings 0`, and prettier check on the changed file all clean.

### MEDIUM ExpectationsWidget uses `text-xs` on the empty-state content area

- **Detected:** 2026-04-14
- **Completed:** 2026-04-17
- **File:** components/widgets/ExpectationsWidget/Widget.tsx:427
- **Detail:** The empty-state container (shown when no expectation categories are enabled for the building) used `text-xs` and `p-6` as hardcoded Tailwind classes. Widget has `skipScaling: true`, so these did not respond to widget size. Teachers see this empty state first after adding the widget if their building has all three categories disabled — it must remain legible on a projected screen.
- **Resolution:** Removed `text-xs` and `p-6` Tailwind classes from the empty-state container and replaced them with inline `cqmin` styles: `fontSize: 'min(12px, 4cqmin)'` and `padding: 'min(24px, 5cqmin)'`. `pnpm type-check` and `pnpm lint --max-warnings 0` both clean; prettier check on changed files passes.

### MEDIUM BreathingWidget uses `text-4xl` / `text-6xl` hardcoded Tailwind text sizes

- **Detected:** 2026-04-14
- **Completed:** 2026-04-15
- **File:** components/widgets/Breathing/BreathingWidget.tsx:53, :59
- **Detail:** The primary phase label (`text-4xl`) and the breathing timer number (`text-6xl`) used hardcoded Tailwind text size classes. Widget has `skipScaling: true`. These are the two most prominent content elements — the ones most critical to classroom legibility at distance — but they did not scale with widget size. Footer controls also used hardcoded `p-4` and `gap-4`, and the phase label used hardcoded `mb-2`.
- **Resolution:** Converted all hardcoded Tailwind sizing classes in front-face content to inline `cqmin` styles:
  - `text-4xl` (phase label) → `style={{ fontSize: 'min(36px, 15cqmin)' }}`
  - `text-6xl` (breathing timer) → `style={{ fontSize: 'min(60px, 25cqmin)' }}`
  - `mb-2` → `marginBottom: 'min(8px, 2cqmin)'`
  - `p-4` (footer container) → `padding: 'min(16px, 3.5cqmin)'`
  - `gap-4` (footer container) → `gap: 'min(16px, 3.5cqmin)'`
    All 1094 unit tests pass; `pnpm type-check`, `pnpm lint --max-warnings 0`, and prettier check on changed files all clean.

### HIGH GraphicOrganizerWidget uses hardcoded Tailwind text sizes throughout content

- **Detected:** 2026-04-12 (expanded 2026-04-13)
- **Completed:** 2026-04-13
- **File:** components/widgets/GraphicOrganizer/Widget.tsx
- **Detail:** Node type labels used `text-xs` (Frayer corner labels x4), Venn content used `text-sm` (left/center/right), and KWL used `text-3xl` for K/W/L letters plus `text-sm` for captions. Widget has `skipScaling: true` — all these fixed Tailwind classes produced non-scaling text regardless of widget size.
- **Resolution:** Converted all hardcoded text-size classes to inline `cqmin` styles:
  - `text-xs` → `style={{ fontSize: 'min(11px, 4cqmin)' }}` (4 Frayer corner labels)
  - `text-sm` → `style={{ fontSize: 'min(14px, 5.5cqmin)' }}` (3 Venn content nodes, 3 KWL captions)
  - `text-3xl` → `style={{ fontSize: 'min(30px, 12cqmin)' }}` (3 KWL letter displays)
  - Added `style?: React.CSSProperties` prop to the internal `EditableNode` component so contentEditable nodes can receive inline font-size without wrapping. All 1094 unit tests pass; `pnpm type-check`, `pnpm lint --max-warnings 0`, and `pnpm format:check` all clean.

### MEDIUM ClockWidget uses `cqh`/`cqw` separately instead of `cqmin` — REVERTED (won't fix)

- **Detected:** 2026-04-12
- **Completed:** 2026-04-12
- **Reverted:** 2026-04-13
- **File:** components/widgets/ClockWidget/Widget.tsx:62, :70-72, :127
- **Detail:** Primary time display uses `min(82cqh, 20cqw)` / `min(82cqh, 25cqw)`, date label uses `min(12cqh, 80cqw)`, and the column gap uses `gap-[0.5cqh]` — separate `cqh`/`cqw` axes by design.
- **Resolution:** The cqmin conversion (with `clamp()` pixel caps) was reverted at user request. The `cqh`/`cqw` formulation fills the widget far more aggressively across non-reference aspect ratios (especially short/wide clocks), and the pixel cap from `clamp()` left large amounts of empty space on bigger widgets. This entry should not be re-flagged by future audits — the mixed `cqh`/`cqw` is the desired behavior for this widget.

### MEDIUM ChecklistWidget uses `cqh`/`cqw` separately in scaling formula — WON'T FIX

- **Detected:** 2026-04-12
- **Closed:** 2026-04-13
- **File:** components/widgets/Checklist/Widget.tsx:147-150
- **Detail:** `buildCardStyle` uses `cqh` for text/icon size, mixed `cqh`/`cqw` for padding, and `cqw` for gap. The intent (per the inline comment) is that height is the smaller dimension on a typical checklist, so scaling against `cqh` fills aggressively.
- **Resolution:** Closed without changes per user direction. Same reasoning as the ClockWidget revert — switching to `cqmin` (plus `clamp()` pixel caps) would shrink content on large widgets and leave wasted space. The "fill the widget logically" preference outweighs the cross-aspect-ratio consistency that `cqmin` provides. Do not re-flag.

### MEDIUM CountdownWidget uses `cqh`/`cqw` separately instead of `cqmin`

- **Detected:** 2026-04-12
- **Completed:** 2026-04-14
- **File:** components/widgets/Countdown/Widget.tsx:146, :153, :164
- **Resolution:** Resolved outside journal workflow. 2026-04-14 audit confirmed widget is clean — no `cqh`/`cqw` separate axis violations detected.

### MEDIUM LunchCountWidget uses `cqh`/`cqw` separately instead of `cqmin`

- **Detected:** 2026-04-12
- **Completed:** 2026-04-14
- **File:** components/widgets/LunchCount/Widget.tsx:405, :415-416, :425
- **Resolution:** Resolved outside journal workflow. 2026-04-14 audit confirmed widget is clean.

### MEDIUM MiniAppWidget uses hardcoded Tailwind text sizes with `skipScaling: true`

- **Detected:** 2026-04-12
- **Completed:** 2026-04-14
- **File:** components/widgets/MiniApp/Widget.tsx
- **Resolution:** Resolved outside journal workflow. 2026-04-14 audit confirmed widget is clean.

### MEDIUM TrafficLightWidget uses `cqh`/`cqw` separately instead of `cqmin`

- **Detected:** 2026-04-13
- **Completed:** 2026-04-14
- **File:** components/widgets/TrafficLightWidget/Widget.tsx:36, :48, :60
- **Resolution:** Resolved outside journal workflow. 2026-04-14 audit confirmed widget is clean.

### LOW NumberLineWidget uses `text-xs` for hover hint

- **Detected:** 2026-04-12
- **Completed:** 2026-04-14
- **File:** components/widgets/NumberLine/Widget.tsx:339
- **Resolution:** Resolved outside journal workflow. 2026-04-14 audit confirmed widget is clean.
