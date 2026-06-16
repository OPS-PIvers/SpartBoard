# PROPOSAL F1 — WCAG AA contrast for muted slate text on the dark dashboard

**Status:** proposal-written · **Gated:** needs Paul's design sign-off (purely visual change)
**Source finding:** `docs/optimize-pass/01-accessibility-contrast.md`
**Scope of this proposal:** `ScaledEmptyState` defaults + GuidedLearning results/manager labels **on dark surfaces only**. No source file is modified by this proposal.

---

## TL;DR (decision-ready)

- I recomputed every muted value against the real `slate-900` (#0f172a) background using the WCAG 2.x relative-luminance formula (verified: black/white = 21.00:1, #777/#fff = 4.48:1).
- **The upstream doc's headline number is wrong.** It claims `text-slate-400` lands at "~2.8:1" on `slate-900`. The actual ratio is **6.96:1 — it already PASSES AA** for normal text. The genuine AA failure on dark is **`text-slate-500` (3.75:1)**, used for the `ScaledEmptyState` _title_ and the GL "Building library" pill.
- Recommended restrained upgrade: **`slate-500 → slate-200`** (3.75 → 14.48) and **`slate-400 → slate-300`** (6.96 → 12.02) for real text on dark. Decorative icons get `aria-hidden`, color unchanged. Light/student/login surfaces are untouched.
- Swatch pairs to eyeball: title `#64748b → #e2e8f0`, subtitle/labels `#94a3b8 → #cbd5e1`.

---

## 1. Contrast table (computed, WCAG 2.x formula)

Background = dark dashboard surface `slate-900` **#0f172a**. Thresholds: **4.5:1** normal text, **3:1** large text (≥18px, or ≥14px **bold**).

Many of the target labels actually render on a `bg-white/5` card (the GuidedLearning stat cards), so that effective background (**#1b2335** = white@5% over #0f172a) is shown too.

| Class       | Hex       | Ratio on #0f172a | Normal (4.5:1) | Large (3:1) | Ratio on `bg-white/5` #1b2335 | Normal  | Large   |
| ----------- | --------- | ---------------- | -------------- | ----------- | ----------------------------- | ------- | ------- |
| `slate-500` | `#64748b` | **3.75:1**       | ❌ FAIL        | ✅ PASS     | **3.30:1**                    | ❌ FAIL | ✅ PASS |
| `slate-400` | `#94a3b8` | **6.96:1**       | ✅ PASS        | ✅ PASS     | **6.12:1**                    | ✅ PASS | ✅ PASS |
| `slate-300` | `#cbd5e1` | **12.02:1**      | ✅ PASS        | ✅ PASS     | **10.57:1**                   | ✅ PASS | ✅ PASS |
| `slate-200` | `#e2e8f0` | **14.48:1**      | ✅ PASS        | ✅ PASS     | **12.73:1**                   | ✅ PASS | ✅ PASS |

**Correction to the explore doc:** `01-accessibility-contrast.md` (lines 11, 26) asserts `text-slate-400` ≈ 2.8:1 and that it "fails 4.5:1." That is incorrect on `#0f172a` — slate-400 is 6.96:1 and passes. The only class that genuinely fails AA for normal text on the dark surface is **`slate-500`**. The acceptance criteria still hold; the at-risk set is just narrower than the doc implies.

---

## 2. Proposed restrained upgrade (dark surfaces only)

Brand direction is "calm / restrained" — so the upgrade is the minimal one Tailwind-step pair that clears AA with margin and keeps the muted _hierarchy_ (title brighter than subtitle):

| Role                                  | Old         | New         | Old ratio (#0f172a) | New ratio (#0f172a) | Result   |
| ------------------------------------- | ----------- | ----------- | ------------------- | ------------------- | -------- |
| Primary muted text (title / pill)     | `slate-500` | `slate-200` | 3.75:1 ❌           | **14.48:1**         | AA + AAA |
| Secondary muted text (subtitle/label) | `slate-400` | `slate-300` | 6.96:1 ✅ (low)     | **12.02:1**         | AA + AAA |

Two notes on the slate-400 → slate-300 bump:

- slate-400 **already passes** 4.5:1, so this row is a _glanceability_ improvement (brand principle 3: "legible on a washed-out classroom projector"), not a compliance fix. It is the safer, restrained choice because it keeps a one-step gap below the new title color (200 vs 300) and preserves visual hierarchy. **Paul may elect to leave slate-400 as-is** and only fix the slate-500 failures — see Decision section.
- We deliberately do **not** go brighter than slate-200 (white would flatten the muted hierarchy and read as "heavy block," against the brand).

**Decorative icons are NOT recolored.** They get `aria-hidden` so a screen reader skips them; their slate color is irrelevant to text-contrast AA. (Several are already `aria-hidden`.)

**Light / student / login surfaces are out of scope** and must not be touched — brightening muted text _on white_ would _reduce_ its contrast.

---

## 3. Exact proposed diff (DO NOT APPLY — review gate)

### 3a. `components/common/ScaledEmptyState.tsx` — defaults (highest reach: fallback UI for 60+ widgets)

The title is `font-black` 14px (qualifies as "large," so slate-500 technically clears 3:1) — but as the most-seen muted text in the product it should clear the **normal** 4.5:1 bar comfortably. The subtitle is 12px non-bold = normal text.

```diff
-  iconClassName = 'text-slate-300',
-  titleClassName = 'text-slate-500',
-  subtitleClassName = 'text-slate-400',
+  iconClassName = 'text-slate-300',
+  titleClassName = 'text-slate-200',
+  subtitleClassName = 'text-slate-300',
```

- `titleClassName`: `slate-500 → slate-200` (3.75 → 14.48) — fixes the real AA gap.
- `subtitleClassName`: `slate-400 → slate-300` (6.96 → 12.02) — restrained glanceability bump.
- `iconClassName`: **unchanged** (`slate-300`). The icon is decorative; see icon note below.

> Icon note for the implementer: the `<Icon>` wrapper (lines 42–50) is decorative (the title already names the empty state). When this lands, add `aria-hidden` to the icon wrapper rather than recoloring it. This proposal does **not** change the icon color.

### 3b. `components/widgets/GuidedLearning/components/GuidedLearningResults.tsx` — stat labels on `bg-white/5` cards

Real, glanceable label text on a dark card. (Lines 201 and 222 are a hover-affordance back button and a spinner respectively — **not changed here**; 201 already animates to white on hover, 222 is a decorative `Loader2`.)

```diff
@@ Total stat label (line ~232)
-              <div className="text-slate-400 text-xs mt-0.5 flex items-center justify-center gap-1">
+              <div className="text-slate-300 text-xs mt-0.5 flex items-center justify-center gap-1">
                 <Users className="w-3 h-3" /> Total
@@ Done stat label (line ~240)
-              <div className="text-slate-400 text-xs mt-0.5 flex items-center justify-center gap-1">
+              <div className="text-slate-300 text-xs mt-0.5 flex items-center justify-center gap-1">
                 <CheckCircle2 className="w-3 h-3" /> Done
@@ Avg Score stat label (line ~248)
-              <div className="text-slate-400 text-xs mt-0.5">Avg Score</div>
+              <div className="text-slate-300 text-xs mt-0.5">Avg Score</div>
@@ "Question Results" heading (line ~255)
-              <h3 className="text-slate-300 text-xs font-semibold uppercase tracking-wider mb-2">
+              <h3 className="text-slate-200 text-xs font-semibold uppercase tracking-wider mb-2">
```

- 232 / 240 / 248: `slate-400 → slate-300` (12px normal text, 6.12 → 10.57 on the card). The inline `Users` / `CheckCircle2` icons are decorative — implementer should add `aria-hidden`.
- 255: this heading is already `slate-300` (passes). Bumping to `slate-200` keeps it as the brightest label in the block (section heading > stat label). **Optional** — listed for completeness; safe to skip if Paul prefers the smaller diff.

### 3c. `components/widgets/GuidedLearning/components/GuidedLearningManager.tsx` — triage of the doc's line list

The explore doc lists `773, 1013, 1103, 1166, 1221, 1341, 1350`. After inspecting the actual code, **most of these should NOT be recolored.** Triage:

| Line | Current                                   | Category                                           | Action                                         |
| ---- | ----------------------------------------- | -------------------------------------------------- | ---------------------------------------------- |
| 773  | `<BookOpen … text-slate-400 aria-hidden>` | Decorative icon, already `aria-hidden`             | **No change** (correct as-is)                  |
| 1013 | spinner container `text-slate-500`        | Colors a `Loader2` icon, not text                  | **No change** (decorative)                     |
| 1103 | spinner container `text-slate-500`        | Colors a `Loader2` icon, not text                  | **No change** (decorative)                     |
| 1166 | `<BookOpen … text-slate-400 aria-hidden>` | Decorative icon, already `aria-hidden`             | **No change** (correct as-is)                  |
| 1221 | "Building library" pill `text-slate-500`  | **Real text on dark** (uppercase bold 11px)        | **Change** `slate-500 → slate-200` (see below) |
| 1341 | "No preview image" `text-slate-400`       | Text on **light** card (`bg-slate-50`, white pane) | **No change** — out of scope (light surface)   |
| 1350 | "Mode:" `text-slate-500`                  | Text on **light** card (white pane)                | **No change** — out of scope (light surface)   |

Confirmed light-surface context for 1341/1350: the enclosing `GuidedLearningPreviewPane` body is `text-slate-700` (line 1332) inside `LibraryPreviewPane`, which is `bg-white` (`components/common/library/LibraryPreviewPane.tsx:114`). Brightening muted text there would _reduce_ contrast — leave it.

The single real change in this file:

```diff
@@ "Building library" filter pill (line ~1221)
-                  <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-widest text-slate-500">
+                  <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-widest text-slate-200">
                     <Building2 size={12} />
```

- 11px bold uppercase = "large" by WCAG, so slate-500 (3.75:1) technically clears 3:1 — but it's a status label a teacher reads, and slate-200 (14.48:1) makes it crisp on a projector. The `Building2` icon is decorative; implementer should add `aria-hidden`.

**Net:** of the 7 manager lines the doc listed, only **1** (line 1221) is a genuine text-on-dark fix; 4 are decorative icons/spinners and 2 are light-surface text.

---

## 4. Contrast-safe muted-text token

**Recommendation: introduce a documented token, lightweight.** Raw `slate-400`/`slate-500` keep getting reached for as "muted text" and `slate-500` is sub-AA on dark — a named default prevents regressions.

Lowest-friction option that fits this codebase (Tailwind + the existing "Widget Appearance Standard" in CLAUDE.md): add two semantic utility classes in the Tailwind theme / a base layer, e.g.

- `text-muted-on-dark` → `slate-300` (12.02:1) — for muted text on the dark dashboard.
- `text-strong-muted-on-dark` → `slate-200` (14.48:1) — for the brighter muted tier (titles, status pills).

Where: define alongside the brand color extensions in `tailwind.config.js`, and steer new widget code to these instead of raw `slate-400/500`. Introducing the token is **not required** to ship the fixes in §3 — it's a follow-up that makes the fix durable. If Paul wants the smallest possible change now, ship §3 with raw classes and defer the token.

**Proposed one-line CLAUDE.md addition** (under "Widget Appearance Standard"), only if the token is adopted:

> - Muted text on the **dark** dashboard surface must use `text-muted-on-dark` (slate-300, 12:1) or `text-strong-muted-on-dark` (slate-200, 14.5:1) — never raw `text-slate-400/500`, which is sub-AA (3.75:1) on `slate-900`. Decorative muted icons get `aria-hidden` instead of a contrast bump.

---

## 5. Decision needed from Paul

This is a purely **visual** change. Brand direction is "calm / restrained" — the proposed upgrade is the minimal Tailwind-step pair that clears AA while keeping the muted hierarchy (title brighter than subtitle/label). Eyeball the before/after swatches (plain hex):

| Role                          | Before (hex)        | After (hex)         | Why                                   |
| ----------------------------- | ------------------- | ------------------- | ------------------------------------- |
| Empty-state **title**         | `#64748b` slate-500 | `#e2e8f0` slate-200 | Real AA fix (3.75 → 14.48 on #0f172a) |
| Empty-state **subtitle**      | `#94a3b8` slate-400 | `#cbd5e1` slate-300 | Glanceability bump (already passed)   |
| GL stat labels (Total/Done/…) | `#94a3b8` slate-400 | `#cbd5e1` slate-300 | Glanceability bump (already passed)   |
| GL "Question Results" heading | `#cbd5e1` slate-300 | `#e2e8f0` slate-200 | Optional — keep heading brightest     |
| GL "Building library" pill    | `#64748b` slate-500 | `#e2e8f0` slate-200 | Real fix on dark (3.75 → 14.48)       |

**Three decisions:**

1. **Required fix vs. comfort bump.** Approve the _required_ slate-500 fixes (title + Building-library pill) — those are genuine AA failures. The slate-400 → slate-300 bumps are optional glanceability; approve them or tell me to leave slate-400 as-is for a smaller, more restrained diff.
2. **Token or not.** Adopt `text-muted-on-dark` / `text-strong-muted-on-dark` (§4) + the CLAUDE.md line, or defer and ship raw classes now.
3. **"Question Results" heading (§3b, line 255).** Already passes AA — bump to slate-200 for hierarchy, or leave it.

Once you pick, F1 implementation can apply §3 (plus `aria-hidden` on the decorative icons called out inline) with no further design input.

---

### Out-of-scope guardrails for the implementer (carried from the source finding)

- Triage by **actual rendered background**, not a global find-replace. ~1300 `text-slate-300/400` occurrences exist repo-wide; most are decorative icons or text on _light_ admin/student surfaces and must stay.
- Do not touch light / student / login surfaces (would _reduce_ their contrast).
- Confirm `ScaledEmptyState`'s readability surface still gives AA when rendered over a user-chosen background image.
