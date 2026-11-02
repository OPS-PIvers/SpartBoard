# Agent backlog

Work an agent can pick up without asking. Paul points at an ID ("do AB-12"); the brief is the whole hand-off. Anything that needs Paul to click, test, decide or approve is in [PAUL_TODO.md](PAUL_TODO.md), not here.

## How to use this file

- **Pick from Ready.** Each item says what and why, where to look, and what counts as done. When an item links a plan, the plan is the source of truth and its decisions (D-numbers) win over this brief.
- **Re-verify first.** Items marked _re-verify_ came from older audits; check the code, and if it's already fixed, delete the item in your PR and say so.
- **Finishing.** Delete the item in the PR that finishes it; no checked-off lines, git keeps history. For a plan entry, update its **Next** line instead, and delete the entry when the plan moves to `docs/plans/shipped/`.
- **New work.** Add a brief in the right area with the next free ID (IDs are never reused). **Next free ID: AB-73**; bump it in the same PR, so parallel adds conflict here. If it needs Paul first, add a `PT-` item to PAUL_TODO.md and put the agent half under Blocked here, naming that `PT-` ID.
- **Flags.** Never open a flag on prod. Retiring or graduating a gate happens after Paul opens it, from the prompt on his PAUL_TODO row.
- Effort: S (under a day), M (a few PRs), L (a plan's worth). Risk shown only when it isn't low.

Last audited 2026-11-01 (#4974 sweep, then a targeted re-check when this file was split from TODO.md).

---

## Ready

### Security and correctness

- **AB-1 Next Up entries: class check and owner binding** (M, MED). The `nextup_sessions/{id}/entries` create rule checks an active parent session and shape/size but not that the writer is in the session's class or owns the entry. Files: `firestore.rules`, `tests/rules/nextupEntries.test.ts`. Done when: emulator tests prove a student outside the class, or one writing another student's entry, is refused, and `pnpm run check:rules-size` still passes.
- **AB-2 Live session races** (M, MED, _re-verify_). C3 PIN-uniqueness TOCTOU race, C4 the SSO assignment query cap above 30 classes (Firestore `in` limit), C5 join-code collision handling. Files: `hooks/useLiveSession.ts`, `hooks/useStudentAssignments.ts`. Done when: each one is either fixed with a test reproducing it, or shown to be already handled and dropped.
- **AB-3 Duplicate "My First Board"** (S, _re-verify_). C1: two first-sign-in paths could each create a default board. The `defaultBoardCreatedForUidRef` the old item named no longer exists; the creation is near `context/DashboardContext.tsx:2718`. Done when: a test shows two concurrent first loads create one board, or the item is dropped as handled.
- **AB-4 Grade doc split** (L, MED). Gradebook D37: move `score`, published `isCorrect` and quiz `grading` off quiz, VA and GL response docs into a teacher-gated `grades/{responseKey}` doc, so students can't read unpublished scores. A read rule alone can't do it. Plan: `docs/plans/GRADEBOOK.md` D37. Must tolerate open old-client tabs at release (CLAUDE.md, compatibility).
- **AB-5 Synced-board drawings `hostUid`** (L). LO9: Drawing canvases on synced boards don't carry the host's uid, so sync reads the wrong owner. Done when: a synced board shows the host's drawing to members, with a test.
- **AB-6 Rules and E2E gaps** (L). T1-T5: rules tests for PIN-session collections, `short_links` and the quota collections, plus E2E for the PIN join and quiz session journeys. Files: `tests/rules/`, `tests/e2e/`. Done when: each collection has allow and deny cases.
- **AB-7 File the rich-response inconsistencies as issues** (S). `docs/rich-response-wayfinder.md` lists shipped inconsistencies that were never filed (checked 2026-11-01): Drive sharing-type mismatch, anonymously readable `global_pdfs`, VA answer-key exposure, Matching/Ordering re-randomization, VA `shuffleAnswerOptions` no-op, the transcription flag's `missingDocPublic` mismatch. Re-check each against the code, file what's still real as a GitHub issue, and replace the wayfinder's list with the issue links.
- **AB-8 Pseudonym call errors** (S). `getPseudonymsForAssignmentV1` returned 79 × 404 and 34 × 403 out of 876 calls in the 30 days to 2026-10-01. Find which callers hit them (function logs, then the client call sites). Agents can't read prod Cloud Run; if prod logs are needed, add a `PT-` item asking Paul to pull them.
- **AB-9 Board save contention** (M). `Commit FAILED_PRECONDITION` grew from 13-146/day mid-September to 2,000-3,845/day by late September. `saveDashboard` (`hooks/useFirestore.ts` ~:365) is the likely source. Find the loop and fix it without dropping the transactional read (see Rejected). An alert fires above 1,000/hour.
- **AB-10 Force-reload stale clients** (M, MED). A tab left on an old build kept the September 10 egress spike going about 1 GiB/hour after the fix shipped; `hooks/useAppVersion.ts` only prompts. Force a reload for clients N builds behind, at a safe moment and never with unsaved edits.
- **AB-59 Class-claim gate leftovers** (M, MED, _re-verify_). From the 2026-10-25 security fixes (#4670-#4682): the quiz attempt `history` rules read, `getQuizArtifactPlaybackUrl` and `getPaperWrittenCropV1` need the same class-claim gate #4678 added. Grade rows should get kind-qualified ids (#4677). Done when: each path has an allow and a deny test.
- **AB-60 Permission-error leftovers** (S, _re-verify_). From #4683-#4695: the org admin panel still offers role, status and Deactivate on a domain or building admin's own row (now fail, #4693), so disable them there; team viewers still see "Sync" in the import modal and viewer teammates in the print picker (both fail, #4692), so hide them; Video Activity import may still offer Synced for a share whose author left the group (#4694 fixed only the quiz preview); a refused paper-crop entry that already has a Drive id still retries (#4691); `plcDetached` markers (#4692) outlive deleted groups (tiny, no names).
- **AB-61 Synced PLC header after Stop syncing** (S, _re-verify_). If the sharer clicks Stop syncing and the group was first made outside that PLC, new members can't synced-import, assign or edit it (copy import works). `assertGroupLinkedToPlc` (`functions/src/plcSyncJoinGuards.ts`) should accept any active PLC member who is a participant (#4692/#4694).
- **AB-62 Duplicate rules denials** (S). `firestore.rules` repeats the `artifactArchive`/`hasStuckArchive`/`backTranslations` create denials (#4690 and #4691, ~line 5068 and 5076); drop one copy and confirm `pnpm run check:rules-size` shrinks.
- **AB-63 PIN and second-tab edges** (M, _re-verify_). Low while PINs are off at the org. From #4684 and #4734: 30 PIN misses in 15 minutes send later joiners to the plain anonymous PIN join (no identity carry-over); the PIN roster budget (150 misses/day) can do the same for linked students on new devices; `/project/*` and `/flashcards/a/*` accept a PIN token that rules now deny, so show "sign in with your school account"; opening Poll, a wall, GL or a Mini App in a second tab during a PIN quiz swaps the quiz tab to anonymous (shared auth; fix is an isolated auth instance); `isOrgOnlyAdmin` (`utils/superAdmin.ts`) ignores member status, so an invited admin of another org sees a tab rules refuse.
- **AB-64 Release 2026.10.29 minors** (S, _re-verify_). All admin-only or flag-on (#4834): Focus Start button briefly re-enables before the session appears; the fullscreen cover needs focus management and translations, and a teacher preview of a Lock session goes fullscreen; push subscriptions aren't pruned on 400/403 and have no TTL; the tokeninfo call has no timeout; the VA Settings modal shows an error if the pointer update fails after saving.
- **AB-65 Triage the 2026-10-28 release minors** (S). Issue #4786 (#4785: a rare widget-reappear race in the board sync fix, cross-board saves no longer atomic, AI boards polish) and the #4807 description (VA shuffle-off, Countdown scrollbar at tiny sizes, Number Line step at 500px, Music old-tab station, long Activity Wall prompt). Fix what's still real, close or update #4786.
- **AB-72 Imported Drive ids in Next Up and the old PLC sheet helper** (S). Same class as the Guided Learning, RevealGrid and image-cleanup fixes: Next Up's "End and delete" (`components/widgets/NextUp/settingsFields.tsx`) permanently deletes `config.activeDriveFileId`, which can arrive in an imported widget; gate it with `driveService.isInAppFolder` on the folder Next Up uploads to. `QuizDriveService.reconcilePlcSheetPermissions` (`utils/quizDriveService.ts`) has no callers since the invite-accept reconcile was removed; delete it and its tests. Done when: a test shows a foreign id is left alone and the dead helper is gone.

### Performance and cost

- **AB-11 Backgrounds listener** (S). P5: `hooks/useBackgrounds.ts` holds permanent `onSnapshot` listeners on `admin_backgrounds` (still true 2026-11-01). Use a one-shot `getDocs` when the picker opens.
- **AB-12 Weather: skip unchanged writes** (S). `components/admin/AdminWeatherFetcher.tsx` rewrites `global_weather/current` on every fetch, which fans out to every open Weather widget. The freshness skip already shipped; still open: skip the write when the values are unchanged. That needs a separate `lastCheckedAt`, or teacher widgets' last-sync time goes stale. Don't skip hidden tabs; teacher widgets rely on admin tabs.
- **AB-13 Session `classIds` migration** (M, MED). F2: `useStudentAssignments` runs two queries because some session docs only carry the legacy `classId`. Write the migration that adds `classIds`, run it on dev, and stop the legacy write paths. Done when: the script and dev run are merged, and a `PT-` item asks Paul to run it on prod. The single-query collapse is AB-58.
- **AB-14 Bundle guard and image compression** (M, _re-verify_). P3: `manualChunks` plus a bundle-size CI guard (also check the DashboardView chunk against the 500 KB warning). P4: client-side image compression on upload paths.
- **AB-15 Quiz leaderboard subdoc** (M, optional). `MonitorShell.tsx` (~:380-394) writes `liveLeaderboard` onto `quiz_sessions/{id}`, which every student listens to; for non-per-period games that doc can reach 900 KB. Move only `liveLeaderboard` to a subdoc and dual-write for one release.

### Quiz, Video Activity and Guided Learning

- **AB-16 Quiz view state cleanup** (M). From `docs/plans/shipped/QUIZ_INTERFACE_REDESIGN.md` Phase 3: remove the `'editor'` member from `QuizConfig.view` (`types.ts` ~6702) if nothing sets it; move ephemeral view state (tabs, view toggles) out of Firestore config into local state; check QuizResults (Phase 1.5) matches the monitor's toggle, sort and filter conventions.
- **AB-17 Excluded-student count on assignment cards** (S). From QUIZ_ACCOMMODATIONS_HANDRAISE_TTS: cards don't show how many students were excluded at assign.
- **AB-18 ExamView sections everywhere** (M). Carry `sections` into substitute launch (`subLaunchAssignment`) and PLC synced copies (`synced_quizzes`), and print the choose-N count on the answer sheet bubble grid (today only the test paper shows it). Plan: `docs/plans/shipped/QUIZ_EXAMVIEW_IMPORT.md`.
- **AB-19 Remove the classic GL editor** (M). GL_STUDIO_GESTURES PR 5: delete the Studio's "Open classic editor" (`glStudio.openClassicEditor` in `EditorHeader.tsx`) and the classic `GuidedLearningEditorModal` from `GuidedLearning/Widget.tsx`. Carry over any tour anchors.
- **AB-20 GL copy audit** (M). Apply the remaining SHORTEN/DELETE/MOVE verdicts (about 40 rows) in `docs/plans/copy-audit/guided-learning.md`, spot-checking each first; update all four locales.
- **AB-21 Confirm VA/GL target tagging** (S). Gradebook D29 expects learning-target tagging on VA and GL questions. Check that it shipped; if not, add a brief here.
- **AB-22 Speak editor re-lookups** (S). From S13 (`docs/multilingual-pronunciation-engine.md`): when hosting runs a newer engine version than functions, editor saves look up every card again.
- **AB-23 Import review minors** (S). From the 2026-10-30 release review; all behind the admin-only `universal-import` flag. They must be fixed before Import opens (PT-49).
  - S1: image URLs not run through `storedUrl`; the reader-failure log can be spammed; the inbox cap is soft.
  - S2: Import code is statically imported into the `DashboardView` chunk (bundle size).
  - S3: student devices call `importStatusV1` every 30 minutes; a `user:pass` image URL fails the whole send.
  - S4: the page fetch has no port restriction; the rate limit is per instance.
  - S5: flashcard and Activity Wall text skip the link filter.
  - S6: notebook SVGs carry a double href (memory use).
- **AB-66 Quiz settings stale class removal** (S, _re-verify_). From #4734: adding or removing a class while another class's roster was deleted or re-imported still marks that stale class removed and hides its work. Record only classes the teacher unchecked (`nextRemovedClasses`, `hooks/useQuizAssignments.ts`). Also: GL Results can show a removed class's work for a moment before the session loads.
- **AB-67 Video import review minors** (M). From release 2026.10.31 (#4959); all behind admin-only flags, fix before those flags open.
  - Re-marking a short answer after Publish leaves the stored score until the teacher republishes (`functions/src/gradebook/gradeRowMath.ts` uses `stored ?? live`). A blank mark box can't clear a mark back to unmarked (`utils/videoActivityShortAnswerMark.ts`).
  - Clip and note stops reach PLC peers without `video-activity-stops` through sync, shared boards, sub-shares and LTI; the flag gates authoring only.
  - Note stops are silent in teacher-paced live runs (`VideoActivityLivePlayer.tsx` passes only `clip`); whether they should pause is PT-102.
  - Every synced publish writes `notes: []`; an old synced group costs one extra Drive read on its first pull (`hooks/useVideoActivity.ts`).
  - Edpuzzle pictures: copies are orphaned if the widget unmounts mid-copy; removing a picture in the editor doesn't delete its Drive file; stops past 200 aren't counted in "Left out".
  - `AGGREGATE_SCHEMA_VERSION` wasn't bumped with the short-answer grading fix (#4961); old PLC video aggregates with a short answer refresh only when next marked dirty.
  - `sendId` now hashes `send.video`, so re-sending a page already in the inbox after the release makes a second item (TTL cleans it).
  - Per-type Import flags (#4960): AI conversion on the server checks only `universal-import`; `import-link` also hides the Embed check's "Add as a link"; tests don't render a flag-off case.
- **AB-68 PLC aggregates for video activities** (M). From the #4961 review: they're never built. `recomputeOnePlcAssessment` reads only `quiz_sessions`/`synced_quizzes` and `status == 'completed'`, and `markPlcAssessmentDirty` watches only quiz sessions. A video kind needs `video_activity_sessions`, `synced_video_activities`, `completedAt != null`, and short answer mapped to free-response.

### PLC, Schoology and imports

- **AB-24 Schoology columns Phase 6** (M). Score never-launched students on Schoology-attached sessions through NRPS matching. Plan: `docs/plans/shipped/SCHOOLOGY_TOOL_COLUMNS.md`.
- **AB-25 PLC sync rollback gaps** (M). `docs/PLC_ROADMAP.md` "Still open": the share-write rollback gap and the `detachSyncLinkage` API.
- **AB-26 Rostered join link** (L). Quiz, Video Activity and GL get a rostered join link (`docs/wide-distro-plan.md`).
- **AB-69 Schoology quiz import review screen** (M). The next PR after server PR1+PR2, carrying the #4854 review findings: inbox docs store `blankAlternates` as `{answers}[]` but `ExtractedQuestion` uses `string[][]`, so `fibAlternates` drops them; the inbox re-send path should claim the replaced `sendId` in a transaction so pictures aren't orphaned; `assessmentReader` turns null points into 0; `readResult` image `src` values must be limited to https Schoology URLs before any credentialed fetch. Accepted as is: `?schoologyImport=1` from any link adds a Quiz widget for a flagged user with none on the board (own data only); the 24 MB picture cap.

### Tours and extension

- **AB-27 Live tour benchmark fixes** (M). `docs/live-tours/BENCHMARK.md` B1-B6, B10: `get_live_tour` drops the material sample; picture `upload_url` unreachable; a type step with no value is refused against the guide; the `editor.save:quiz` key; demo content in the guide; multiple openers per surface; video activity tour 11 not green.
- **AB-28 Web tour pictures with suggestions** (M). C15 in `docs/plans/shipped/WEB_TOURS_CLAUDE.md`: save a fresh picture with a suggestion from an admin's own run or a check run (PR 5 sends clues only).
- **AB-70 Schoology Materials Send button goes stale** (S). From the #4858 review: the Materials checklist is built once at injection, so an AJAX-filled table or a pushState move to a subfolder leaves it stale or empty and no Send button shows. Add a `webNavigation.onHistoryStateUpdated` re-inject and a MutationObserver/retry. Also: the `openReview` reload fallback reloads an open board tab if the event isn't heard (consider a new tab); `render()`'s `if (!page)` branch is unreachable. Raise the extension version in the same PR.
- **AB-71 PDF viewer tour anchor route** (S). From the #4670 review: the PDF viewer needs an anchor route so live tours can reach its controls (`config/tourSurfaces/`).

### Widgets and UI

- **AB-29 Settings drawer wave 10** (M). List the widgets without `settings.schema.ts` (about 85 widget folders, 58 schemas), confirm each has no settings or migrate it, then delete `components/settings/legacy/LegacySettingsSlot.tsx` and the frozen legacy palettes (`docs/plans/shipped/WIDGET_SETTINGS_DRAWER.md` D9, D12, D30).
- **AB-30 Activity Wall leftovers** (S). P3-3: delete the no-op `archiveActivityWallPhoto` callable and its test, the `activity_wall_photos` block in `storage.rules`, the `?data=` decoder remnants, and the deprecated `mode`/`identificationMode` writes (`functions/src/driveArchive.ts`, `functions/src/index.ts`, `types.ts`, `components/widgets/ActivityWall/`). Keep old docs readable.
- **AB-31 Dead sidebar component** (S). `components/layout/sidebar/SidebarBoardsActive.tsx` is rendered nowhere; remove it, its test, and its entries in `config/tourSurfaces/board.ts`, `tests/e2e/sharing.spec.ts` and `tests/i18n/boardsModalCollectionLocales.test.ts`.
- **AB-32 Always-visible copy leftovers** (S). From `docs/plans/shipped/ALWAYS_VISIBLE_COPY.md`: decorative accent strips (Analytics KPI cards, LinksPanel, WhatsNewModal, TalkingTool); colour-only status (Drive sidebar dot, class-row dot, Poll and VA markers, PLC switches missing `role="switch"`); static help styled as blue alert boxes (QuizEditor, StimulusManagerPanel).

### Build hygiene

- **AB-33 Unused-locals strictness** (L). `tsconfig.json:38-39` has `noUnusedLocals`/`noUnusedParameters` false. Flip them and clear TS6133/TS6196 in per-directory batches.
- **AB-34 CI lint memory** (M). F11: split the root and functions type-aware ESLint passes so the `NODE_OPTIONS` 5120 MB override can go, or document why it stays.
- **AB-35 Functions `types.ts` alias** (S). F18: give `functions/tsconfig.json` an alias to the root `types.ts`, or close the item with the reason (ClassLinkUser duplication is already solved by `functions/src/classlinkShared.ts`).
- **AB-36 useEffect cleanups** (S + M). Move the `prevIndexRef` sync out of an effect in `components/layout/DashboardView.tsx` (~559, 966); extract the ~175-line live scoreboard sync effect in `components/widgets/QuizWidget/Widget.tsx` into a `useLiveScoreboardSync` hook.
- **AB-37 Configurable internal domain** (S-M). LO8: `orono.k12.mn.us` is hardcoded in `utils/userTier.ts`, and /subs operator scoping is fixed; make both admin-configurable.
- **AB-38 Quiz assign picker and `rosterIds`** (M, MED). M6: the Quiz edit modal's AssignClassPicker plus the `rosterIds` data migration.

### Plans with a next slice

The plan holds the slices; build the **Next** one and update this line in the same PR.

- **AB-39 Quiz roster grading and reopen**: `docs/plans/QUIZ_ROSTER_GRADING_AND_REOPEN.md`, approved 2026-10-30. Next: slice 0.
- **AB-40 Structured assessments**: `docs/plans/QUIZ_STRUCTURED_ASSESSMENTS.md`. Next: PR1 (auto-score override, rescore warning, PLC override math, D4-D7). Then PR3-PR7; PR2 and PR8 build on ExamView's sections core; PR9-PR10 need the gathered A&L assessments.
- **AB-41 Starred class audit**: `docs/plans/STARRED_CLASS_AUDIT.md`. Next: PR 1 (empty-state fix for Seating Chart, Checklist and Randomizer; delete `components/common/RosterModeControl.tsx` if unused). Includes PROJECTS_WIDGET §10.4. PR 4 waits for Paul to open the flag.
- **AB-42 Annotation overlay PR3**: `docs/plans/ANNOTATION_OVERLAY_PR3.md`. Next: item 2 (`hitTestInk` with unit tests), then pointer pass-through, the Dock guard narrowing, and the stroke redraw fast path.
- **AB-43 Unit Overview widget**: `docs/plans/UNIT_OVERVIEW_WIDGET.md`. Next: Phase 1 step 1. Ships behind a flag (`new-widget` skill).
- **AB-44 AI Responsible Use widget**: `docs/plans/AI_RESPONSIBLE_USE_WIDGET.md`. Next: PR1 (registration, flag, `config/aiResponsibleUseContent.ts` with the verbatim district content). The flag can't open until PT-82.
- **AB-45 Chrome extension quiz and video hand-off**: `docs/plans/CHROME_EXTENSION.md`. Next: slice 15 / F13.
- **AB-46 Drawing page space**: `docs/plans/shipped/QUIZ_WHITEBOARD_RESPONSE.md` D29, the decoupled Drawing widget page-space migration.

## Blocked

Each names what unblocks it. When the blocker clears, move the item to Ready.

- **AB-47 Drop the join code transition** (S). Blocked on PT-1, then one more release. Remove `o == null` in `ownsJoinCode` (`firestore.rules` ~4863) and flip the "staff use a code nobody has claimed" case in `tests/rules/quizJoinCodeLookup.test.ts` to `assertFails`.
- **AB-48 Legacy tool features** (S). Blocked on PT-62, then one release. Delete the `LEGACY_TOOL_FEATURES` fallback (`components/layout/Dock.tsx:762`, `config/featureDefaults.ts`) and the three retired GlobalFeature ids.
- **AB-49 One gate per rollout** (L). Blocked on AB-48. Collapse each rollout switch into its paired flag (ADMIN_ACCESS_PAGES, deferred).
- **AB-50 PLC rename** (M). Blocked on PT-87. Rename ~188 `plcDashboard.*` strings in en/de/es/fr and the inline fallbacks in `PlcQuizzesBody.tsx`, `PlcQuizLibraryBody.tsx`, `PlcAssessmentsBody.tsx`, `PlcSettingsTab.tsx`; Help Center and changelog; screenshot all four locales. Plan: `docs/plans/PLC_RENAME_QUIZZES_TO_ASSESSMENTS.md`.
- **AB-51 PLC phases 7-8** (L). Blocked on PT-88. Phase 7 Mini-Apps PLC integration (`useSyncedMiniAppGroups`, `synced_mini_apps` rules, CF join, PLC body and import modal, flag row; widen `assignment_index` so `sheetUrl` is optional for `mini-app` and `guided-learning`). Phase 8 GL PLC sharing (same pattern plus Drive-backed import gating). Spec: `docs/specs/M16-plc-phases-7-8-spec.md`.
- **AB-52 Nexus connections** (S-L). Blocked on PT-89 (Decision A). Then tracer 1: Checklist → Timer (candidate 2); tracer 2: Webcam/Drawing → GL (1); Scoreboard → Stickers (8); Quiz/Text/GL/Poll spawns (3, 4, 5, 7, 10; new AIGenerationType and promptMap entries); VA → GL (6); Schedule → Catalyst (9). Spec: `docs/specs/LO12-nexus-widget-connections-spec.md`.
- **AB-53 Import wave 2 and 3 readers** (M each). Blocked on PT-91 samples. Google Forms reader, Canvas/QTI file route, then ranked wave 3. Plan: `docs/plans/IMPORT.md`.
- **AB-54 Import S8 PR2** (M). Blocked on PT-8. Extension Send for a single Schoology rubric or discussion.
- **AB-55 Schoology grade import** (L). Blocked on PT-90. Plan: `docs/plans/SCHOOLOGY_GRADE_IMPORT.md`.
- **AB-56 Web tour list cost** (M). Blocked on firestore.rules size headroom. Store each tour's start host and step count at publish so `webToursListV1` stops reading every step.
- **AB-57 Starred class PR 4** (S). Blocked on Paul opening the per-widget class flag (after AB-41 PR 2-3). Remove the star UI, `activeRosterId`/`setActiveRoster`, the localStorage key and the Classes widget catalog entry.
- **AB-58 One student assignment query** (M). Blocked on AB-13's prod run. Collapse `useStudentAssignments` to a single `classIds` query with a regression test.

## Reference

### Live plans

Each stays in `docs/plans/` until built, then moves to `docs/plans/shipped/` and its human leftovers go to PAUL_TODO.md.

| Plan                                                           | State (2026-11-01)                                                                                  | Here         |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------ |
| `docs/plans/IMPORT.md`                                         | Wave 1 and the Edpuzzle, YouTube and Quizlet readers built behind `universal-import` and `import-*` | AB-53, AB-54 |
| `docs/plans/CHROME_EXTENSION.md`                               | Web tours and Focus FS1-9, FS12 built                                                               | AB-45        |
| `docs/plans/GRADEBOOK.md`                                      | Phases 1-6 built behind admin flags                                                                 | AB-4, AB-21  |
| `docs/plans/QUIZ_ROSTER_GRADING_AND_REOPEN.md`                 | Approved, unbuilt                                                                                   | AB-39        |
| `docs/plans/QUIZ_STRUCTURED_ASSESSMENTS.md`                    | Unbuilt                                                                                             | AB-40        |
| `docs/plans/SCHOOLOGY_GRADE_IMPORT.md`                         | Unbuilt                                                                                             | AB-55        |
| `docs/plans/STARRED_CLASS_AUDIT.md`                            | Unbuilt                                                                                             | AB-41, AB-57 |
| `docs/plans/UNIT_OVERVIEW_WIDGET.md`                           | Unbuilt                                                                                             | AB-43        |
| `docs/plans/AI_RESPONSIBLE_USE_WIDGET.md`                      | Unbuilt                                                                                             | AB-44        |
| `docs/plans/ANNOTATION_OVERLAY_PR3.md`                         | Unbuilt                                                                                             | AB-42        |
| `docs/plans/PLC_RENAME_QUIZZES_TO_ASSESSMENTS.md`              | Waiting on scope                                                                                    | AB-50        |
| `docs/plans/copy-audit/guided-learning.md`                     | Most verdicts unapplied                                                                             | AB-20        |
| `docs/specs/M16-plc-phases-7-8-spec.md`, `docs/PLC_ROADMAP.md` | Unbuilt                                                                                             | AB-51, AB-25 |
| `docs/specs/LO12-nexus-widget-connections-spec.md`             | Unbuilt                                                                                             | AB-52        |
| `docs/plans/WIDGET_RUBRIC.md`                                  | Living reference for the widget grader; not backlog                                                 |              |

Other references: roadmaps and design docs (`docs/nexus.md`, `docs/wide-distro-plan.md`), runbooks (`docs/admin_settings_widget_configs.md`, `docs/external-availability-*.md`, `docs/assign-from-spartboard-to-lms-feasibility.md`, `docs/ADMIN_SETUP.md`, `docs/DEV_WORKFLOW.md`, `docs/LINTING_SETUP.md`, `docs/DEPLOY_CHECK.md`), and the decision record in `docs/plans/shipped/`.

### Known limits (accepted; no work unless Paul asks)

- Drawing (#4650-#4663): the sticky note editor keeps its starting text size while typing and shrinks on save; alignment guides use a rotated item's unrotated box.
- Poll (#4637-#4666), with the flag on: Reset after Stop ends that session, so the next Start gets a new join code; typed answers drop off the board after Stop (they stay in Results and the CSV); reordering questions after a session maps old votes by position.
- Sound (#4648-#4664): goal progress and the session summary live only in the open tab, so a reload clears them; lowering the goal below time already counted doesn't award the point.
- `/plc/:id/dataOverview` URLs stay on that path when PLC Home is off (URL only, #4734).
- Chrome Extension CI bench budget (frame gap p95 150 ms) failed once on a runner at 183 ms (#4698); fix the bench if it flakes again.

### Rejected; don't re-propose without answering these

From the 2026-10-01 cost audit, adversarially reviewed:

- **Prod `minInstances: 0` for `getPseudonymsForAssignmentV1`**: cold starts measured 5-10 s (up to 20 s+), and about 19% of calls would land cold. A visible regression for about $4-5/mo net.
- **`persistentLocalCache`**: can't be route-scoped, leaves student data in IndexedDB on shared devices, and feeds stale first snapshots into the save baseline.
- **Skipping the transactional read in `saveDashboard`**: reopens the multi-device clobber #2813 fixed.
- **Moving `currentQuestionIndex`/`questionPhase`/`autoProgressAt`/`revealedAnswers` out of the session doc**: already-open student tabs freeze, and those fields lose atomicity with `status`.
- **Slowing the student written-answer autosave from 500 ms**: negligible egress saved, wider data-loss windows.
