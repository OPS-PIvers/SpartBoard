# CSS Scaling Patterns — Scheduled Task Journal

_Audit model: claude-sonnet-4-6_
_Action model: claude-opus-4-6_
_Audit cadence: daily_
_Last audited: 2026-04-24_
_Last action: 2026-04-24_

---

## Audit guidance — `cqmin` is not always the right answer

The CLAUDE.md scaling rules recommend `cqmin` for consistency. **However**, `cqmin` (and `clamp(…, Xpx)` caps) can leave large amounts of empty space on widgets that get resized aggressively — especially short/wide layouts where the height-driven `cqh` axis would have filled the widget. User preference: widget content should **logically fill the widget window**. If a widget already uses a `cqh`/`cqw` mix (or `min(Acqh, Bcqw)`) that fills better than the equivalent `cqmin` form, **leave it**. Do not propose `cqmin` conversions for widgets where the existing formula visibly fills the widget at a wider range of aspect ratios. When in doubt, audit visually before flagging.

---

## In Progress

_Nothing currently in progress._

---

## Open

### MEDIUM StarterPackWidget has hardcoded icon size and spacing in addition to text sizes

- **Detected:** 2026-04-12 (expanded 2026-04-14)
- **File:** components/widgets/StarterPack/Widget.tsx:48, :54, :55, :59, :96, :100
- **Detail:** In addition to the previously noted `text-sm`/`text-xs` on card titles (lines 96, 100), the widget also has: `p-4` hardcoded outer wrapper (line 48), `gap-2` on empty state (line 54), `w-8 h-8` on the Wand2 icon (line 55), `gap-4` on the template grid (line 59). Widget has `skipScaling: true`.
- **Fix:** Replace `text-sm` with `style={{ fontSize: 'min(14px, 5.5cqmin)' }}` and `text-xs` with `style={{ fontSize: 'min(11px, 4cqmin)' }}`. Replace `p-4` with `style={{ padding: 'min(16px, 3.5cqmin)' }}`, `w-8 h-8` Wand2 with `style={{ width: 'min(32px, 8cqmin)', height: 'min(32px, 8cqmin)' }}`, `gap-4` grid with `style={{ gap: 'min(16px, 3cqmin)' }}`.

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

---

## Completed

### MEDIUM GraphicOrganizerWidget has hardcoded padding throughout node layouts (post-text-fix)

- **Detected:** 2026-04-14
- **Completed:** 2026-04-24
- **File:** components/widgets/GraphicOrganizer/Widget.tsx
- **Detail:** Structural padding remained hardcoded after the 2026-04-13 text-size fix: `p-4` on Frayer cell divs (×4), `w-32 h-32` + `p-4` on the Frayer center circle, `pb-2 mb-4` and `text-xl` on T-chart headers, `p-4` outer + column wrappers on Venn, `p-3` headers and `p-4` EditableNode wrappers on KWL (×3 each), and `p-6` outer + `p-4` EditableNode wrappers on Cause-Effect. Widget has `skipScaling: true`, so fixed-pixel padding compressed content proportionally less as the widget grew.
- **Resolution:** Converted all `p-4`, `p-3`, `p-6` instances to inline `cqmin` styles using the project pattern:
  - `p-4` → `padding: 'min(16px, 3cqmin)'` (15 instances across Frayer cells, T-chart cells, Venn outer + columns, KWL EditableNodes, Cause-Effect EditableNodes)
  - `p-3` → `padding: 'min(12px, 3cqmin)'` (3 KWL header containers)
  - `p-6` → `padding: 'min(24px, 5cqmin)'` (Cause-Effect outer wrapper)
  - `w-32 h-32` (Frayer center circle) → `width: 'min(128px, 22cqmin)', height: 'min(128px, 22cqmin)'`
  - `text-xl` (T-chart headers) → `fontSize: 'min(20px, 7cqmin)'`
  - `pb-2 mb-4` (T-chart headers) → `paddingBottom: 'min(8px, 2cqmin)', marginBottom: 'min(16px, 3cqmin)'`
  - Moved padding out of `EditableNode` `className` prop into its `style` prop to avoid className/style conflicts.
    `pnpm type-check`, `pnpm lint --max-warnings 0`, and `pnpm format:check` all clean.

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
