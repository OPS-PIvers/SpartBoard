# CSS Scaling Patterns — Scheduled Task Journal

_Audit model: claude-sonnet-4-6_
_Action model: claude-opus-4-6_
_Audit cadence: daily_
_Last audited: 2026-04-13_
_Last action: 2026-04-13_

---

## In Progress

_Nothing currently in progress._

---

## Open

### MEDIUM CountdownWidget uses `cqh`/`cqw` separately instead of `cqmin`

- **Detected:** 2026-04-12
- **File:** components/widgets/Countdown/Widget.tsx:146, :153, :164
- **Detail:** Primary number display (`min(42cqh, 55cqw)`), unit label (`min(9cqh, 16cqw)`), and event name (`min(13cqh, 30cqw)`) all use separate `cqh`/`cqw` axes instead of `cqmin`. This violates the project's scaling guidelines and causes inconsistent font scaling between portrait and landscape widget orientations.
- **Fix:** Convert to `cqmin`-based sizing, e.g. `min(42cqh, 55cqw)` → `clamp(24px, 28cqmin, 120px)`. Verify at reference 300×250 dimensions after change.

### MEDIUM LunchCountWidget uses `cqh`/`cqw` separately instead of `cqmin`

- **Detected:** 2026-04-12
- **File:** components/widgets/LunchCount/Widget.tsx:405, :415-416, :425
- **Detail:** Uses `min(14cqh, 4cqw)`, `min(45cqh, 10cqw)` / `min(55cqh, 12cqw)`, and `min(10cqh, 3.5cqw)` — all mixing `cqh` and `cqw` independently. Also uses `gap-[0.5cqh]` and `mt-[1.5cqh]` Tailwind-in-square-bracket form with `cqh`, not `cqmin`.
- **Fix:** Replace with `cqmin` equivalents, e.g. `min(14cqh, 4cqw)` → `min(14px, 5cqmin)`. Test at reference 600×400 dimensions.

### MEDIUM ChecklistWidget uses `cqh`/`cqw` separately in scaling formula

- **Detected:** 2026-04-12
- **File:** components/widgets/Checklist/Widget.tsx:147-150
- **Detail:** The computed scaling function produces `textSize` using `cqh`, `iconSize` using `cqh`, `cardPadding` using a mix of `cqh` and `cqw`, and `cardGap` using `cqw`. The comment at line 140 explains the intent ("Height is always the smaller dimension, so we scale relative to cqh"), but this logic can be replaced with `cqmin` which is defined as `min(cqw, cqh)`.
- **Fix:** Replace `cqh`/`cqw` with `cqmin` throughout the scaling formula in the `buildCardStyle` helper. `cqmin` handles the "smaller dimension" case automatically.

### MEDIUM StarterPackWidget uses hardcoded Tailwind text sizes with `skipScaling: true`

- **Detected:** 2026-04-12
- **File:** components/widgets/StarterPack/Widget.tsx:96, :100
- **Detail:** Card titles use `text-sm` and descriptions use `text-xs`. The widget has `skipScaling: true` in WIDGET_SCALING_CONFIG, meaning CSS container queries are active and all text/sizing should use `cqmin`. Hardcoded Tailwind text classes are fixed in px terms and will not scale as the widget resizes.
- **Fix:** Replace `text-sm` with `style={{ fontSize: 'min(14px, 5.5cqmin)' }}` and `text-xs` with `style={{ fontSize: 'min(11px, 4cqmin)' }}`.

### MEDIUM MiniAppWidget uses hardcoded Tailwind text sizes with `skipScaling: true`

- **Detected:** 2026-04-12
- **File:** components/widgets/MiniApp/Widget.tsx:125, :129, :133, :139, :157, :178, :185, :195, :199, :206
- **Detail:** The "no app selected" and "share link" states use `text-base`, `text-sm`, `text-xs`, `font-bold` without inline `cqmin` sizing. Since MiniApp has `skipScaling: true`, these classes produce fixed-size text that does not respond to widget resize. The inner iframe content is separate and not affected, but the surrounding UI chrome does not scale.
- **Fix:** Convert text sizes in the shell UI (states before an app is loaded) to `cqmin` inline styles per project pattern. The iframe content inside an active mini-app does not need changes.

### LOW RevealGridWidget uses `text-xs` class for control labels

- **Detected:** 2026-04-12
- **File:** components/widgets/RevealGrid/Widget.tsx:164, :170
- **Detail:** "Reveal All" button label uses `text-xs` and card count label uses `text-xs`. Widget has `skipScaling: true`. While these are small UI controls, they should still scale with container queries.
- **Fix:** Replace `text-xs` with `style={{ fontSize: 'min(11px, 4cqmin)' }}` and update adjacent spacing as needed.

### MEDIUM TrafficLightWidget uses `cqh`/`cqw` separately instead of `cqmin`

- **Detected:** 2026-04-13
- **File:** components/widgets/TrafficLightWidget/Widget.tsx:36, :48, :60
- **Detail:** Each traffic light circle's size is calculated as `min(28cqh, 80cqw)` — uses separate `cqh` and `cqw` axes. In a narrow-tall widget this will produce very different results than in a wide-short widget, causing scaling inconsistency. Should use `cqmin` which automatically resolves to the smaller dimension.
- **Fix:** Replace `min(28cqh, 80cqw)` with appropriate `cqmin` equivalent, e.g. `min(56px, 20cqmin)` (preserving visual size at reference dimensions). Verify at both portrait and landscape widget aspect ratios.

### LOW NumberLineWidget uses `text-xs` for hover hint

- **Detected:** 2026-04-12
- **File:** components/widgets/NumberLine/Widget.tsx:339
- **Detail:** A hover tooltip uses `className="... text-xs ..."`. Widget has `skipScaling: true`. Even though this is a hover-only element, it should scale consistently with the widget.
- **Fix:** Replace `text-xs` with `style={{ fontSize: 'min(11px, 3.5cqmin)' }}`.

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
