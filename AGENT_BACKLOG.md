# Agent backlog

Work an agent can pick up without asking. Paul points at an ID ("do AB-12"); the brief is the whole hand-off. Anything that needs Paul to click, test, decide or approve is in [PAUL_TODO.md](PAUL_TODO.md), not here.

## How to use this file

- **Pick from Ready.** Each item says what and why, where to look, and what counts as done. When an item links a plan, the plan is the source of truth and its decisions (D-numbers) win over this brief.
- **Re-verify first.** Items marked _re-verify_ came from older audits; check the code, and if it's already fixed, delete the item in your PR and say so.
- **Finishing.** Delete the item in the PR that finishes it; no checked-off lines, git keeps history. For a plan entry, update its **Next** line instead, and delete the entry when the plan moves to `docs/plans/shipped/`.
- **Release review findings.** Fix small (S) findings inside the release as `release fix:` PRs. File an item here only for work that is M or larger, needs a flag or rules design, or can't ship in that release.
- **Agent-only means agent-only.** An item in Ready needs nothing from Paul. When an item needs new wording, the agent builds it and asks Paul with a screenshot and a decision card in its thread; when it needs a real decision, it goes to PAUL_TODO.md and the item moves to Blocked.
- **New work.** Add a brief in the right area with the next free ID (IDs are never reused). **Next free ID: AB-310**; bump it in the same PR, so parallel adds conflict here. If it needs Paul first, add a `PT-` item to PAUL_TODO.md and put the agent half under Blocked here, naming that `PT-` ID.
- **Flags.** Never open a flag on prod. Retiring or graduating a gate happens after Paul opens it, from the prompt on his PAUL_TODO row.
- Effort: S (under a day), M (a few PRs), L (a plan's worth). Risk shown only when it isn't low.

Last audited 2026-11-15 (drift and blocker check; see the backlog drain routine). The nightly [backlog drain routine](docs/routines/backlog-drain.md) works through Ready, so Paul never needs to read this file.

---

## Ready

### Security and correctness

- **AB-289 Video Activity: turn in let-in and reopened students after their pass ends** (S, from #6238 review). A closed VA class's turn-in (teacher tab and `functions/src/videoClassTurnIn.ts`) skips students with a live `studentAccess` pass or on `reopenedFor`, then never looks again, so their attempt stays open for good. Quiz covers this through `classClosedOver` in the idle sweep. Re-queue the marker for the latest pass expiry (or re-check closed classes on a slow sweep), with functions tests.

- **AB-304 Follow-ups from release 2026.11.19b** (S, #6272 review; nothing blocking). (1) `functions/src/mcp/boardWrite.ts` `commitBoardChange` refunds the board allowance only from the `batch.commit()` catch; a retry after a conflict (code 9) that then throws (missing board, `change()`, `assertFits`) or returns `unchanged` keeps the allowance spent with nothing written. Refund once whenever `reservedAt` is set and no commit landed, keeping ambiguous errors (code 4) charged, with tests. (2) `context/AuthContext.tsx` clears the quick sign-in device flag on manual sign-out but not on the idle-timeout sign-out; clear it there too. (3) `glClassLifecycle.ts` and `miniAppClassLifecycle.ts` only `console.error` a pointer-sync failure on Open; show the teacher a toast as Quiz should. (4) `tests/rules/focusSessions.test.ts`: add a legacy sub stamp with no `subMonitorShares` entry, a map that names a share only for a different uid, and a renewed share.
- **AB-283 Follow-ups from release 2026.11.18** (S, #6138 review; nothing blocking). (1) `.github/scripts/affected-functions.mjs` `RUNTIME_FEATURE_ID_CALLERS` still names `quizMediaArchive.ts` and `aiGeneration.ts`, but the variable-id flag lookup now lives in `functions/src/featureGrant.ts` (`isGlobalFeatureGranted`); add it so a release that only adds a flag id to `ADMIN_PREVIEW_FEATURES` redeploys its callers. (2) The prod deploy starts the Firestore rules release before the function delete check, so a failed check leaves new rules live with old functions; run the delete check first.
- **AB-275 Board save race and cross-board saves** (M, from AB-65 triage of #4786 and #4773). (1) A widget deleted within one save round-trip of being added can reappear: when the active board isn't pending but another board is, `knownIds` is empty (`context/DashboardContext.tsx`, around the sync merge). Track recently saved widget ids so the merge can tell a delete from a not-yet-seen add. (2) `saveDashboards` runs one transaction per board, so a cross-board config apply and the tour keep are no longer atomic; batch them or make each step safe to retry. Add a test for each.
- **AB-262 Follow-ups from release 2026.11.17** (S, #6040 review; nothing blocking). (1) Writing callables (`functions/src/writingSessions.ts`, `writingResponses.ts`) check ownership but not the Writing widget grant server-side; add the grant check to `assignWritingV1` as `saveCourseV1` does. (2) `hooks/useQuizSession.ts` `toPublicQuestion` copies `modifiedText` and `modifiedRubricSnapshot` onto every student's public questions; keep them only for students in a modification group. (3) `hooks/useWritingReturnedDrafts.ts` opens one listener per draft copy (up to 50); read them with one query. (5) Student landing opens two Writing listeners and a `class_pages` read for every student; skip them until a public marker says Writing or Agenda is in use. (6) Writing results view is not on the Quiz results shell yet (`WritingResultsView.tsx`). (7) `components/projects/ProjectOwnGroupSteps.tsx` step strip jumps on first layout; latch `placedRef` after the first measure. (8) `functions/src/organizationUserDelete.ts` can race and leave course copies; delete the `users/{uid}/courses` docs together with their copies. (9) `firestore.rules` `gradebook_columns` read lets any signed-in user, students included, tell whether a session has a column doc; narrow the missing-doc case to `liveStaffSignedIn()` and cover it in `tests/rules/`.
- **AB-249 Assignment-doc override mirror keeps removed nested keys** (S, correctness). Pointer docs were fixed in #6008 (`mergeFields`). `setAssignmentTargetsV1` still writes the `overridesByStudentUid` mirror on the assignment doc with `{merge: true}`, so a replacement override that drops `readAloud`, `questionIds` or a `hiddenOptionIdsByQuestion` entry keeps the old value there, and scoring reads it. Write each `overridesByStudentUid.<uid>` as a whole field (`mergeFields` with a `FieldPath` per uid, alongside the other fields that call writes), and add a test that asserts the exact stored mirror.
- **AB-242 Follow-ups from the 2026-11-15 PR sweep** (S). Small findings left after #5884, #5887, #5888 and #5889 merged: (1) `hooks/useSubShareContentLoader.ts` `load()` logs every permission-denied on `calendar_*` content for link-only subs once a share carries `calendarIds`; skip permission-denied as `loadKey` does. (2) Add `(?s)` to the super-admin path regex in `firestore.rules` (the `admin_settings` super-admin match, unchanged by #5884) so a newline doc id can't slip past it, with a rules test. (3) Add a unit test that greps `functions/src` for `collectionGroup(` names and fails when one is missing from `notServerCgPath`. (4) `importPaperResponses.ts` counts skipped foreign pointers in `foreign`, which no client reads; add them to `unplaced` or show them. (5) `functions/src/subControlAssignment.ts` `finalizeQuizResponses` runs every transaction at once; chunk at about 50. (6) Consider merging `provenGoogleEmail` (`mailRecipients.ts`) and `trustedSignInUid` (`webTourExtension.ts`) into one check.
- **AB-244 Follow-ups from release 2026.11.15b** (S). From the #5920 release review: (1) `getStudentClassDirectoryV1` (`functions/src/studentIdentity.ts`) drops classes whose roster owner ClassLink couldn't confirm during an outage, so the student's class list shrinks until ClassLink answers (the token keeps them); list a token class in `uncertainIds` from its roster docs, but only when the owner is a staff member doc, so a forged roster's name never shows. (2) `utils/sharedBoardItems.ts` `publishSharedBoardItem` skips the pick check whenever a copy exists, so after a share is re-created at an old id an owner's tab can republish an item never picked for the new share; skip it only when the stored `shareNonce` matches, and make the items `allow update` rule require the pick when the stored nonce differs, with rules tests. (3) `sub-share.calendar` anchor (`ShareWithSubModal.tsx`) is on every calendar checkbox; register it `perField` and tag rows with `tourFieldAttr`. (4) Sub-share calendar checkboxes show raw calendar ids; show the widget's calendar name, and hint when calendars are ticked with no sub named. (5) Paper publish counts students whose `pin_index` entry is gone as unplaced under a toast that says to sync the roster; give them their own count or wording. (6) Tests: `question-editor-fields` on (`metaList=true`) in the quiz and video editors, and the in-flight ClassLink lookup dedupe in `studentIdentity.test.ts`.
- **AB-243 Store re-minted class claims on student_sections** (S). From the #5887 re-review: `getStudentClassDirectoryV1` re-mints the token without updating `student_sections.classIds`, so a section added mid-day can drop at the next sign-in during a ClassLink blip; and an owner whose class list is always truncated keeps returning 'unavailable', so a once-claimed section holds a claim slot at every sign-in. Write the re-minted set back, and treat `class list truncated` separately from an outage.
- **AB-202 Drop the client org admin write rules** (S). Unblocked: `orgAdminV1` reached prod in #5640 (2026-11-11) and later releases (Admin Settings organization, buildings, domains, roles and members now write through it). In `firestore.rules` under `organizations/{orgId}`, delete the org `create`/`delete`/`update` allows (and `managedAuthOk`/`managedAuthShape`), the `buildings`, `domains` and `roles` write allows, the members `create`/`delete` and the domain admin and building admin `update` branches (keep only the self `lastActive` branch), and `removedMembers` writes; then drop helpers left unused (`memberStatusOk`, `manages` if nothing else calls them; #6127 already removed `legacyStatusSafe` and `notLegacyListed`). Flip `tests/rules/firestore-rules-organizations.test.ts` and any other suite that still expects those client writes to succeed to `assertFails`. Measure with `pnpm run check:rules-size` (about 6 KB expected) and test the release with `node scripts/releaseFirestoreRules.mjs spartboard-dev`.
- **AB-203 Drop the client share join and leave rules** (S). Unblocked: `shareMembershipV1` reached prod in #5640 (2026-11-11) and later releases (joining and leaving a shared board or a Synced / View-Only collection link). In `firestore.rules`, delete the `/shared_boards` self-join and self-leave `update` allows and the `/linked_collections` self-join and self-leave `update` allows; flip the rules tests that expect those client writes to succeed to `assertFails`. About 2.4 KB compiled (measured 2026-11-12).
- **AB-223 Late finishers and per-student overrides after #5811** (S). Minor #5811 findings from the release 2026.11.14c review (see the review log on #5847): late finishers and per-student results overrides. Re-check both paths in `hooks/useQuizSession.ts` against the unlock batch #5843 added, and fix or close with a note.
- **AB-224 Retired PINs across same-named rosters** (S). From the #5847 review: `retired_pins` keys by name segment, so two rosters with a same-named student can match a former PIN to the wrong roster. Key retired PINs by `rosterId` as well (pairs with the open #5814 work), and update `formerCutoff` callers in `components/widgets/QuizWidget/utils/quizScoreboard.ts`.
- **AB-251 Clear grading and picks on a quiz retake** (S). From the #6020 review (AB-222). The student retake reset in `hooks/useQuizSession.ts` strips the answer key now, but keeps the previous attempt's `grading` (per-question teacher marks and feedback) and `countedChoices`. Reopen clears both; make a fresh retake attempt clear them the same way, with a rules test that the student branch allows it and a hook test.
- **AB-252 VA retake shows the previous score** (S). From the #6025 review (AB-238). The rejoin reset in `hooks/useVideoActivitySession.ts` sets `completedAt: null, answers: []` but keeps `score` and `verdictsWithheld`, so after re-finishing (before any republish) the completion screen shows the old attempt's percentage, or "0 of N" with the flag off. Clear both in the reset (the student branch of the VA responses rule has `unchanged('score')`; widen it only for the reset to null, with a rules test) or show the stored score only when `completedAt <= publishedAt`.
- **AB-253 VA short-answer marks visible at Score only** (S). From the #6025 review. Teacher short-answer marks live in `grading.<qid>.pointsAwarded` on the student's own response doc (`utils/videoActivityShortAnswerMark.ts`), so a Score-only publish still lets a student read per-question marks for short answers. Under `va-score-only-verdicts`, move the marks off the student-readable doc or strip them at publish, matching how `isCorrect` is withheld; close with a note if the student UI never needs them.
- **AB-256 Two tabs at first sign-in make two first boards** (S). From the #6026 review (AB-3). The guard #6026 added lives in one `DashboardProvider`, so two tabs or devices open at a teacher's first sign-in each pass it and each save "My First Board" with a fresh `crypto.randomUUID()` id. Make creation idempotent across clients, for example a deterministic first-board id derived from the uid with a create-if-absent write, with a test.

- **AB-215 Release 2026.11.14b review minors** (S). From the #5802 release review. (1) Tour run counters write one shared doc, so busy tours contend, and staff can bump their own counts; shard or move to a function. (2) The web tour `countPublicView` timeout is never cleared on unmount. (3) When the Forms API read fails, the editor fallback offers only Quiz and Poll; check that is intended. (4) Import `source: 'import'` is declared by the client; don't trust it server side. (5) The Google Forms import code lands in the main chunk; lazy-load it. (6) With the "pasted" input sign off, Quiz Live view still shows the paste count.
- **AB-213 Choose-N pick follow-ups** (S). From the 2026-11-14 PR sweep integration review of #5778. (1) Paper re-import (`functions/src/importPaperResponses.ts`) deletes `countedChoices` including `revived`, but an answer the teacher picked back from `unresponded: 'passed'` stays a real answer; restore `unresponded` for the `revived` ids first, as reopen now does (`restorePassedAnswers`, release fix #5781). (2) The site-admin branch of the response update rule (`firestore.rules`, `isSiteAdmin() && !changed([...])`) excludes `liveView` but not `countedChoices`; decide with the `resultsOverride` precedent and add it if admins shouldn't change picks, with a rules test. The pick is on for every teacher now, so this is live.

- **AB-198 Building-keyed configs: prefer the canonical key over a legacy alias** (S). `canonicalizeBuildingKeyedRecord` (`config/buildings.ts`) lets the later key win when a legacy alias (`schumann-elementary`) and its canonical id (`schumann`) both exist, and Firestore returns map keys sorted, so the stale alias wins for every reader (dock defaults, `buildingDefaults` in widget configs). Release #5606 fixed only the calendar fetcher (#5604). Make the function prefer the canonical key, with a test, and check readers that index the raw map. From release #5606 review.
- **AB-185 Shared board ink: only an accepted write is the merge baseline** (S). `context/DashboardContext.tsx` mirror timer sets `lastMirroredRef` to the payload before `mirrorSharedBoard` settles. If a peer's snapshot lands while that write is in flight and the write is then refused, the unaccepted payload was the ink baseline, so local strokes read as remote deletes and vanish. Hold the in-flight payload in a pending ref for dedupe and move it into `lastMirroredRef` in `.then`. Done when a test with a snapshot arriving before a permission-denied rejection keeps the local stroke. Found in release #5559 review (pre-existing).
- **AB-172 Finish moving student data off bare isAdmin() in firestore.rules** (S, Opus, rules). From release 2026.11.09 (3) review of #5485. `isSiteAdmin()` now keeps a synced building admin out of most student data, but these still use `isAdmin()`: `guided_learning_sessions` update and delete, `poll_sessions` get, list and writes, poll `votes` delete, the `nextup_sessions` session write, `sessions/{userId}` get (live code), and `shared_activity_walls` comments and likes read and delete. Also `archived_responses` update and delete have no session-teacher branch (no client path uses them today). Decide each, convert the student-work ones, check `check:rules-size`, and add allowed and denied rules tests.
- **AB-170 Poll follow-ups from release #5455** (S). (1) `poll_voter_salts` docs never expire; add a TTL field and policy, or delete them when the session ends. (2) On a copied board, the Poll settings panel shows the original teacher's join link until the copier presses Start (Start already mints a fresh code); hide or replace a link whose `joinCodeOwnerUid` is another teacher's.
- **AB-171 Shared board item picks follow-ups from release #5455** (S). (1) A collaborator who re-shares a board they joined records no picks, so items they added can't be copied from the new share. (2) `users/{uid}/board_item_picks/{shareId}` docs are never deleted when a share ends or is deleted. (3) The comment beside `noteBoardItemPick` in `context/DashboardContext.tsx` describes the wrong function. Done with tests for (1) and (2).
- **AB-159 GL media reference scan reads every recent Claude revision** (S). From release #5423 review. `addRevisionReferences` in `functions/src/glMediaReferences.ts` streams the whole `claude_revisions` collection group (bounded only by its 30-day TTL) on every `releaseGuidedLearningMediaV1` call. Filter to Guided Learning revisions or by `createdAt` in the query (check the collection-group index it needs), and keep the fail-safe that a failed scan keeps every file.
- **AB-161 Storage rules test for staff member status** (S, rules tests). From release #5423 review. `storage.rules` `districtStaffMember` now admits only `active` and `invited`, but nothing in `tests/rules/` exercises it with `invited`, `inactive` or a stray value. Add allowed and denied cases.
- **AB-157 Recording take whose tab closed mid-upload after turn-in** (S). From R4 (state machine audit). When the tab closes before a take's Storage upload finishes, or the device is offline when the post-turn-in hand-off to `archiveQuizMediaArtifact` runs (or that callable refuses before its claim), the response keeps `uploadState: 'pending'` with no `artifactArchive` entry, so the teacher's card reads "archiving" forever and the hourly sweep (it only queries `hasStuckArchive`) never sees it. Have a server pass mark any such pending take with no archive entry `lost` once the response is completed and older than `STUCK_ARCHIVE_AGE_MS` (for example from `finalizeIdleQuizAttempts` or the finalize paths setting `hasStuckArchive`). Done with a functions test.
- **AB-154 Grade index retry cost** (S, from the PR sweep's integration review of #5364; the PLC dirty mark half shipped with release #5423). In `functions/src/gradebook/gradeIndex.ts` `markSessionDirty` merges `dirtyAt` but keeps an old `retryAt`, so fresh data waits up to an hour, and sessions that always fail now retry hourly forever (the old 5-try cap is gone). Clear `retryAt` on a new mark and cap permanent failures. Done when both have tests.
- **AB-155 Spotlight setting survives a minimize** (S, from #5366). `utils/spotlightOverlay.ts` hides the dim overlay when the spotlit widget is minimized, but `spotlightWidgetId` stays set, so `WidgetRenderer`, `DraggableWindow` and `RemoteWidgetCard` still treat it as spotlit and the overlay returns on restore. Decide whether minimizing clears the spotlight, and test it.
- **AB-151 Live session follow-ups from B5** (S). (1) No heartbeat: `lastActive` is written only at join (`hooks/useLiveSession.ts` join path), so a student who drops stays `active` until the teacher removes them. (2) Deleting a board or undoing a widget delete does not end or restore a live session, and undoing the add of a Live widget hides the widget but leaves its session active (undo runs through `applyHistoryEntry` in `context/DashboardContext.tsx`); only `removeWidget` and `removeWidgets` announce `spart-widget-removed`. Done when both are decided and covered by tests.
- **AB-193 Deactivation: Storage admin checks and server-side PLC checks** (S). From the wave 5 reviews (#5590 and its follow-up). Firestore rules now refuse a deactivated operator-org member as admin, legacy super admin and PLC member, but three mirrors still don't: (1) `storage.rules` `isAdmin()`/`isSiteAdmin()` are a bare `/admins` doc check, so a deactivated person with a hand-made `/admins` doc keeps Storage admin branches; adding the member read costs a second Firestore doc, which some branches can't afford under Storage's two-doc limit, so reorder per branch or skip where it would break. (2) `canEditPlc`/`isPlcMember` in `functions/src/plcRecordingCore.ts`, `canEditPlc` in `plcMeetingNotes.ts`, `canFlagInPlc` in `plcNorming.ts` and `isPlcMember` in `plcGoalCoach.ts` check `memberUids` only; their callables should also refuse a revoked operator-org member (`isRevokedMemberStatus`). (3) Functions that treat a bare `/admins` doc as admin with no status check (`aiCallerGate.ts`, `focus/sessions.ts`, `importInbox.ts`, `tourPublicLink.ts`, `webTourExtension.ts` and others): route them through one helper that also checks the operator member status. Also: `storage.rules` `plc_meeting_audio` create can't take the check (already two docs); leave a comment saying so. Done with unit tests per callable and a note on Storage branches left as they are.
- **AB-195 Key the deactivation check to the uid, not the email** (M, rules + functions). From the #5590 review. `notDeactivated()` in `firestore.rules` and `storage.rules` looks up `organizations/orono/members/{token email}`, and a missing doc counts as live, so a deactivated teacher who changes their Firebase account email (same uid) passes it again. Have the member sync write a server-only marker keyed by uid whenever a member's status leaves active or invited (and clear it on reactivation), check that marker in both `notDeactivated()` functions, and mirror it in `functions/src/authz.ts`. Measure `check:rules-size` and the Storage two-read paths first. Tests for an email-changed deactivated user.
- **AB-196 Connector preview card follow-ups from release #5598** (S, connector). (1) `cardHtml` in `functions/src/mcp/apps.ts` caches the card page for 5 minutes, and the page loads hashed assets under `/mcp-app/assets/` that the next hosting release stops serving, so a card can render blank for a few minutes after a deploy (functions deploy before hosting). Carry `dist/mcp-app/assets` forward in `scripts/carryForwardAssets.mjs`, or inline the card's JS and CSS. Also require a marker string in the fetched page so the SPA fallback is never cached as the card. (2) `changedQuestionIds` compares `JSON.stringify(q)`, which is key-order sensitive, so imported quizzes show every resent question as Updated; compare with a stable-key stringify. Done with tests for both.
- **AB-197 Storage quiz media read for staff joiners** (S, storage rules). From the #5598 review. The `quiz_response_media` read in `storage.rules` now evaluates the teacher branch first (session get), so a staff-audience joiner with an email reads session, admins, then responses: three Firestore docs against Storage's two-doc limit. No client reads this path through the SDK today (uploads only), so nothing breaks; if a read path is added, reorder per caller or skip the admin read for non-admins. Done with a Storage rules test once the Storage emulator can resolve Firestore.
- **AB-194 Activity Wall teacher post rule at the expression limit** (S, rules). From #5590. The Activity Wall teacher submission create rule in `firestore.rules` is within a couple of expressions of Firestore's 1,000-expression limit for a co-teacher's link post (`tests/rules/activityWallBoardMembers.test.ts` "a collaborator cannot create an upload post"), so its owner branch keeps a raw uid-prefix check without the deactivation gate. Shrink the rule (for example fold `awFieldTypesOk`, `awStoragePathOk` and `awUploadPathOk` into fewer calls, or move the board share loop out), then gate its owner branch with `notDeactivated()` like `awIsOwner()`.

- **AB-144 Finish server and client feature gate parity** (S). Follow-ups from the T4 gate-parity PR (#5374). (2) The AI gates check beta only against `betaUsers` (`isVerifiedBetaMember`), while `isGlobalFeatureGranted` and the client also accept the other beta sources (`isBetaTeacher`). (3) `isGlobalFeatureGranted` denies `accessLevel: 'all'` while the AI gates allow it. (4) PLC meeting-notes AI and the PLC goal coach screens never check `gemini-functions`, which the server now enforces with its tier and buildings. (5) `assertQuizTranslationFeature` (`functions/src/quizTranslation.ts`) compares saved `buildings` raw; route its tier and building checks through `permissionAudienceAllows`. (6) `enforceAiFeatureAccess` and `generateWithAI` don't apply a missing doc's `defaultMinTier` (use `missingDocAccess`). Done when each gate gives the client's answer, with tests.

- **AB-175 Paper reword log outlives a deleted assignment** (S). From the release review of #5491. `paperRewordSyncV1` (`functions/src/paperRewordSync.ts`) writes each student's old and new answer text to `quiz_sessions/{id}/responses/{id}/paper_reword_log`, but `deleteAssignment` (`hooks/useQuizAssignments.ts`) deletes only the response docs and Firestore doesn't cascade, so the log stays with student answer text that no client can read or delete. Keep the undo record where the delete paths already reach it (a bounded field on the response doc, checked against the student write rules), or have every response-delete path remove the subcollection, with a test. Before `paper-reword-sync` opens.
- **AB-136 Activity Wall delete: close before clearing** (S). From the B7 review (#5371). `components/widgets/ActivityWall/WallLibraryModal.tsx` `handleDelete` runs `clearWallSubmissions` before `onDelete`, which now closes the session, so a post made between the two leaves an orphan submission. Close the session first, then clear, then delete. Test the order.
- **AB-137 Activity Wall archive: Drive file for a post deleted mid-archive** (S). From the B7 review (#5371). When `finalizeResumedSubmission` finds the submission deleted, the Drive file it just uploaded is no longer referenced anywhere. Delete that Drive file with the teacher's token, best effort, and test it.

- **AB-127 Scan-first hybrid row blocks a PIN student's device join** (S, rules, before `paper-written-hybrid` opens). From release #5335 review. On a roster without a ClassLink pseudonym, `importPaperResponses.ts` (`hybridResponseFields`) creates a `joined` response whose `studentUid` is the `pin-…` response key, and the response update rule requires `authUid() == existing().studentUid`, so a student who opens the quiz after their sheet is scanned can't join. PINs are off at the org today. Let the device join adopt an unowned `paperWrittenBatchId` row and keep its paper answers. Done with rules tests for the adopt and for a second device being refused; check `check:rules-size`.
- **AB-128 Teammate print: custom image answer boxes** (S, behind paper sheet flags). From release #5335 review. `toPaperQuestion` (`functions/src/createTeammatePaperBatch.ts`) drops `paperBoxImage`, so a PLC teammate's sheets print lines where the owner's print shows the image, and those boxes go to transcription. Copying the field alone printed an empty box, because `PlcTeammatePrintModal` never passes `writtenImages` to `printPaperSheets`. Resolve each image box's src there (public only, like its sheet stimuli), then copy `paperBoxImage`, keeping `lines` for any box whose image can't load. Done when a teammate sheet prints the image and import grades the crop, with tests.
- **AB-129 Written answers on paper: review minors** (S). From release #5335 review. (1) `functions/src/plcNorming.ts` treats `paperTranscript: 'image'` with empty text as a blank answer; show the crop or a "graded on paper" message (wording to Paul). (2) A hybrid retake clears scanned answers (`hooks/useQuizSession.ts`, retake path). (3) Closing the tab during assign can leave an orphan paper batch. (4) `QuizAssignmentSettingsModal` seeds `sessionOptions` once, so a live change from another tab isn't picked up. Done when each is fixed with a test or deleted here as not worth it.

- **AB-126 Flashcards Check: hand off after a Schoology pop out** (S, rules change). #5317 makes a framed Quiz or Video Activity copy stop its away timer and show "This activity is open in another tab" once the new tab closes its open `tabExits` entry (`hooks/useTabAwayTracker.ts`, `utils/attemptHandOff.ts`). Flashcards Check passes `serverExits: undefined` (`components/flashcards/FlashcardAssignmentPage.tsx`), so after Schoology's pop out the framed copy can still time out and force-submit. Write `tabExits` on the flashcard progress doc (add it to the allowed keys in `firestore.rules`, with rules tests for reads and writes) and pass it to the tracker. Done when a framed Check hands off like a quiz.

- **AB-118 Roster-owner ClassLink check: dedupe and error caching** (S, LOW). Release #5189 review minors. In `functions/src/studentIdentity.ts` `candidateTaughtClasses`, cache the in-flight promise so a class logging in at once makes one ClassLink call per candidate owner, and cache a thrown error for about 30 seconds instead of the 5-minute TTL. In the gradebook, give `getGradebookRosterV1` and the project grade triggers a `timeoutSeconds` at or above `CLASSLINK_TOTAL_BUDGET_MS`, or a smaller budget there. Delete Mini App `receipts` docs when an assignment is wiped. Done when tests cover the dedupe, the short error cache and the receipt cleanup.
- **AB-117 PLC bank import trusts any doc at the group id** (S, LOW). `handleImport` in `components/plc/bodies/PlcQuestionBanksBody.tsx` copies whatever `synced_question_banks/{groupId}` holds into the importer's own library. The header's `sharedBy` is not a safe owner hint (any PLC editor can write a header), so tie the header create rule to the synced doc's `ownerUid` with a get(), then pass it as the expected owner. Done when a header pointing at someone else's group is refused and import checks the owner, with rules tests for reads and writes.
- **AB-108 Connector OAuth hardening from the 2026-11-04 sweep** (S). (1) `handleToken` (`functions/src/mcp/oauthEndpoints.ts`) consumes the auth code before `verifyClientId`, which now fetches the CIMD document, so a slow claude.ai fetch burns the code; verify the client first. (2) `isCimdClientId` (`cimd.ts`) accepts any path on claude.ai/claude.com; pin it to the published document paths. (3) The org create rule skips `managedAuthOk()`, so a super admin can create an org with a malformed `claudeManagedAuth`. Done when each has a test.
- **AB-94 Flashcard revoke race in the connector save** (S, LOW). If a teacher revokes a public flashcard link while Claude is saving that set, the save can re-publish it: `guardPublicShare` sees no snapshot and `stageSetWrite` creates it, while the set write restores the stale `publicShareId`. Files: `functions/src/mcp/flashcardStore.ts`, `tools.ts`. Done when: a save refuses when the snapshot is missing but the set still has a `publicShareId`, and the set write is conditional on the update time `readSet` saw, with a test for a revoke landing mid-save.
- **AB-1 Next Up entries: class check and owner binding** (M, MED). The `nextup_sessions/{id}/entries` create rule checks an active parent session and shape/size but not that the writer is in the session's class or owns the entry. Files: `firestore.rules`, `tests/rules/nextupEntries.test.ts`. Done when: emulator tests prove a student outside the class, or one writing another student's entry, is refused, and `pnpm run check:rules-size` still passes.
- **AB-96 PLC membership a lead can write** (M). Since batch 2D the print-for-a-teammate and sync-join callables no longer trust `memberUids` or `members` entries alone, but `firestore.rules` still lets a sitting lead append any uid to `memberUids` (broad lead update) and then mint or reactivate that uid's `members` entry through `isChangingMemberRole`. Other server code that trusts membership (`assertPlcMember` callers, the auto-roster's `isActiveOrgMember`, which accepts an active member doc with no `uid` on any domain) should be checked the same way. Known gaps after 2D (the PT-115 creator backfill ran on prod 2026-11-10): the print refusal and the building-group "has not signed in" error reuse old wording that doesn't name the real reason (new wording needs Paul's OK); a member who left and was put back by the lead still passes on their old accepted invite; members added by an admin (Admin Settings PLC member edits, building groups) have no server-written marker, so they can be printed for only once they sit in that quiz's group. Files: `firestore.rules` `plcs/{plcId}`, `functions/src/plcSyncJoinGuards.ts`, `functions/src/plcBuildingGroups.ts`. Done when: the rules only add a member through invite accept, admin edits or server code, with emulator tests for reads and writes.
- **AB-2 Live session races** (M, MED, _re-verify_). C3 PIN-uniqueness TOCTOU race, C4 the SSO assignment query cap above 30 classes (Firestore `in` limit), C5 join-code collision handling. Files: `hooks/useLiveSession.ts`, `hooks/useStudentAssignments.ts`. Done when: each one is either fixed with a test reproducing it, or shown to be already handled and dropped.
- **AB-4 Grade doc split** (L, MED). Gradebook D37: move `score`, published `isCorrect` and quiz `grading` off quiz, VA and GL response docs into a teacher-gated `grades/{responseKey}` doc, so students can't read unpublished scores. A read rule alone can't do it. Plan: `docs/plans/GRADEBOOK.md` D37. Must tolerate open old-client tabs at release (CLAUDE.md, compatibility).
- **AB-5 Synced-board drawings `hostUid`** (L). LO9: Drawing canvases on synced boards don't carry the host's uid, so sync reads the wrong owner. Done when: a synced board shows the host's drawing to members, with a test.
- **AB-6 Rules and E2E gaps** (L). T1-T5: rules tests for PIN-session collections, `short_links` and the quota collections, plus E2E for the PIN join and quiz session journeys. Files: `tests/rules/`, `tests/e2e/`. Done when: each collection has allow and deny cases.
- **AB-9 Board save contention** (M, _re-verify_). `Commit FAILED_PRECONDITION` grew from 13-146/day mid-September to 2,000-3,845/day by late September. `saveDashboard` (`hooks/useFirestore.ts` ~:365) is the likely source. Find the loop and fix it without dropping the transactional read (see Rejected). An alert fires above 1,000/hour. The numbers are prod from September and dev traffic can't reproduce them: re-verify against the save loop in code, and if prod logs are needed, add a `PT-` item for Paul and move this item to Blocked.
- **AB-153 Storage writes from an ended View as tab** (S, risk: Storage rules). Since A2 (#5404), ending a View as session cuts off callables and Firestore at once, but `viewAsWriteOk()` in `storage.rules` still checks only the claim's `exp` and `ro`. So an unlocked tab that is ended from the opener can still create and delete the target's Storage files for up to 1 h. Unlock is off by default (`admin_settings/view_as.allowUnlock`). Fix: in `viewAsWriteOk()` only, after the `ro == false` check, require `firestore.get(.../view_as_sessions/$(sid)).data.get('endedAt', null) == null`. Read paths stay untouched. First confirm the cross-service call budget on the busiest write paths (PLC recordings, session uploads); the Storage emulator doesn't resolve `firestore.get()`, so verify on spartboard-dev. Done when an ended, unlocked tab can't upload or delete on dev, and a live unlocked tab still can.
- **AB-74 View-as revert scrub parity** (S). `stripPii` in `functions/src/viewAsRevert.ts` still drops only the old PII list and custom-mode `assignments`. Make it match `widgetPiiKeys` in `utils/dashboardPII.ts` (quiz-built Scoreboard teams, name-keyed class-mode assignments, Seating Chart `savedPlans`, legacy `#` poll hide keys); it needs the widget `type`. `utils/viewAsApprove.ts` (~:106) restores only `PII_WIDGET_FIELDS` and `assignments` and needs the same keys. Done when: a test shows a reverted widget config carries none of them.
- **AB-10 Force-reload stale clients** (M, MED). A tab left on an old build kept the September 10 egress spike going about 1 GiB/hour after the fix shipped; `hooks/useAppVersion.ts` only prompts. Force a reload for clients N builds behind, at a safe moment and never with unsaved edits.
- **AB-59 Class-claim gate leftovers** (M, MED, _re-verify_). From the 2026-10-25 security fixes (#4670-#4682): the quiz attempt `history` rules read, `getQuizArtifactPlaybackUrl` and `getPaperWrittenCropV1` need the same class-claim gate #4678 added. Grade rows should get kind-qualified ids (#4677). Done when: each path has an allow and a deny test.
- **AB-61 Synced PLC header after Stop syncing** (M, security). If the sharer clicks Stop syncing and the group was first made outside that PLC, new members can't synced-import, assign or edit it (copy import works). Simply relaxing `assertGroupLinkedToPlc` (`functions/src/plcSyncJoinGuards.ts`) was tried in #6251 and closed: it let any PLC member forge a header and join a teammate's synced group, and Stop syncing writes no `plcDetached` marker to key on. Fix: when a member leaves or stops syncing, write `plcDetached` markers server side on that member's PLC headers (quiz, video and assignment groups, found with a collection-group query), but only on headers whose group listed the leaver in `participants`, checked in the same transaction as the removal (as `handleDetachPlcSyncLinkage` already does inside `if (wasParticipant)`). The leave callables accept any groupId and no-op for non-participants, so an unchecked marker would reopen the hole. Then accept an unstamped group only when that marker is present. Never accept one without the marker. Functions tests cover a forged header (refused), a non-participant's no-op leave that writes no marker, and a real detached group (accepted).

- **AB-120 Flashcards Checks hardening, release #5263 review minors** (M). (1) Stamp `attemptStartedAt` with `serverTimestamp()` and require `== request.time` in `fcValidProgress`; optionally reject an unforced submit in `submitFlashcardCheckV1` after start + limit x multiplier + grace. (2) Hidden or unpublished results are UI-only: the student can read their own `answerLog`/`score`; move them teacher-only or hide `correct` until release, or record it as accepted. (3) `publishSet` and present accept incomplete sets; apply `flashcardSetIncompleteReason`. (4) Close on a shared set with a blank title fails the public-set rule; block Close with an inline message. (5) Make `studentCards`/`forcedSubmitAllowed` in `functions/src/flashcardCheck.ts` require `rules.sessionOptions` like `checkOverrideOf`. (6) Memoize `withCardSubset` in `FlashcardAssignmentPage.tsx`. Add rules tests for a submitted student writing `cardSubset` and the teacher changing a stamped subset.

- **AB-133 GL media scan cost** (S). T7 (#5369) made `loadSharedReferences` stream every `users/*/claude_revisions` doc, and `gcGuidedLearningMedia` calls it on each personal Guided Learning set delete. Scan revisions only in `loadAllReferences` (the weekly sweep) or filter by `createdAt` with a collection-group index, keeping the "revision under 30 days keeps its files" test green.
- **AB-134 Refund marker cleanup** (S). T7 (#5369) writes `ai_usage_refunds/{chargeId}` once per refund and never removes it. Add an `expireAt` (about 7 days) and a TTL policy in `firestore.indexes.json` so the collection stays small.

- **AB-290 Expired sub-share sweep: retention and reap order** (S, release 2026.11.19 review). `functions/src/expireSubShares.ts` now keeps an expired share forever when its Drive grants can't be revoked (host gone or no stored grant), logging and calling `auth().getUser` every hour against the 5000-doc cap. Delete the doc after a 30 to 90 day cutoff (keep the warning log) and skip `getUser` for a departed host. Also: the parent delete now runs before the `boards`/`content`/`keys` reap, so a crash between them orphans subcollections the query never finds again; reap by collection group or record pending reaps. Done when both have tests.
- **AB-291 Board backup: only inherited grants mark a backup stuck** (S, release 2026.11.19 review). `keepBackupPrivate` in `utils/googleDriveService.ts` treats any 403 from Drive permissions calls as an inherited grant and adds the file to `stuckSharedBackupIds`, so one rate-limit 403 stops that board's backups until reload. Mark stuck only on `cannotModifyInheritedPermission` (or similar reason); treat rate-limit 403s as transient. Done with a test for each reason.
- **AB-292 Import admin rows can't show Excluded users** (S, release 2026.11.19 review). `needsFullRow` in `components/admin/access/PreviewsPanel.tsx` ignores `excludedUsers`, and `PreviewAccess`/`PreviewTesters` in `ImportOffersSection.tsx` have no exclude panel, so plain Import flags can't add or show an exclusion. Add `|| (p.excludedUsers?.length ?? 0) > 0` and render `BetaUsersPanel kind="excluded"`.
- **AB-293 Claude picture upload housekeeping** (S, release 2026.11.19 review; `claude-picture-uploads` only). `uses` is counted before the body is validated, so rejected posts burn a ticket's 30 uploads; abandoned uploads leave a private Drive file and a `claude_pictures` doc with no cleanup. Count after validation and add a TTL or sweep for unused pictures.
- **AB-295 Assignment id ownership when the first session is gone** (S, release 2026.11.19 review). `assertPointerKeyUnclaimed` (`functions/src/studentAssignmentTargets.ts`) now gives a key to its earliest-created session. If the owner deletes that session, the oldest remaining one, possibly a copy, owns the key. Record the owner on first claim (like `synced_bank_owners`) instead. Done with a test.

### Performance and cost

- **AB-307 Speech to text paid engine hardening** (M; release 2026.11.19d review, #6320). In `functions/src/speechToText.ts`: (1) bill AI transcription from the clip's real length (container timestamps, or true up from what the model processed) instead of the client's `durationMs` floored by size (#6321 narrowed this); (2) the single `ai_usage/global_speech_to_text_YYYY-MM` doc is written in a transaction on every clip, so a class dictating at once contends and falls back to free dictation; shard it; (3) `getSpeechToTextAccessV1` has no rate limit; (4) `assigningTeacher` accepts a pointer after the assignment closes; (5) `utils/speechToText/hybridEngine.ts` `revise` keeps sending a clip after Stop and unmount and still spends the student's limits, and in Writing a revise or Tidy up inflates `dictatedCount`; (6) `modelSupportsInputs` (`functions/src/aiModels.ts`) is not enforced server-side. Done when each has a test.
- **AB-306 Cache Intl.DisplayNames in language labels** (S; release 2026.11.19c review of #6278). `utils/languageDisplayLabel.ts` builds a new `Intl.DisplayNames` on every call, and it runs per row in language lists and override summaries. Keep one instance per locale in a module Map. Done when `utils/languageDisplayLabel.test.ts` still passes and a test shows a second call reuses the instance.
- **AB-56 Web tour list cost** (M). Unblocked: rules headroom is about 25 KB since #5637; measure `check:rules-size` before and after. Store each tour's start host and step count at publish so `webToursListV1` stops reading every step.
- **AB-99 Activity Wall cleanup retries starve behind repeat failures** (S, LOW). Since #5060 `retryStorageCleanup` (`functions/src/sweepActivityWallArchives.ts`) pages through flagged submissions but starts from the first doc every hourly run and stops at `MAX_CLEANUP_RETRIES_PER_RUN` (200), so 200+ docs that keep failing still hide later ones until the 7-day orphan sweep. Stamp a last-attempt time on failure and order by it (needs a collection-group index), or save the cursor between runs. Done when: a test with more failing docs than the cap shows a later doc retried within two runs. Same PR: check the cap per doc read (not only between pages, it can reach ~299 today) and stop the retry phase on a wall-clock budget so a slow Storage can't starve the orphan sweep in the 540 s run (release #5072 review).
- **AB-13 Session `classIds` migration** (M, MED). F2: `useStudentAssignments` runs two queries because some session docs only carry the legacy `classId`. Write the migration that adds `classIds`, run it on dev, and stop the legacy write paths. Done when: the script and dev run are merged, and a `PT-` item asks Paul to run it on prod. The single-query collapse is AB-58.
- **AB-14 Bundle guard and image compression** (M, _re-verify_). P3: `manualChunks` plus a bundle-size CI guard (also check the DashboardView chunk against the 500 KB warning). P4: client-side image compression on upload paths.

### Quiz, Video Activity and Guided Learning

- **AB-308 Recorded question audio and assign auto-translate leftovers** (M; release 2026.11.19d review, #6320). (1) Re-recording or removing prompt audio (`PromptAudioField.tsx`, `usePromptAudio.ts`) leaves the old public Drive file; delete it only when no assigned snapshot uses it. (2) Auto-translate at assign (`utils/quizAutoTranslate.ts`, QuizWidget `Widget.tsx`) keeps running after its 45 s race; a re-assign in that window starts a second translation and orphans a sidecar. It also marks every fresh question reviewed. (3) Only the widget assign path auto-translates; PLC pickup, PLC new assignment, LTI and Classroom apply a preset language with no translation or warning. (4) `groupFromStanding` (`modificationGroups.ts`) drops a seeded student's `openAt`, `closeAt`, `questionIds`, `rubricOverrideByQuestion` and `spellingHelp`; `withStandingGroups` deletes a blank group the teacher is still filling when a new class brings presets. Done when each has a test.
- **AB-309 Speech to text and tab-away minors** (S; release 2026.11.19d review). (1) `utils/speechToText/textRules.ts` turns content words "colon", "comma", "punto", "coma" into marks; add guard words like English "period" has. (2) `hooks/useTabAwayTracker.ts`: a focus loss held during a mic prompt is dropped, not back-dated, when the page then goes hidden. (3) The FIB single input and quiz editor statically import the paid dictation engine; lazy-load it behind the override. (4) `components/quiz/QuestionAudioButton.tsx` small variant uses fixed Tailwind sizes in the Quiz monitor card (`CurrentQuestionCard.tsx`); give it a cqmin-scaled variant.

- **AB-297 GL Results flash old session targets** (S). `sessionLoaded` in `GuidedLearningResults.tsx` (~:130) never resets when `sessionId` changes, so a new session's responses can show briefly against the old session's class targets. Reset with `key={sessionId}` on the component or the adjust-state-while-rendering pattern, with a test. From the #6253 review.
- **AB-298 Matching and Ordering banks re-shuffle on back-navigation** (S). Issue #6254. `components/quiz/MatchingResponseInput.tsx` and `OrderingResponseInput.tsx` shuffle the bank with `Math.random` on every remount; placed items restore, but the bank order jumps. Seed the shuffle per student and question the way `utils/quizShuffle.ts` does, with a test. Close #6254 in the PR.
- **AB-277 Live view follows the student's own shuffle latch** (S, behind `quiz-live-view`). Since #6126 the panel latches shuffle per student and attempt when it first sees them, but the student's `ActiveQuiz` latches per mount (`components/quiz/QuizStudentApp.tsx`), so a student who reloads or resumes after a mid-attempt shuffle change sees a different order than the panel's question number and mirror. Have the student write its latched shuffle flag into `live/state` and let `LiveViewPanel` prefer it; keep the panel's own latch as the fallback. This also closes AB-214 item 3.
- **AB-278 Paper reword check minors** (S). After #6125: (1) single-digit choices can trip the 0.25 margin when every number in a question changes (`['2','4','8','16']` to `['3','6','12','24']` is rejected); skip the margin test when either text is one character, in both `utils/paperImportPlan.ts` and `functions/src/paperRewordSync.ts`. (2) A rejected reword skips the question silently; return the skipped question ids from the import and show the teacher a short notice. Wording needs Paul's OK in the thread.
- **AB-269 Rubric table Edit in the Writing grader** (M). Behind `rubric-grading-v2` (#6088): the full rubric table's Edit only shows in Quiz results, where `onSaveRubric` saves the quiz file and library rubric and `rescoreRubricGrades` moves students scored at a changed level to its new points. Writing needs `updateWritingSessionV1` to accept a rubric edit (swap the session's rubric snapshot, same criteria ids only) and rescore saved feedback the same way, then pass `onSaveRubric` from `WritingGrader` to `FreeResponseGrader`. Also not covered in Quiz: frozen assignment copies, bank-drawn questions and earlier attempts.
- **AB-267 Printed versions reprint minors** (S). Behind `paper-printed-versions` (release review of #6086): a reprint with no Drive token or a translation load error prints English with only a console warning (show a notice); the "Group N · English" label only shows with two or more groups; a stack records the group's wanted language even when its first print fell back to English, so a later reprint can switch language; the reprint `questionTexts` skip `plainPromptText` and `choicePictureFields` that `PaperPrintModal` applies (pre-existing). Tests for each.
- **AB-257 Video Activity onto the Quiz monitor, results and grader** (M). Paul's rule (`.claude/rules/assignment-shells.md`): assignment widgets reuse the Quiz shells. Video Activity still has its own copies, listed in `KNOWN_COPIES` and `NOT_YET_ADOPTED` in `tests/assignmentShells.static.test.ts`: (1) `monitor/VaRosterList.tsx` (own roster and `RowMenu`) → `RosterList` or `RosterParts`, as `Flashcards/results/FlashcardCheckRoster.tsx` does; (2) the `QuestionDetail` in `monitor/VideoActivityMonitor.tsx` → `QuestionResults`/`ItemDetailView`; the monitor also needs `QuestionResults`; (3) `Results.tsx` (old `SessionRow`) and `results/VaResultsParity.tsx` (own `DrillRow`) → `ResultsHome` (`ResultsSummaryCard`, `ScoreDistributionBars`, `ResultsDrillRow`); (4) `results/VaShortAnswerMarking.tsx` → `FreeResponseGrader`, extended for a time-in-video prompt if needed; (5) `VideoActivityLivePlayer.tsx` header and buttons (old `SessionViewHeader`, `ActionButton`) → the Quiz `present/` or monitor pieces. One PR per numbered part is fine; delete each guard entry in the PR that clears it. Before and after screenshots for Paul, no flag needed when the screen looks the same.
- **AB-258 Guided Learning onto the Quiz roster and results** (M). Same rule. `results/GuidedLearningMonitor.tsx` renders its roster rows inline → `RosterParts`, and its per-step breakdown inline (about lines 222-260) → `QuestionResults`/`ItemResultsList`; `GuidedLearningResults.tsx` has no `ResultsHome` summary or drill rows; `results/StudentProgressLine.tsx` copies `StudentAnswerLine` (extend it with a step-progress variant). Guard entries: `guided-learning` in `NOT_YET_ADOPTED` and `StudentProgressLine` in `KNOWN_COPIES`.
- **AB-259 Mini Apps onto the Quiz roster and results** (M). Same rule. `MiniAppSubmissionsMonitor.tsx` renders its roster rows inline → `RosterParts`, with no `QuestionResults` per-item view; `MiniAppResultsView.tsx` has its own `DrillRow` and no `StudentResultsControl` → `ResultsHome` and `StudentResultsControl`. `SubmissionsModal.tsx`, which hosts both, uses the old `PeriodAccessControls` → `PeriodAccessStrip`. Guard entries: `mini-app` in `NOT_YET_ADOPTED`, two files in `KNOWN_COPIES`.
- **AB-261 Writing results onto the Quiz per-student actions** (S). Same rule. Writing results (`components/widgets/Writing/components/results/`, from #6027) use `ResultsHome` and `FreeResponseGrader` but not `StudentResultsControl` (and `StudentResultsBulkBar`) for per-student actions; add them as Flashcards does in `results/FlashcardResultsScreen.tsx`, extending the control for return/revise if needed, and delete `writing` from `NOT_YET_ADOPTED` in `tests/assignmentShells.static.test.ts`.
- **AB-260 Flashcards: drop the last old session views** (S). Flashcards is the model on the shared pieces, but `results/FlashcardStudyResults.tsx` and `results/FlashcardSpeakResults.tsx` still use the old `StatTile`, `SessionRow` and `SegmentedTabs`, `results/FlashcardResultsView.tsx` the old `SessionViewHeader`, and `results/FlashcardMonitor.tsx` its own `PercentPill` (use `RosterScorePill`). Move them onto the Quiz results pieces and delete their `KNOWN_COPIES` entries in `tests/assignmentShells.static.test.ts`.
- **AB-248 Earlier-attempt results use the live choose-N pick** (S). From the #5953/#5954 hotfix review: on a retake, a student opening an earlier attempt in `PublishedScoreReview` (`components/quiz/QuizStudentApp.tsx`) gets `notChosenQuestionIds` from the live response, because `myAttemptAsResponse` (`hooks/useQuizResponseAttempts.ts`) spreads `countedChoices` and `completedAttempts` from the live doc. If the teacher picked a later answer on that attempt, the page can show "Provisional" or "still being graded" for it. Return each copy's `countedChoices` from `getMyQuizAttemptsV1` and `MyQuizAttempt`, and build the earlier attempt with its own pick and `completedAttempts: attempt.n`, as the teacher-side `attemptAsResponse` does. Test it in `tests/components/quiz/QuizStudentApp.publishedResults.test.tsx`.
- **AB-225 Sub share needs no member doc** (S). From #5800: building Guided Learning sets now need a live district member doc, so a substitute without one sees an empty sub share. Serve the shared sets through the sub-share bundle (`utils/bundleSubShareContent.ts`) or a callable instead of a direct `building_guided_learning` read.
- **AB-226 Padded-seat gap in quiz join PINs** (S). Minor #5810 finding from the release 2026.11.14c review (see the review log on #5847): canonical seats can leave a padded-seat gap. Reproduce it in a test, then fix or close with a note.
- **AB-229 Video Activity student update hits the 1,000-expression limit** (S, rules, low urgency: PINs are off at the org). In `firestore.rules`, the Video Activity student `allow update` (about line 5673) can exceed the limit for a pinLogin student let in after their period closed, on a session with `periodAccess`, `studentAccess`, a future `closeAt` and `attemptLimit`. Add a Video Activity update expression budget test like `tests/rules/quizResponseExpressionBudget.test.ts`, then factor the checks into shared helpers until it passes.
- **AB-230 Narrow the expired quiz attempt sweep** (S, cost). `finalizeExpiredQuizAttempts` reads up to 5,000 `responses` docs per run, and non-quiz docs with `attemptStartedAt` can fill that window. Narrow the query or skip them, with a test.
- **AB-231 Next Up on a duplicated board** (S). Since #5835, a duplicated board gets a new widget id while its config still holds `activeDriveFileId`, so the queue refuses to load. Let the board's owner re-bind the file instead of refusing.
- **AB-232 Import AI per-widget cap ignores the org limits** (S). `importAiAccess` in `functions/src/importSettings.ts` ignores `externalDailyLimit` and `dailyLimitEnabled`. Mirror `pickOverallLimit`, with tests.
- **AB-233 Mini App Publish scores hidden on older results-v2 assignments** (S). The MiniAppManager gate reads `assignment.resultsVersion`, which assignments made before #5853 lack. Gate on the session's `resultsVersion` or backfill the assignments.
- **AB-234 Paused-work turn-in gaps** (S, flag-on only). (1) A Manual due on a session without per-period rows gets `closeAt === dueAt` but no `dueLocks`, so paused work waits for End. (2) The settings modal's `closeAt === dueAt` branch has no `dueLocks` check, so a legacy assessment can show Manual after turning late work off.
- **AB-235 Quiz: save a retyped choose-N answer at once** (S). A cleared choose-N answer that the student retypes is not autosaved until Next (same as before release 2026.11.15). Save it when the prior entry is blank.
- **AB-236 #5817 gradebook minors** (S). Legacy row not migrated when identical; migration strips `removeWhenScored`; deploy-overlap duplicate rows; legacy projection entries claimable; `moveRemovedAttempts` crashes on retry.
- **AB-237 #5816 residuals** (S). Hybrid scan-first rows on an old tab (flag `quiz-time-limit`); the input-signal tail flush is lost on close.
- **AB-199 Fill in the blank on paper answer sheets** (M, risk: scan and grade path). Deferred M10 clause of `docs/plans/QUIZ_MCA_PRACTICE.md`. `analyzePaperQuiz` (`utils/paperSheetPlan.ts`) excludes every fill-in-the-blank question as `question-type`, so dropdown and drag blanks can't be answered on paper. Starting design: a dropdown blank prints as one MC bubble row per blank (its choices in authored order, key = the right choice), and a drag question prints as a handwritten box with the word bank under the stem, graded by hand. Touches the sheet plan, print geometry, scan crop, grading and the server copy in `createTeammatePaperBatch` (keep `paperBatchPlanParity` green). Typed questions keep printing as today. Done with plan, parity and grading tests.
- **AB-177 Kept pages: rescan replaces pages by page number** (M, before `paper-kept-pages` opens; release 2026.11.10 #5516 review). `keptPageFields` in `functions/src/importPaperResponses.ts` rebuilds `paperPages` from only the current import's pages, so a later scan that covers only page 2 of a student (with "Skip page N" for page 1) drops page 1's kept copy while page 1's answers stay; the page prints redrawn and its Storage object is swept after 7 days unless already in Drive. Have `PaperImportModal` send each sheet's covered page numbers, replace only those, keep prior pages for uncovered numbers, and still clear a covered page that came without a copy. Update the K12 tests in `importPaperResponses.keptPages.test.ts`. Also from the same review: hybrid responses (`paperWrittenBatchId`) never load `student.sheet` in `ResultsPrintModal.tsx` (`batchIds` reads only `paperBatchId`), so markup boxes and kept pages don't print for them; and a student can create a response with a forged `paperPages` array (response create rule doesn't deny it), which only adds phantom rows to `collectKeptPageArtifacts` in the org-admin media list. Filter those rows by a server-owned scan record rather than touching the rules (near the expression limit).
- **AB-178 Quiz read-aloud and picture names** (S, release 2026.11.10 review). `components/quiz/readAloud/useQuizReadAloud.ts` and `functions/src/quizReadAloud.ts` read choice text raw, so drawn-math choices speak the `⟦…⟧` markers (stems had the same gap); run them through `plainPromptText`. `spokenAnswer` says "Picture N" from the session's order while the student's screen-reader name uses their own shuffle (`pictureOnlyName` in `QuizStudentApp.tsx`); make both use the same number, and note the teacher's picture description is not translated. `PaperPrintModal.tsx` passes raw `⟦⟧` choice text into the paper fill.
- **AB-176 Kept paper pages and image markup follow-ups** (M, before `paper-kept-pages` opens for 1 and 2). From the build of `docs/plans/shipped/QUIZ_PAPER_KEPT_PAGES.md`. (1) A handwriting crop whose transcription never succeeds gets no archive entry, so `paperTranscriptionSweep.ts` never starts its 60-day clock and the crop stays in Storage; give it the same stamp-on-first-sight rule kept pages use, with a sweep test. This predates kept pages. (2) Kept pages archive to Drive only on the daily sweep, so a page can sit in Storage for about a day; archive soon after the upload lands (a trigger, or a client call once the queue finishes) and keep the sweep as the retry. (3) A class set printed on scanned pages spools for 10 to 18 seconds and makes a 38 to 115 MB PDF, because Chromium stores each grayscale page as full colour; try a JPEG data URL or a canvas re-encode in `utils/paperPageFetch.ts`, measure, and keep it only if marks still line up. (4) The org-admin media console's column header reads "Attempts" above a "2 pages" badge (`MediaReviewView.tsx`). (5) After "Clear marks" has saved, undo restores the marks stamped with the current scan, so the earlier-scan notice does not return. (6) Marks on a handwritten answer have no keyboard resize.
- **AB-122 Quiz picture lightbox and small buttons** (S, release #5270 review). `components/common/ImageLightbox.tsx` sets `aria-modal` but doesn't move focus into the dialog, trap Tab or return focus to the enlarge button on close. The enlarge button (`AnswerImageZoomButton`, 32px) and the one-list Ordering up/down arrows (`OrderingListInput`, 22px tall) are below the 44px touch target. Fix both with screenshots at phone and Chromebook sizes; no wording changes.
- **AB-114 Delete the old paper print doors** (S). Assign on paper replaced New > Paper test and the library's Print response sheets and Import responses items, so `PaperPrintModal` no longer opens without `assign`: its roster checklist and the stub door (`onCreateQuiz`, `readDocument`, stub title/count/choices/written numbers) are unreachable. Keep `PaperImportModal`'s batch and administration pickers: the library's Import responses item for a stack with no Paper card still uses them. Delete the unreachable paths and their tests, keeping the stub _analysis_ path, which old paper tests still use. Check `tourAnchorsInUse.json` before removing any `quiz-print.*` or `quiz-import.*` anchor. Done when: both modals have only the paths Widget.tsx reaches.
- **AB-16 Quiz view state cleanup** (M). From `docs/plans/shipped/QUIZ_INTERFACE_REDESIGN.md` Phase 3: remove the `'editor'` member from `QuizConfig.view` (`types.ts` ~6702) if nothing sets it; move ephemeral view state (tabs, view toggles) out of Firestore config into local state; check QuizResults (Phase 1.5) matches the monitor's toggle, sort and filter conventions.
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
- **AB-67 Video import review minors** (M). From release 2026.10.31 (#4959); short answer, notes and clips are now on for every teacher, so these reach them.
  - Re-marking a short answer after Publish leaves the stored score until the teacher republishes (`functions/src/gradebook/gradeRowMath.ts` uses `stored ?? live`). A blank mark box can't clear a mark back to unmarked (`utils/videoActivityShortAnswerMark.ts`).
  - Note stops are silent in teacher-paced live runs (`VideoActivityLivePlayer.tsx` passes only `clip`); whether they should pause is PT-102.
  - Every synced publish writes `notes: []`; an old synced group costs one extra Drive read on its first pull (`hooks/useVideoActivity.ts`).
  - Edpuzzle pictures: copies are orphaned if the widget unmounts mid-copy; removing a picture in the editor doesn't delete its Drive file; stops past 200 aren't counted in "Left out".
  - `sendId` now hashes `send.video`, so re-sending a page already in the inbox after the release makes a second item (TTL cleans it).
  - Per-type Import flags (#4960): AI conversion on the server checks only `universal-import`; `import-link` also hides the Embed check's "Add as a link"; tests don't render a flag-off case.
- **AB-68 PLC aggregates for video activities** (M). From the #4961 review: they're never built. `recomputeOnePlcAssessment` reads only `quiz_sessions`/`synced_quizzes` and `status == 'completed'`, and `markPlcAssessmentDirty` watches only quiz sessions. A video kind needs `video_activity_sessions`, `synced_video_activities`, `completedAt != null`, and short answer mapped to free-response.

### PLC, Schoology and imports

- **AB-300 PLC recompute failure docs: cleanup and rules test** (S). Since #6256, `plc_recompute_failures/{plcId}/recompute_failures/{assessmentId}` counts recompute failures. `plcDeleteCascade` doesn't delete them, and no rules test proves clients are denied. Add both.
- **AB-274 PLC permission leftovers** (S, from AB-60 after #6129). (1) Video Activity import may still offer Synced for a share whose author left the group (#4694 fixed only the quiz preview); hide it when the server would refuse. (2) A refused paper-crop entry that already has a Drive id retries every hour: `settleRefusedArchive` in `functions/src/quizMediaArchive.ts` returns false when `driveFileId` is set; settle it without `finalizeArchivedEntry` deleting the Storage object. (3) The assessment print picker (`components/plc/assessments/PlcAssessmentList.tsx`) lists viewer teammates; reviewers disagreed on whether a print request to a viewer fails (#4692). Check the rules and function, and filter viewers only if it fails. Test each.
- **AB-53 Import: Canvas and QTI export files** (M). The Wave 2 file route (D25): a Canvas or QTI export file lands in the Quiz and question bank import, reusing the `.imscc` cartridge reader (`functions/src/cartridgeBankImport.ts`), with a fixture test and the reader failure fallback (D18). Wave 3 readers wait until Paul ranks the sites. Plan: `docs/plans/IMPORT.md`.
- **AB-24 Schoology columns Phase 6** (M). Score never-launched students on Schoology-attached sessions through NRPS matching. Plan: `docs/plans/shipped/SCHOOLOGY_TOOL_COLUMNS.md`.
- **AB-25 PLC sync rollback gaps** (M). `docs/PLC_ROADMAP.md` "Still open": the share-write rollback gap and the `detachSyncLinkage` API.
- **AB-26 Rostered join link** (L). Quiz, Video Activity and GL get a rostered join link (`docs/wide-distro-plan.md`).
- **AB-69 Schoology quiz import review screen** (M). The next PR after server PR1+PR2, carrying the #4854 review findings: inbox docs store `blankAlternates` as `{answers}[]` but `ExtractedQuestion` uses `string[][]`, so `fibAlternates` drops them; the inbox re-send path should claim the replaced `sendId` in a transaction so pictures aren't orphaned; `assessmentReader` turns null points into 0; `readResult` image `src` values must be limited to https Schoology URLs before any credentialed fetch. Accepted as is: `?schoologyImport=1` from any link adds a Quiz widget for a flagged user with none on the board (own data only); the 24 MB picture cap.

### Tours and extension

- **AB-273 Prune dead Focus push subscriptions safely** (S, from AB-64). #6128 added a TTL, but subscriptions that answer 400 or 403 are never removed. Pruning on the first 400/403 would wipe every subscription if the VAPID keys were ever mixed up, so count failures per endpoint and delete only after several in a row across separate days (`functions/src/focus/push.ts`). Test the count and the reset on success.
- **AB-280 Focus Lock cover translations and VA Settings save message** (S, from AB-64). (1) The fullscreen Lock cover (`extension/src/focus/pageNotice.ts`) is English only; add es, fr and de, raising the extension version. (2) The Video Activity Settings modal says "Couldn't save settings." when the batch saved and only the pointer update failed; show a partial-save message instead. Draft both, then ask Paul with a screenshot and a decision card in the thread before pushing the wording.
- **AB-206 Send to SpartBoard opens a second tab from a PLC or gradebook page** (S). Release #5707 review. `boardTabs` in `extension/src/serviceWorker.ts` now keeps only tabs whose path is exactly `/`, so a teacher whose SpartBoard tab is on `/plc/...` or the gradebook overlay (both still mount `DashboardView`) gets a new tab instead of reusing theirs. Exclude only routes that are not board pages (`/web-tours`, standalone and student routes). Raise the extension version in the same PR. Done when a test covers a PLC-path tab being reused and a `/web-tours` tab being skipped.
- **AB-207 Convert to live tour hides a set when filing fails** (S). Release #5707 review. `components/widgets/GuidedLearning/Widget.tsx` saves the set with `helpCenter: true` before `createHiddenHelpItem`; when filing rejects (no org, rules or network) it only logs, so the set leaves the library with no Help Center item and no message. File the item first, as `moveSetToHelpCenter` does, or show the recorder's `glRecorder.helpCenterNoOrg` / `glRecorder.helpCenterFailed` toasts. Done when a test covers a failed filing.
- **AB-208 Web tour step-count and message rules disagree** (S, minor). Release #5707 review. (1) `extension/src/tourSteps.ts` slices to `MAX_STEPS` counting Message steps while the public link does not count them toward `MAX_PUBLIC_STEPS`; pick one rule. (2) `publishBlockers` in `components/tours/web/webStepReview.ts` accepts a title-only Message step while the editor and MCP tools require text; align them. (3) `useWebTourCheck.ts` runs a check without the cross-site protocol gate. Done when each has a test.

- **AB-187 Tour routes for assignment-row side menus** (S). #5576 moved Share, PLC results, Publish/Unpublish scores and paper import/print rows on In Progress and Completed into side menus (Paper, Share, Published scores). Give each group row a registered `tourAttr` anchor, point the inner routes in `config/tourSurfaces/quiz.ts` (and VA, Mini App, Flashcards where they share the menu) at it, regenerate `functions/src/mcp/tourAnchorList.ts`, and rebind the prod tour steps that click these rows by position (prod edit needs Paul's OK). Done when `tests/tourAnchorRoutes.test.ts` shows each moved anchor's path through its side-menu row.
- **AB-183 Links in web tour tips look like plain text in the extension** (S, release #5550 review). `extension/src/overlay/OverlayRoot.tsx` now renders tips with `renderStepText` (`components/widgets/GuidedLearning/utils/richText.tsx`), but `extension/scripts/tailwind.overlay.config.ts` content globs don't include `richText.tsx`, so its `underline underline-offset-2` classes are never generated and a `[label](https://...)` link shows with no underline or color. Add the file to the overlay content list, check a link in a tip, and bump the extension version.
- **AB-184 Print the tour Steps article with the new spotlight** (S, release #5550 review). `components/tours/steps/StepPicture.tsx` now draws `RingAndTip` sized by `useMeasured`, and `TourSpotlight` paints a 55% dim. `PrintCopy` in `StepsView.tsx` prints 150ms after portaling the article, so a picture may print with no ring (unmeasured) or with the dim over it. Print a Live tour and a web tour with targets on spartboard-dev; if either is wrong, hide the dim and draw the ring from percentages in print.
- **AB-182 Tour anchors for library side-menu rows** (S, from #5539 review). Library card menus now have side menus (Quiz Preview › and Share ›, Flashcards Share ›). Their rows reuse `library-shell.card-menu-item` with fields like `row-1-item-1-2`, but that anchor's surface opener is `library-shell.card-menu` (`config/tourSurfaces/library.ts`), and the side menu mounts only after its parent row is clicked (`components/common/library/LibraryItemCard.tsx` `openSub`). So a tour step on Get link, Share with PLC, Check answers or Student view can't be reached. Give side-menu rows their own anchor id with the parent row as opener, register it, regenerate the anchor maps, and add a `tourDryRun` test. While there, key library menu rows by action id instead of position (`LibraryItemCard.tsx` `${rowKey}-item-${i + 1}`), keeping the old positional keys working for saved tours (release #5550 review: removing Stats shifted every row after it).
- **AB-179 Public tour link and editor follow-ups** (S, release 2026.11.10 review). `functions/src/tourPublicLink.ts` `clientKey` keys the 600/min limit on the last `X-Forwarded-For` hop, which behind the Hosting rewrite may be the edge, so a class opening one tour could share a bucket; log the header on spartboard-dev and key on the right hop. Step title and text edits go live on a public link without re-confirming (only pictures are fingerprinted); confirm with Paul whether that's intended. `components/admin/HelpCenter/GuidedLearningPicker.tsx` copies derived `linkedToWeb` into `HelpItemForm` state from an effect; derive it in the form instead. `utils/paperPageFetch.ts` `driveBlobReader` fetch has no timeout, so Print can stay on "Loading scanned pages".
- **AB-180 Quiz import reader without its own flag** (S, decide before `quiz-document-import` opens; release 2026.11.10 review). The plain reader rewrite in #5509 (figures, unicode sub/superscripts, math pictures, key answers as notes, `optionOrder`) ships under the existing `quiz-document-import` preview with no separate switch, and `pdfReader.ts` now runs `getOperatorList` on every page even with answer marks off. Skip that work when `marks` is unset, and with the Google-Doc-as-PDF flag on a failed `pdfPageCount` should fall back to the Word export (`QuizWidget/Widget.tsx` ~447).
- **AB-163 Flashcards Speak opt-outs that render for admins** (S, 2026-11-08 sweep of #5431). `components/flashcards/SpeakMode.tsx` has `no-tour-anchor: student player` opt-outs on controls that also render in Admin Settings' Words to check practice (`components/admin/FlashcardsSpeakWordsToCheck.tsx`, `allowedModes={['speak']}`): the `SelectSetting` select, the auto-continue and example toggles, Hear it and Speak. Give the ones an admin tour could point at real anchors (follow the `flashcards.present-*` ids from #5431) or correct the reasons. Also fix `FlashcardPlayer.tsx`'s remaining `no-tour-anchor: student player` line. Done when `check:tour-anchors` passes and every reason is true.
- **AB-109 Learning target picker and Schoology push anchors** (S). From #5126 review: the four `target-picker` close/apply/replace/cancel anchors use `closes: 'own'` on a `kind: 'shared'` surface, so the dry run closes the surrounding editor instead (`config/tourAnchors.ts` ~922-954; set `closes: 'board.target-picker'` or make the surface a dialog kind). `schoology-push.add-category`, `.create-categories` and `.skip-course` render once per course (`components/schoology/ToolColumnPushDialog.tsx`); scope them `perField` by course or opt them out. `board.target-picker` has no `opensWith`, and the PLC mount in `LearningTargetsManager.tsx` has no surface. Done when `tourDryRun` gives no false closed-panel warning, with a test.
- **AB-27 Live tour benchmark fixes** (M). `docs/live-tours/BENCHMARK.md` B1-B6, B10: `get_live_tour` drops the material sample; picture `upload_url` unreachable; a type step with no value is refused against the guide; the `editor.save:quiz` key; demo content in the guide; multiple openers per surface; video activity tour 11 not green.
- **AB-28 Web tour pictures with suggestions** (M). C15 in `docs/plans/shipped/WEB_TOURS_CLAUDE.md`: save a fresh picture with a suggestion from an admin's own run or a check run (PR 5 sends clues only).
- **AB-70 Schoology Materials Send button goes stale** (S). From the #4858 review: the Materials checklist is built once at injection, so an AJAX-filled table or a pushState move to a subfolder leaves it stale or empty and no Send button shows. Add a `webNavigation.onHistoryStateUpdated` re-inject and a MutationObserver/retry. Also: the `openReview` reload fallback reloads an open board tab if the event isn't heard (consider a new tab); `render()`'s `if (!page)` branch is unreachable. Raise the extension version in the same PR.
- **AB-101 Flashcards results anchors with no live control** (S). Since the `monitor-parity` retirement (#5079), `flashcards.let-in` and `flashcards.reset-student` are tagged only in `FlashcardStudyResults`, which only `components/dev/FlashcardsSpeakFlowDevHarness.tsx` still mounts; the results screen is `FlashcardMonitor`. Tag the monitor's Let in and Reset controls with them (or unregister both and regenerate the anchor maps), then move the harness to the monitor and delete what's left of `FlashcardStudyResults` apart from `BucketBar`/`BucketSummary`. Done when: both anchors resolve on the Flashcards results screen or are gone from `config/tourAnchors.ts`.
- **AB-71 PDF viewer tour anchor route** (S). From the #4670 review: the PDF viewer needs an anchor route so live tours can reach its controls (`config/tourSurfaces/`).

### Widgets and UI

- **AB-305 Lunch Count redesign: translate, settle the fit, keep the date fresh** (S; release 2026.11.19c review of #6282; admin-only behind `lunch-count-redesign`). Do before that flag opens. (1) `components/widgets/LunchCount/redesign/RedesignedLunchCount.tsx` and `LunchZone.tsx` hardcode English ("Daily Lunch Count", "Submit Report", "Assign N More Students", zone names, "Unassigned", "Show photo of"); move them to `locales/*.json` (#6282 deleted the old `short*` keys). (2) `useBoardFit.ts` `fitsAt` runs up to 9 reflows per `fit()` on every board resize frame; run the board-resize path through one rAF so a drag on a Chromebook with 30+ students stays smooth. (3) The header date is `new Date()` per render and goes stale past midnight; tick it at midnight. Done when the face renders translated in es and a test covers the rAF-batched fit.
- **AB-281 Small widget polish** (S, from AB-65 triage). (1) The Countdown grid's 12px bottom padding can add a scrollbar at the smallest sizes. (2) Number Line has a visible jump at the 500px width threshold. (3) A very long Activity Wall composer prompt grows without limit; cap it with `max-h` and scroll. Screenshot each before and after.
- **AB-266 QR stuck on an old Text sync with no Text widget** (S). Since Connections went Public, `hiddenWithConnections` hides the old per-widget link toggles. A QR with `syncWithTextWidget: true` and no Text widget never converts (`utils/legacyConnections.ts`), so `QRDestinationField` keeps the URL box disabled and the teacher can't turn the sync off. Treat a sync with no Text widget as unsynced (or show the toggle while unconverted), and check the other unconverted toggles (Music `syncWithTimeTool`, Random `autoStartTimer` with no Timer) for the same trap.
- **AB-211 Lunch Count middle/high refresh button on touch panels** (S, minor; release 2026.11.13d review). `components/widgets/LunchCount/MiddleHighLunchCount.tsx` refresh button is `opacity-0 group-hover:opacity-100`, so a middle or high school board on a touch-only panel never shows it. Pre-existing (moved unchanged). Use the repo's touch-panel pattern from `components/CLAUDE.md` (there is no `touch:` variant). Done when the button shows on a touch device and a test or screenshot proves it.
- **AB-209 YouTube paste picker: read-only board and start time** (S, minor; release 2026.11.13b review; live for everyone since the flag retired). In `components/layout/Dock.tsx` the Video Activity choice (1) calls `offerImportHandoff` even when `addWidget` no-ops on a read-only board or with no active board, leaving an orphaned handoff; skip the offer, as `ImportScreenHost` does with `refuseReadOnly()`. (2) It rebuilds the URL as `watch?v=<id>`, dropping a pasted `&t=` start time; pass the pasted URL through. Done when a test covers each.
- **AB-188 Flashcards check sync: retry and don't block the save on rescore** (S, release 2026.11.10 (5) review). `hooks/useFlashcardSets.ts` `rewriteOpenCheckSessions` awaits every `rescoreFlashcardCheckV1` call inside the final save, so editor Close waits on cold starts, and a failed call is only logged: the cards are already committed, so the next save sees no change and never rescores. Fire the rescore after the save resolves, and mark the session (for example `rescorePending`) so a later save or the next open retries it. Skip the call for Flashcards and Speak Checks.
- **AB-189 Term-only cards through the connector and results views** (S, term-only cards are on for everyone since 2026-11-15; release 2026.11.10 (5) review). `functions/src/mcp/tools.ts` `update_flashcard_set` requires `definition.min(1)`, so sending back a sight-word set from `get_flashcard_set` fails validation; allow an empty definition for sets the owner's flag allows. Blank definitions also leave a dangling separator or blank line in `FlashcardStudyResults.tsx`, `FlashcardCardResults.tsx`, `FlashcardsCardsStep.tsx`, `PlcFlashcardsBody.tsx` and `flashcardPrompt` in `utils/flashcardResults.ts`.
- **AB-190 Stepper written-answer selects need their own tour routes** (S, release 2026.11.10 (5) review). `components/common/library/assignStepper/WrittenAnswersStep.tsx` renders the `quiz-print.written-box-*` selects with `assign-N` keys, but those id literals live only in `PaperWrittenBoxControls.tsx`, which sits on the `quiz.paper-print` surface, so a tour step on a stepper select opens the Assign on paper dialog instead. Give the stepper its own registered ids (or pass anchor attrs from each caller), keep the dialog's ids, and regenerate the surface map.
- **AB-191 Assign stepper saves the written box setup before it can still abort** (S, release 2026.11.10 (5) review). In `components/widgets/QuizWidget/Widget.tsx` the stepper's written-on-paper path calls `saveQuiz` with the new box sizes and styles before `planHybridWrittenBatch`, image loading and `savePaperBatch`, so a later failure leaves the quiz changed with no assignment, and a Drive save failure blocks an assign that could still print. Save the setup after the batch is saved, or treat a save failure as a warning.
- **AB-125 Remove the unused Bloom's AI integration** (S). Retiring `blooms-question-starters` (#5308) removed the only caller of `blooms-ai`. Delete the `blooms-ai` feature, its AI integration and limit (`config/aiIntegrations.ts`, `config/aiLimits.ts`, `functions/src/aiIntegrations.ts`, `functions/src/aiLimits.ts`, `functions/src/aiGeneration.ts`, `featureMissingDoc.ts`, `useGlobalPermissionsEditor.ts`), and the Bloom's `enabledCategories` and admin category building defaults that no longer do anything. Keep the analytics label so past usage still reads.
- **AB-123 Layout Generator double run in View As** (S). #5275 guards Enter while a run is going, but in an unlocked View As tab `handleGenerate` in `components/layout/dock/MagicLayoutModal.tsx` awaits `outward.confirm` before `setIsGenerating(true)`, so extra Enter presses queue more confirms and each accepted one generates. Set a `useRef` in-flight flag at the guard, clear it in `finally` and on a declined confirm, and add a test.
- **AB-124 Rubric CSV keeps a leading apostrophe** (S). #5276 prefixes `'` on formula-leading cells and strips one on import, so a cell the teacher wrote as `'-1 per error` comes back as `-1 per error`. In `utils/rubricCsv.ts` `quoteCell`, test `/^'*[=+\-@\t\r]/` so the round trip always restores the original, and add a round-trip test.
- **AB-83 Rubric CSV import line numbers** (S). #4999 fixed invite CSV errors pointing at the wrong line after a quoted cell that spans lines. `utils/rubricCsv.ts` has its own copy of `splitLogicalRows` and still uses `line = i + 1` (~:188). Port the physical-line tracking, and in both parsers count a bare `\r` inside quotes as a line break too. Done when: a rubric CSV test with a multi-line quoted cell reports the right line.
- **AB-84 One `clipText` helper, grapheme-safe** (S). `utils/clipText.ts` (#4997) only keeps surrogate pairs whole; flags and ZWJ emoji at the cap still split, and a space before the cut survives (`seatingPlans.ts` trims before clipping). `components/widgets/Flashcards/utils/flashcardImport.ts:120` has a private copy. Make `clipText` back off to a grapheme boundary (`Intl.Segmenter`, fallback like `emojiCatalog.ts` `walkEmojiCluster`), `trimEnd` the plan name after clipping, and point Flashcards at the shared helper. Done when: tests cover a flag and a ZWJ family at the cap.
- **AB-85 Adopt `clipText` at other character caps** (S). Other `.slice(0, n)` caps on user text can split an emoji: `miniAppImportAdapter` (`titleFromFileName`/`titleFromHtml`), `MusicWidget/mySongs.ts`, `ArtsLettersAgenda/utils.ts`, `VideoActivityWidget/Widget.tsx` ~:345, `Focus/FocusSetup.tsx` ~:348, `GuidedLearning/.../resolveAnchor.ts` ~:147 (from the 2026-11-02 debugger log). Do after AB-84.
- **AB-29 Settings drawer wave 10** (M). List the widgets without `settings.schema.ts` (about 85 widget folders, 58 schemas), confirm each has no settings or migrate it, then delete `components/settings/legacy/LegacySettingsSlot.tsx` and the frozen legacy palettes (`docs/plans/shipped/WIDGET_SETTINGS_DRAWER.md` D9, D12, D30).
- **AB-30 Activity Wall leftovers** (S). P3-3: delete the no-op `archiveActivityWallPhoto` callable and its test, the `activity_wall_photos` block in `storage.rules`, the `?data=` decoder remnants, and the deprecated `mode`/`identificationMode` writes (`functions/src/driveArchive.ts`, `functions/src/index.ts`, `types.ts`, `components/widgets/ActivityWall/`). Keep old docs readable.
- **AB-31 Dead sidebar component** (S). `components/layout/sidebar/SidebarBoardsActive.tsx` is rendered nowhere; remove it, its test, and its entries in `config/tourSurfaces/board.ts`, `tests/e2e/sharing.spec.ts` and `tests/i18n/boardsModalCollectionLocales.test.ts`.
- **AB-32 Always-visible copy leftovers** (S). From `docs/plans/shipped/ALWAYS_VISIBLE_COPY.md`: decorative accent strips (Analytics KPI cards, LinksPanel, WhatsNewModal, TalkingTool); colour-only status (Drive sidebar dot, class-row dot, Poll and VA markers, PLC switches missing `role="switch"`); static help styled as blue alert boxes (QuizEditor, StimulusManagerPanel).
- **AB-88 Connections: two visible pages can both join a remote Timer start** (S). Since #6057 the page that carries the Run joins at once and other pages wait 4 s, so a Run already under way is joined once. A Timer step that starts a new Run from the phone remote while two pages show the board (no Run yet) still has both pages joining after a 0 to 1.5 s jitter, because a join write takes about 1.2 s to reach the other page. Fix with a real claim (e.g. a `claim` field on the Sequence written first, or a callable), then remove this item. Done when: two visible runners on one board apply a no-Run remote start once.
- **AB-90 Connections: older client tab drops Connections** (S, release-time). A tab on the previous client rebuilds dashboards from known fields and can save over newer `connections` and Runs. Only flagged admins have the field. Check `hooks/useFirestore.ts` save paths on the next release and, if needed, make saves field-level for `connections`. Note it in that release's compatibility check.
- **AB-86 Connector timers use the teacher starting length** (S). #5009 starts new Time Tool timers at the teacher's `timeToolStartSeconds` on client adds only; timers the Claude connector adds still use the building default. Files: `functions/src/mcp/boardConfig.ts` (`widgetConfigSources`), `functions/src/mcp/boardWrite.ts`, `utils/timeToolClock.ts` (`withTimerStartSeconds`). Done when: a connector-added timer starts at the saved length, a stopwatch stays at 0, and a test covers both.

- **AB-111 Release 2026.11.05 review minors** (S). From the #5173 review: (1) `functions/src/lti/courseLinkStore.ts` `deleteTeacherLink`: a second Unlink after a co-teacher's link was promoted into the section doc returns false, so `ltiUnlinkSectionV1` shows "Only the teacher who linked..." instead of succeeding quietly; a legacy section doc with no `teacherUid` can't be unlinked either. (2) `components/layout/BoxSelectionBar.tsx` now mounts for every teacher and re-renders on every widgets change; return early before the filter when nothing is selected. (3) `formatVideoActivityBehaviorSummary` in `utils/videoActivityBehavior.ts` is dead since #5164; delete it and its test. (4) `taken` in `functions/src/lti/findSchoologySections.ts` is unreachable now that `saveSectionLink` always passes `coTeacher`; drop it or document why it stays. Done when each is fixed or deleted with a reason.
- **AB-106 Release 2026.11.04 review minors** (S). From the #5121 review: (1) `components/widgets/TimeTool/TimeToolWidget.tsx` ring mode on a short, wide widget (e.g. 240x170): when `inCorners` is false the four-button row under the time uses the compact `ctrlGap` (44px hit areas) and is about 156px wide, wider than the ring, so ± touch the stroke; fit the row to the ring chord or hide ± there. (2) Same file: above compact size (`expandHitArea = isCompact`) Timer buttons can be under 44px; consider expanding hit areas where the gap allows. (3) The ResizeObserver sets `ringSizes` in digital mode too; skip it when not in ring mode. (4) Connections, admin only: `components/widgets/Scoreboard/settingsFields.tsx` shows Import and Add/Delete team on a Scoreboard that follows a Review, and the next Review sync overwrites those teams; hide them like the Randomizer-led case. (5) A previous-client tab uses slotless `followLeaderId`, so a Scoreboard with both a Randomizer and a Sound or Review follow may skip the Randomizer team sync there until reload; fold into AB-90. Done when each is fixed or deleted with a reason.
- **AB-105 Release 2026.11.03 (d) review minors** (M, all admin-only unless noted). From the #5104 slice review: (1) `components/widgets/Scoreboard/settingsFields.tsx` (~:102) hides Add Team, Delete and Import whenever a Randomizer leads, even when `randomizerGroups(leader.config)` returns null (single mode, no pick yet), so the teams freeze; gate on that check like `Scoreboard/Widget.tsx`. (2) Timer's `TimerMusicLauncher` and Randomizer `connectScoreboard` build `connections` from the render closure; read the latest through `getCanvasState()` as ActivityWall and MiniApp do. (3) #5093: turning off Avoid recent partners keeps `recentGroupings` (student names) and stale rounds win when it's turned back on; clear it on off, and record Rotate and drag edits. (4) `hooks/useFirestore.ts` `shareConnectionFields` and `SaveAsTemplateModal` write empty `shareConnections`/`connections` for everyone; write only when non-empty. (5) Marquee select can highlight widget text: set `user-select: none` on body during the gesture (`useBoardMarqueeSelect.ts`); memo `GroupBoundingBoxLayer`'s Set. (6) Trim the multi-line docblocks added in `utils/sharedBoardMerge.ts`, `hooks/useFirestore.ts` and `random/groupMaker.ts` to one line.
- **AB-104 Phone remote Clock: Show Time and Show Date** (S). #5089 added `showTime`/`showDate` to the Clock (undefined means on; the last one on can't be turned off). `components/remote/controls/RemoteClockControl.tsx` doesn't offer them and its preview always shows the time. Its generic `toggle` (`!config[field]`) would read an unset key as off, so default both to on before flipping, and keep the never-both-off rule. Reuse the settings labels "Show Time" and "Show Date". Done when: the remote shows both switches, its preview matches date-only clocks, and a test covers the both-off guard.
- **AB-102 Activity Wall timelines without dates on shared walls** (S). Since the `activity-wall-timeline-dates` retirement (#5071) the owner's mirror always passes `{ timelineDates: true }`, but `components/widgets/ActivityWall/useSubShareActivityWall.ts` calls `mirrorSessionFromEntry` without it, and `functions/src/sharedActivityWallEdit.ts` only ever sets `timelineDates` false, so a timeline reached through a sub share or a colleague's edit renders undated. Pass the option in both places. Done when: a test shows a sub-share timeline session and a colleague's switch to timeline both get `timelineDates: true`.

### Build hygiene

- **AB-301 Lazy-load MCP widget schemas and ajv** (M). Left from AB-276 (#6257). `partialWidgetSchema`, `hasWidgetSchema`, `checkWidgetSettings`, `collectRefs` and `resolveSchema` are synchronous and used across `functions/src/mcp/boardTools`, `boardWrite`, `boardStore` and `boardConfig`, so lazy loading needs an async-init refactor. Also: in `commitBoardChange`, a `change()` that throws on a retry attempt, or an unchanged result after reserving, still spends the board allowance; refund those too.
- **AB-279 Flaky Schoology teacher review test** (S). `tests/components/classroomAddon/TeacherReviewRoute.schoology.test.tsx` "grades a bank draw with the bank's current answer key" fails in CI shard runs about once a night (mock called 0 times; #6129, #6133 and one PR on 2026-11-16) but passes alone. Find the timing dependency (likely an unawaited load or a `waitFor` that resolves too early) and fix the test or the code, without skipping it.
- **AB-268 VideoActivityStudentApp tab-warning test flakes in CI** (S). `tests/components/videoActivity/VideoActivityStudentApp.live.test.tsx` "warns and logs a tab exit but never submits" failed on the dev-paul push for 80bbd9e2 (could not find "TAB SWITCH DETECTED"); it passes locally. Find the timing dependency and make it deterministic. Never skip it.
- **AB-263 Slow PDF import test times out in CI** (S). `tests/utils/quizDocumentImport/plainVersions.test.ts` "splits each version with its own key" hit the 5000ms default on the dev-paul push for f86dc870 (a docs-only commit; the run before and after passed). Profile the PDF parse it does, make the fixture smaller or give that one test an explicit timeout with a one-line reason. Never skip it.
- **AB-121 Carry-forward should warn on missing assets** (S). `scripts/carryForwardAssets.mjs` exits 0 when old chunks can't be fetched (30s timeout, 32 workers since #5253), so an old tab can 404 on a dropped chunk. Emit `::warning::` with the count when `missing.length > 0`, and fail above a set share.

- **AB-33 Unused-locals strictness** (L). `tsconfig.json:38-39` has `noUnusedLocals`/`noUnusedParameters` false. Flip them and clear TS6133/TS6196 in per-directory batches.
- **AB-34 CI lint memory** (M). F11: split the root and functions type-aware ESLint passes so the `NODE_OPTIONS` 5120 MB override can go, or document why it stays.
- **AB-36 useEffect cleanups** (S + M). Move the `prevIndexRef` sync out of an effect in `components/layout/DashboardView.tsx` (~559, 966); extract the ~175-line live scoreboard sync effect in `components/widgets/QuizWidget/Widget.tsx` into a `useLiveScoreboardSync` hook.
- **AB-38 Quiz assign picker and `rosterIds`** (M, MED). M6: the Quiz edit modal's AssignClassPicker plus the `rosterIds` data migration.

- **AB-140 Board save leftovers after the switch fix** (S, risk: board save path). Follow-ups from #5377 (state machine audit slice B1) in `context/DashboardContext.tsx`. (1) On `pagehide`/`beforeunload`, also flush any parked board (`parkedBoardsRef`) whose switch flush is still queued or retrying. Today only the active board gets the blind teardown write. (2) A parked flush abandoned after `PARKED_FLUSH_TIMEOUT_MS` can still land after its retry. Consider cancelling it or re-checking that the board is unchanged before the late write commits. (3) `heldCopyIsCurrent` misses this tab's write when Firestore folds it and another device's write into one snapshot, so an inactive board shows slightly stale content until the next collection change. Record each `updatedAt` in arrival order so a copy seen after the write resolved counts as current. Done when each has a test in `context/DashboardContext.boardSwitchSave.test.tsx`.

- **AB-143 Re-sharing an Activity Wall can lose a race with the hourly relock** (S). `ShareModal.tsx:218-226` writes `publiclyShared: true` on the session, then creates the share doc in a separate write. If `expireActivityWallShares` runs between them it sees only lapsed shares and relocks, leaving a dead gallery link until the teacher re-shares. Fix: write both atomically from the client, or have the sweep skip a session whose `latestShareId` has no share doc yet (bounded to one run). Found in review of #5362.

- **AB-164 Dev hosting skip can let a stale run queue a backend deploy** (S, from review of #5437). In `.github/workflows/firebase-dev-deploy.yml` the `deploy-hosting` "Stop if a newer push superseded this one" step now only skips its own steps, so a superseded run's `deploy` job still queues in the shared `dev-backend-spartboard-dev` group, where it can replace another branch's pending deploy. Fix: from hosting, read this run's jobs; cancel the run when `deploy` has not started, and only skip when it is in progress. Update `tests/ci.checkMode.test.ts`. Done when a stale run never reaches the backend queue and a running backend deploy is never cancelled.

- **AB-156 Shape check for `tour_anchor_queue` rules** (S). `firestore.rules` `tour_anchor_queue` is bare `isAdmin()`; add a minimal status-enum and transition check with the shorthands, after the other rules slices have landed, and put the `check:rules-size` before and after in the PR. Skipped from T2 to protect the rules budget.
- **AB-181 Quiz PDF import: no "added as a picture" note when the whole-question crop also failed** (S, from release #5534 review). In `utils/quizDocumentImport/pdfPictures.ts` `resolveChoicePictures`, when the per-choice crops are lost and `choiceFallbackId` has no crop either (whole-PDF crop failure), the question still gets `CHOICES_AS_LETTERS`, which says the whole question was added as a picture, though none was. The import-level `PDF_PICTURES_FAILED` warning also shows. Fix: add that note only when `whole` exists; any new wording needs Paul's OK. Optional in the same PR: skip cropping the whole-question fallback when every choice crop succeeded (extra crop work today).
- **AB-201 Release 2026.11.12 review leftovers (flag-on minors)** (S-M). Found in the #5630 slice reviews, none reachable with the flags off; fix before each flag opens. (2) `functions/src/subLaunchAssignment.ts`: sub launches don't run `blankTypeProblem`, so a dropdown blank whose answer isn't among its choices can launch. (3) Blocked on PT-183: if Paul says hide them, move `targetEmails`, `updatedBy` and `sourceName` off the `district_library` item doc that targeted teachers can read. (4) `components/plc/bodies/MembersBody.tsx` shows Remove to co-leads, which the server (and the old rules) refuse; gate it on the lead. (5) `useDistrictLibraryForTeacher` opens its listeners once per Quiz widget; share one. (6) CodeQL still flags the tag-stripping regexes in `scripts/mca-package/lib/html.mjs` and `parse.mjs`; replace them with a small tag scanner so the alerts close. (7) `touch-target-expand` needs a positioned element (its `::after` is `width/height: 100%`); on an unpositioned button the hit area grows to the nearest positioned ancestor, which made every District library row open the last row's delete. Twelve older sites still lack `relative` (grep `touch-target-expand` without `relative|absolute|fixed|sticky`); check each and add a static test.

- **AB-204 District library folders: safer folder writes** (S, from release #5678 review; live for everyone since the flag retired). In `hooks/useDistrictLibraryFolders.ts`: (1) `applyFolderAudiences` stops at the first failed item; keep going and report the failures, and use `itemsNeedingFolderAudience` (`utils/districtLibraryFolders.ts`, tests only today) to show a "some items need the folder's audience" repair banner in `DistrictLibraryFolderView`. (2) `renameDistrictFolder`/`moveDistrictFolder` merge-write `folders[id]`, so a folder another admin just deleted comes back without a name; check it still exists in a transaction. (3) `deleteDistrictFolder` writes the folders and audiences docs separately; use one batch. (4) Moving a published item into a folder with no audience now hides it from teachers; ask first. (5) `DistrictLibraryPanel` publishes then moves in one try, so a failed move leaves items at the top level and a retry never files them.
- **AB-205 Prompt formatting leftovers** (S, from release #5678 review). Paper answer sheet labels use raw `question.text` (`utils/paperSheetPlan.ts`, `functions/src/paperBatchPlan.ts`), so marks show; use `stripPromptFormat`/`plainPromptText`. Numbered lines renumber when edited (`5. a` / `3. b` saves as 5, 6); keep the typed numbers. A literal `*word*` typed in the editor only turns italic after reload.
- **AB-270 Paper fill-in-the-blank: leftovers** (S-M, release 2026.11.17c #6107 review). (1) `utils/paperSheetReprint.ts` and `PaperReprintModal.tsx` build `writtenTexts` without `letteredBlanks`, so a reprinted multi-blank stem lacks "___ (a)". (2) `functions/src/paperWrittenCallables.ts` `handleUpdatePaperTranscript` writes `answer: html` and `paperTranscript: 'done'`; on a FIB box it must store blanks (`blankAnswerFromTranscript`) or be hidden for FIB. (4) `TRANSCRIBE_PROMPT` says to separate paragraphs with a blank line; say FIB boxes get one answer per line with `[empty]` for an unwritten line and no spacer lines. (5) `monitor/QuestionResults.tsx` answer distribution calls `gradeAnswer` without `paperTranscript`, so an unread paper FIB shows as a wrong empty answer. (6) "Use new scan" keeps the old scan's mark on a FIB box; decide whether to clear it like a fresh box. Done when each is fixed with a test.
- **AB-271 Rubric table edit: leftovers before the flag opens** (S-M, release 2026.11.17c #6107 review; `rubric-grading-v2` only). (1) A grader edit changes `question.points` and the quiz file but not the assignment answer key or the PLC key the server scores against (`plcAssessmentMath.ts` clamps to the key's points); refresh those keys on save or block point changes on assigned or PLC quizzes. (2) When the library write fails after the quiz saves, `saveRubricAndRescore` skips rescoring. (3) `applyRubricEdit` takes `before` from the first matching snapshot, which can be a modified copy with renamed criteria, so `sameRubricContent` wrongly reports the library as newer. (4) Legacy questions whose main and modified totals already differ can't be edited at all. (6) The grader table's Levels / Scoring guide switch (release 2026.11.19) can cap rows at 5 and lower the total the same way as (1). (5) Panel minors: a typed score matching no level saves `levelId: ''`; tapping the level a fractional score sits on clears it; clearing a points field in the table saves 0; `openCriteriaMemory` never clears. Done when each is fixed or answered with a test.
- **AB-272 Quiz assign Supports file sources: minors** (S, release 2026.11.17c review; `modification-groups` only). (1) `Assets/QuizSupports` is not in `DRIVE_UPLOAD_FOLDERS` (`hooks/useStorage.ts`), as `.claude/rules/storage-uploads.md` asks. (2) `SupportsEditor.tsx` `uploadFiles` silently drops files past `MAX_SUPPORTS`, and a partial failure closes the form and loses the error. (3) `FileAddSources.tsx` `UrlAddRow` clears the pasted link even when the add failed. Done with a test per fix.
- **AB-112 Delete merged branches (local agent)** (S, recurring). Branch deletes are a local agent job, not Paul's; cloud sessions can't delete branches. From a local checkout, list remote branches with no open PR whose work is merged or abandoned (never `main`, `dev-*` or `scheduled-tasks`), then `git push origin --delete` them. Threads that merge a PR add their branch to the list below by PR instead of to PAUL_TODO.md. Done when the list is empty; keep the item for future adds.

  <details><summary>Branches to delete (190, checked 2026-11-01)</summary>

claude/project-thread-fa7cvi (#6317, then this docs PR; delete after it merges)
claude/project-thread-1pw1yd (#6316, then this docs PR; delete after it merges)
claude/project-thread-14bvaw (#6302, then this docs PR; delete after it merges)
claude/project-thread-tx2kko (#6309)
claude/project-thread-tx2kko-ab112 (this docs PR; delete after it merges)
claude/release-fix-2026-11-19c (#6298)
claude/release-2026-11-19c-followups (this docs PR, delete after it merges)
claude/project-thread-w12g03 (release #6292 branch, delete after it merges)
claude/project-thread-tcgprd (#6282)
claude/project-thread-tcgprd-ab112 (this docs PR, delete after it merges)
claude/project-thread-xutx1d (#6281)
claude/project-thread-xutx1d-branches (this docs PR, delete after it merges)
nightly/build-2026-11-19 (#6264)
nightly/dashboard-2026-11-19 (#6263)
nightly/widgets-2026-11-19 (#6262)
nightly/debugger-log-2026-11-19 (#6265)
claude/kind-johnson-64jqqf (#6258)
claude/elegant-hypatia-siakst (#6266)
claude/project-thread-frh6q9 (#6275; this docs PR reuses it, delete after it merges)
claude/project-thread-avawwc (this docs PR, delete after it merges)
claude/project-thread-ygx718 (#6174)
claude/ab112-ygx718 (#6175, closed; folded into this PR)
claude/project-thread-ucv837 (#6165)
claude/ab112-quick-sign-in (#6170, closed; folded into this PR)
claude/project-thread-6v7ytk (#6243)
claude/project-thread-vyicgs (#6267; this docs PR reuses it, delete after it merges)
claude/project-thread-6v7ytk-kinds (class left open flag for every kind; delete after it merges)
claude/project-thread-2xxi1c (Video Activity background turn-in PR; delete after it merges)
claude/project-thread-kejiop (#6236; this docs PR reuses it, delete after it merges)
claude/project-thread-30h9gb (Video Activity Assigned tab PR; delete after it merges)
claude/project-thread-xomk7l (Flashcards and Writing Assigned tabs; delete after its PR merges)
claude/project-thread-6nd30t (Mini Apps and Guided Learning Assigned tabs; delete after it merges)
claude/assigned-tab-pr0 (#6216)
claude/assigned-tab-reopen-turnin (#6225)
claude/assigned-tab-quiz-window (#6233)
claude/project-thread-5uuvdq (this docs PR, delete after it merges)
claude/project-thread-j4paf2 (#6227; this docs PR reuses it, delete after it merges)
claude/project-thread-7u8ra6 (#6226; this docs PR reuses it, delete after it merges)
claude/project-thread-ce51ew (#6222; this docs PR reuses it, delete after it merges)
claude/project-thread-4zd7sk (#6214, #6220; this docs PR reuses it, delete after it merges)
claude/project-thread-nrzbl4 (#6217; this docs PR reuses it, delete after it merges)
claude/project-thread-7dhc7a (#6215; this docs PR reuses it, delete after it merges)
claude/project-thread-r8x8gv (#6213)
claude/project-thread-r8x8gv-ab112 (this docs PR, delete after it merges)
claude/project-thread-vyyos0 (#6202; this docs PR reuses it, delete after it merges)
claude/project-thread-yyrdz8 (#6198; this docs PR reuses it, delete after it merges)
claude/project-thread-h3n64u (#6194; this docs PR reuses it, delete after it merges)
claude/project-thread-ygwr09 (#6187; this docs PR reuses it, delete after it merges)
security/q-drive-grants (#6151)
security/o-ai-quota-and-sweeps (#6153)
security/r-projects-assignments (#6152)
security/i-synced-boards (#6154)
claude/project-thread-tmtq9h (this docs PR, delete after it merges)
claude/project-thread-czge1w (#6168; this docs PR reuses it, delete after it merges)
claude/project-thread-huw2kb (#6176)
claude/ab112-course-menu (this docs PR, delete after it merges)
claude/project-thread-imr8je (#6163; this docs PR reuses it, delete after it merges)
hotfix/view-as-edit-mode (#6166)
claude/project-thread-hm2dnv (#6162, then its AB-112 docs PR and the rubric modal follow-up PR; delete after all merge)
claude/project-thread-ndf6am (#6245, #6247, #6249 and its release follow-ups docs PR; delete after all merge)
claude/project-thread-vgif9w (#6179, #6182, #6186, #6188, #6191 and its AB-112 docs PR; delete after all merge)
claude/project-thread-ivlo9j (#6158; this docs PR reuses it, delete after it merges)
claude/project-thread-s4hzrk (#6159)
claude/project-thread-8q5g3q (#6180)
claude/project-thread-8q5g3q-docs (this docs PR, delete after it merges)
claude/ab112-s4hzrk (this docs PR, delete after it merges)
claude/project-thread-rnvyvu (#6149)
claude/project-thread-rnvyvu-ab112 (this docs PR, delete after it merges)
claude/project-thread-eibt0b (#6230)
claude/project-thread-eibt0b-ab112 (this docs PR, delete after it merges)
claude/project-thread-o5lwcn (Assignments hub Assigned list PR; delete after it merges)

claude/project-thread-qd0xi5 (#6301; this docs PR reuses it, delete after it merges)
claude/project-thread-dsduhb (#6279; this docs PR reuses it, delete after it merges)
claude/project-thread-2jo0s2 (#6137, #6139; this docs PR reuses it, delete after it merges)
claude/kind-johnson-owvr5o (#6134)
claude/project-thread-yv7q1n-ab112 (#6090)
claude/project-thread-yv7q1n (#6089)
claude/project-thread-yv7q1n-ab112 (this docs PR, delete after it merges)
claude/project-thread-qg4og2 (#6120; this docs PR reuses it, delete after it merges)
claude/project-thread-a1yb0n (#6118; this docs PR reuses it, delete after it merges)
claude/project-thread-or5rdv (#6123; this docs PR reuses it, delete after it merges)
claude/project-thread-19tx5f (#6114; this docs PR reuses it, delete after it merges)
claude/project-thread-39lo68 (#6112; this docs PR reuses it, delete after it merges)
claude/project-thread-sb4d62 (#6113)
claude/project-thread-sb4d62-ab112 (this docs PR, delete after it merges)
claude/project-thread-64s1aj (#6108, #6109; this docs PR reuses it, delete after it merges)
claude/project-thread-73vdhy (#6103; this docs PR reuses it, delete after it merges)
claude/project-thread-girgp2 (#6092; this docs PR reuses it, delete after it merges)
claude/project-thread-purooz (#6102; this docs PR reuses it, delete after it merges)
claude/project-thread-qhanha (#6093; this docs PR reuses it, delete after it merges)
claude/project-thread-dln4ez (#6074)
claude/project-thread-dln4ez-branches (this docs PR, delete after it merges)
claude/project-thread-h6p64t (#6069; this docs PR reuses it, delete after it merges)
claude/project-thread-0rybcr (#6066, #6071, #6086)
claude/project-thread-l1bz26 (#6084; this docs PR reuses it, delete after it merges)
claude/project-thread-dtdhr9 (#6065)
claude/project-thread-dtdhr9-ab112 (this docs PR, delete after it merges)
claude/project-thread-zjwcsx (#6063)
claude/project-thread-zjwcsx-ab112 (this docs PR, delete after it merges)
claude/project-thread-by0g86 (#6029; this docs PR reuses it, delete after it merges)
claude/project-thread-n40jeu (#6021; this docs PR reuses it, delete after it merges)
claude/project-thread-jve72x (#6028)
claude/project-thread-jve72x-ab112 (this docs PR, delete after it merges)
claude/project-thread-3yxmqk (#5999)
claude/project-thread-3yxmqk-ab112 (this docs PR, delete after it merges)
claude/project-thread-tr6djp (#6027; this docs PR reuses it, delete after it merges)
claude/project-thread-wtri81 (#6004)
claude/project-thread-wtri81-ab112 (this docs PR, delete after it merges)
claude/project-thread-sbdtgq (#5997, #6008)
claude/project-thread-sbdtgq-modq (#6012)
claude/project-thread-sbdtgq-rubric (#6034)
claude/project-thread-sbdtgq-ab112b (this docs PR, delete after it merges)
claude/project-thread-sbdtgq-ab112 (this docs PR, delete after it merges)
claude/project-thread-sbdtgq-docs (this docs PR, delete after it merges)
claude/project-thread-cjb0tf (#6006)
claude/project-thread-hhep89 (#6002; this docs PR reuses it, delete after it merges)
claude/project-thread-xa0n5v (#5996; this docs PR reuses it, delete after it merges)
claude/project-thread-2iitho (#5988, #5993, #5994; this docs PR reuses it, delete after it merges)
claude/project-thread-9d5cnu (#5987)
claude/ab112-editor-title (this docs PR, delete after it merges)
claude/project-thread-3a9r1i (#5984)
claude/ab112-music-rows (this docs PR, delete after it merges)
claude/project-thread-p6ivx7 (#5983; this docs PR reuses it, delete after it merges)
claude/project-thread-a5eqoq (#5976)
claude/ab112-a5eqoq (this docs PR, delete after it merges)
claude/project-thread-636nhw (#5977)
claude/ab112-636nhw (this docs PR, delete after it merges)
claude/project-thread-g6k4z7-points (#5964)
claude/project-thread-bmzlu7 (#6037, then the release 2026.11.17 follow-ups docs PR; delete after it merges)
hotfix/quiz-points-score (#5965)
claude/project-thread-9o434u (#5967)
claude/project-thread-9o434u-ab112 (this docs PR, delete after it merges)
claude/project-thread-lm2xra (#5971)
claude/ab112-lm2xra (this docs PR, delete after it merges)
claude/project-thread-g6k4z7-docs (#5957)
claude/project-thread-g6k4z7-docs2 (this docs PR, delete after it merges)
nightly/debugger-log-2026-11-16 (#5939)
nightly/build-2026-11-16 (#5938)
nightly/admin-2026-11-16 (#5937)
nightly/dashboard-2026-11-16 (#5936)
nightly/widgets-2026-11-16 (#5935)
nightly/unifier-log-2026-11-16 (#5934)
claude/spartboard-feature-gaps-ki7ih8 (#5924)
feat/schedule-block-warnings (#5955)
claude/project-thread-gq0s35 (PR sweep 2026-11-16 docs PR, delete after it merges)
claude/project-thread-p545yl (#6303 and its AB-112 docs PR; delete after both merge)
claude/project-thread-tnwgwz (#5956)
claude/project-thread-tnwgwz-ab112 (this docs PR, delete after it merges)
claude/project-thread-djnott (#5949; this docs PR reuses it, delete after it merges)
claude/project-thread-1vmhxb (#5951)
claude/project-thread-1vmhxb-ab112 (this docs PR, delete after it merges)
claude/project-thread-lqy8qu (#5952)
claude/project-thread-lqy8qu-ab112 (this docs PR, delete after it merges)
claude/project-thread-g6k4z7 (#5953)
hotfix/choose-n-extra-score (#5954)
claude/project-thread-g6k4z7-docs (this docs PR, delete after it merges)
claude/project-thread-f3gyyo (#5947)
claude/ab112-5947 (this docs PR, delete after it merges)
claude/project-thread-ljeqkl (#5946)
claude/ab112-5946 (this docs PR, delete after it merges)
claude/project-thread-p785kx (#5944)
claude/ab112-p785kx (this docs PR, delete after it merges)
claude/project-thread-0xkq44 (#5962)
claude/ab112-rubric-refresh (this docs PR, delete after it merges)
claude/project-thread-ssbmlj (#5941)
claude/project-thread-ssbmlj-ab112 (this docs PR, delete after it merges)
claude/project-thread-7t008a (#5940, then its AB-112 docs PR; delete after both merge)
claude/project-thread-217zkz (#5969; this docs PR reuses it, delete after it merges)
claude/project-thread-dhavkf (#5913)
claude/project-thread-crhnsd (#5972)
claude/project-thread-crhnsd-ab112 (this docs PR, delete after it merges)
claude/backlog-ab-107-20261115 (#5925)
claude/backlog-ab-95-20261115 (#5926)
claude/backlog-ab-167-20261115 (#5927)
claude/project-thread-auew6q (#6007, #6015, then its AB-112 docs PR; delete after it merges)
claude/backlog-ab-220-20261115 (#5928)
claude/backlog-ab-169-20261115 (#5929)
claude/backlog-ab-216-20261115 (#5930)
claude/backlog-ab-245-20261116 (#6017)
claude/backlog-ab-247-20261116 (#6018)
claude/backlog-ab-222-20261116 (#6020)
claude/backlog-ab-246-20261116 (#6019)
claude/backlog-ab-158-20261116 (#6023)
claude/backlog-ab-218-20261116 (#6024)
claude/backlog-ab-238-20261116 (#6025)
claude/project-thread-94bvar (#6070)
claude/project-thread-94bvar-docs (this docs PR, delete after it merges)
claude/backlog-ab-3-20261116 (#6026)
claude/backlog-closeout-20261116 (this docs PR, delete after it merges)
claude/backlog-ab-173-20261117 (#6125)
claude/backlog-ab-214-20261117 (#6126)
claude/backlog-ab-218-20261117 (#6127)
claude/project-thread-71uopu (release heads #6148 and #6155, then its follow-ups docs PR; delete after it merges)
claude/backlog-ab-64-20261117 (#6128)
claude/backlog-ab-60-20261117 (#6129)
claude/backlog-ab-11-20261117 (#6131)
claude/backlog-ab-12-20261117 (#6132)
claude/backlog-ab-65-20261117 (#6133)
claude/backlog-closeout-20261117 (this docs PR, delete after it merges)
claude/backlog-ab-97-20261118 (#6252)
claude/backlog-ab-7-20261118 (#6255)
claude/backlog-ab-66-20261118 (#6253)
claude/backlog-ab-276-20261118 (#6257)
claude/backlog-ab-284-20261118 (#6256)
claude/backlog-ab-61-20261118 (#6251, closed unmerged)
claude/backlog-closeout-20261118 (this docs PR, delete after it merges)
claude/project-thread-94bvar-ab264 (merged; held back during the 2026.11.17b release)
claude/backlog-ab-210-20261115 (#5931)
claude/backlog-ab-240-20261115 (#5932)
claude/backlog-closeout-20261115 (this docs PR, delete after it merges)
claude/project-thread-rkoilv (#5919)
claude/project-thread-jebqdl (#5921, #5922, release 2026.11.15b follow-ups)
claude/project-thread-r2540g (#5917; this docs PR reuses it, delete after it merges)
security/k2-scheduled-mailers (#5884)
security/m-classlink-student-identity (#5887)
security/p-paper-import (#5888)
claude/project-thread-qt0byr (#5980, #5982, #5986; this docs PR reuses it, delete after it merges)
claude/project-thread-mi0c67 (#6068; this docs PR reuses it, delete after it merges)
claude/project-thread-3ozyvl (#6072; this docs PR reuses it, delete after it merges)
security/h2-calendar-and-seed (#5889)
nightly/widgets-2026-11-15 (#5878)
nightly/layout-2026-11-15 (#5879)
nightly/state-2026-11-15 (#5880)
nightly/admin-2026-11-15 (#5881)
nightly/build-2026-11-15 (#5882)
nightly/debugger-log-2026-11-15 (#5883)
nightly/unifier-log-2026-11-15 (#5858)
claude/funny-wozniak-ch4xxx (#5908)
claude/project-thread-984ja9 (this docs PR, delete after it merges)
claude/project-thread-pabnrl (#5870)
claude/ab112-pabnrl (this docs PR, delete after it merges)
claude/project-thread-eyxxw7 (#5907; this docs PR reuses it, delete after it merges)
claude/project-thread-ri9uou (#5905)
claude/project-thread-ri9uou-ab112 (this docs PR, delete after it merges)
security/d1-followup
security/d2-quiz-response-integrity
security/g-gradebook-integrity
security/h1-quiz-share-import
security/f-video-activity
security/h2-board-share-content
release-fix/gate-pickers-class-list
release-fix/gate-paused-turn-in
release-fix/gate-revisit-autosave
release-fix/legacy-bank-slots
docs/release-2026-11-15-followups (this docs PR, delete after it merges)
claude/project-thread-606z5x (#5896)
claude/project-thread-606z5x-ab112 (this docs PR, delete after it merges)
claude/widget-loop-schedule-config-2026-11-15 (#5914)
claude/widget-loop-schedule-config-2026-11-15-ab112 (this docs PR, delete after it merges)
claude/project-thread-wv3l34 (#5906; this docs PR reuses it, delete after it merges)
claude/project-thread-tmq3fo (#5890)
hotfix/lunch-count-classic-layout (#5893)
hotfix/lunch-count-classic-layout-to-dev (#5894)
claude/ab112-lunch-count-branches (this docs PR, delete after it merges)
claude/project-thread-x7mvut (#5885)
claude/project-thread-x7mvut-ab112 (this docs PR, delete after it merges)
claude/project-thread-29pa8f (#5868)
claude/project-thread-29pa8f-ab112 (this docs PR, delete after it merges)
claude/project-thread-vubbhb (#5867)
claude/ab112-toolbar-overlays (this docs PR, delete after it merges)
claude/project-thread-1h4b12 (#5865)
claude/ab112-board-menu (this docs PR, delete after it merges)
claude/project-thread-sqz8of (#5863)
claude/project-thread-sqz8of-shot (#5871)
claude/ab112-sqz8of-2 (this docs PR, delete after it merges)
claude/ab112-sqz8of (this docs PR, delete after it merges)
claude/project-thread-731sur (#5861; this docs PR reuses it, delete after it merges)
claude/project-thread-24fjg3 (#5839, #5842, #5853; this docs PR reuses it, delete after it merges)
claude/project-thread-qdrzhx (#5851; this docs PR reuses it, delete after it merges)
claude/project-thread-bbbtfd (#5843; this docs PR reuses it, delete after it merges)
claude/release-fix-ab217
claude/release-fix-5797-split
security/a2-deactivation-followup
claude/project-thread-wo37x1
claude/project-thread-5klgdt (#5841; this docs PR reuses it, delete after it merges)
claude/project-thread-egwso2
claude/project-thread-8jx25m
claude/ab112-dok-branch
(OPS-PIvers/claude-skills) spartboard-dok
claude/project-thread-fgyb5l
claude/project-thread-fgyb5l-docs
claude/project-thread-5ghkl1
claude/project-thread-5ghkl1-backlog

claude/project-thread-k84rxm
claude/project-thread-ixrgdq
claude/project-thread-stpelc
claude/ab112-ixrgdq
claude/project-thread-gskozr
claude/project-thread-6kzik6
claude/project-thread-vki4cy
claude/project-thread-bnuqvd
claude/ab112-bnuqvd
claude/project-thread-k4clwq
claude/project-thread-tm5pfn
claude/project-thread-j4q0iv
claude/project-thread-9hkbs1
claude/project-thread-dff8t3
claude/project-thread-a1em3y
claude/ab112-crossout-preview
retire/spell-check-setting
retire/video-activity
retire/lunch-count
retire/tours
retire/quiz-editor
retire/quiz-assigning
retire/quiz-results
retire/nov18-flags
retire/nov19-flags
claude/ab112-nov18
claude/ab112-nov19 (this docs PR)
claude/project-thread-mclg4c (also claude/ab112-nov18, this docs PR)
claude/claude-security-fix-find_01hdwd6jykvej5w2jqqm7yvi-3zioml
nightly/widgets-2026-11-13
nightly/dashboard-2026-11-13
nightly/admin-2026-11-13
nightly/build-2026-11-13
nightly/debugger-log-2026-11-13
nightly/unifier-log-2026-11-13
claude/tour-anchors-2026-11-13
claude/project-thread-7cvy7s
claude/project-thread-csyhd9
claude/project-thread-lvqzbz
claude/project-thread-lvqzbz-docs
claude/project-thread-qom41c
docs/ab112-qom41c
claude/project-thread-87riou
claude/project-thread-iv86b0
claude/ab112-wildcard
claude/project-thread-2n195f
claude/project-thread-2n195f-branches
claude/project-thread-7mpti9
claude/project-thread-7mpti9-ab112
claude/project-thread-pxr7js
claude/ab112-pxr7js
claude/project-thread-vcq9je
docs/ab112-s2-branch
claude/project-thread-7matnt
claude/ab112-s1-7matnt
claude/project-thread-fab08e
docs/ab112-fab08e
claude/project-thread-p5qz9y
docs/ab112-p5qz9y
claude/project-thread-g77dp4
claude/project-thread-g77dp4-ab112
claude/project-thread-24dy3v
claude/project-thread-24dy3v-ab112
claude/project-thread-cxubid
docs/ab112-cxubid
claude/project-thread-dmb90p
claude/ab112-prompt-formatting
claude/project-thread-kwulpx

claude/project-thread-oakw56
claude/project-thread-oakw56-ab112
claude/project-thread-jrytph
claude/ab112-grader-copy
claude/tour-anchors-2026-11-12
nightly/debugger-log-2026-11-12
nightly/admin-config-2026-11-12
nightly/dashboard-layout-2026-11-12
nightly/widgets-2026-11-12
nightly/unifier-log-2026-11-12
claude/project-thread-ov98y6
claude/project-thread-ov98y6-branchlog
claude/project-thread-bd1fel
claude/project-thread-bd1fel-ab112
claude/project-thread-l8b36b
claude/project-thread-shwk3a
claude/project-thread-anub7c
claude/project-thread-ae8ce7
claude/project-thread-r8cbhe
claude/ab112-district-folders
claude/project-thread-9krwwi
claude/project-thread-848bcg
docs/va-editor-arrows-followups
docs/release-2026-11-11c-followups
claude/project-thread-vplbva
nightly/admin-calendar-followup-2026-11-11
claude/project-thread-c0512w
nightly/widgets-2026-11-11
nightly/dashboard-2026-11-11
nightly/state-2026-11-11
nightly/admin-2026-11-11
nightly/debugger-log-2026-11-11
claude/tour-anchors-2026-11-11
claude/project-thread-ylaw63
claude/project-thread-tc5drw
claude/project-thread-tc5drw-docs
claude/project-thread-uhhzb5
claude/project-thread-uhhzb5-docs
claude/project-thread-tu7i6d
claude/project-thread-zsvnns
claude/project-thread-zsvnns-ab112
claude/project-thread-59pkq4
claude/ab112-grammarly
claude/project-thread-dmpjbw
feat/quiz-live-view
claude/project-thread-ucbftr
claude/project-thread-ldt8ev
claude/project-thread-4b5o66 (#6056)
claude/project-thread-4b5o66-connections (#6057)
claude/project-thread-4b5o66-ab112 (this docs PR, delete after it merges)
claude/project-thread-4b5o66-retire-connections (#6058)
claude/project-thread-69hrdw (#6052, #6054; this docs PR reuses it, delete after it merges)
nightly/widgets-2026-11-17 (#6042)
nightly/state-2026-11-17 (#6043)
nightly/admin-2026-11-17 (#6044)
nightly/build-2026-11-17 (#6045)
nightly/debugger-log-2026-11-17 (#6046)
nightly/widgets-2026-11-18 (#6142)
nightly/admin-2026-11-18 (#6143)
nightly/debugger-log-2026-11-18 (#6144)
claude/project-thread-9vkksw (this docs PR, delete after it merges)
claude/funny-wozniak-97qwkg (#6051)
claude/project-thread-1glhgi (#6055)
claude/project-thread-1glhgi-docs (this docs PR, delete after it merges)
claude/project-thread-1h9zd9 (#6075, then its AB-112 docs PR; delete after it merges)
claude/project-thread-h6xnku (#6088)
claude/project-thread-h6xnku-docs (this docs PR, delete after it merges)
claude/project-thread-gn0o0p (#6119)
claude/d4-ab112 (this docs PR, delete after it merges)
claude/project-thread-skf281 (#6121, then this docs PR; delete after it merges)
claude/project-thread-whigxe (#6229)
claude/project-thread-whigxe-ab112 (this docs PR, delete after it merges)
claude/release-fix-2026-11-19b (#6274)
claude/project-thread-o4g11s (release #6272 branch; this docs PR reuses it, delete after it merges)

```
git push origin --delete claude/project-thread-1ylvse
git push origin --delete claude/project-thread-l8wz1a claude/project-thread-l8wz1a-ab112
git push origin --delete claude/release-fix-picture-letters claude/release-fix-nocookie-server claude/release-2026-11-10b-followups
git push origin --delete claude/project-thread-c3fx5h claude/project-thread-mruy1c claude/project-thread-48v8wd scheduled-tasks-gemini-deprecation-cleanup claude/nice-dirac-ksppnp claude/tour-anchors-2026-11-07-sweep claude/project-thread-ca8zv7 claude/project-thread-lngvlt claude/project-thread-r320lj claude/project-thread-pnunet claude/project-thread-cb9nc7 claude/project-thread-boe8ze claude/project-thread-w6l3di claude/project-thread-vv2cnp claude/project-thread-mxii4a claude/project-thread-ganvgg claude/project-thread-rhq1kq claude/project-thread-fq4jfv retire/scoreboard-pro retire/docs-2026-11 claude/project-thread-urz37g-03 claude/project-thread-yevw4z claude/project-thread-i30zmn claude/project-thread-2vbvx9 claude/project-thread-7wasr8 claude/project-thread-ngv06o claude/project-thread-554wo9 claude/project-thread-v208np claude/project-thread-6lfohm claude/project-thread-mla3yw claude/admins-mirror-operator-org claude/claude-security-fix-find_01l5gzfb3kmiuxgdvt3dkfzc-kfp12t claude/confident-turing-n9n9zw claude/ecstatic-galileo-059p5k claude/funny-wozniak-l3l0ob claude/funny-wozniak-xu7lql claude/nice-dirac-wzcd2c claude/pensive-hawking-tx4n0g claude/project-thread-0ffxig claude/project-thread-0kfjsw claude/project-thread-0ko1jo claude/project-thread-0mexu0 claude/project-thread-10c5rm claude/project-thread-4dc2id claude/project-thread-5n14b0 claude/project-thread-5nb5c2 claude/project-thread-7vicjo claude/project-thread-8as6lb claude/project-thread-8dkw7u claude/project-thread-9261pf claude/project-thread-9eufc4 claude/project-thread-aiv7sx claude/project-thread-d4oe70 claude/project-thread-daycqw claude/project-thread-ema7wl claude/project-thread-goitjt claude/project-thread-grj64o claude/project-thread-i9dr5c claude/project-thread-igrvjl claude/project-thread-j0zhdm claude/project-thread-jlm0kg claude/project-thread-jyktga claude/project-thread-kl8m3h claude/project-thread-ks4v2t claude/project-thread-mpadky claude/project-thread-n55fq0 claude/project-thread-o1p8ua claude/project-thread-o7hhba claude/project-thread-okj17f claude/project-thread-sqh365 claude/project-thread-swlvaf claude/project-thread-uk231h claude/project-thread-xdu47b claude/security-finding-fix-98pxew claude/security-finding-fix-9wfcsz claude/security-finding-fix-bcpho1 claude/security-finding-fix-dmat2f claude/security-finding-fix-e89c60 claude/security-finding-fix-fg2bln claude/security-finding-fix-h9ns0z claude/security-finding-fix-j4hao6 claude/security-finding-fix-jivb57 claude/security-finding-fix-kmhhxm claude/security-finding-fix-pdgda8 claude/security-finding-fix-vmiv6u claude/security-finding-fix-w0inx2 claude/security-finding-fix-zinmq4 claude/sleepy-newton-cinxi2 claude/tour-anchors-2026-10-23 claude/tour-anchors-2026-10-24 claude/tour-anchors-2026-10-25 claude/tour-anchors-2026-10-26 claude/tour-anchors-2026-10-27 claude/tour-anchors-2026-10-29 claude/widget-loop-2026-10-29 claude/widget-loop-countdown-layout-2026-10-27 claude/widget-loop-numberLine-layout-2026-10-27 claude/wonderful-meitner-mb0agw dep/anthropic-sdk-1 dep/lucide-react-1 nightly/admin-2026-10-24 nightly/admin-2026-10-25 nightly/admin-2026-10-26 nightly/admin-2026-10-27 nightly/admin-2026-10-29 nightly/admin-config-2026-10-23 nightly/build-2026-10-24 nightly/build-2026-10-25 nightly/build-2026-10-27 nightly/dashboard-2026-10-24 nightly/dashboard-2026-10-25 nightly/dashboard-2026-10-27 nightly/dashboard-2026-10-29 nightly/dashboard-layout-2026-10-23 nightly/debugger-log-2026-10-23 nightly/debugger-log-2026-10-24 nightly/debugger-log-2026-10-25 nightly/debugger-log-2026-10-26 nightly/debugger-log-2026-10-27 nightly/debugger-log-2026-10-29 nightly/debugger-log-fix-2026-10-25 nightly/layout-2026-10-26 nightly/state-2026-10-25 nightly/state-2026-10-26 nightly/state-2026-10-27 nightly/state-2026-10-29 nightly/state-data-2026-10-23 nightly/tooling-2026-10-26 nightly/unifier-log-2026-10-24 nightly/unifier-log-2026-10-25 nightly/unifier-log-2026-10-26 nightly/unifier-log-2026-10-27 nightly/unifier-log-2026-10-29 nightly/widgets-2026-10-23 nightly/widgets-2026-10-24 nightly/widgets-2026-10-25 nightly/widgets-2026-10-26 nightly/widgets-2026-10-29 scheduled-tasks-css-notebook-assets schoology-grade-import-plan claude/project-thread-9tu6tt claude/project-thread-6msuzy claude/project-thread-yfxrmy claude/project-thread-10ypyl claude/project-thread-krrxbp claude/project-thread-n622ql claude/tour-anchors-2026-10-30 nightly/debugger-log-2026-10-30 nightly/build-2026-10-30 nightly/admin-2026-10-30 nightly/dashboard-2026-10-30 nightly/widgets-2026-10-30 claude/widget-loop-2026-10-30 claude/kind-johnson-vzcxrw claude/project-thread-mpfi8k claude/project-thread-lasbmm claude/project-thread-2ufyfk claude/project-thread-5ljkgp claude/project-thread-789sli claude/project-thread-thkss3 claude/project-thread-vmae6b claude/project-thread-xmkd3q claude/project-thread-80vrse claude/project-thread-5t0ylg claude/project-thread-6czdqi claude/project-thread-nt6gm7 firebase-admin-14 tailwind-4 root-firebase-admin-14 claude/project-thread-uyjtsd claude/kind-johnson-5ivvtv scheduled-tasks-embed-zoom-padding claude/tour-anchors-2026-10-31 claude/project-thread-kqdif2 scheduled-tasks-css-2026-11-01 claude/tour-anchors-2026-11-01 nightly/unifier-log-2026-11-01 claude/nice-dirac-uylhsp claude/project-thread-yj3ccm claude/project-thread-sstqri claude/project-thread-1aqukr claude/project-thread-sollff claude/project-thread-xoutxq claude/project-thread-ce3fea claude/project-thread-1dz6w8 claude/tour-anchors-2026-11-02 nightly/widgets-2026-11-02 nightly/dashboard-2026-11-02 nightly/state-2026-11-02 nightly/admin-2026-11-02 nightly/unifier-log-2026-11-02 nightly/debugger-log-2026-11-02 claude/project-thread-44p1ek claude/project-thread-x5bqul claude/project-thread-j2hpy2 claude/project-thread-aodreu claude/project-thread-5svaji claude/project-thread-agp9p4 claude/project-thread-3hz5v1 claude/project-thread-0l73e9 claude/project-thread-pmnbxh claude/project-thread-gn5tvy claude/project-thread-b75ymp claude/project-thread-6w9q9d claude/project-thread-gd7az0 claude/project-thread-ejz1ne nightly/debugger-log-2026-11-03 nightly/unifier-log-2026-11-03 nightly/build-tooling-2026-11-03 nightly/widgets-2026-11-03 nightly/dashboard-layout-2026-11-03 nightly/unify-d2-brand-colors-2026-11-03 claude/tour-anchors-2026-11-03 pt-113-done claude/project-thread-6f1wa1 claude/project-thread-27vmnk claude/review-scoreboard-anchors claude/project-thread-urz37g claude/project-thread-rjsnda claude/project-thread-9mmobo claude/project-thread-kd8151 claude/tour-anchors-2026-11-04 nightly/unifier-log-2026-11-04 claude/connector-cimd claude/connector-managed-auth claude/project-thread-f95fsa claude/project-thread-dmqiz2 claude/project-thread-2fbcke claude/project-thread-1fon8u claude/project-thread-ldwhmz claude/project-thread-kb1k0x claude/project-thread-kaaeg2 claude/project-thread-i0bqme claude/project-thread-msui79 schoology-auto-link claude/project-thread-nhhfjn claude/claude-security-fix-find_01gbhkubqv72v914ulemjvmf-j5merg fix/ai-import-matching-sets claude/project-thread-ozghf6 claude/project-thread-pzcwwp-3a claude/project-thread-pzcwwp-3b claude/project-thread-pzcwwp-3c claude/project-thread-pzcwwp-3d claude/project-thread-pzcwwp-3e claude/project-thread-pzcwwp-3f claude/project-thread-pzcwwp-3g claude/project-thread-pzcwwp-3h claude/project-thread-pzcwwp-docs claude/project-thread-pzcwwp-rf-3e claude/project-thread-pzcwwp-rf-3f claude/project-thread-pzcwwp-rf-3f2 claude/project-thread-pzcwwp-docs2 claude/tour-anchors-2026-11-05 scheduled-fix-lint-heap-2026-11-05-pr nightly/debugger-log-2026-11-05 nightly/state-2026-11-05 nightly/admin-2026-11-05 nightly/widgets-2026-11-05 nightly/unifier-log-2026-11-05 claude/project-thread-cqsw9c claude/project-thread-suj6jw claude/project-thread-hz7w5v claude/project-thread-3kk2xz docs/ab-112-sync-branch claude/project-thread-kyqr7m claude/project-thread-kyqr7m-ab112 claude/project-thread-fy2d77 claude/project-thread-ypezoq claude/project-thread-ypezoq-ab112 claude/project-thread-ypezoq-settings claude/project-thread-ypezoq-ab112b claude/project-thread-w42e17 claude/project-thread-dw9i41 claude/project-thread-dw9i41-ab112 claude/project-thread-au8af2 claude/project-thread-fd8iiu claude/project-thread-gc6r6j claude/project-thread-gc6r6j-docs claude/project-thread-dw9i41-plc claude/project-thread-dw9i41-plc-ui claude/project-thread-dw9i41-docs2 claude/project-thread-dak4r7 claude/project-thread-dak4r7-ab112 claude/project-thread-fg4tcw claude/project-thread-dw9i41-speak claude/project-thread-dw9i41-standards claude/project-thread-2st384 claude/project-thread-6d5vjc claude/project-thread-6d5vjc-ab112 claude/project-thread-n0qu84 claude/project-thread-n0qu84-ab112 claude/project-thread-6sweez claude/project-thread-6sweez-ab112 claude/claude-security-fix-find_01kegycu3sjwshiahnr9nzbm-d2enb8 claude/claude-security-fix-find_018fn3srsyajrvqffu33b2rg-qhj6zh claude/project-thread-wa7kt3 claude/project-thread-b7nhrw claude/project-thread-trec0n claude/project-thread-98c404 nightly/widgets-2026-11-06 nightly/dashboard-2026-11-06 nightly/state-2026-11-06 nightly/admin-2026-11-06 nightly/build-2026-11-06 nightly/debugger-log-2026-11-06 nightly/unifier-log-2026-11-06 claude/tour-anchors-2026-11-06 claude/project-thread-tonro7 claude/project-thread-817fc5 claude/project-thread-h8zjkc claude/project-thread-le53at claude/project-thread-le53at-ab112 retire/weather-gear-layout retire/schoology-auto-link retire/flashcards-assign-v2 retire/flashcards-test-nav retire/import-quiz retire/quiz-attempt-history retire/random-avoid-repeats retire/quiz-rubric-visibility retire/quiz-spell-check-toggle retire/quiz-import-suggested-targets retire/blooms-question-starters claude/project-thread-h7wt7w claude/project-thread-zsfyf1 claude/project-thread-zsfyf1-ab112 claude/project-thread-zsfyf1-students claude/project-thread-zsfyf1-ab112b claude/project-thread-xx05ww claude/project-thread-an1ysx claude/project-thread-yb5a31 claude/project-thread-pq2t86 claude/project-thread-6kcgcz claude/project-thread-le53at-names claude/project-thread-le53at-ab112b claude/project-thread-ke2h88 claude/project-thread-a754ph claude/project-thread-aa8ji9 claude/project-thread-p7czuv claude/project-thread-8k7ynb claude/project-thread-8k7ynb-ab112 claude/project-thread-om7a1h claude/project-thread-02b8tu claude/project-thread-8k7ynb-ab112b claude/project-thread-uflge1 claude/project-thread-lbur3m
git push origin --delete claude/project-thread-zl2u2x claude/project-thread-6inzrd claude/project-thread-e3p2ea
git push origin --delete claude/project-thread-1wj7jd
git push origin --delete claude/project-thread-yjiumh claude/project-thread-yjiumh-ab112
git push origin --delete claude/project-thread-wrsw83 claude/project-thread-gnqh9n
git push origin --delete claude/project-thread-3r24g5 claude/b2-ab112
git push origin --delete claude/project-thread-ispilm claude/project-thread-ta7n7b
git push origin --delete claude/project-thread-v022ec
git push origin --delete claude/project-thread-dkv28p
git push origin --delete claude/project-thread-mpuaai claude/a2-backlog
git push origin --delete claude/project-thread-4hqkck claude/kebab-backlog
git push origin --delete claude/project-thread-g7gl9c
git push origin --delete claude/project-thread-xa560h claude/project-thread-xa560h-ab112
git push origin --delete claude/project-thread-kof3cp
git push origin --delete claude/project-thread-6j0hsf
git push origin --delete claude/project-thread-42s01y claude/project-thread-42s01y-ab112
git push origin --delete claude/project-thread-fpc0bu
git push origin --delete claude/project-thread-unrkuv
git push origin --delete claude/project-thread-hj4h1e
git push origin --delete claude/project-thread-6mytcz claude/project-thread-6mytcz-ab112
git push origin --delete claude/project-thread-7j9i00 claude/project-thread-7j9i00-ab112
git push origin --delete claude/project-thread-7g5uex
git push origin --delete nightly/widgets-2026-11-08 nightly/state-2026-11-08 nightly/debugger-log-2026-11-08
git push origin --delete claude/nice-dirac-tv4ijm claude/kind-johnson-m215i6 claude/amazing-meitner-tc2h9q
git push origin --delete claude/project-thread-aimuy5
git push origin --delete claude/project-thread-e2p3nk claude/ab112-e2p3nk
git push origin --delete claude/project-thread-qn6ncf claude/project-thread-qn6ncf-docs
git push origin --delete claude/project-thread-p02dbq
git push origin --delete claude/project-thread-lr3mn3 claude/project-thread-lr3mn3-ab112
git push origin --delete release-fix/poll-vote-keys release-fix/board-item-legacy-picks release-fix/poll-copied-board-code nightly/unifier-log-2026-11-09
git push origin --delete nightly/build-2026-11-09 nightly/state-2026-11-09 nightly/admin-2026-11-09 nightly/dashboard-2026-11-09 nightly/debugger-log-2026-11-09 claude/tour-anchors-2026-11-09 nightly/widgets-2026-11-09 claude/project-thread-ay1uga
git push origin --delete claude/project-thread-d17ckk claude/project-thread-d17ckk-ab112
git push origin --delete claude/project-thread-aij942 claude/ab112-aij942
git push origin --delete claude/project-thread-a6wy60 claude/ab112-a6wy60
git push origin --delete claude/picture-choices-stem-math claude/ab112-stem-math
git push origin --delete nightly/widgets-2026-11-10 nightly/dashboard-2026-11-10 nightly/state-2026-11-10 nightly/debugger-log-2026-11-10 nightly/unifier-log-2026-11-10 claude/tour-anchors-2026-11-10
git push origin --delete claude/project-thread-227rsn
git push origin --delete claude/project-thread-9ltdwy claude/ab112-public-tour-branch
git push origin --delete claude/project-thread-0ybg2w
git push origin --delete claude/project-thread-dn23lu
git push origin --delete claude/project-thread-9ltdwy-links claude/project-thread-9ltdwy-stable claude/ab112-tour-links
git push origin --delete claude/project-thread-8c5xjf
git push origin --delete claude/project-thread-ejijbp claude/project-thread-ejijbp-docs
git push origin --delete claude/project-thread-ttggwa claude/ab112-paper-written-step3
git push origin --delete claude/project-thread-4u3dz9 claude/project-thread-4u3dz9-docs
git push origin --delete claude/project-thread-dkc08c claude/project-thread-dkc08c-docs
git push origin --delete claude/project-thread-fbyjcl claude/project-thread-fbyjcl-ab112
git push origin --delete claude/project-thread-ic5u38 claude/project-thread-ic5u38-ab112
git push origin --delete claude/project-thread-47qx31
git push origin --delete claude/project-thread-gbykry
git push origin --delete nightly/unifier-log-2026-11-11 claude/project-thread-ryu6co claude/project-thread-ryu6co-ab112
git push origin --delete claude/project-thread-jn07pu claude/project-thread-jn07pu-ab112
git push origin --delete claude/project-thread-4o47oj claude/project-thread-4o47oj-ab112
git push origin --delete claude/project-thread-05ocrk claude/s4-ab112
git push origin --delete claude/project-thread-98ewth docs/ab112-98ewth
git push origin --delete claude/project-thread-ny32f4 claude/project-thread-ny32f4-ab112
git push origin --delete release-fix/stimuli-for-everyone security/b-admin-collection-reads security/c-guided-learning security/a-org-deactivation
git push origin --delete claude/project-thread-ay3n3n security/e-quiz-answer-key-leaks security/d1-quiz-join-pins
git push origin --delete nightly/unifier-log-2026-11-14 nightly/state-data-2026-11-14 nightly/dashboard-2026-11-14 nightly/admin-config-2026-11-14 nightly/debugger-log-2026-11-14 claude/tour-anchors-2026-11-14
git push origin --delete claude/project-thread-6hlkkz claude/project-thread-6hlkkz-ab112
git push origin --delete claude/project-thread-776f0z claude/ab112-776f0z
git push origin --delete claude/project-thread-hnyuke claude/project-thread-hnyuke-ab112
git push origin --delete claude/project-thread-5qafu6
git push origin --delete claude/project-thread-sbqr9b claude/ab112-sbqr9b
```

  </details>

### Plans with a next slice

The plan holds the slices; build the **Next** one and update this line in the same PR.

- **AB-39 Quiz roster grading and reopen**: `docs/plans/QUIZ_ROSTER_GRADING_AND_REOPEN.md`, approved 2026-10-30. Slice 5 (per-student reopen) shipped as #5643 and #5874 (flag `reopen-selected-students`). Next: check slices 1-4 against the code (some may be partly built), then build the first one that isn't.
- **AB-40 Structured assessments**: `docs/plans/QUIZ_STRUCTURED_ASSESSMENTS.md`. Next: PR1 (auto-score override, rescore warning, PLC override math, D4-D7). Then PR3-PR7; PR2 and PR8 build on ExamView's sections core; PR9-PR10 need the gathered A&L assessments.
- **AB-41 Starred class audit**: `docs/plans/STARRED_CLASS_AUDIT.md`. Next: PR 1 (empty-state fix for Seating Chart, Checklist and Randomizer; delete `components/common/RosterModeControl.tsx` if unused). Includes PROJECTS_WIDGET §10.4. PR 4 waits for Paul to open the flag.
- **AB-42 Annotation overlay PR3**: `docs/plans/ANNOTATION_OVERLAY_PR3.md`. Next: item 2 (`hitTestInk` with unit tests), then pointer pass-through, the Dock guard narrowing, and the stroke redraw fast path.
- **AB-43 Unit Overview widget**: `docs/plans/UNIT_OVERVIEW_WIDGET.md`. Next: Phase 1 step 1. Ships behind a flag (`new-widget` skill).
- **AB-44 AI Responsible Use widget**: `docs/plans/AI_RESPONSIBLE_USE_WIDGET.md`. Next: PR1 (registration, flag, `config/aiResponsibleUseContent.ts` with the verbatim district content).
- **AB-45 Chrome extension quiz and video hand-off**: `docs/plans/CHROME_EXTENSION.md`. Next: slice 15 / F13.
- **AB-46 Drawing page space**: `docs/plans/shipped/QUIZ_WHITEBOARD_RESPONSE.md` D29, the decoupled Drawing widget page-space migration.
- **AB-80 Clearer message when a long PIN can't join a ClassLink quiz** (S, needs Paul's wording OK). Since security batch 1A (#4986), an anonymous join with a 6+ character PIN on a session with both rosters and class ids is refused when the PIN sign-in doesn't match (stale PIN index, rate limit, outage, or a local roster linked only to a Schoology section). The student sees the "already in this quiz on another tab" message from `hooks/useQuizSession.ts`; it should tell them to sign in with their school account. Also consider counting only non-`schoology:` class ids in that rule.
- **AB-54 Import S8 PR2** (M). Extension Send for a single Schoology rubric or discussion. Build it from the two Schoology links (one rubric, one discussion) Paul posted in the "Import S8" thread (PT-8, done 2026-11-04).
- **AB-138 Timer end triggers on synced shared boards** (S, from #5380). Trigger claims (`utils/boardTriggerClaim.ts`) live on each teacher's own board doc, so on a synced shared board the host's copy and a co-teacher's copy can still both pick, advance or rotate on one timer end. Claim on the share doc (`shared_boards/{id}`) for linked boards, or let only the host's copy act.
- **AB-139 Hidden-board timer expiry follow-ups** (S, from #5380). The hidden-board expiry write waits a 10 s grace and is dropped if the board unmounts first (then the timer stays running at 0 until shown, as before #5380). Also: legacy timer end triggers compare the run end time (starting device's clock) with Connections bump values (runner device's clock), so large clock skew can skip one. Consider a server timestamp for both. Also, the expiry write goes through `applyConnectionChanges` with this tab's copy of the board as its baseline, so if that board is parked after a switch with its flush still retrying, the expiry write takes server values for the other widgets until the parked retry lands (from the PR sweep's integration review).
- **AB-145 Next Up queue writes from two tabs** (S, from #5397). The drain lease makes one tab take in joins, but Drive writes are not fenced: a holder that stalls mid-write past the 10 s takeover window can land an older queue over the new holder's, and Next or Reset in a tab that does not hold the lease writes that tab's own copy of the queue (last write wins). Fix by reloading the Drive file just before a Next or Reset write, or by routing every queue change through the lease holder. Also: a timed-out claim transaction can still commit a lease the tab never releases (self-heals after 10 s). Files: `components/widgets/NextUp/nextUpDrainLease.ts`, `nextUpQueueStore.ts`, `Widget.tsx`.
- **AB-130 Drive grant fact while the probe is unknown** (S, from #5352 review). `offlineGrantPresent` stays false for a whole tab session when the grant probe errors or an older tab left the bare `'1'` flag, so the `drive-connected` tour condition and the Getting Started Drive checkmark read false for a teacher who is connected. Report the fact as undefined while the answer is unknown (`components/tours/useTourConditions.ts`, `hooks/useGettingStarted.ts`) and retry the probe after an error (`context/AuthContext.tsx`).
- **AB-131 Tell a chosen Snowy from the default** (S, from #5352 review). `firstBoardOnDefault` (`utils/boardBackgroundDefaults.ts`) treats a first board on Snowy as untouched, but Snowy is also a pickable preset, so a teacher who chose it can have it replaced by an admin building default when they save a first building. Mark app-set backgrounds explicitly (for example a field set on creation and cleared on any background change).
- **AB-132 Resume a live tour by step id** (S, from #5352 review). `SavedTour` keeps only a numeric index, and resume re-filters steps with the current `showWhen` facts, so a fact that flipped mid-run shifts the resumed step. Save the step id and resolve it on resume (`components/tours/tourResume.ts`, `LiveTourRunner.tsx` launch).
- **AB-135 Keep a failed notebook page edit across a notebook switch** (S, from #5366). In `components/widgets/SmartNotebook/Widget.tsx`, an edit whose upload failed is dropped from `editedSvgsRef` and the notebook-switch reset, so it is lost after "Autosave failed". Keep failed edits in the map and retry them on the switch flush.

## Blocked

Each names what unblocks it. When the blocker clears, move the item to Ready.

- **AB-8 Pseudonym call errors** (S). Blocked on PT-259 (prod log count). `getPseudonymsForAssignmentV1` returned 79 × 404 and 34 × 403 out of 876 calls in the 30 days to 2026-10-01. #3733 likely fixed part of it. If Paul's count since 2026-10-01 is still above zero, find the callers from the log entries and fix them; if zero, delete this item.
- **AB-17 Excluded-student count on assignment cards** (S). Blocked on PT-260. Cards don't show how many students were excluded at assign. It is teacher-visible, so it needs a preview flag; PT-260 picks yes or no, and a yes names the flag, label and card placement.
- **AB-296 Drop the Focus old-stamp fallback** (S, security, rules). Blocked until one release after #6252 is live on prod. Remove the `sh == null` stamp-only branch in `focusSubShareLive` (`firestore.rules`), so a sub reads a focus session only through a live share named in `subMonitorShares`. Add a rules test that an old-stamped sub with no map entry is denied while another sub's entry exists. Note in the PR: `subMonitorUntil` is one max shared by all subs, and opening with a second share replaces the sub's entry.
- **AB-299 `global_pdfs` read access** (S, security, rules). Blocked on PT-261. If Paul says tighten, limit `global_pdfs` reads in `firestore.rules` and `storage.rules` to staff and admins, with rules tests and a check of every student-facing reader first.
- **AB-285 Grades projection trusts only verified class enrollment** (M, security #2). Blocked on PT-146. The grade projection writes a student Grades entry only when the owner's `verified_classes` list has the class and the class-scoped roster vouches for the student (reuse `projectMemberAuthority`, narrowed to that class). The grade index ignores a `studentUid` change written by the owner. Local-roster classes have no server-trusted enrollment: decide with Paul before they lose student entries. Existing bad entries need a prod reprojection pass (PT item, Paul's OK). Security #3 is AB-166, same blocker.
- **AB-286 Name-hidden Activity Walls keep names off peers' devices** (M, security #5). Blocked on PT-252. On name-hidden walls, rules accept only the placeholder label from students. Peer-readable posts carry a per-wall author key instead of the student uid, and own-posts and the gradebook switch to that key. If Paul says yes, the teacher reads real names from a teacher-only author doc. Rules tests cover reads and writes; check `check:rules-size` first.
- **AB-287 PIN joins need a server-near join time** (S, security #4). Blocked on PT-253. Require `joinedAtOk` (within 5 minutes of server time) on every PIN join create, and have the client stamp `joinedAt` from server time. Add a dry-run-first script that back-fills `retired_pins` for local rosters with linked students. The PIN join rule is near the expression limit: measure it before adding.
- **AB-288 LTI launch binding defaults to enforce** (S, security #7). Blocked on PT-214. After Paul turns on `launchBinding: 'enforce'` on prod and it holds, change `parseLaunchBindingMode` to default to `enforce`, so a missing `lti_config` no longer falls back to log-only. Embedded launches already relaunch top-level when they have a `login_hint`.
- **AB-282 Offline saves, touch alignment guides and nudge-note languages** (S each). Blocked on PT-244. (1) `hooks/useFirestore.ts` `deferSave` retries `unavailable` and `deadline-exceeded` forever; add a maximum age only if Paul accepts dropping very old offline edits. (2) Touch users have no Alt key to move past an alignment guide; add the gesture Paul picks. (3) Live view nudge notes fall back to English for quiz languages other than es, fr and de (AB-214 item 4); add languages only if Paul wants them.
- **AB-250 Refuse a quiz retake that keeps the answer key** (S, security, rules; blocked until the release carrying #6020 is live on prod for one release). Add `keyGone(d)` back to the completed to joined branch of `statusMoveOk` in firestore.rules, so a retake must strip `revealedAnswers`, `revealedRubricExamples`, `revealedExplanations` and the same keys in `resultsOverride`; flip the rules test "a retake that leaves the key in place is still allowed" (`tests/rules/quizResultsOverride.test.ts`) back to REJECTED. Re-add cases (a retake writing `revealedAnswers` onto a doc with none, and `resultsOverride.revealedExplanations` onto an override without it) already ship refused in #6020.
- **AB-254 Withhold VA check verdicts from PIN joiners** (S, security). Blocked on PT-230. Security finding `find_01DCttpG`: in self-paced sessions with show result and reveal answer on, `checkVideoActivityAnswerV1` returns right/wrong and the answer key to PIN joiners; #5820's fix was reverted because it changes what PIN joiners see. Do what PT-230 picks: gate the fix on the session teacher's flag server side, or ship it for everyone, with a functions test.
- **AB-255 Withhold the quiz answer key while attempts remain** (S, security). Blocked on PT-231. From the #6020 review: a quiz published with answers writes the key to the student's response doc while they still have attempts left, so they can read it before retaking. If PT-231 says yes, publish the key only once no attempts remain (and strip it on retake as #6020 does), with rules and hook tests.
- **AB-241 Re-tighten share content rules after `share-content-safeguards`** (S, blocked on the `share-content-safeguards` retire (handed off 2026-11-17) and on the release that ships #5889 being live for one release). In `firestore.rules`: drop the no-nonce branch of `sbItemNonceOk` and the `!('shareNonce' in d)` write branch on `shared_boards/{id}/items` (old-client tolerance from #5889), and its mirror `isThisInstanceCopy` in `functions/src/sharedBoardItemsCleanup.ts`; drop `!('calendarIds' in shareData())` from `shared_collections/{id}/content` reads once the flag has been Public for 14 days (every live sub share then carries `calendarIds`). Retire the flag in the same PR: delete the legacy pick seed (`seedLegacyBoardItemPicks`, the `legacyPickFallback`/`legacySeed` params) and make the calendar list always shown. Rules tests in `tests/rules/sharedBoardItems.test.ts` and `sharedCollections.test.ts` flip their tolerance cases to denials.
- **AB-73 Other extensions' pages during Redirect and Lock** (S, blocked on PT-213). Since security batch 1H, Redirect and Lock send away every top-level page that isn't a web page on the list, our own pages, a browser screen or about:blank, so another extension's own page (for example a PDF annotator that opens files in its own tab) is blocked too. If the pilot needs one, add a short list of allowed extension ids in `isBlockedTopLevel` (`extension/src/focus/focusState.ts`) and raise the extension version.
- **AB-212 Flashcards: unspaced slash pairs accept either half** (S, blocked on PT-213; release 2026.11.13d review). Since #5762, typed answers expand an unspaced slash word, so `yes/no`, `true/false`, `and/or` and `input/output` accept either half alone (the same rule that makes `el/la` work). Check with Paul whether non-gendered pairs should stay whole; if so, limit expansion in `utils/flashcardMatch.ts` and its `functions/` mirror, with cases in `flashcardMatch.cases.json`.
- **AB-142 Sub-share sweep leaves Drive grants unrevoked (needs a design call)** (M, blocked on PT-213). After the 7-day grace, `functions/src/expireSubShares.ts` deletes a share that still has `driveGrants` and only logs them; the service identity cannot revoke on a teacher's files. Keeping the doc with a `grantsOrphaned` marker was tried and rejected in review (#5362): expired docs stay listable by any district staff account (shared_boards/shared_collections list rules), the client reconciler warns the host every session when a revoke keeps failing, and kept docs pile up at the front of the sweep query. A fix must strip `initialState`/`subEmails` and subcollections when marking (or move the orphan record to an admin-only collection), make the reconciler skip marked docs, exclude marked docs from the sweep query, and catch NOT_FOUND on the marker update. AB-284 (#6256) left this open too: the choice is deleting such shares (the host's reconciler can no longer find them) or the marker with rules and index changes.
- **AB-228 Pin the owner on old synced bank slots, then refuse unknown owners** (S, security). Blocked on PT-210 (Paul's OK). For one release, bank slots with no recorded owner load whatever bank sits at their id (`hooks/useBankSources.ts`, `utils/quizShareContent.ts`), same as before release 2026.11.15. Pin the owner on the slot's first load or save, then refuse unknown owners again, with a test for each. Also extend the H1 import protection to old-format shares.
- **AB-239 Re-tighten `claimClassOk`** (S, security). Blocked on one release after 2026.11.15. Re-tighten `claimClassOk` in `firestore.rules` once no previous-client page can be live, with a rules test.
- **AB-219 Drop the Activity Wall single-class gate** (S). Blocked on PT-203. Once no Activity Wall or mini app session on prod has a `classId` without a `classIds` list, replace `passesStudentClassGateCompat` in `firestore.rules` with `passesStudentClassGateList` at its two Activity Wall callers, delete the helper, and move the wall seeds in `tests/rules/studentRoleClassGate.test.ts` off the legacy shape. Re-count with `scripts/count-legacy-rule-shapes.mjs` (read-only, `CLOUD_RUN_PROJECT=prod scripts/cloud-run.sh`, needs Paul's OK) first.
- **AB-166 Class targeting rules** (M). Blocked on PT-146. Batch 4A's rules PR: session creates and edits that add a class id not on `verified_classes/{authUid}.ids` are refused, across quiz, video activity, mini app, Guided Learning, Activity Wall, flashcard and project run sessions. Also: flip `MISSING_LIST_ALLOWS` to false in `functions/src/verifiedClassList.ts`; on a refusal the assign flows call `refreshMyClassesV1` once, retry, then show `CLASS_NOT_TAUGHT_MESSAGE`; the Admin SDK writers that mirror a teacher's own wall entry `classIds` onto the session (MCP `update_activity_wall` and restore in `functions/src/mcp/wallTools.ts`, the owner part in `saveSharedActivityWallV1`) drop ids not on the owner's list; have the dev "Sync from prod" copy the admin's own `verified_classes` doc; check the `[ltiExchange] teacher section not recorded` log counts first. Rules tests cover reads and writes; check `check:rules-size` first.
- **AB-152 Turn in scan-first written answers after End** (S). Blocked on PT-145. A hybrid "written answers on paper" row the student never opened on a device (`joined`, `paperWrittenBatchId`, no `lastWriteAt`; see `hybridResponseFields` in `functions/src/importPaperResponses.ts`) is left open by the assignment End (`utils/quizFinalizeOpenResponses.ts`) but turned in by the monitor's legacy End and the sub End (`finalizeAllResponses`), and the idle sweep's query never sees it. Turning one in marks its device questions abandoned and uses an attempt. Once Paul picks, make every End path and the sweep do the same (coordinate with the R5 slice, same import function) and add unit tests.
- **AB-48 Legacy tool features** (S). Blocked on PT-62, then one release. Delete the `LEGACY_TOOL_FEATURES` fallback (`components/layout/Dock.tsx:762`, `config/featureDefaults.ts`) and the three retired GlobalFeature ids.
- **AB-49 One gate per rollout** (L). Blocked on AB-48. Collapse each rollout switch into its paired flag (ADMIN_ACCESS_PAGES, deferred).
- **AB-50 PLC rename** (M). Blocked on PT-87. Rename ~188 `plcDashboard.*` strings in en/de/es/fr and the inline fallbacks in `PlcQuizzesBody.tsx`, `PlcQuizLibraryBody.tsx`, `PlcAssessmentsBody.tsx`, `PlcSettingsTab.tsx`; Help Center and changelog; screenshot all four locales. Plan: `docs/plans/PLC_RENAME_QUIZZES_TO_ASSESSMENTS.md`.
- **AB-51 PLC phases 7-8** (L). Blocked on PT-88. Phase 7 Mini-Apps PLC integration (`useSyncedMiniAppGroups`, `synced_mini_apps` rules, CF join, PLC body and import modal, flag row; widen `assignment_index` so `sheetUrl` is optional for `mini-app` and `guided-learning`). Phase 8 GL PLC sharing (same pattern plus Drive-backed import gating). Spec: `docs/specs/M16-plc-phases-7-8-spec.md`.
- **AB-55 Schoology grade import** (L). Blocked on PT-90. Plan: `docs/plans/SCHOOLOGY_GRADE_IMPORT.md`.
- **AB-57 Starred class PR 4** (S). Blocked on Paul opening the per-widget class flag (after AB-41 PR 2-3). Remove the star UI, `activeRosterId`/`setActiveRoster`, the localStorage key and the Classes widget catalog entry.
- **AB-58 One student assignment query** (M). Blocked on AB-13's prod run. Collapse `useStudentAssignments` to a single `classIds` query with a regression test.

## Reference

### Live plans

Each stays in `docs/plans/` until built, then moves to `docs/plans/shipped/` and its human leftovers go to PAUL_TODO.md.

| Plan                                                           | State (2026-11-01)                                                                                                | Here         |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------ |
| `docs/plans/IMPORT.md`                                         | Wave 1 and the Edpuzzle, YouTube, Quizlet and Google Forms readers built behind `universal-import` and `import-*` | AB-53, AB-54 |
| `docs/plans/CHROME_EXTENSION.md`                               | Web tours and Focus FS1-9, FS12 built                                                                             | AB-45        |
| `docs/plans/GRADEBOOK.md`                                      | Phases 1-6 built behind admin flags                                                                               | AB-4, AB-21  |
| `docs/plans/QUIZ_ROSTER_GRADING_AND_REOPEN.md`                 | Approved, unbuilt                                                                                                 | AB-39        |
| `docs/plans/QUIZ_STRUCTURED_ASSESSMENTS.md`                    | Unbuilt                                                                                                           | AB-40        |
| `docs/plans/SCHOOLOGY_GRADE_IMPORT.md`                         | Unbuilt                                                                                                           | AB-55        |
| `docs/plans/STARRED_CLASS_AUDIT.md`                            | Unbuilt                                                                                                           | AB-41, AB-57 |
| `docs/plans/UNIT_OVERVIEW_WIDGET.md`                           | Unbuilt                                                                                                           | AB-43        |
| `docs/plans/AI_RESPONSIBLE_USE_WIDGET.md`                      | Unbuilt                                                                                                           | AB-44        |
| `docs/plans/ANNOTATION_OVERLAY_PR3.md`                         | Unbuilt                                                                                                           | AB-42        |
| `docs/plans/PLC_RENAME_QUIZZES_TO_ASSESSMENTS.md`              | Waiting on scope                                                                                                  | AB-50        |
| `docs/plans/copy-audit/guided-learning.md`                     | Most verdicts unapplied                                                                                           | AB-20        |
| `docs/specs/M16-plc-phases-7-8-spec.md`, `docs/PLC_ROADMAP.md` | Unbuilt                                                                                                           | AB-51, AB-25 |
| `docs/specs/LO12-nexus-widget-connections-spec.md`             | Dropped 2026-11-15: superseded by Widget Connections v2 (`config/widgetConnections.ts`)                           |              |
| `docs/plans/WIDGET_RUBRIC.md`                                  | Living reference for the widget grader; not backlog                                                               |              |

Other references: roadmaps and design docs (`docs/nexus.md`, `docs/wide-distro-plan.md`), runbooks (`docs/admin_settings_widget_configs.md`, `docs/external-availability-*.md`, `docs/assign-from-spartboard-to-lms-feasibility.md`, `docs/ADMIN_SETUP.md`, `docs/DEV_WORKFLOW.md`, `docs/LINTING_SETUP.md`, `docs/DEPLOY_CHECK.md`), and the decision record in `docs/plans/shipped/`.

### Known limits (accepted; no work unless Paul asks)

- PLC `plcDetached` markers (#4692) outlive deleted groups; tiny and hold no names (AB-60, 2026-11-17).
- Background pickers read once when opened (#6131): an admin's new background, or a load that failed offline, shows after the picker is reopened.
- Drawing (#4650-#4663): the sticky note editor keeps its starting text size while typing and shrinks on save; alignment guides use a rotated item's unrotated box.
- Poll (#4637-#4666), with the flag on: Reset after Stop ends that session, so the next Start gets a new join code; typed answers drop off the board after Stop (they stay in Results and the CSV); reordering questions after a session maps old votes by position.
- Sound (#4648-#4664): goal progress and the session summary live only in the open tab, so a reload clears them; lowering the goal below time already counted doesn't award the point.
- `/plc/:id/dataOverview` URLs stay on that path when PLC Home is off (URL only, #4734).
- Chrome Extension CI bench budget (frame gap p95 150 ms) failed once on a runner at 183 ms (#4698); fix the bench if it flakes again.
- AB-15 Quiz leaderboard subdoc (moved 2026-11-15): optional; no reported problem since it was filed.
- AB-35 Functions `types.ts` alias (moved 2026-11-15): the item's own reason holds: ClassLink types are already shared through `functions/src/classlinkShared.ts`.
- AB-37 Configurable internal domain (moved 2026-11-15): SpartBoard serves one district; revisit only if a second district signs on.
- AB-63 PIN and second-tab edges (moved 2026-11-15): PINs are off at the org; reopen if PINs come back.

### Rejected; don't re-propose without answering these

From the 2026-10-01 cost audit, adversarially reviewed:

- **Prod `minInstances: 0` for `getPseudonymsForAssignmentV1`**: cold starts measured 5-10 s (up to 20 s+), and about 19% of calls would land cold. A visible regression for about $4-5/mo net.
- **`persistentLocalCache`**: can't be route-scoped, leaves student data in IndexedDB on shared devices, and feeds stale first snapshots into the save baseline.
- **Skipping the transactional read in `saveDashboard`**: reopens the multi-device clobber #2813 fixed.
- **Moving `currentQuestionIndex`/`questionPhase`/`autoProgressAt`/`revealedAnswers` out of the session doc**: already-open student tabs freeze, and those fields lose atomicity with `status`.
- **Slowing the student written-answer autosave from 500 ms**: negligible egress saved, wider data-loss windows.
