# SpartBoard Consolidated Backlog

**Last verified:** 2026-07-18; plan-sweep additions 2026-09-26 — every item below was checked against the actual code and git
history by a per-doc audit sweep (43 assessor agents). Items already shipped were dropped;
what remains is genuinely unshipped. This file replaces `docs/remaining-todos-audit.md`,
`docs/repo-improvement-plan-2026-07-13.md`, `docs/optimize-pass/`, `todo/`, and the other
deleted planning docs (see PR that introduced this file; git history preserves all of them).

**Living references kept alongside this file:**

- Feature specs (the plan-of-record for large items): `docs/specs/` (LO12, M12, M13, M16)
- Roadmaps / design docs: `docs/PLC_ROADMAP.md`, `docs/nexus.md`, `docs/wide-distro-plan.md` (referenced from code comments), `docs/written-response-quiz-questions.md`
- Shipped plans kept as the decision record cited by code comments: `docs/plans/shipped/`
- References / runbooks: `docs/admin_settings_widget_configs.md`, `docs/external-availability-oauth-runbook.md`, `docs/external-availability-legal-review.md`, `docs/external-availability-journal.md`, `docs/assign-from-spartboard-to-lms-feasibility.md`, setup docs (`ADMIN_SETUP`, `DEV_WORKFLOW`, `LINTING_SETUP`, `DEPLOY_CHECK`)

Legend: effort S/M/L, risk LOW/MED/HIGH. Sections ordered: human-gated first.

---

## 1. Human-gated (Paul / district ops — cannot be done by an agent alone)

### External availability / OAuth (from external-availability journal + wide-distro plan)

- [ ] **Confirm prod OAuth web client (`…-hdc7`) is Trusted** in Admin Console → Security → API Controls. (S/LOW)
- [ ] **Upload consent-screen logo** (Console → Branding → `marketplace-assets/icon-128.png`) — triggers brand verification bundle. (S/LOW)
- [ ] **Submit OAuth verification for sensitive scopes** (spreadsheets, calendar.readonly). Blocked: `*.web.app` domain can't satisfy OAuth branding homepage requirements — needs custom-domain decision first. (M/MED)
- [ ] **CLASSROOM_ASSIGN feature-gate decision**: flip `CLASSROOM_ASSIGN_ADMIN_ONLY=false` once Spike A testing clears. (S/LOW)
- [ ] **Legal/operator-model sign-off** (wide-distro Phase 4): finalize `/privacy` + `/terms` copy after district counsel review; broaden `SupportPage.tsx` for external framing; decide Path A vs B for scope verification; then flip GCP OAuth consent screen Internal → External. (M–L/HIGH — hard to reverse)
- [ ] **Vanity short domain** for link shortener (recurring $15–50/yr cost — budget decision). (S/LOW)

### Spec decisions blocking feature work

- [x] **M12 (rubrics)**: OD-1/2/3 resolved 2026-08-27 (slide-over builder; auto-fill editable; full PLC integration now) plus six further decisions — see spec §3a. `docs/specs/M12-written-response-rubrics-spec.md`.
- [ ] **M13 (student landing)**: Decision A (buildingIds vs classlinkClassIds teacher-directory scoping). See `docs/specs/M13-student-landing-overhaul-spec.md`.
- [ ] **M16 (PLC Phases 7–8)**: share-action integration point for Mini-Apps, mini-app sync content model, GL/Drive coupling during import. See `docs/specs/M16-plc-phases-7-8-spec.md`.
- [ ] **LO12 (Nexus connections)**: sign off deferral of Candidates 6/9 and rejection of 11. See `docs/specs/LO12-nexus-widget-connections-spec.md`.
- [ ] **M14 Schoology Phase E** formal deliverables — district coordination. (M)
- [ ] **D3**: schedule `jose` 4→6 and `@google/genai` dependency bumps with LTI/AI regression testing. (M/MED)
- [ ] **District Curriculum Repository** for Quiz widget (admin-approved quiz library, grade/subject tags) — large net-new feature, needs product definition. (L)

### From the 2026-09-26 plan sweep (flag flips, prod steps, Paul's testing and decisions)

Each item names the plan it came from; the plan holds the detail.

#### `docs/plans/ACTIVITY_WALL_REDESIGN.md`

- [ ] P3-3: delete archiveActivityWallPhoto callable, activity_wall_photos Storage rule block, ?data= decoder remnants, and deprecated mode/identificationMode writes (functions/src/driveArchive.ts, functions/src/index.ts, storage.rules, types.ts, components/widgets/ActivityWall/\*). (S)

#### `docs/plans/ADMIN_ACCESS_PAGES.md`

- [ ] Run scripts/migrate-internal-tool-permissions.mjs --project dev then --project prod (dry-run first, then --apply). (S)
- [ ] Check each 'keep' row against prod global_permissions for already-Public flags ('Ready to graduate'). (S)
- [ ] Retire flags already Public in prod per D14 once Paul confirms readiness. (M)

#### `docs/plans/AI_RESPONSIBLE_USE_WIDGET.md`

- [ ] District review/approval of drafted grade 3-12 term definitions before the feature flag opens to teachers. (S)
- [ ] Confirm placeholder task-group headers (Writing/Projects/Learning support/etc.) with district since original export drops group headers. (S)
- [ ] Paul testing in prod and eventual Public flag flip / district sign-off. (S)

#### `docs/plans/shipped/ALWAYS_VISIBLE_COPY.md`

- [ ] Decorative accent strips (Analytics KPI cards, LinksPanel, WhatsNewModal, TalkingTool) — cosmetic cleanup, never scheduled. (S)
- [ ] Colour-only status indicators (Drive sidebar dot, class-row dot, Poll/Video Activity markers, PLC switches missing role=switch). (S)
- [ ] Static help styled as solid-blue alert boxes (QuizEditor, StimulusManagerPanel). (S)

#### `docs/plans/shipped/DEV_FIREBASE_PROJECT.md`

- [ ] Follow-up (explicitly out of scope): enable Firestore delete protection + PITR + daily backup schedule on prod. (S)
- [ ] Follow-up (explicitly out of scope): move prod CI to WIF and delete the prod JSON key. (M)
- [ ] Follow-up (explicitly out of scope): ClassLink/Spotify/LTI dev registrations when a feature needs them. (M)

#### `docs/plans/shipped/FLASHCARDS.md`

- [ ] Flip feature_permissions/flashcards from admin to beta (world-language teachers) after Paul's prod check, per Q47. (S)

#### `docs/plans/shipped/GL_CALLOUT_EDITING.md`

- [ ] Flip 'gl-callout-editing' flag to Public in Admin Settings once Paul has used it in prod (per plan's release section). (S)

#### `docs/plans/GL_STUDIO_GESTURES.md`

- [ ] PR 5: remove gl-studio gate and classic GuidedLearningEditor/GuidedLearningEditorModal fallback from Widget.tsx once Paul confirms new gestures in prod. (M)

#### `docs/plans/shipped/GUIDED_LEARNING_STUDIO.md`

- [ ] Paul plays each surface (widget, Manager preview, Help viewer, student app) end to end on prod and flips gl-player-v2, gl-live-tours, gl-studio from admin to Public in Admin Settings > Access. (S)
- [ ] Write public/changelog.json entries once each flag opens (per CLAUDE.md, not at merge). (S)

#### `docs/plans/shipped/LIVE_TOURS_V2.md`

- [ ] Paul flips gl-live-tours flag to Public after prod testing. (S)

#### `docs/plans/shipped/PER_PERIOD_ASSIGNMENT_ACCESS.md`

- [ ] Paul runs a real class through per-period access in prod on his own account, then flips 'per-period-access' from admin to Public in Admin Settings > Access > Global Settings. (S)

#### `docs/plans/shipped/PLC_DELEGATED_PAPER_PRINTING.md`

- [ ] Flip admin_settings/plc_delegated_printing (Rollouts switch) to Public in prod after Paul tests it live, per the flag-release convention. (S)

#### `docs/plans/shipped/PLC_HOME_V2.md`

- [ ] Flip plc-home-v2 GlobalFeature to Public after Paul runs it in prod (Admin Settings > Access > Previews). (S)

#### `docs/plans/shipped/PLC_NORMING_FLAGS.md`

- [ ] Paul tests the feature in prod on his own account and flips 'plc-norming-flags' from admin/preview to Public in Admin Settings > Access > Previews. (S)
- [ ] Once Public, per afterLaunch:'retire', delete the feature gate and registry entry and add the changelog note. (S)

#### `docs/plans/PLC_RENAME_QUIZZES_TO_ASSESSMENTS.md`

- [ ] Hold grilling session with Paul to settle scope/wording (teacher-side Quiz widget rename? video activities/rubrics as kinds under Assessments? student-facing copy?). (S)

#### `docs/plans/shipped/PROJECTS_WIDGET.md`

- [ ] Flip admin_settings/projects_widget and widget access level to Public once Paul is satisfied. (S)

#### `docs/plans/shipped/QUIZ_ACCOMMODATIONS_HANDRAISE_TTS.md`

- [ ] Browser-verify the four flows on dev-paul (assign with skip, hub edit, Spanish read-aloud, FIB translation review+grading, admin modal + raise hand). (S)
- [ ] Release notes must flag raise-hand default OFF for existing quizzes, written without naming internal flags. (S)
- [ ] Check TTS cost after first Spanish class uses read-aloud. (S)
- [ ] Flip admin_settings/feature_permissions flags to Public on prod after Paul's testing. (S)

#### `docs/plans/shipped/QUIZ_EXAMVIEW_IMPORT.md`

- [ ] Paul flips 'quiz-sections' flag to Public in Admin Settings after prod testing. (S)

#### `docs/plans/shipped/QUIZ_IMPORT_RELIABILITY.md`

- [ ] Flip feature flag to Public. (S)

#### `docs/plans/QUIZ_JOIN_CODE_LOOKUP.md`

- [ ] Run scripts/backfill-quiz-join-codes.mjs --all --apply against production. (S)
- [ ] Tighten quiz_sessions rules to get/scoped-list matching the other four collections. (S)

#### `docs/plans/shipped/QUIZ_PAPER_HANDWRITTEN_RESPONSES.md`

- [ ] Flip GlobalFeature 'paper-handwritten-responses' to Public after district privacy review (D7). (S)

#### `docs/plans/shipped/QUIZ_PAPER_SHEET_STIMULI.md`

- [ ] Real print-and-scan of a single-column sheet with a dark photo and coordinate grid on the actual copier to empirically confirm the post-fit Otsu exclusion (D4) on real toner/scan artifacts. (S)

#### `docs/plans/shipped/QUIZ_READ_ALOUD.md`

- [ ] Flip 'quiz-read-aloud' from admin to beta/public in Admin Settings once Paul has tested it in prod on his own account. (S)
- [ ] Out-of-scope items explicitly deferred by the plan itself (word-level sync, per-student usage logging for IEP docs, per-question pronunciation overrides, Drive tiering, OCR beyond 4 pages) remain unbuilt by design (§9), not oversight. (M)

#### `docs/plans/shipped/QUIZ_RESULTS_PRINT.md`

- [ ] Flag 'quiz-results-print' is still admin-only (stage: 'preview'); opening to all teachers requires Paul to test in prod and flip Admin Settings > Access > Global Settings to Public. (S)
- [ ] Changelog entry for teachers has not been written (correctly deferred until the flag opens per repo convention). (S)

#### `docs/plans/QUIZ_STRUCTURED_ASSESSMENTS.md`

- [ ] PR9: admin assessment library, targeting, sync groups (D28-D29). (L)
- [ ] PR10: A&L validation run against gathered assessments (D30). (S)
- [ ] Flag flips to Public for all 6 new GlobalFeatures once each PR is tested by Paul. (S)

#### `docs/plans/shipped/ROSTER_GROUPS_INTEGRATION.md`

- [ ] Paul verifies privacy behavior in browser (group names never render on front face) and flips admin_settings/roster_groups_integration to Public in prod after using it himself. (S)

#### `docs/plans/STARRED_CLASS_AUDIT.md`

- [ ] PR 4: remove star UI, activeRosterId/setActiveRoster, localStorage key, Classes widget catalog entry — only after Paul opens the flag to Public. (S)

#### `docs/plans/shipped/SUB_SHARE_COLLECTIONS.md`

- [ ] Flip admin_settings/sub_launch_as_teacher to enabled in spartboard-dev for Paul's testing, then to Public in prod after he validates on his real account. (S)
- [ ] Confirm no residual gaps in the amended v1 launch scope (class-wide targeting only, no roster/group-targeted launch, no translated locales/read-aloud/media responses/learning targets/banked questions in sub-launched runs) match current product expectations. (S)

#### `docs/plans/shipped/TAB_AWAY_TIMER.md`

- [ ] Real-Chromebook test of short (5s-range) auto-submit timers for false positives from focus-loss/iframe blur, per §4. (S)
- [ ] Flip 'tab-away-timer' flag to Public in Admin Settings > Access > Previews once Paul has tested in prod, then add the public changelog entry. (S)

#### `docs/plans/WIDGET_SETTINGS_DRAWER.md`

- [ ] Flip settings-drawer flag to public default and delete components/common/SettingsPanel.tsx (wave 4). (M)

#### `docs/specs/LO12-nexus-widget-connections-spec.md`

- [ ] Candidate 11: Activity Wall → Hotspot Image. (M)
- [ ] Decision A: adopt Option 1 (per-widget config, recommended) vs Option 2 (nexusConnections wiring table) before any candidate ships. (S)

#### `docs/specs/M13-student-landing-overhaul-spec.md`

- [ ] Phase 2: teacherDirectory Firestore rules + composite index; Decision A (buildingIds vs classIds approach) needs Paul's call before implementing. (M)
- [ ] Decisions A, B, C in section 3 need Paul's confirmation before Phase 2/3/4 work proceeds (spec has recommendations but flags them open). (S)

#### `docs/specs/M16-plc-phases-7-8-spec.md`

- [ ] Paul decides Open Decisions A/B/C (Mini-App share UI integration point, Mini-App sync content model, Guided Learning Drive coupling for PLC import). (S)
- [ ] Ship both behind feature flags at admin-only access per repo's flag-release convention, then Paul opens to Public after prod testing. (S)

#### `docs/PLC_ROADMAP.md`

- [ ] Doc itself needs a rewrite/retirement decision: it documents only the original 6-phase scope and is now missing ~18 hooks worth of shipped PLC functionality (assessments, meetings, norming, rubrics, docs, folders, CRDT notes) that arrived in later, separately-planned PRs. (M)

#### `docs/wide-distro-plan.md`

- [ ] Confirm OAuth web client Trusted status; decide CLASSROOM_ASSIGN_ENABLED for launch. (S)
- [ ] Complete Google sensitive-scope verification. (M)
- [ ] Operator-model/legal sign-off with district counsel. (M)

#### `docs/assign-from-spartboard-to-lms-feasibility.md`

- [ ] Confirm the live prod Spike A end-to-end pass (partner-first courseWork.create, due-date patch, token-less add-on attachment render+launch, grade roll-up) with the admin-only cohort. (S)
- [ ] Flip CLASSROOM_ASSIGN_ADMIN_ONLY to false to widen the feature from admins to all Classroom-using teachers once Spike A is confirmed. (S)

#### `docs/multilingual-pronunciation-engine-spec.md`

- [ ] Resolve D1 (client-side vs server-side inference) — blocks the whole design. (L)

#### `docs/rich-response-wayfinder.md`

- [ ] Enable the `quiz-media-response` global permission to actually turn on audio capture for admin/beta testing. (S)
- [ ] Run RR-B3's whiteboard grading-time prototype (30 responses, stopwatch) to validate the 180s/600s take-limit assumption before committing to the B-track grading surface. (M)

#### `docs/rich-response/IMPLEMENTATION.md`

- [ ] Create the 'quiz-media-response' global_permissions Firestore record to actually enable audio capture (doc says 'no record exists yet'). (S)
- [ ] Video capture and B track (whiteboard) remain deferred/unscheduled by design, not unshipped scope of this doc. (L)

#### `docs/multilingual-pronunciation-engine.md`

- [ ] Resolve student voice data / consent (D2) given the human-audio fixtures raised in #2344. (M)

#### `docs/gemini-api-terms-audit.md`

- [ ] Confirm aiplatform.googleapis.com is enabled and roles/aiplatform.user is granted on spartboard. (S)
- [ ] Counsel review of Gemini API age-restriction clause before wide distribution. (M)

## 2. Spec-backed feature work (specs are the plan of record — build from the spec, not from here)

- [x] **M12 — Written-response rubrics (Phase 3)** — SHIPPED to dev-paul 2026-08-28 (PRs #2614–#2619, #2628–#2630; issues #2602–#2610 closed): all phases 3-A..3-I landed — types, `/users/{uid}/rubrics` + `/shared_rubrics` + `/plcs/{plcId}/rubrics` rules + emulator tests, RubricBuilderPanel, RubricScoringPanel, useRubrics/usePlcRubrics, CSV import/export + export columns, link sharing with `/share/rubric/{id}` deep link, PLC Rubrics tab, `GradeResult.state` (RR-06 interleave — fixes ungraded-essay-pushes-0), student-facing rubric views. Phase-1 rules-test carry-over included. Remaining follow-ups: PLC Trash surfacing for unshared rubrics (task chip filed); share-to-PLC from the builder panel (spec §10 3-I bullet, PLC-tab share picker shipped instead); `plcContributions` share counting (no resource type counts shares today — parity holds vacuously). Playwright pause/resume E2E still deferred; Phase 4 (AI-assisted grading) deferred. (L)
- [ ] **M13 — Student landing overhaul** (`docs/specs/M13-student-landing-overhaul-spec.md`): Phases 1–7 (type foundation → teacherDirectory CF + rules → showResultToStudent writes → ResultsModal → sections/hooks → i18n). Must not leak `correctAnswer`/peer data; `useStudentOrgPage` must not call `useAuth`. (L/HIGH in rules/results phases)
- [ ] **M16 — PLC Phases 7–8** (`docs/specs/M16-plc-phases-7-8-spec.md` + `docs/PLC_ROADMAP.md`): synced mini-app groups infra then guided-learning mirror; widen `assignment_index` rule to make `sheetUrl` optional for kinds `mini-app`/`guided-learning`. (L)
- [ ] **LO12 — Nexus widget connections** (`docs/specs/LO12-nexus-widget-connections-spec.md`): Phase 1 tracer Checklist→Timer (S), Phase 2 Webcam/Drawing→GL (M), Phase 3 AI quiz-analysis/concept-map CF (L), Phase 4 GL→Quiz (M), Phase 5 Scoreboard→Stickers (M).

## 3. Security & correctness (code-only, actionable now)

- [ ] **S1**: remove `allow-same-origin` from MiniApp teacher iframe sandbox (`components/widgets/MiniApp/Widget.tsx:1283`) — auth-token exposure, account-takeover class. (S/HIGH priority)
- [ ] **S4**: gate `nextup_sessions/entries` create rule with class check, owner binding, shape/size validation (`firestore.rules` ~3318) + emulator tests. (M/MED)
- [ ] **S5**: gate legacy `sessions/{userId}/students` create rule on parent session active + field validation (`firestore.rules` ~2822) + emulator tests. (M/MED)
- [ ] **E1**: `functions/src/embedProxy.ts:209-217` — return false/unknown instead of fail-open `true` on HEAD-probe failure. (S/LOW)
- [ ] **C1**: `defaultBoardCreatedForUidRef` guard against duplicate "My First Board" on first sign-in (`context/DashboardContext.tsx` ~2003). (S/LOW)
- [ ] **C2**: `hooks/useLiveSession.ts:255-262` — add else branch to student status listener so teacher-removed students are ejected. (S/LOW)
- [ ] **C3/C4/C5**: PIN-uniqueness TOCTOU race, >30-class SSO assignment query cap, join-code collision handling (`useLiveSession.ts` / `useStudentAssignments.ts`) — re-verify then fix. (M/MED)
- [ ] **LO9**: synced-board drawings `hostUid` support (sync correctness). (L)
- [ ] **T1–T5**: Firestore rules tests (PIN-session collections, short_links, quota collections) + E2E for PIN-join/quiz-session journeys. (L)

## 4. Performance & cost

- [ ] **F2 dual-query consolidation** (blocked on backfill): run migration writing `classIds` onto session docs that only carry legacy `classId`, stop legacy write paths, confirm via telemetry, then collapse `useStudentAssignments` to a single query + regression test. (M/MED)
- [ ] **P2**: lazy-import tesseract.js in Webcam OCR handler (`components/widgets/Webcam/Widget.tsx:21`). (S/LOW)
- [ ] **P5**: `hooks/useBackgrounds.ts` — one-shot `getDocs` on modal open instead of permanent `onSnapshot` for admin_backgrounds. (S/LOW)
- [ ] **P3/P4**: manualChunks + bundle-size CI guard; client-side image compression on upload paths — re-verify then implement. (M/LOW)
- [ ] **LO14**: DashboardContext churn — ~192 `useDashboard` call sites; decide whether to pursue full data/actions context split beyond the shipped stable-actions + canvas-store mechanism (`context/DashboardContext.tsx` is still ~5,865 lines). Also verify DashboardView chunk size vs the 500KB warn limit. (L/MED — wide blast radius)
- [ ] **Wildcard lucide-react imports**: `import * as Icons from 'lucide-react'` in 7 files (StickerItemWidget, CatalystVisualWidget, catalystHelpers, ExpectationsWidget, InstructionalRoutines/IconPicker + Widget, Stations/IconOrImageInput) — replace with targeted imports/maps to restore tree-shaking. (M/LOW)
- [ ] **PR 2 of link shortener**: per-click event log (`short_link_events`), nightly rollup CF (`daily_clicks`), clicks-over-time chart in LinksPanel — FERPA-aware schema per the phase-2 design (in git history: `docs/link-shortener-phase-2.md`). (M/MED)
- [ ] **PR 4 of link shortener**: bulk CSV import/export for short_links (low priority, deferred until real distribution). (M/LOW)

## 5. Build hygiene & tech debt

- [ ] **F8/F20/LO15 — tsconfig strictness**: flip `noUnusedLocals`/`noUnusedParameters` to true (`tsconfig.json:38-39`), run `pnpm run type-check:all`, clear all TS6133/TS6196 (large noisy sweep; consider per-directory batches). (L/LOW)
- [ ] **F23**: group the 153 flat `utils/` files into domain subfolders with barrels + updated imports (mechanical, wide-reaching, collision-prone — coordinate with other work). (L/LOW)
- [ ] **F11**: finish CI lint memory work — split root/functions ESLint type-aware passes so the `NODE_OPTIONS` override can drop, or document why 5120MB stays. (M/LOW)
- [ ] **F18**: decide whether `functions/tsconfig.json` gets a real alias to share root `types.ts`, or close the item (ClassLinkUser duplication already resolved via `functions/src/classlinkShared.ts`). (S/LOW)
- [ ] **D1**: add `.nvmrc` pinning Node 24 (confirmed absent). (S/LOW)
- [ ] **D2**: fix `README.md:80` — `pnpm install` → `pnpm run install:all` (confirmed still wrong). (S/LOW)
- [ ] **useEffect cleanups** (last two from the May audit): move `prevIndexRef` assignment out of useEffect into render body in `components/layout/DashboardView.tsx`; extract the ~175-line live-scoreboard-sync effect in `components/widgets/QuizWidget/Widget.tsx` (~line 525) into a `useLiveScoreboardSync` hook. (S + M)
- [ ] **LO8**: make the `internal` tier's domain (`orono.k12.mn.us`, hardcoded in `utils/userTier.ts`) and /subs operator scoping admin-configurable. (S–M/LOW)
- [ ] **M6**: Quiz edit modal AssignClassPicker + `rosterIds` migration (data-model change). (M/MED)

## 6. Admin / no-code roadmap stragglers (from the archived non-code roadmap — verify before building)

- [ ] **Mini App library Monaco editor**: wire `@monaco-editor/react` (already used in WidgetBuilder/CodeEditorPane) into `MiniAppLibraryModal.tsx`; formalize/version the postMessage bridge API. (M/LOW)
- [ ] **JSON-schema-driven admin config renderer** (the roadmap claimed `SchemaDrivenConfigurationPanel.tsx` exists — it does not): decide whether to generalize the ~60 bespoke `*ConfigurationPanel.tsx` files or drop the idea. (M)
- [ ] **Data binding / webhooks (Phases 3.3–3.4)**: server-side proxy + webhook executor CFs — security-sensitive, needs careful design. (L/HIGH)
- [ ] **Google Fonts picker + @font-face upload (Phase 1.2)** — not verified as implemented; verify then build or drop. (M/LOW)
- [ ] **Auto-assign dashboard template on first login by building/grade; admin lock/unlock of live widgets** — remaining halves of Phases 4.1/4.2; verify then finish. (S–M/LOW)

## 7. Plan-sweep stragglers (2026-09-26)

Unshipped work found by checking every `docs/plans/`, `docs/specs/` and design doc against the code. Each item names the plan that holds the detail.

### Ready for an agent

#### `docs/plans/AI_RESPONSIBLE_USE_WIDGET.md`

- [ ] Implement widget types/registration: types.ts WidgetType, config/tools.ts, config/widgetDefaults.ts, config/widgetGradeLevels.ts, WidgetRegistry.ts for ai-responsible-use and ai-responsible-use-card. (L)
- [ ] Build config/aiResponsibleUseContent.ts with verbatim district content (ops-4 and oms-3 presets, terms, question bank). (M)
- [ ] Admin config modal for per-building preset choice and admin-editable wording. (M)
- [ ] Feature flag setup (GlobalFeature id, FEATURE_DEFAULTS, featureMissingDoc.ts) and admin-only rollout per CLAUDE.md flag process. (S)

#### `docs/plans/ANNOTATION_OVERLAY_PR3.md`

- [ ] Implement pass-through pointer routing for cursor/select mode (pointer-events-none + document-level capture-phase pointerdown/move/up, exact hit test against ink, handle hit test, deselect-and-pass-through). (L)
- [ ] Add exact hit-test function hitTestInk covering path/line/arrow tolerance, rect/ellipse outline-vs-fill, text glyph box via layoutTextLines, image box, and rotation reversal, plus unit tests. (M)
- [ ] Narrow Dock/DashboardView gesture-guard and pointer-event-drop logic so it applies only for drawing tools, not select mode, with the accompanying Dock test. (S)
- [ ] Append-only in-progress stroke redraw fast path in useDrawingCanvas plus tests/perf benchmark asserting no clearRect after first frame. (M)
- [ ] Full AnnotationOverlay.test.tsx coverage for the new pass-through/selection/pen-capture behaviors, then pnpm run validate before push. (S)

#### `docs/plans/shipped/PLC_ASSESSMENT_DATA.md`

- [ ] D3/showPerTeacher per-teacher gated view was superseded by a later decision (PR #3400) to remove per-teacher breakdown entirely -- not simply implemented as planned. (S)

#### `docs/plans/PLC_RENAME_QUIZZES_TO_ASSESSMENTS.md`

- [ ] Inventory and update ~188 plcDashboard.\* strings across en/de/es/fr plus inline defaultValue fallbacks in PlcQuizzesBody.tsx, PlcQuizLibraryBody.tsx, PlcAssessmentsBody.tsx, PlcSettingsTab.tsx FEATURE_ROWS. (M)
- [ ] Update help center content and changelog entry. (S)
- [ ] Run i18n tests and screenshot the PLC page in all four locales for verification. (S)

#### `docs/plans/shipped/PROJECTS_WIDGET.md`

- [ ] Section 10.4 follow-up plan (audit widgets on global starred class) never started. (M)

#### `docs/plans/shipped/QUIZ_ACCOMMODATIONS_HANDRAISE_TTS.md`

- [ ] Excluded-student count on assignment cards (still open per doc, not implemented). (S)

#### `docs/plans/shipped/QUIZ_INTERFACE_REDESIGN.md`

- [ ] Remove dead 'editor' member from QuizConfig.view union in types.ts (Phase 3 cleanup). (S)
- [ ] Confirm Phase 1.5 (QuizResults.tsx visual alignment to monitor shell language) reached full parity with monitor toggle/sort/filter conventions. (S)
- [ ] Move ephemeral view-state (tab clicks, view-mode toggles) out of Firestore config into local state per Phase 3 item 2 — not verified as done. (M)

#### `docs/plans/QUIZ_JOIN_CODE_LOOKUP.md`

- [ ] Set LEGACY_CODE_QUERY_ENABLED = false and delete sessionsByLegacyQuery in utils/quizJoinCodes.ts. (S)

#### `docs/plans/QUIZ_STRUCTURED_ASSESSMENTS.md`

- [ ] PR1: auto-score override + rescore warning + PLC override math (D4-D7). (M)
- [ ] PR3: Part A/B groups, gated scoring, each-correct-part credit mode, MA choose-exactly-N (D15-D18). (L)
- [ ] PR4: Categorize question type (D19-D20). (L)
- [ ] PR5: structured passages, excerpt references, passage read-aloud setting (D21-D23). (L)
- [ ] PR6: teacher-scored item type + grading queue + class score grid (D24-D25). (M)
- [ ] PR7: general non-AI import detectors for sections/parts/passages/Categorize/ordering/teacher-scored (D26). (L)

#### `docs/plans/STARRED_CLASS_AUDIT.md`

- [ ] PR 1: empty-state bug fix for Seating Chart/Checklist/Randomizer + delete RosterModeControl.tsx if confirmed unused. (S)
- [ ] PR 2: per-widget-class flag, controlled ActiveClassChip, rosterId on 5 live-roster widget configs, Dashboard.defaultRosterId, switch-all toast, class-switch reset, migration stamp. (L)
- [ ] PR 3: import-class dropdowns (Poll/NextUp/Scoreboard), sub-share bundling of all board classes, Projects board-default hookup. (M)

#### `docs/plans/WIDGET_SETTINGS_DRAWER.md`

- [ ] Confirm remaining ~17 widget types without settings.schema.ts either have no settings panel or are intentionally deferred. (S)

#### `docs/plans/copy-audit/guided-learning.md`

- [ ] Spot-check and apply remaining SHORTEN/DELETE/MOVE verdicts across the ~40 remaining findings rows (Studio tour controls, recorder dialogs, screen-capture modal, classic editor chips, student app class-picker/paused overlay, Help Center). (M)

#### `docs/specs/README.md`

- [ ] Add M17 row to specs table. (S)
- [ ] Update reference from 'docs/remaining-todos-audit.md (since consolidated into TODO.md)' to just TODO.md. (S)
- [ ] Consider adding 'Status' column or 'Shipped Specs' section to clarify M12 and M17 completion. (S)

#### `docs/specs/LO12-nexus-widget-connections-spec.md`

- [ ] Candidate 2: Checklist → Timer auto-trigger (ChecklistItem.duration, checklistAutoTimer toggle) — recommended tracer 1. (S)
- [ ] Candidate 1: Webcam/Drawing → Guided Learning AI spawn — recommended tracer 2. (S)
- [ ] Candidates 3,4,5,7,10: Quiz/Text/GL/Poll → Graphic Organizer/Concept Web/Quiz spawns, need new AIGenerationType + Cloud Function promptMap entries. (L)
- [ ] Candidate 8: Scoreboard → Stickers threshold spawn. (S)
- [ ] Candidate 6: Video Activity → Guided Learning spawn. (M)
- [ ] Candidate 9: Schedule → Catalyst live sync. (L)

#### `docs/specs/M13-student-landing-overhaul-spec.md`

- [ ] Phase 1: add showResultToStudent to ActivityWallSession/MiniAppSession/GuidedLearningSession, StudentPageSection union + sectionOrder/assignmentsDefaultFilter on StudentPageConfig, config/assignmentDefaults.ts, wire showResultToStudentFrom into useStudentAssignments. (M)
- [ ] projectTeacherDirectory Cloud Function trigger + backfill script. (M)
- [ ] ResultsModal.tsx + AssignmentListItem CTA wiring. (M)
- [ ] Announcements + TeacherDirectory sections on student landing, StudentPageView section-order reorder UI. (M)
- [ ] i18n keys across locales/en,de,es,fr.json. (S)

#### `docs/specs/M17-individual-assignments-spec.md`

- [ ] Spec's own non-goals (per-student server-side window enforcement, automatic reduction presets, cross-assignment profiles) remain explicitly out of scope — not gaps, by design. (S)

#### `docs/PLC_ROADMAP.md`

- [ ] Phase 7 — Mini-apps PLC integration (share/sync/import + assignment index kind widening). (L)
- [ ] Phase 8 — Guided Learning PLC integration. (L)
- [ ] Several 'Still open' follow-ups documented at bottom (share-write rollback gap / detachSyncLinkage API) remain genuinely unresolved per the doc's own tracking. (M)

#### `docs/wide-distro-plan.md`

- [ ] Build rostered-join link for Quiz/Video/GL widgets. (L)

#### `docs/assign-from-spartboard-to-lms-feasibility.md`

- [ ] Update the doc's own status header and §7 to reflect that the scope/Marketplace step already happened and the flag is live (admin-only), since the doc text still reads as pre-flip guidance. (S)

#### `docs/multilingual-pronunciation-engine-spec.md`

- [ ] Build dialect surface, Firestore response shape, recording UX (issues #2338, #2354, #2351). (L)
- [ ] Build feature code: 'Speak' quiz question type, MediaRecorder capture, teacher results UI, gating via GlobalFeature. (L)
- [ ] Source/build per-dialect accepted stress-pattern reference data for Spanish, German, English. (M)

#### `docs/rich-response-wayfinder.md`

- [ ] File the 'shipped inconsistencies' the map found (Drive sharing-type mismatch, anonymously-readable global_pdfs, VA answer-key exposure, Matching/Ordering re-randomization bug, VA shuffleAnswerOptions no-op, transcription flag missingDocPublic mismatch) as tracked issues. (S)

#### `docs/rich-response/IMPLEMENTATION.md`

- [ ] Verify follow-up issues #2735, #2749-#2755, #2750, #2751 (sweep retry cap, pluralisation, and integration-review fixes) actually merged, not just referenced in the doc. (S)

#### `docs/multilingual-pronunciation-engine.md`

- [ ] Update the doc's spike status (the D1 bias probe has run) and the stale types.ts citations. (S)

#### `docs/gemini-api-terms-audit.md`

- [ ] Webcam OCR: default to on-device Tesseract or confirm before sending. (S)

### Blocked on another item

#### `docs/plans/ADMIN_ACCESS_PAGES.md`

- [ ] After migration, delete LEGACY_TOOL_FEATURES fallback and the three retired GlobalFeature ids one release later. (S)
- [ ] Deferred: collapse rollout switches into their paired flag (one gate instead of two). (L)

#### `docs/plans/shipped/FLASHCARDS.md`

- [ ] v2 scope: matching test type, PLC shared library ('copy into my library'), Speak mode. (L)

#### `docs/plans/shipped/PLC_HOME_V2.md`

- [ ] §7 removals: delete QuickCreateBar/CommonAssessmentBanner/AttentionCard/SinceYouWereHereCard/YourActionItemsCard/RecentDocsCard, old PlcHome.tsx path, MembersHeaderCluster merge, and the Assessments-header flag check, once the flag is Public. (M)

#### `docs/plans/shipped/QUIZ_EXAMVIEW_IMPORT.md`

- [ ] Carry `sections` into substitute launch (subLaunchAssignment) and PLC-synced quiz copies (synced_quizzes). (M)
- [ ] Print the choose-N count on the physical answer sheet bubble grid (currently test-paper only). (S)

#### `docs/plans/QUIZ_JOIN_CODE_LOOKUP.md`

- [ ] Flip sessionListScoping.test.ts quiz_sessions case to assertFails. (S)

#### `docs/plans/QUIZ_STRUCTURED_ASSESSMENTS.md`

- [ ] PR2: formatting, section extras (not-scored award, subtotals, wait-for-teacher) on top of ExamView's quiz-sections core (D8-D14). (L)
- [ ] PR8: A&L answer-key profile in non-AI key reader (D27). (M)

#### `docs/plans/WIDGET_SETTINGS_DRAWER.md`

- [ ] Delete components/settings/legacy/LegacySettingsSlot.tsx and related fallback plumbing (wave 10). (S)

#### `docs/specs/M16-plc-phases-7-8-spec.md`

- [ ] Implement Phase 7: Mini-Apps PLC integration (useSyncedMiniAppGroups hook, synced_mini_apps rules/collection, CF join, PLC body + import modal, PlcMiniAppEntry type, feature flag row). (L)
- [ ] Implement Phase 8: Guided Learning PLC sharing (mirrors Phase 7 pattern plus Drive-backed import gating). (L)

#### `docs/rich-response-wayfinder.md`

- [ ] Build deferred video capture (peer-mode UI, framing check, transcode runtime, district gate) and whiteboard B-track (event-log capture, page-space migration). (L)

#### `docs/rich-response/README.md`

- [ ] Integration follow-ups listed in IMPLEMENTATION.md (PRs #2750-#2755): LTI origin handling, index wait script, lost archive states, ffmpeg guard, transit path keying. (L)
