# SpartBoard Consolidated Backlog

**Last verified:** 2026-07-18 — every item below was checked against the actual code and git
history by a per-doc audit sweep (43 assessor agents). Items already shipped were dropped;
what remains is genuinely unshipped. This file replaces `docs/remaining-todos-audit.md`,
`docs/repo-improvement-plan-2026-07-13.md`, `docs/optimize-pass/`, `todo/`, and the other
deleted planning docs (see PR that introduced this file; git history preserves all of them).

**Living references kept alongside this file:**

- Feature specs (the plan-of-record for large items): `docs/specs/` (H1, H2, LO12, M12, M13, M16)
- Roadmaps / design docs: `docs/PLC_ROADMAP.md`, `docs/nexus.md`, `docs/wide-distro-plan.md` (referenced from code comments), `docs/written-response-quiz-questions.md`
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

- [ ] **H1 (Monitor/Results redesign)**: visual sign-off on Phase 2 atoms at `/session-views-dev`; Open Decision #3 (default results tab). See `docs/specs/H1-monitor-results-redesign-spec.md`.
- [ ] **H2 (rostered join links)**: Decisions A/B/C (SSO redirect flag timing, dual-link teacher UX, gating rostered-link visibility on class targeting). See `docs/specs/H2-rostered-join-links-spec.md`.
- [ ] **M12 (rubrics)**: OD-1 (builder UI placement), OD-2 (auto-fill vs advisory points), OD-3 (PLC sharing phasing). See `docs/specs/M12-written-response-rubrics-spec.md`.
- [ ] **M13 (student landing)**: Decision A (buildingIds vs classlinkClassIds teacher-directory scoping). See `docs/specs/M13-student-landing-overhaul-spec.md`.
- [ ] **M16 (PLC Phases 7–8)**: share-action integration point for Mini-Apps, mini-app sync content model, GL/Drive coupling during import. See `docs/specs/M16-plc-phases-7-8-spec.md`.
- [ ] **LO12 (Nexus connections)**: sign off deferral of Candidates 6/9 and rejection of 11. See `docs/specs/LO12-nexus-widget-connections-spec.md`.
- [ ] **M14 Schoology Phase E** formal deliverables — district coordination. (M)
- [ ] **D3**: schedule `jose` 4→6 and `@google/genai` dependency bumps with LTI/AI regression testing. (M/MED)
- [ ] **District Curriculum Repository** for Quiz widget (admin-approved quiz library, grade/subject tags) — large net-new feature, needs product definition. (L)

## 2. Spec-backed feature work (specs are the plan of record — build from the spec, not from here)

- [ ] **H1 — Monitor & Results redesign** (`docs/specs/H1-monitor-results-redesign-spec.md`): Phases 1–6. Nothing shipped yet; QuizLiveMonitor.tsx is ~2,979 lines — major structural surgery, preserve all existing handlers. (L/HIGH)
- [ ] **H2 — Rostered join links** (`docs/specs/H2-rostered-join-links-spec.md`): Phases 1–5 across Quiz/VA/GL/ActivityWall; stale TODO still at `components/widgets/ActivityWall/Widget.tsx:1805`. Watch open-redirect risk in `resolveNextTarget` prefix matching. (L/MED)
- [ ] **M12 — Written-response rubrics (Phase 3)** (`docs/specs/M12-written-response-rubrics-spec.md` + design doc `docs/written-response-quiz-questions.md`): types, `/users/{uid}/rubrics` rules + tests, RubricBuilderPanel, RubricScoringPanel, useRubrics, CSV export, PLC sharing. Carry-overs from Phase 1: rules tests for student-rejection on grading writes; Playwright pause/resume-next-day E2E. Phase 4 (AI-assisted grading) optional/deferred. (L)
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
- [ ] **M5**: finish `/subs` Collections stub + Drive grants for Collection shares. (M/LOW)
- [ ] **M6**: Quiz edit modal AssignClassPicker + `rosterIds` migration (data-model change). (M/MED)

## 6. Admin / no-code roadmap stragglers (from the archived non-code roadmap — verify before building)

- [ ] **Mini App library Monaco editor**: wire `@monaco-editor/react` (already used in WidgetBuilder/CodeEditorPane) into `MiniAppLibraryModal.tsx`; formalize/version the postMessage bridge API. (M/LOW)
- [ ] **JSON-schema-driven admin config renderer** (the roadmap claimed `SchemaDrivenConfigurationPanel.tsx` exists — it does not): decide whether to generalize the ~60 bespoke `*ConfigurationPanel.tsx` files or drop the idea. (M)
- [ ] **Data binding / webhooks (Phases 3.3–3.4)**: server-side proxy + webhook executor CFs — security-sensitive, needs careful design. (L/HIGH)
- [ ] **Google Fonts picker + @font-face upload (Phase 1.2)** — not verified as implemented; verify then build or drop. (M/LOW)
- [ ] **Auto-assign dashboard template on first login by building/grade; admin lock/unlock of live widgets** — remaining halves of Phases 4.1/4.2; verify then finish. (S–M/LOW)
