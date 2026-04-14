# Skill File Freshness — Scheduled Task Journal

_Audit model: claude-sonnet-4-6_
_Action model: claude-opus-4-6_
_Audit cadence: weekly — Tuesday_
_Last audited: 2026-04-14_
_Last action: never_

---

## In Progress

_Nothing currently in progress._

---

## Open

### MEDIUM `spart-new-widget` references non-existent `SpecialistSchedule/Widget.tsx`

- **Detected:** 2026-04-14
- **File:** `.claude/skills/new-widget/SKILL.md` — "Building-defaults consumption" reference table row
- **Detail:** The skill's gold-standard reference table lists `components/widgets/SpecialistSchedule/Widget.tsx` as the "Building-defaults consumption" example. This file does not exist. The actual component is `components/widgets/SpecialistSchedule/SpecialistScheduleWidget.tsx` — SpecialistSchedule is the only widget that uses a named-file pattern inside its subdirectory instead of the standard `Widget.tsx` convention. Developers following the skill's reference will get a 404 when they try to open the file.
- **Fix:** Update the skill reference table to point to `components/widgets/SpecialistSchedule/SpecialistScheduleWidget.tsx`. Consider also noting in the skill that this widget is the sole exception to the `Widget.tsx` naming convention and should not be imitated.

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
  The actual array in `components/admin/FeaturePermissionsManager.tsx` (lines 919–933) is significantly longer and includes 7 additional types added since the skill was written: `blooms-taxonomy`, `catalyst`, `graphic-organizer`, `music`, `pdf`, `video-activity`, `work-symbols`. A developer following the example literally would insert their widget type into an outdated list and potentially misunderstand the full scope of widgets with dedicated config modals.
- **Fix:** Update the skill's code example to match the current exclusion array, or replace the hardcoded list in the example with a comment like `// ...existing widget types with dedicated modals...` so the example is not tied to a specific snapshot.

### LOW `spart-widget-admin-config` does not document hardcoded exclusion list in `FeatureConfigurationPanel.tsx`

- **Detected:** 2026-04-14
- **File:** `.claude/skills/admin-widget-config/SKILL.md` — Path B description
- **Detail:** `components/admin/FeatureConfigurationPanel.tsx` (lines 682–694) contains a hardcoded widget-type exclusion list: `['calendar', 'expectations', 'guided-learning', 'instructionalRoutines', 'miniApp', 'quiz', 'stickers', 'talking-tool', 'weather', 'webcam', ...Object.keys(BUILDING_CONFIG_PANELS)]`. These widgets show custom panels or full-screen modals within `GenericConfigurationModal`. The skill describes Path B but does not mention this secondary exclusion gate. For most new widgets the `BUILDING_CONFIG_PANELS` registration handles exclusion automatically, but if a developer needs to know why certain widgets disappear from the generic modal, this list is the missing context.
- **Fix:** Add a note in the skill's Path B section explaining this secondary exclusion list and its purpose.

---

## Completed

_No completed items yet._
