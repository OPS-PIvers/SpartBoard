# Widget Transparency Remediation Plan

## Goal

Make widget-level transparency controls behave logically by removing/reducing full-size **opaque inner containers** that visually override the widget window background.

---

## Scope

Based on the audit, the following widgets currently render a full-size internal background that can negate the transparency slider effect:

1. Breathing
2. Activity Wall
3. Talking Tool
4. Hotspot Image
5. Webcam
6. Number Line
7. Math Tools
8. QR Widget
9. Seating Chart
10. Music (Spotify mode)

Also noted (state-specific):

- Car Rider Pro (loading state)

---

## Design Principle for Fixes

Use this rule consistently across widgets:

- **Window shell owns background transparency**.
- Widget internals should default to `bg-transparent` at the root content layer.
- If a visual surface is needed for readability, use a **non-full-screen panel** or **subtle alpha layer** (for example, `bg-black/20` or `bg-white/30`; the `/NN` suffix controls alpha) that still respects transparency.
- Keep accessibility contrast acceptable by applying local surfaces to text/cards only (not full canvas unless required by feature semantics).

---

## Implementation Strategy

### Phase 1 — Add a safe styling pattern (optional helper)

- Introduce a shared utility/class pattern for widget roots:
  - `h-full w-full bg-transparent`
  - optional `supports-[backdrop-filter]:backdrop-blur-sm` for readability only where needed.
- Document pattern in a short comment near `WidgetLayout` usage conventions.

### Phase 2 — Widget-by-widget remediation

#### 1) Breathing

- Replace root `bg-slate-50 dark:bg-slate-900` with `bg-transparent`.
- Move readability styling to a smaller, intentional surface (e.g., controls footer only).
- Keep visuals unchanged.

#### 2) Activity Wall

- Empty state: replace full `bg-slate-50` with transparent root and a centered card panel.
- Active state: replace full `bg-white` root with transparent root + white cards/chips only.

#### 3) Talking Tool

- Root `bg-white` becomes transparent.
- Keep sidebar/content panels with their existing local backgrounds (`bg-slate-50`, `bg-white`) so usability remains.

#### 4) Hotspot Image

- Replace root full `bg-slate-900` with transparent container.
- Place dark background only behind the image frame area if needed.

#### 5) Webcam

- Root `bg-slate-950` becomes transparent.
- Retain dark overlays only on camera/video surfaces and modal overlays.

#### 6) Number Line

- Root `bg-white` becomes transparent.
- Put optional white panel behind SVG only if marks become hard to read.

#### 7) Math Tools

- `contentClassName` currently includes `bg-white`; switch to transparent.
- Keep white backgrounds at tool cards/panels where needed.

#### 8) QR Widget

- Inner full-size `bg-white` panel should become either:
  - transparent, or
  - reduced to a padded card that does not occupy entire window.
- Preserve QR readability and scanning contrast.

#### 9) Seating Chart

- Canvas root `bg-white` becomes transparent or lightly tinted.
- If grid readability drops, use a subtle translucent layer (not opaque white).

#### 10) Music (Spotify mode)

- Replace full-size `bg-black` with transparent root.
- Keep contrast treatment in content overlays only.

#### 11) Car Rider Pro (loading state)

- Change loading state surface from full-size `bg-slate-50` to transparent with centered loader chip/card.

---

## Suggested Work Breakdown (PR slicing)

### PR A — Low-risk visual-only roots

- Breathing
- Activity Wall
- Talking Tool
- Car Rider Pro (loading)

### PR B — Media-heavy widgets

- Hotspot Image
- Webcam
- Music (Spotify mode)

### PR C — Academic/tooling widgets

- Number Line
- Math Tools
- QR Widget
- Seating Chart

This split reduces regression blast radius and simplifies review.

---

## Validation Plan

### Manual QA

For each remediated widget:

1. Add widget to board.
2. Set transparency slider to low/medium/high.
3. Verify board background is visibly affected through widget interior.
4. Verify text/icon contrast remains accessible.
5. Verify core interactions still work.

### Automated / existing quality gates

- `pnpm run lint`
- `pnpm run type-check:all`
- `pnpm run format:check`
- `pnpm run test`

### Optional E2E additions

Add a lightweight Playwright visual assertion pattern:

- Set widget transparency to a known value.
- Assert widget content root does **not** contain known opaque background classes.
- Snapshot compare for at least one widget from each PR slice.

---

## Risk & Mitigation

- **Risk:** readability loss on bright/busy board backgrounds.
  - **Mitigation:** introduce local translucent cards/pills, not full-size fills.

- **Risk:** visual drift for camera/music widgets.
  - **Mitigation:** preserve per-element overlays, remove only root opaque fill.

- **Risk:** unintentional style regressions across size modes.
  - **Mitigation:** test at small/medium/large widget sizes and landscape/portrait container query states.

---

## Definition of Done

A widget is done when:

- Its root content no longer uses a full-size opaque fill that masks transparency.
- Transparency slider changes are visibly meaningful in normal usage.
- Lint/typecheck/format/tests pass.
- Any readability tradeoffs are resolved with local, non-full-size surfaces.
