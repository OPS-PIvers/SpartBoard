# Always-visible copy cleanup

Status: audit done 2026-09-25. Implementation waits for Paul's go-ahead on the phases and the four decisions at the end.

Paul asked for a full audit of the helper text, hints, tips, subtitles and notices that sit permanently on screen, because earlier Claude models wrote long sentences to say simple, objective things. This doc is the plan. The per-area findings, with every string, its location and a proposed replacement, are in [`copy-audit/`](copy-audit/).

| Area                                                                                            | Findings file                                       | Permanent findings                  |
| ----------------------------------------------------------------------------------------------- | --------------------------------------------------- | ----------------------------------- |
| Admin panel                                                                                     | [admin.md](copy-audit/admin.md)                     | about 190                           |
| Widgets other than Quiz and Guided Learning, including every widget's legacy settings panel     | [widgets.md](copy-audit/widgets.md)                 | about 95                            |
| PLC                                                                                             | [plc.md](copy-audit/plc.md)                         | about 55                            |
| App shell (sidebar, settings modal, share, assign, classes, add-ons, subs portal, student apps) | [shell.md](copy-audit/shell.md)                     | about 55                            |
| Quiz widget and student quiz app                                                                | [quiz.md](copy-audit/quiz.md)                       | about 55, plus about 85 conditional |
| Guided Learning, Help Center and live tours                                                     | [guided-learning.md](copy-audit/guided-learning.md) | about 45                            |

Roughly 500 permanent strings are flagged, and a little over half of them should be deleted outright rather than rewritten. Another 150 or so are empty states, dialogs and errors that are too long but only appear in one state. Each findings file also lists the strings that look long but should stay, with the reason.

## How the audit was run

A TypeScript AST pass extracted every string a user can see from `components/` and `App.tsx`, meaning JSX text, text-bearing props and `t()` calls resolved against `locales/en.json`. That produced about 7,300 strings, of which 346 run to 15 words or more and 143 contain an em dash. Six reviewers then read every surface in context against the `deslop` standard, sorted each string by when it is on screen, and added the permanent helper lines the extractor missed, such as strings held in config arrays and settings schemas.

Legal pages, quiz and lesson content, and seed data are out of scope.

## What the copy does wrong

The same seven habits account for nearly every finding.

1. **A sentence under the label that repeats the label.** "Show correct answer on board" sits above "Display correct answer on the projected screen", and "Sound Effects" above "Chimes, ticks, and fanfares during the quiz". This is the largest single pattern.
2. **Narrating how the app works.** "Boards are saved as JSON files in your Drive", "These are injected as CSS variables", "persisted to Firestore when you click Save", "The file is read on this computer and never uploaded."
3. **Explaining the control right next to it.** A paragraph explaining the Verify button that sits directly above it, or "Where do you want to assign this quiz?" in a modal titled Assign whose three cards are the three answers.
4. **Release notes left in the UI.** Global Settings has 40 feature descriptions and about 25 of them run 3 to 6 sentences, ending "Admin-only until this is saved and opened up." (16 times) or "Fail-closed" (7 times).
5. **The same explanation written more than once.** "Students will pick their period when joining" appears in 4 places, the building-defaults paragraph is pasted into 17 admin panels, and the Synced / View-only / Copy explanations exist in two share modals with different wording.
6. **Internal names and wrong facts leaking through.** "(A7)" is a plan decision id shown to teachers, the text says "wire format separator", "Current view: editor" shows a raw view id, and "click the kebab" is dev slang. The Remote Control menu says "this board" for a setting that is account-wide, and a PLC empty state points to a "Shared Data" tab that is now called Assessments.
7. **Banned punctuation and framing.** 143 visible strings use em dashes, and there are in-sentence semicolons and colons, "Tip:", "Pro-tip:" and "Note:" boxes, and static help styled as a solid blue alert.

## Worst surfaces

Teachers see these often.

- **Legacy widget settings.** The panel teachers see renders each widget's `settings.schema.ts`. Every schema `help:` line renders permanently (25 fields in 16 widgets). The partner-widget card adds "Add a … widget to …" whenever the partner widget is missing, which is most of the time, and Timer stacks five of these.
- **Assign modals and the Quiz Settings tab.** About 14 toggles each carry a grey hint, and the same panel appears again inside the Assign dialog.
- **Quiz editor.** The Stimuli tab has a solid blue explainer box plus a detail pane that holds only a paragraph, and the Settings tab's right pane is also just a paragraph.
- **Settings modal.** Behavior says the same thing three times, once in the section description, once in the "All boards" chip and once in a "Tip:" box. Profile has about nine sentences on one pane.
- **Sidebar pages.** Google Drive has an intro, a status pair and a numbered "How it works" list about JSON files, and My Classes and My PLCs each open with a paragraph.
- **Share modals.** Every mode card has a long body, and every field in substitute mode has a hint.

Teachers see these less often, but they are the densest.

- **Paper-sheet modals** (print, scan import, read test paper). Almost every step opens and closes with two or three sentences of mechanism.
- **PLC.** The Settings toggles, three copies of the import modal with two paragraphs each, up to five stacked banners in the teammate print modal, and a sentence under every Meeting Mode step heading.
- **Guided Learning classic editor and AI generator.** These include a 70-word tooltip about render timing and "Gemini will analyze them together and draft a guided learning experience".

In the admin panel, Paul sees these daily.

- **Global Settings.** 40 descriptions, an amber "No saved settings" banner repeated on every unsaved card, and a `MinTierSelect` hint repeated on every card.
- **The building-defaults paragraph** in 17 widget config panels, the Rollouts panel descriptions, which copy Global Settings, the Organization page blurbs, and the Announcements editor, which has a sentence under nearly every option.

## Where one edit fixes many strings

These are shared components and data arrays, so fixing each one once clears a whole class of findings. Phase 2 works through them.

| Fix point                                                  | File                                                                                               | Reach                                                                                                                                        |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `ToggleRow` `hint`                                         | `components/common/library/AssignmentSettingsToggleGroup.tsx`                                      | 48 `hint=` call sites. It covers every assign modal, the Quiz and Video Activity settings, the Activity Wall editor and the PLC assign slot. |
| `AttemptLimitRow` default hint                             | same file                                                                                          | It shows on every assign unless a caller overrides it.                                                                                       |
| Schema `help:`                                             | `components/settings/renderer/FieldRenderer.tsx:173`                                               | 25 to 29 fields across 16 widget schemas, in both the legacy panel and the drawer.                                                           |
| `missingHelp` on the partner card                          | `components/settings/PartnerCardFrame.tsx:53`                                                      | 14 partner cards.                                                                                                                            |
| `SettingsSectionHeader` `description`                      | `components/settingsModal/SettingsSectionHeader.tsx`                                               | 5 Settings sections.                                                                                                                         |
| `GLOBAL_FEATURES[].description`                            | `components/admin/GlobalPermissionsManager.tsx:86-358`                                             | 40 feature cards.                                                                                                                            |
| `MinTierSelect` hint and the unsaved-settings banner       | `components/admin/MinTierSelect.tsx:51`, `GlobalPermissionsManager.tsx:1235, 1491`                 | Every feature and widget card.                                                                                                               |
| Building-defaults paragraph and `DockDefaultsPanel` helper | 17 admin config panels, `DockDefaultsPanel.tsx:43`                                                 | 27 panels.                                                                                                                                   |
| Organization `ViewHeader` `blurb`                          | `components/admin/Organization/components/primitives.tsx`                                          | 9 pages.                                                                                                                                     |
| `FEATURE_ROWS` description                                 | `components/plc/tabs/PlcSettingsTab.tsx:212`                                                       | 5 PLC settings toggles.                                                                                                                      |
| `ModeOption` import cards, three private copies            | `PlcQuizImportModal`, `PlcVideoActivityImportModal`, `PlcAssignmentImportModal`                    | 6 paragraphs, which would become 2 strings.                                                                                                  |
| `ChoiceGroup` `desc` and `Field` `hint`                    | `components/widgets/GuidedLearning/studio/panelControls.tsx`                                       | Most of the Studio properties panel.                                                                                                         |
| Pacing-mode and score-visibility option lists              | `QuizBehaviorSettingsPanel.tsx`, `VideoActivityBehaviorSettingsPanel.tsx`, `publishScoreLevels.ts` | The same lists are written twice, so they should become one source.                                                                          |

## Phases

Each phase is one PR into `dev-paul`, or one PR per area where a phase is large. Copy and styling changes are exempt from the feature-flag rule in `CLAUDE.md`, so nothing here needs a flag.

### Phase 1: Wrong copy and leaked internals

This phase is small and safe and can merge first. It fixes the strings that are false or expose internal names, which are "(A7)", "wire format separator", "Current view: {raw id}", "CSS variables", "via Feature Permissions" in the Talking Tool settings, "Attendees (from presence)", "click the kebab", the Remote Control "this board" claim, the PLC "Shared Data" tab name, the read-aloud passage hint that shows when read-aloud is unavailable, and "Viewer — read only". It also deletes the dead locale keys the audit found (`sidebar.settings.quickAccessDescription`, `widgets.weather.*Description`, `stationConnectedTo`, `widgets.timeTool.add*Tip`).

### Phase 2: Shared fix points

This phase works through the table above. For each component, the implementer cuts the strings its callers pass, keeps the prop only where the audit marked a caller KEEP, and removes the prop when no caller is left. The component that draws the most hints is `ToggleRow`, so it goes first. The partner card's `missingHelp`, the Settings section descriptions and the schema `help:` lines follow it. Together these clear most of what teachers see on the legacy settings panel, the assign modals and the Settings modal.

### Phase 3: Teacher daily surfaces, string by string

This phase covers the findings that no shared component reaches. They are the Quiz editor and library, the Settings modal panes, the sidebar pages, the share modals, the Timer, Poll, Embed, Video Activity and Mini App settings, and the managed-notice stubs in 10 widgets (four of which are one copied card and should become one short shared notice). The work follows the findings tables in `quiz.md`, `shell.md` and `widgets.md`.

### Phase 4: Occasional teacher surfaces

This phase covers the paper-sheet modals, PLC, the Guided Learning classic editor, the AI generator and the capture modals, the Classroom and Schoology add-on pickers, and the subs portal. It follows `quiz.md`, `plc.md`, `guided-learning.md` and `shell.md`.

### Phase 5: Admin panel

This phase covers the Global Settings descriptions (one short line each, with the release-note detail left to the plan docs and PRs where it already lives), the Rollouts panel, the Organization pages, the Announcements editor, the Widget Builder and the "managed elsewhere" placeholder panels. It follows `admin.md`. It sits last because only admins see it, not because it is small. It is the largest single file of findings.

### Phase 6: Conditional copy and a guard against regrowth

This phase shortens the empty states, confirm dialogs and error text flagged in each findings file, starting with the 86 `ScaledEmptyState` subtitles. It then adds a ratcheting Vitest check over `locales/en.json` and the extracted JSX strings. The check fails on a new em dash, "Tip:", "Note:" or any on-screen string over a word limit that is not on a committed baseline, and the baseline only shrinks. The same rules go into `components/CLAUDE.md` so future sessions write short copy from the start.

## Rules for the implementing sessions

- The proposed text in the findings files is a starting point, not final copy. Run `deslop --writing` on every replacement string, and prefer deleting a line over rewording it.
- When a line is deleted, the information is dropped unless the findings file marks it MOVE. A MOVE item goes into the control's tooltip or an info popover, never into a new permanent line elsewhere.
- Keep the text that states a prerequisite ("Needs Gemini AI Functions"), the consequence of a destructive action, or a privacy disclosure such as the recording consent notice.
- Change `en.json` and the matching keys in `de.json`, `es.json` and `fr.json` in the same PR. Delete removed keys from all four files, and translate shortened strings rather than leaving the old long translation in place. The terminology tests in `tests/i18n/` must stay green.
- Tests that query the old copy with `getByText` need their queries updated. Prefer role and label queries when touching them.
- Check the result on https://spartboard-dev.web.app, including the legacy settings panel as a non-admin teacher would see it, because the settings drawer is admin-only.

## Visual findings outside the copy work

These came up during the sweep. They are listed here and not scheduled into the copy phases.

- **Decorative accent strips.** There is a 4px coloured left strip on the Analytics KPI cards (`admin/Analytics/AnalyticsManager.tsx:339`, 10 uses, and `Analytics/LinksPanel.tsx:69`, 4 uses) and left border rules on release notes in `WhatsNewModal.tsx:78, 93, 172`. The TalkingTool `border-l-4` looks like a category colour and is low priority.
- **Colour-only status.** The Google Drive dot in the sidebar nav (`layout/sidebar/Sidebar.tsx:671`) has no text or label, and the class-row dot (`SidebarClasses.tsx:689`), the Poll settings green dot and the Video Activity timeline marker are the same. The `ShareStatusBanner.tsx:144` dot relies on a hover title. The PLC Settings section switches show no On/Off word and lack `role="switch"`.
- **Static help styled as an alert.** Two surfaces use a solid brand-blue box with an alert icon, at `QuizEditor.tsx:1078` and `StimulusManagerPanel.tsx:259`.

## Decisions for Paul

1. **Default for hints under toggles.** Delete every one except those the audit marked KEEP (recommended), or rewrite each one shorter.
2. **Where needed-but-rare detail goes.** A tooltip or info popover for the few MOVE items only (recommended), or a Help Center article per surface.
3. **Global Settings descriptions.** One short line each (recommended), or a short line with a "details" disclosure that keeps today's text.
4. **Translations.** Update de, es and fr in the same PR (recommended), or change English only and let the other locales catch up later.
