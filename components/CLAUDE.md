# UI design context

Loaded when working under `components/`.

## Text contrast and motion

- Muted text on dark surfaces (dashboard `slate-900` / semi-transparent widgets over user backgrounds): use `text-slate-300` for body/label text and `text-slate-200` for headings/emphasis (both clear WCAG AA on `slate-900`). Do NOT use `text-slate-400`/`text-slate-500` for real text on dark surfaces — once rendered over translucent/over-background surfaces they erode below the AA 4.5:1 minimum. `text-slate-400`/`500` stay fine for (a) decorative/icon glyphs (give purely decorative icons `aria-hidden`) and (b) text on LIGHT surfaces (admin/library/student/login UI), where bumping toward white would REDUCE contrast — leave those untouched.
- A global `prefers-reduced-motion` rule (Tailwind base-layer plugin in `tailwind.config.js`) disables decorative/looping animations. Urgency signals are color-based, not animation-based. Don't reintroduce always-on looping animations without a `motion-reduce:` guard.
- Backgrounds can be a Tailwind class string OR a URL/data URI (handled in `components/layout/DashboardView.tsx`); custom backgrounds are set via inline style, not className.

## On-screen copy

Permanent helper text was cut across the app in September 2026 (`docs/plans/shipped/ALWAYS_VISIBLE_COPY.md`), so don't add it back.

- A label and its control need no sentence under them. Add a hint only when it states a prerequisite ("Signed-in students only."), a number or limit the label lacks, or the consequence of a destructive action.
- Detail that is needed but rarely goes in the control's `title` tooltip, not in a new permanent line.
- Empty states get a title and at most one short sentence naming the next action.
- No em dashes, "Tip:" or "Note:" boxes, marketing words, or mechanics (Firestore, JSON, CSS, sync internals, flag names) in UI text. Run `deslop --writing` on new strings.
- `tests/copyGuard.test.ts` fails on new em dashes, Tip/Note prefixes and strings over 30 words. Shorten the string. Never add to `tests/fixtures/copyGuardBaseline.json`, which may only shrink.

## Design Context

### Users

Teachers (K-12) managing live classrooms on projected screens, tablets, and desktops. They are often multitasking -- running a lesson, managing behavior, and tracking time simultaneously. The tool must be instantly legible at a glance, even from across a room on a projector. Students interact through separate lightweight views (quiz, activity wall, guided learning) on personal devices.

### Brand Personality

**Clean. Professional. Calm.**
SpartBoard is the quiet, competent tool that just works. It doesn't demand attention -- it gives teachers control. Every surface should feel considered and deliberate, never cluttered or decorative for decoration's sake.

### Aesthetic Direction

- **Visual tone**: Premium, restrained, Apple/Arc Browser-caliber polish. Surfaces feel like frosted glass (glassmorphism is already the core visual language). Generous whitespace, subtle depth via shadows and blur, minimal ornamentation.
- **Theme**: Dark mode primary (slate-900 base), light mode for student-facing and login screens. Widgets float on transparent/glass surfaces over user-chosen backgrounds.
- **Typography**: Lexend for UI (clean, high-legibility), Patrick Hand for classroom warmth where appropriate. Type hierarchy is the primary tool for visual organization -- not borders, dividers, or heavy color blocks.
- **Color**: Brand blue (#2d3f89) and brand red (#ad2122) as anchors. Widget accent colors from the Tailwind palette. Color is used sparingly and purposefully -- to indicate state, draw attention, or differentiate widgets. Never decorative noise.
- **Motion**: Subtle and purposeful. Transitions ease state changes; nothing bounces, jiggles, or pulses unless it's communicating urgency (e.g., timer alarm). Respect `prefers-reduced-motion`.
- **Anti-references**: Must NOT feel overwhelming like Canva. No rainbow palettes, no competing visual elements, no "everything is customizable" overload. Also not sterile like a spreadsheet -- the glassmorphism and careful shadows provide warmth without clutter.

### Design Principles

1. **Clarity over cleverness** -- Every element earns its place. If it doesn't help the teacher understand or act, remove it. UI should be self-explanatory; if you need a tooltip, the design isn't done.

2. **Calm confidence** -- The interface should feel like a deep breath. Neutral surfaces, consistent spacing, predictable interactions. Teachers are managing 30 kids -- the tool must never add cognitive load.

3. **Glanceable at distance** -- Content must be legible on a projected screen from across a classroom. Strong type hierarchy, high contrast where it matters, container-query scaling that actually fills the widget. No tiny metadata that only works on a laptop.

4. **Purposeful restraint** -- Use color, motion, and decoration only when they communicate something. A red badge means something is wrong. A subtle fade means something changed. Silence is the default.

5. **Premium materiality** -- Glassmorphism, soft shadows, and backdrop blur create depth without heaviness. Surfaces feel like they exist in physical space -- layered, translucent, real. This is the visual signature that makes SpartBoard feel high-end.

### Accessibility Baseline

- **WCAG AA compliance** as the minimum standard
- Sufficient contrast ratios on all text (4.5:1 for normal text, 3:1 for large text)
- Keyboard navigation support for all interactive elements
- Respect `prefers-reduced-motion` -- disable non-essential animations
- Focus indicators visible on all interactive elements
- Screen reader labels on icon-only buttons
- Projector-friendly: designs must hold up on washed-out, low-contrast display environments
