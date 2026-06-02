# Skill File Freshness — Scheduled Task Journal

_Audit model: claude-sonnet-4-6_
_Action model: claude-opus-4-6_
_Audit cadence: weekly — Tuesday_
_Last audited: 2026-06-02_
_Last action: 2026-05-26_

---

## In Progress

_Nothing currently in progress._

---

## Open

_2026-06-02: Skill files NOT accessible at `/mnt/skills/user/` in this environment. Codebase-side verifications performed: (1) `SpecialistSchedule/` still contains `SpecialistScheduleWidget.tsx`, `Settings.tsx`, `index.ts`, `utils.ts` — `Widget.tsx` still absent; MEDIUM item about non-existent `SpecialistScheduleSettings.tsx` remains valid. (2) `FeaturePermissionsManager.tsx` exclusion array (lines ~941–953) still contains the same 13 hardcoded types as 2026-05-26 — LOW item #1 remains valid. (3) `FeatureConfigurationPanel.tsx` `BUILDING_CONFIG_PANELS` now has 38 entries (up from the 2026-05-19 checklist addition; `checklist` confirmed present at line 98, `classes`, `smartNotebook`, `recessGear`, `countdown`, `embed`, `poll`, `qr`, `drawing`, `breathing`, `numberLine`, `mathTools`, `nextUp`, `countdown` all present). The LOW item #2 about undocumented secondary exclusion gate remains valid and more stale as the map grows. (4) lazyNamed() convention confirmed correct across WidgetRegistry.ts. All 3 open items remain valid. No new stale references introduced._

_2026-05-26 action: Fixed MEDIUM `spart-new-widget` reference to non-existent `SpecialistSchedule/Widget.tsx` (PR pending against dev-paul). Item moved to Completed. 3 open items remain (1 MEDIUM, 2 LOW)._

_2026-05-26: Skill files NOT accessible at `/mnt/skills/user/` in this environment. Codebase-side verifications performed: (1) `SpecialistSchedule/` still contains `SpecialistScheduleWidget.tsx`, `Settings.tsx`, `index.ts` — `Widget.tsx` still absent; MEDIUM item #1 remains valid. (2) `FeaturePermissionsManager.tsx` exclusion array (lines 941–953) still contains the same 13 hardcoded types as 2026-05-12/19 — LOW item #1 remains valid. (3) `FeatureConfigurationPanel.tsx` `BUILDING_CONFIG_PANELS` has grown: `checklist` was added since 2026-05-19 (new `ChecklistConfigurationPanel.tsx`). The LOW item #2 about the undocumented secondary exclusion gate remains valid and slightly more stale now that `checklist` is present in the panel map. (4) lazyNamed() convention confirmed correct across WidgetRegistry.ts. All 4 open items remain valid. No new stale references introduced by recent commits._

_2026-05-19: Skill files ARE accessible at `/mnt/skills/user/` in this environment (unlike prior runs at 2026-05-12). Both skill files read and verified. Codebase-side verification confirms: `components/widgets/SpecialistSchedule/` contains `SpecialistScheduleWidget.tsx`, `Settings.tsx`, and `index.ts` — there is NO `Widget.tsx`. This means the MEDIUM open item referencing `SpecialistSchedule/Widget.tsx` remains valid. Similarly `SpecialistScheduleSettings.tsx` does not exist (actual path: `components/widgets/SpecialistSchedule/Settings.tsx`) — MEDIUM item #2 remains valid. `FeaturePermissionsManager.tsx` exclusion array (lines 941–953) contains 13 types — LOW item #1 remains valid (array in skill still outdated). `FeatureConfigurationPanel.tsx` secondary exclusion gate undocumented in skill — LOW item #2 remains valid. lazyNamed() convention confirmed correct. No new stale references detected. All 4 open items remain valid._

_2026-05-12: Skill files not accessible at `/mnt/skills/user/` in this audit environment (path does not exist). Codebase-side verifications performed: (1) `SpecialistSchedule/SpecialistScheduleWidget.tsx` still exists; the directory contains `SpecialistScheduleWidget.tsx`, `Settings.tsx`, and `index.ts` — Widget.tsx still absent. (2) `FeaturePermissionsManager.tsx` exclusion array (lines 939–953) now contains 13 types: `blooms-taxonomy`, `calendar`, `catalyst`, `graphic-organizer`, `instructionalRoutines`, `miniApp`, `music`, `pdf`, `specialist-schedule`, `starter-pack`, `stickers`, `video-activity`, `work-symbols`. The skill example remains stale. (3) `lazyNamed()` convention confirmed correct across WidgetRegistry.ts. All four open items remain valid._

_2026-05-05: Skill files not accessible at `/mnt/skills/user/` in this audit environment. Codebase-side verifications performed: `SpecialistSchedule/SpecialistScheduleWidget.tsx` still exists (Widget.tsx does not); `FeaturePermissionsManager.tsx` exclusion list still omits the 7 types noted in the LOW item below; `FeatureConfigurationPanel.tsx` secondary exclusion gate still undocumented in skill. `blending-board` was added to `BUILDING_CONFIG_PANELS` in `FeatureConfigurationPanel.tsx` this week — the exclusion-list LOW item is now more stale. All four open items remain valid._

### MEDIUM `spart-widget-admin-config` references non-existent `SpecialistScheduleSettings.tsx`

- **Detected:** 2026-04-14
- **File:** `.claude/skills/admin-widget-config/SKILL.md` — "How Configs Reach the Widget" section
- **Detail:** The skill references `SpecialistScheduleSettings.tsx` as a working example of how to read `featurePermissions` in a widget settings component. No file named `SpecialistScheduleSettings.tsx` exists anywhere in the codebase. The correct path is `components/widgets/SpecialistSchedule/Settings.tsx`. The pattern itself is valid and the code works, but a developer following the skill literally cannot find the referenced file.
- **Fix:** Update the skill to reference `components/widgets/SpecialistSchedule/Settings.tsx` (not `SpecialistScheduleSettings.tsx`).

### LOW `spart-widget-admin-config` exclusion array example is missing 7 widget types

- **Detected:** 2026-04-14
- **File:** `.claude/skills/admin-widget-config/SKILL.md` — Path A wiring code example
- **Detail:** The skill shows this exclusion array in the `FeaturePermissionsManager.tsx` wiring example:
  ```
  !['instructionalRoutines', 'stickers', 'calendar', 'specialist-schedule', 'miniApp', 'starter-pack', 'your-widget-type']
  ```
  The actual array in `components/admin/FeaturePermissionsManager.tsx` (lines 941–953) is significantly longer and includes 7 additional types added since the skill was written: `blooms-taxonomy`, `catalyst`, `graphic-organizer`, `music`, `pdf`, `video-activity`, `work-symbols`. A developer following the example literally would insert their widget type into an outdated list and potentially misunderstand the full scope of widgets with dedicated config modals.
- **Fix:** Update the skill's code example to match the current exclusion array, or replace the hardcoded list in the example with a comment like `// ...existing widget types with dedicated modals...` so the example is not tied to a specific snapshot.

### LOW `spart-widget-admin-config` does not document hardcoded exclusion list in `FeatureConfigurationPanel.tsx`

- **Detected:** 2026-04-14
- **File:** `.claude/skills/admin-widget-config/SKILL.md` — Path B description
- **Detail:** `components/admin/FeatureConfigurationPanel.tsx` (lines 688–700) contains a hardcoded widget-type exclusion list: `['calendar', 'expectations', 'guided-learning', 'instructionalRoutines', 'miniApp', 'quiz', 'stickers', 'talking-tool', 'weather', 'webcam', ...Object.keys(BUILDING_CONFIG_PANELS)]`. These widgets show custom panels or full-screen modals within `GenericConfigurationModal`. The skill describes Path B but does not mention this secondary exclusion gate. For most new widgets the `BUILDING_CONFIG_PANELS` registration handles exclusion automatically, but if a developer needs to know why certain widgets disappear from the generic modal, this list is the missing context.
- **Fix:** Add a note in the skill's Path B section explaining this secondary exclusion list and its purpose.

---

## Completed

### MEDIUM `spart-new-widget` references non-existent `SpecialistSchedule/Widget.tsx`

- **Detected:** 2026-04-14
- **Completed:** 2026-05-26
- **File:** `.claude/skills/new-widget/SKILL.md` — "Building-defaults consumption" reference table row
- **Detail:** The skill's gold-standard reference table listed `components/widgets/SpecialistSchedule/Widget.tsx` as the "Building-defaults consumption" example. That file does not exist. The actual component is `components/widgets/SpecialistSchedule/SpecialistScheduleWidget.tsx` — SpecialistSchedule is the only widget that uses a named-file pattern inside its subdirectory instead of the standard `Widget.tsx` convention.
- **Resolution:** Updated the reference table row to point to the correct path `components/widgets/SpecialistSchedule/SpecialistScheduleWidget.tsx` and added an inline parenthetical noting that this is the sole exception to the `Widget.tsx` naming convention and should not be imitated. Documentation-only change.
