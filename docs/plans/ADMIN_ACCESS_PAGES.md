# Admin Access pages: Widgets, Features, Previews

Status: 2026-09-25. Planned. Decisions settled with Paul in a grill-me session; no code yet.

## Problem

Admin Settings > Access has three tabs that have drifted into each other:

- **Global Settings** (`components/admin/GlobalPermissionsManager.tsx`, ~1,700 lines) mixes four
  unrelated things: the Custom Logo (branding), Assignment Modes (org policy that silently forces
  `accessLevel: 'public'`), permanent capability gates (Live Sessions, Board Sharing, Google
  Classroom, the AI features with daily limits and Gemini model overrides), and ~25 temporary
  "admin-only until Paul has tried it" release flags. The flags are most of the recent growth.
- **Rollouts** (`RolloutSwitchesPanel.tsx`, `admin_settings/*`) is a third home for the same
  features. Paper answer sheets, Class groups and Build a quiz from a test document each need a
  switch on Rollouts **and** a flag on Global Settings.
- **Feature Permissions** (`FeaturePermissionsManager.tsx`) lists every Dock item, including the
  internal tools Record, Magic and Remote. Their cards write `feature_permissions/{record,magic,remote}`,
  which nothing reads: `components/layout/Dock.tsx:678` gates them on the global
  `screen-recording`, `magic-layout` and `remote-control` features. `screen-recording` has no admin
  UI at all.
- Feature ids, labels, icons and descriptions live in three parallel lists: the `GlobalFeature`
  union in `types.ts`, `FEATURE_DEFAULTS` in `config/featureDefaults.ts`, and `GLOBAL_FEATURES` in
  the manager. Two ids (`screen-recording`, `org-admin-writes`) exist in the union with no row.
- A preview flag with `missingDocPublic: false` returns `false` for admins too until someone presses
  Save once (`context/AuthContext.tsx` `canAccessFeature`, and the server mirrors in
  `functions/src/quizTranslation.ts` and `quizDocumentExtract.ts`). "On for Paul first" is only true
  after a manual save, which the amber "Not saved" badge exists to remind about.
- Neither page has search. Every Global Settings row is permanently expanded (building picker and
  tier picker always visible), so finding one flag means scrolling past ~40 tall rows.
- Global Settings inlines its own beta-tester editor instead of reusing `BetaUsersPanel`.

## Target

| Tab                                   | Purpose                                        | Contents                                                                                                                                                 |
| ------------------------------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Widgets** (was Feature Permissions) | Who gets each Dock item, plus its admin config | All Dock items, including Record, Magic and Remote (now actually wired). Graduated widget-owned capabilities appear as sub-toggles on their widget card. |
| **Features** (was Global Settings)    | Permanent app-wide capabilities                | Category sections: AI, Sharing & sessions, Integrations, Students. Nothing temporary.                                                                    |
| **Previews** (replaces Rollouts)      | Everything still being tested                  | One row per preview, showing its district switch (if any) and its Admin/Beta/Public control together.                                                    |
| **Organization** (existing)           | Org policy and branding                        | Gains Custom Logo, Assignment Modes and the `org-admin-writes` control.                                                                                  |

All three Access tabs share: a sticky search box, one-line rows that expand for targeting, and the
admin shell reopening on the last-used tab.

## Decisions

| #   | Decision                                                                                                                                                                                                                                                                                                                                                                                                               |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Temporary release flags and Rollouts switches move to a new **Previews** tab. Global Settings keeps only permanent capabilities.                                                                                                                                                                                                                                                                                       |
| D2  | Custom Logo and Assignment Modes move to the **Organization** tab. `org-admin-writes` gets its control there too.                                                                                                                                                                                                                                                                                                      |
| D3  | The **Widgets** page owns Record, Magic and Remote. The Dock reads `canAccessWidget('record' / 'magic' / 'remote')`; the global ids `screen-recording`, `magic-layout`, `remote-control` are retired. Migration: if a prod `global_permissions/{id}` doc exists and the matching `feature_permissions` doc does not, copy it across once (script, dry-run first), and read the old doc as a fallback for one release.  |
| D4  | Search is per page and matches label, description and id. When the current tab has no hits but another Access tab does, show a "Found on Features →" style jump link that switches tab with the query kept.                                                                                                                                                                                                            |
| D5  | `FEATURE_DEFAULTS` becomes the single registry. Each entry gains the row's `label`, `icon`, `description`, and required `stage: 'preview' \| 'permanent'`. `GLOBAL_FEATURES` in the manager is deleted. Because the table is `Record<GlobalFeature, …>`, a new flag cannot compile without choosing a stage.                                                                                                           |
| D6  | Each entry also declares `afterLaunch: 'retire' \| 'keep'`, an optional owning `widget: WidgetType`, and for permanent non-widget features a `category: 'ai' \| 'sharing' \| 'integrations' \| 'students'`. Graduation is decided per flag: redesigns are retired in code; capabilities are kept as permanent switches, on their widget card when widget-owned, else on Features.                                      |
| D7  | Admins pass a `stage: 'preview'` feature when no doc exists, in the client and in Cloud Functions. Features that are fail-closed for external-setup or privacy reasons (`personal-spotify`, `quiz-media-response`) keep denying everyone until saved; model this as `missingDocPublic: false` plus a new `failClosedForAdmins: true`, not as a stage exception.                                                        |
| D8  | Rows on all three Access tabs collapse to one line: icon, name, on/off, access level, and summary chips ("2 buildings", "Org tier", "3 testers", "Limit 20/day"). Clicking expands targeting and config. The grid/list toggle is removed; the one layout also serves mobile.                                                                                                                                           |
| D9  | Tabs are renamed **Widgets / Features / Previews**. CLAUDE.md "Releasing a feature" and the `admin-widget-config` / `new-widget` skills are updated to the new paths and required registry fields.                                                                                                                                                                                                                     |
| D10 | Features is organized into category sections. The AI section gets one header card for Gemini model overrides (moved out of the `gemini-functions` row); each AI row keeps its own daily limit.                                                                                                                                                                                                                         |
| D11 | Targeting stays as is: widgets by grade level, features by building. Both show as chips on the collapsed row.                                                                                                                                                                                                                                                                                                          |
| D12 | A preview with a district switch shows one row: district switch first, then Admin/Beta/Public, then a status line ("Live for: admins", "Off everywhere"). Storage is unchanged (`admin_settings/*` stays, since functions and rules read it), so no migration. Rollout-only previews (PLC collaborative notes, delegated printing, Projects widget, subs starting activities) get the same row with no access control. |
| D13 | Client and server share the D7 rule: a helper in `functions/src` resolves the missing-doc case from the same stage data (copied or generated from `config/featureDefaults.ts`), with tests pinning admin-pass for preview flags and fail-closed for the D7 exceptions.                                                                                                                                                 |
| D14 | Retirement: Previews shows "Public for everyone · ready to retire" on `afterLaunch: 'retire'` flags that are saved as enabled + public. Paul asks an agent to retire one; that PR deletes the gate and the old code path, removes the registry entry, and adds the `public/changelog.json` note. No scheduled automation.                                                                                              |
| D15 | Admin Settings reopens on the last-used tab (localStorage, guarded), falling back to Widgets.                                                                                                                                                                                                                                                                                                                          |
| D16 | Admin-only tooling, so no feature flag (CLAUDE.md "Exempt"). No changelog entry; teachers never see these pages.                                                                                                                                                                                                                                                                                                       |

## Starting classification

Recorded in the registry in PR 2. Changes after that are made in the registry, not here.

**Previews, retire after launch** (redesigns and one-way changes)
`quiz-choice-editor`, `quiz-grader-v2`, `quiz-choose-all`, `quiz-fib-alternates`,
`quiz-results-tools`, `quiz-results-print`, `quiz-import-suggested-targets`, `gl-player-v2`,
`gl-studio`, `gl-callout-editing`, `gl-live-tours`, `plc-home-v2`, `plc-notes-rich-editor`,
`plc-norming-flags`, `modal-fullscreen`, `settings-drawer`, `per-period-access`,
`sub-share-collections`

**Keep as a switch, on the widget card** (preview until opened, then permanent)

| Widget         | Features                                                                                                                                                   |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Quiz           | `quiz-read-aloud`, `quiz-translation`, `quiz-media-response`, `question-bank-ai`, `quiz-document-import`, `quiz-document-ai-reader`, `paper-answer-sheets` |
| Video Activity | `video-activity-audio-transcription`                                                                                                                       |
| Embed          | `embed-mini-app`                                                                                                                                           |
| Poll           | `smart-poll`                                                                                                                                               |
| Music          | `personal-spotify`                                                                                                                                         |

**Keep as a switch, on Features**

| Section            | Features                                                                                         |
| ------------------ | ------------------------------------------------------------------------------------------------ |
| AI                 | `gemini-functions`, `smart-paste`, `ai-file-context`                                             |
| Sharing & sessions | `live-session`, `dashboard-sharing`, `dashboard-import`, `share-link-tracking`, `anonymous-join` |
| Integrations       | `google-classroom`                                                                               |
| Students           | `tab-away-timer`, `roster-groups`                                                                |

**Moved elsewhere**: `screen-recording`, `magic-layout`, `remote-control` → Widgets page as the
Record / Magic / Remote Dock items (D3). `org-admin-writes`, `assignment-modes` → Organization (D2).

Current stage of the "keep" rows: anything still at `defaultAccessLevel: 'admin'` in
`FEATURE_DEFAULTS` today starts as `stage: 'preview'` and shows on Previews until Paul opens it;
the rest start `permanent`. PR 2 confirms each against the prod `global_permissions` docs
(read-only) rather than the in-code defaults, since several were opened to Public by hand.

## Delivery

Four PRs, each independently shippable. PR 1 needs nothing from the others.

### PR 1: Quick wins

- Search box on Feature Permissions and Global Settings (label, description, id), with the
  cross-tab jump link from D4. A shared `AdminSearchField` + a small `adminSearchIndex` that each
  Access tab registers its rows into, so the jump link works without mounting the other tab.
- D3: Dock reads `canAccessWidget` for Record / Magic / Remote with a one-release fallback to the
  old global doc; migration script under `scripts/` (`--dry-run`, `--project dev` first).
- D7 + D13: admin missing-doc pass for preview flags, client and functions, with tests. Until PR 2
  adds `stage`, derive it as `defaultAccessLevel === 'admin' && !missingDocPublic`, minus the D7
  exceptions.
- Global Settings reuses `BetaUsersPanel`.

### PR 2: Registry and the Previews tab

- `FEATURE_DEFAULTS` gains `label`, `icon`, `description`, `stage`, `afterLaunch`, `widget?`,
  `category?`, `failClosedForAdmins?` (D5, D6, D7). Delete `GLOBAL_FEATURES`. A test fails when a
  `stage: 'permanent'` non-widget entry has no `category`.
- Rollout switches get a registry entry too (`config/rolloutSwitches.ts`, moving the list out of
  `RolloutSwitchesPanel`), optionally linked to a `GlobalFeature` so D12 can pair them.
- New `PreviewsPanel` replaces the Rollouts tab: paired rows (D12), ready-to-retire badge (D14),
  search, collapsed rows.
- Global Settings filters to `stage: 'permanent'`.
- Replace the PR 1 derived stage with the registry field in client and functions.

### PR 3: Features page and Organization

- Custom Logo, Assignment Modes and `org-admin-writes` move to Organization (D2).
- Features renders category sections (D10) with the Gemini models header card and collapsed rows (D8).
- Rename tabs to Widgets / Features / Previews and remember the last tab (D9, D15).
- Update CLAUDE.md "Releasing a feature" and the `admin-widget-config` / `new-widget` skills.

### PR 4: Widgets page

- Collapsed one-line rows with chips (D8); remove the grid/list toggle.
- Widget cards list their `widget`-owned permanent features as sub-toggles, writing the same
  `global_permissions/{id}` docs (no data move). Previews stay on the Previews tab until graduated.
- Search on Widgets also matches sub-toggle names, so "read aloud" finds the Quiz card.

## Verification

- Unit tests per PR with `pnpm exec vitest related --run`; `tests/tourAnchors.test.ts` and
  `tests/copyGuard.test.ts` must stay green (no new helper copy on these pages).
- Paul checks each PR on https://spartboard-dev.web.app: find a flag by search, flip a preview,
  confirm a new unsaved preview is visible to him and hidden from a non-admin test account.
- D3 migration: `--dry-run` against prod lists which docs would be copied before any write.

## Open follow-ups

- Once PR 2 lands, the retire-list flags that are already Public in prod are candidates for the
  first retirement PRs.
- Whether rollout switches can eventually collapse into their flag (one gate instead of two) is
  deferred; it touches functions and rules per feature.
