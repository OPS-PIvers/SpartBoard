# Widget Registry Consistency — Scheduled Task Journal

_Audit model: claude-sonnet-4-6_
_Action model: claude-opus-4-6_
_Audit cadence: daily_
_Last audited: 2026-05-19_
_Last action: 2026-05-15_

---

## In Progress

_Nothing currently in progress._

---

## Open

_2026-05-19: Full audit of all 63 WidgetType values. types.ts WidgetType union unchanged (still 63 types). Recent commits since 2026-05-18: Sidebar Cohesion Pass (89b66431 — modal UI only), feat(music) 94f21d0f (adds `MusicSource` union type and new fields to `MusicConfig` — no new WidgetType member), fix(text-widget) 2109d9b1, feat(whats-new) 0fbbea46, fix(styles) 8c51c322, docs(changelog) a0710f91, quiz teacher-unlock 5c5eb1d7, board-nav-fab overhaul (multiple commits). None touched WidgetRegistry.ts, widgetDefaults.ts, tools.ts, or widgetGradeLevels.ts. Zero new gaps. All lazyNamed() export names remain correct. No open items._

_2026-05-18: Full audit of all 63 WidgetType values. types.ts WidgetType union unchanged (still 63 types). Recent commits since 2026-05-17: feat(whats-new) 8e86f851, fix(soundwidget) 6bf370df, fix(quiz-results-protection) 0f81a137, fix(number-line-cqmin) 8b91d650, feat(collection-level-templates) 516ab8dc (added 84 lines to types.ts — new CollectionTemplate interfaces; no new WidgetType members), chore(comments) 56dac1ca. None touched WidgetRegistry.ts, widgetDefaults.ts, tools.ts, or widgetGradeLevels.ts. Zero new gaps. All lazyNamed() export names remain correct. No open items._

_2026-05-17: Full audit of all 63 WidgetType values. types.ts WidgetType union unchanged (still 63 types). Recent commits since 2026-05-16: perf(functions) 0c0457f3, feat(Collection-level-sharing) 2f8d6751, fix(collections-polish) 6dccd37a/e490fa79/debe426f, feat(quiz-screenshot-protection) 2bf54e9d. None touched WidgetRegistry.ts, widgetDefaults.ts, tools.ts, or widgetGradeLevels.ts. Zero new gaps. All lazyNamed() export names remain correct. No open items._

_2026-05-16: Full audit of all 63 WidgetType values. types.ts WidgetType union unchanged (still 63 types). Recent commits since 2026-05-15: feat(Collections+Boards) f691e285, fix(editors) d50460d0/2a2ba441, fix(activity-wall-gallery) 6b6b77c1, fix(text-widget) f4a8315b, fix(quiz-student/quiz/grader) dc682704/e49bf415/e5b63444/fa928a62/d9f2ed10, feat(grader) 361dda84, feat(quiz) e15bde39, feat(publish-scores) c6edb29c, fix(embed) 1894d043, fix(subs) 08f13588. None touched WidgetRegistry.ts, widgetDefaults.ts, tools.ts, or widgetGradeLevels.ts. Zero new gaps. All lazyNamed() export names remain correct. No open items._

_2026-05-15: Full audit of all 63 WidgetType values. types.ts WidgetType union unchanged (still 63 types, lines 1–64). No new widget types or registry entries added. Recent commits verified: random redesign (`feat(random)` ×2, `b0b11656`, `f8fb1e6b`) added new sub-components (RandomGroups, StudentChip, UnassignedTray, GroupSizeStepper) but no new WidgetType — `RandomWidget` and `RandomSettings` export names in lazyNamed() still match source. Substitute share (`c42faa9d`) added `SubstituteShareFields` and `substitute` to `SharedBoardIntendedMode` — no WidgetType change. Quiz-written overhaul (`7de28fe7`) and other commits: no new widget types. WidgetRegistry.ts, widgetDefaults.ts, tools.ts, widgetGradeLevels.ts all unchanged since 2026-05-14 audit. Two existing LOW open items remain valid._

_2026-05-14: Full audit of all 63 WidgetType values against all seven registration locations. Zero new gaps. All lazyNamed() export names verified — RevealGrid intentionally uses generic `'Widget'` export via index.ts aliased re-export (confirmed correct per prior audits). No new widget types added since yesterday. Two existing LOW open items remain valid._

_2026-05-13: Full audit of all 63 WidgetType values (`stations` confirmed at line 64 of types.ts; prior extractions stopped at line 63 and missed it). All seven registration locations cross-referenced — zero new gaps. WIDGET_SCALING_CONFIG is `Record<WidgetType, ScalingConfig>` enforced exhaustive by TypeScript. StationsAppearanceSettings confirmed registered. RevealGrid aliased exports (`Widget`/`Settings`) correct. Two existing LOW open items remain valid._

_2026-05-12: Full audit of all 63 WidgetType values against WIDGET_COMPONENTS, WIDGET_SETTINGS_COMPONENTS, WIDGET_APPEARANCE_COMPONENTS, WIDGET_SCALING_CONFIG, widgetDefaults.ts, tools.ts, and widgetGradeLevels.ts. Zero new gaps found. All recently added widgets (`stations`, `need-do-put-then`, `blooms-detail`, `blooms-taxonomy`) confirmed in all locations. RevealGrid aliased exports (`Widget`/`Settings` via index.ts re-export) confirmed correct. Two existing LOW open items (stickers and blooms-detail missing from WIDGET_SETTINGS_COMPONENTS) remain valid — see Open section._

_2026-05-06: All WidgetType values verified against WIDGET_COMPONENTS, WIDGET_SETTINGS_COMPONENTS, WIDGET_SCALING_CONFIG, widgetDefaults.ts, tools.ts, and widgetGradeLevels.ts. No new gaps found. TimeTool ±button additions, URL widget overhaul, and BlendingBoard expansion all correctly registered. `stations`, `need-do-put-then`, `blooms-detail`, `blooms-taxonomy` — all confirmed._

_2026-05-05: `blending-board` (added in dev-paul merge) verified fully registered in all locations; export names match source files. No new registry gaps from the merge._

_No open items as of 2026-05-15 action._

---

## Completed

### LOW `stickers` and `blooms-detail` missing from `WIDGET_SETTINGS_COMPONENTS`

- **Detected:** 2026-04-14 (stickers), 2026-04-17 (blooms-detail)
- **Completed:** 2026-05-15
- **File:** components/widgets/WidgetRegistry.ts
- **Detail:** Both widget types had entries in `WIDGET_COMPONENTS` and `WIDGET_SCALING_CONFIG` but were absent from `WIDGET_SETTINGS_COMPONENTS`. For `stickers`, all configuration lives in the appearance panel (`StickerBookAppearanceSettings`, surfaced on the flip panel's "Style" tab); the flip-panel "Settings" tab falls back to the standard "Standard settings available." placeholder rendered by `WidgetRenderer.tsx:169-173`. For `blooms-detail`, the widget is a read-only companion spawned programmatically by `blooms-taxonomy` with no per-instance configuration. Both omissions were intentional but undocumented — a developer adding a new widget might assume an entry was missed.
- **Resolution:** Chose option (a) — added a JSDoc block on the `WIDGET_SETTINGS_COMPONENTS` export in `components/widgets/WidgetRegistry.ts` documenting that the map is intentionally not exhaustive over `WidgetType`. The note explicitly calls out `stickers` (appearance-panel-only on the "Style" tab; flip-panel "Settings" tab shows the standard fallback face), `blooms-detail` (read-only companion managed by parent), `sticker` (cross-referenced to the `WIDGET_COMPONENTS` JSDoc), and `onboarding` (one-time system widget — already documented inline). Documentation-only change — no behavioral impact. `pnpm exec tsc --noEmit`, `pnpm exec eslint components/widgets/WidgetRegistry.ts --max-warnings 0`, and `pnpm exec prettier --check components/widgets/WidgetRegistry.ts` all clean.

### LOW `config/tools.ts` lacks documentation of intentionally-excluded `WidgetType`s

- **Detected:** 2026-04-12 (catalyst sub-types), 2026-04-12 (mathTool/onboarding/custom-widget), 2026-05-01 (blooms-detail)
- **Completed:** 2026-05-02
- **File:** config/tools.ts
- **Detail:** Six `WidgetType`s are fully registered elsewhere (WIDGET_COMPONENTS, widgetDefaults.ts, widgetGradeLevels.ts) but intentionally absent from `config/tools.ts` because they are not user-selectable from the Dock: `catalyst-instruction` and `catalyst-visual` (spawned by `catalyst`), `blooms-detail` (spawned by `blooms-taxonomy`), `mathTool` (spawned by the `mathTools` palette), `custom-widget` (created via Custom Widget system), and `onboarding` (one-time system widget). Each omission was deliberate but undocumented — a developer adding a new sub-widget could mistakenly conclude they needed a tools.ts entry.
- **Resolution:** Added a JSDoc block above the `TOOLS` export in `config/tools.ts` explaining that the catalog is intentionally not exhaustive over `WidgetType` and listing each excluded type with the reason it is excluded. Also referenced `sticker`, which is handled via the `WidgetRenderer` special-case branch (already documented in the prior `WIDGET_COMPONENTS` comment, surfaced here for completeness). Documentation-only change — no behavioral impact. `pnpm type-check`, `pnpm exec eslint config/tools.ts --max-warnings 0`, and `pnpm exec prettier --check config/tools.ts` all clean.

### LOW `sticker` widget bypasses WIDGET_COMPONENTS via WidgetRenderer special-case

- **Detected:** 2026-04-12
- **Completed:** 2026-04-26
- **File:** components/widgets/WidgetRegistry.ts, components/widgets/WidgetRenderer.tsx:271-273
- **Detail:** `sticker` is a valid WidgetType in types.ts and has entries in widgetDefaults.ts and WIDGET_SCALING_CONFIG, but is intentionally absent from WIDGET_COMPONENTS and WIDGET_SETTINGS_COMPONENTS. WidgetRenderer handles it via a hard-coded branch (`if (widget.type === 'sticker') return <StickerItemWidget ... />`). This special-casing bypasses the standard registry pattern and is a silent failure point if any other code looks up WIDGET_COMPONENTS['sticker'].
- **Resolution:** Chose option (b) — added a JSDoc block on the `WIDGET_COMPONENTS` export in `components/widgets/WidgetRegistry.ts` documenting that the map is intentionally not exhaustive over all `WidgetType`s. The note specifically calls out `sticker` (handled via the hard-coded branch in `WidgetRenderer.tsx:271-273`), warns against adding a `sticker` entry without also removing the special-case branch, and tells future developers to handle the `undefined` case at call sites. Documentation-only change — no behavioral impact, all 1476 tests still pass; `pnpm type-check`, `pnpm lint --max-warnings 0`, and `pnpm format:check` all clean.
