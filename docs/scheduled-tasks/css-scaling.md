# CSS Scaling Patterns — Scheduled Task Journal

_Audit model: claude-sonnet-4-6_
_Action model: claude-opus-4-6_
_Audit cadence: daily_
_Last audited: 2026-04-15_
_Last action: 2026-04-13_

---

## In Progress

_Nothing currently in progress._

---

## Open

### MEDIUM BreathingWidget uses `text-4xl` / `text-6xl` hardcoded Tailwind text sizes

- **Detected:** 2026-04-14
- **File:** components/widgets/Breathing/BreathingWidget.tsx:53, :59
- **Detail:** The primary phase label (`text-4xl`) and the breathing timer number (`text-6xl`) use hardcoded Tailwind text size classes. Widget has `skipScaling: true`. These are the two most prominent content elements — the ones most critical to classroom legibility at distance — but they do not scale with widget size.
- **Fix:** Replace `text-4xl` with `style={{ fontSize: 'min(36px, 15cqmin)' }}` and `text-6xl` with `style={{ fontSize: 'min(60px, 25cqmin)' }}`. Convert `mb-2` and `p-4` footer spacing to inline `cqmin` equivalents.

### MEDIUM ExpectationsWidget uses `text-xs` on the empty-state content area

- **Detected:** 2026-04-14
- **File:** components/widgets/ExpectationsWidget/Widget.tsx:427
- **Detail:** The empty-state container uses `text-xs` and `p-6` as hardcoded classes. Widget has `skipScaling: true`. While empty-state is not the primary content view, it is shown when no expectations are configured and is the first thing a teacher sees after adding the widget — it must remain legible on a projected screen.
- **Fix:** Replace `text-xs` with `style={{ fontSize: 'min(11px, 4cqmin)' }}` and `p-6` with `style={{ padding: 'min(24px, 5cqmin)' }}`.

### MEDIUM MathToolsWidget uses `h-32` to cap an empty-state content container

- **Detected:** 2026-04-14
- **File:** components/widgets/MathTools/Widget.tsx:213
- **Detail:** The empty-state container for the math tool list uses `h-32` — a fixed 128 px height cap. Widget has `skipScaling: true`. When the widget is large this truncates the container, wasting space. Also has hardcoded `gap-2`, `gap-1.5`, `px-3 py-1.5` on the tab bar and controls.
- **Fix:** Replace `h-32` with `min-h-0 flex-1` so the empty-state fills available space. Convert tab-bar spacing (`px-3 py-1.5`, `gap-2`, `gap-1.5`) to `cqmin` inline styles.

### MEDIUM GraphicOrganizerWidget has hardcoded padding throughout node layouts (post-text-fix)

- **Detected:** 2026-04-14
- **File:** components/widgets/GraphicOrganizer/Widget.tsx
- **Detail:** The previous fix (2026-04-13) converted all hardcoded Tailwind text-size classes to `cqmin`. However, structural padding remains hardcoded: `p-4` on Frayer cell divs (×4), `w-32 h-32` on the Frayer center circle, `pb-2 mb-4` and `text-xl` on T-chart headers, and multiple `p-3`/`p-4`/`p-6` instances in Venn, KWL, and Cause-Effect layouts. Widget has `skipScaling: true`. Fixed padding compresses content proportionally less as the widget grows, creating a poor density experience at large sizes.
- **Fix:** Convert all `p-4`, `p-3`, `p-6` padding to `style={{ padding: 'min(16px, 3cqmin)' }}` pattern. Convert `w-32 h-32` Frayer center circle to `style={{ width: 'min(128px, 22cqmin)', height: 'min(128px, 22cqmin)' }}`. Replace `text-xl` T-chart header with `style={{ fontSize: 'min(20px, 7cqmin)' }}`.

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
  - `MathTools/Widget.tsx:118, :128, :167-168` — `gap-2`, `gap-1.5`, `px-3 py-1.5` tab buttons
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

### MEDIUM ClockWidget uses `cqh`/`cqw` separately instead of `cqmin`

- **Detected:** 2026-04-12
- **Completed:** 2026-04-12
- **File:** components/widgets/ClockWidget/Widget.tsx:62, :70-72, :127
- **Detail:** Primary time display used `min(82cqh, 20cqw)` / `min(82cqh, 25cqw)`, date label used `min(12cqh, 80cqw)`, and the column gap used `gap-[0.5cqh]`. All mixed `cqh`/`cqw` independently instead of using `cqmin`.
- **Resolution:** Converted to `cqmin`-based sizing, preserving visual size at the reference 280×140 dimensions (cqmin = 1.4px at reference):
  - Time with seconds: `min(82cqh, 20cqw)` (→ 56px at ref) → `clamp(24px, 40cqmin, 160px)` (→ 56px at ref)
  - Time without seconds: `min(82cqh, 25cqw)` (→ 70px at ref) → `clamp(24px, 50cqmin, 200px)` (→ 70px at ref)
  - Date: `min(12cqh, 80cqw)` (→ 16.8px at ref) → `clamp(10px, 12cqmin, 28px)` (→ 16.8px at ref)
  - Gap: `gap-[0.5cqh]` → `gap-[0.5cqmin]`
    Added clamp() pixel bounds for predictable min/max behavior per CLAUDE.md hero-text guidance.

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

### MEDIUM ChecklistWidget uses `cqh`/`cqw` separately in scaling formula

- **Detected:** 2026-04-12
- **Completed:** 2026-04-14
- **File:** components/widgets/Checklist/Widget.tsx:147-150
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
