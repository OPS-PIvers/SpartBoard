# CSS Scaling Patterns — Scheduled Task Journal

_Audit model: claude-sonnet-4-6_
_Action model: claude-opus-4-6_
_Audit cadence: daily_
_Last audited: 2026-05-04_
_Last action: 2026-04-25_

---

## Audit guidance — `cqmin` is not always the right answer

The CLAUDE.md scaling rules recommend `cqmin` for consistency. **However**, `cqmin` (and `clamp(…, Xpx)` caps) can leave large amounts of empty space on widgets that get resized aggressively — especially short/wide layouts where the height-driven `cqh` axis would have filled the widget. User preference: widget content should **logically fill the widget window**. If a widget already uses a `cqh`/`cqw` mix (or `min(Acqh, Bcqw)`) that fills better than the equivalent `cqmin` form, **leave it**. Do not propose `cqmin` conversions for widgets where the existing formula visibly fills the widget at a wider range of aspect ratios. When in doubt, audit visually before flagging.

---

## In Progress

_Nothing currently in progress._

---

## Open

### LOW EmbedWidget zoom toolbar uses hardcoded sizes — portaled outside container query context

- **Detected:** 2026-04-28
- **File:** components/widgets/Embed/Widget.tsx:443 (zoom reset button), :437 (ZoomOut icon), :457 (ZoomIn icon), :426 (toolbar gap)
- **Detail:** The hover-visible zoom toolbar uses `text-xs font-mono` on the percentage reset button (line 443), `className="w-4 h-4"` on ZoomOut/ZoomIn icons (lines 437, 457), `p-2` on the zoom buttons, and `gap: 4` (hardcoded pixels) on the toolbar flex container (line 426). Widget has `skipScaling: true`. Critically, the entire toolbar is rendered via `createPortal` to `document.body` (line 393) with `position: fixed` — it lives **outside** the widget's container query context, so `cqmin` units will not resolve against the widget size. The hardcoded sizes will not scale with the widget, but cqmin is not a straightforward fix either.
- **Fix:** Two options: (a) Remove the portal if the toolbar doesn't need to escape the iframe stacking context — then convert to `cqmin` as normal: `text-xs` → `style={{ fontSize: 'min(11px, 4cqmin)' }}`, icons `w-4 h-4` → `style={{ width: 'min(16px, 4cqmin)', height: 'min(16px, 4cqmin)' }}`, `gap: 4` → `style={{ gap: 'min(4px, 1cqmin)' }}`; (b) Keep the portal and pass the widget's computed `cqmin`-equivalent pixel size down as a prop derived from the widget's `rect` dimensions, then use those pixel values directly in the portaled toolbar's styles.

### LOW QuizResults period-filter `<select>` uses hardcoded `text-sm`

- **Detected:** 2026-04-27
- **File:** components/widgets/QuizWidget/components/QuizResults.tsx:607
- **Detail:** The period filter `<select>` in the quiz results view uses `text-sm` (hardcoded Tailwind). The QuizWidget has `skipScaling: true`, so this element is inside a CSS container-query context. Introduced by the 2026-04-26 commit `fix(quiz): persist Results export URL on assignment doc (#1419)`.
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
  - `random/RandomWidget.tsx:711, :750, :752` — `px-2 pb-2` footer, `h-12` Randomize button, `w-4 h-4` RefreshCw icon
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

### LOW NumberLineWidget hover hint `text-xs` still present — prior completion was inaccurate

- **Detected:** 2026-04-26 (re-flagged; originally detected 2026-04-12, incorrectly closed 2026-04-14)
- **File:** components/widgets/NumberLine/Widget.tsx:339
- **Detail:** `className="absolute bottom-2 left-4 text-xs text-slate-400 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity"` is still present. The 2026-04-14 completion note "Resolved outside journal workflow. 2026-04-14 audit confirmed widget is clean" was inaccurate — the `text-xs` at line 339 was never removed. The hint is invisible by default (opacity-0) and only visible on hover, so impact is very low, but the pattern is inconsistent for a `skipScaling: true` widget.
- **Fix:** Replace `text-xs` with `style={{ fontSize: 'min(12px, 6cqmin)' }}` on the hint div and remove the `bottom-2 left-4` Tailwind positional classes, replacing them with equivalent inline styles `style={{ bottom: 'min(8px, 4cqmin)', left: 'min(16px, 8cqmin)' }}`. (cqmin percentages chosen to reach the px caps at the widget's default size of 700×200, where `cqmin = 2px`; this preserves the original Tailwind dimensions at default size and only shrinks if the widget is sized smaller.)

---

## Completed

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
