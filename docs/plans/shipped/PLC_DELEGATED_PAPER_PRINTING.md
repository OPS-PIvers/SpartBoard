# PLC Delegated Paper Printing — Implementation Plan

**Date**: 2026-09-20 · **Branch**: `dev-paul` · **Status**: Draft for product-owner review. The decisions in §2 were settled in a design interview on 2026-09-19/20, and no code has been written. File paths were verified against `dev-paul` at `baa1e3e`; re-verify them before relying on them.

Let a PLC teammate print paper answer sheets for a colleague who is out. Builds on the shipped paper answer sheets feature (`docs/plans/shipped/QUIZ_PAPER_ANSWER_SHEETS.md`), which this plan does not change: the absent teacher still scans, reviews and publishes exactly as they do today.

---

## 1. Problem statement

A teacher asked:

> Is there a way in which one plc member (maybe plc lead?) to print paper forms for their plc members classes instead of only the specific teacher being able to do it for themselves? If one teacher is out sick, or is super busy, plc members stepping in to help get the answer sheets printed is super helpful.

Today only the owning teacher can print. Everything the print path needs — the quiz, the roster, the batch record — is owner-scoped, and the person who would benefit most from help is by definition unavailable to grant it.

### 1.1 Why this is not a small change

**SpartBoard has no delegation path today.** There is no `actAs`, no proxy uid, no teacher custom token; `createCustomToken` mints only student / LTI / Classroom-addon identities. The `/subs` portal is not a counterexample — the substitute signs in as themselves (`components/subs/SubsAuthGate.tsx`) and reads a `shared_boards` snapshot the host _voluntarily created in advance_, with roster access mediated by Google Drive grants the host issued (`hooks/useSubstituteRosters.ts:10`). A PLC lead is a **membership** administrator, not a data administrator: the only content-level lead override in all of `firestore.rules` is `question_banks` update/delete (`:2635`, `:2660`).

This plan establishes the first "act for another teacher" capability in the app. That is the risk, and it is why §9 exists and why §8 ships the read half alone.

### 1.2 Constraints found during the interview

These shaped the decisions and are easy to re-derive wrongly later:

- **Owner-only rules on the batch.** `users/{userId}/paper_batches/{batchId}` is `request.auth.uid == userId` (`firestore.rules:538`). Tests at `tests/rules/paperBatches.test.ts`.
- **Import is hard-bound to the caller.** `importPaperResponsesV1` namespaces every lookup to `caller.uid` (`functions/src/importPaperResponses.ts:214`), rejects `session.teacherUid !== caller.uid` (`:225`), and asserts `batch.quizId === assignment.quizId` (`:228`). A delegated batch must therefore carry the **absent teacher's** quiz id, not the helper's.
- **A PLC peer's copy is a different quiz.** Importing from the PLC always writes a private copy with `id: crypto.randomUUID()` (`hooks/usePlcQuizActions.tsx:283`); only `sync.groupId` links the copies.
- **Student names and PINs live only in Google Drive**, at `SpartBoard/Data/Rosters/{rosterId}.json` (`hooks/useRosters.ts:369`). Firestore holds roster metadata only. The app holds `drive.file` scope, so a peer cannot read another teacher's roster file at all.
- **The server can read a teacher's Drive with nobody present.** `refreshGoogleAccessTokenForUid` (`functions/src/googleOAuth.ts:345`) exists for exactly this and already backs `pushClassroomGrade`, `quizMediaArchive` and `activityWallArchive`. It throws `failed-precondition` with `reason: 'needs-consent'` when the teacher never granted offline access (`components/common/DriveOfflineGrantCard.tsx` is the dismissible prompt).
- **Canonical quiz content is already peer-readable.** `/synced_quizzes/{groupId}` is `allow get: if request.auth != null` (`firestore.rules:1472`) — an unguessable UUID, no PII. So quiz questions are reachable without Drive; **only the roster truly needs the offline grant.**
- **Joining a sync group already takes a uid parameter.** `handleJoinPlcQuizSyncGroup(db, uid, plcId, plcQuizId)` (`functions/src/plcQuizSyncJoin.ts:48`) re-verifies _that_ uid's membership inside the transaction.
- **The print modal is already uid-agnostic.** `PaperPrintModal` takes `{ quiz, rosters, onSaveBatch }` and renders HTML + `window.print()` via `utils/printHtmlDocument.ts`. No PDF library, no server rendering — **printing cannot happen anywhere but in a browser**.
- **The roster name is the class period.** Import sends `classPeriod: found.roster.name` (`utils/paperImportPlan.ts:140`), which keys the `pin_index` lookup and the `pin-{period}-{pin}` fallback response key.
- **Firestore rules cannot be tested locally on this machine**, and a `dev-*` push ships rules, indexes and Cloud Functions to the shared prod project.

---

## 2. Decisions (locked 2026-09-20)

### 2.1 Scope and authorization

| #   | Decision       | Choice                                                                                                                                                                                                |
| --- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Scope          | **Print only.** The helper prints; the absent teacher scans, reviews and publishes. `importPaperResponsesV1`'s `caller.uid` trust model is not touched.                                               |
| D2  | Batch owner    | **The absent teacher's `paper_batches`, written by a Cloud Function.** Follows the existing cross-user writer pattern; `firestore.rules:538` stays owner-only.                                        |
| D3  | Who may print  | **Any non-viewer PLC member, with no pre-arrangement.** Reuses the `plcCanEditContent` shape (`firestore.rules:1702`). A design needing the absent teacher's live action fails the actual use case.   |
| D4  | Quiz scope     | **PLC-shared quizzes only**, matched on `sync.groupId`. A peer never browses a colleague's private library.                                                                                           |
| D5  | Student data   | **Server reads the roster, returns names only.** PINs are join credentials and never leave the server.                                                                                                |
| D6  | Gating         | **Helper passes both existing paper gates; the callable re-reads the kill switch server-side**, mirroring `importPaperResponses.ts:207`. The target's feature permission is not evaluated.            |
| D7  | Kill switch    | **Its own Rollouts switch, ships off**, following `admin_settings/paper_answer_sheets` and `plc_note_collab`. Delegation can be killed without killing paper sheets.                                  |
| D8  | PLC off switch | **`printForTeammates` in `PlcFeatureSettings`** (`types.ts:348`), default on, merged through `getPlcFeatures`. Honestly: any member can flip these, so this is an off-switch, not individual consent. |

### 2.2 Resolving the absent teacher's quiz

| #   | Decision         | Choice                                                                                                                                                                                                       |
| --- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D9  | No personal copy | **The server creates it and joins the sync group for them.** Without a copy there is no quiz id to bind a batch to. See §9 — this is the most intrusive step in the plan.                                    |
| D10 | Join mechanism   | **Reuse `handleJoinPlcQuizSyncGroup` with the target's uid**, after separately verifying the caller. No second writer of the `participants` map.                                                             |
| D11 | Content source   | **Their Drive copy first, `/synced_quizzes` as fallback.** Their copy is what their assignment will grade against; the group is the safety net when Drive is unreachable. The fallback is flagged on screen. |
| D12 | Answer key       | **The full quiz is returned, `correctAnswer` included.** A PLC colleague teaching the same common assessment may be proctoring or grading a section.                                                         |

### 2.3 Printing

| #   | Decision     | Choice                                                                                                                                                                                        |
| --- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D13 | Entry point  | **PLC dashboard → Quiz Library row kebab**, beside the existing Import / Edit actions. The delegated path stays visibly PLC-scoped.                                                           |
| D14 | Run shape    | **One teammate per run.** Each run writes one batch under one owner, and each teacher's stack stays separable at the copier.                                                                  |
| D15 | Roster scope | **All of the target's rosters, with student names.** The helper must pick which classes are sitting the test and uncheck the student on a field trip. Names print regardless.                 |
| D16 | Batch trust  | **The server re-derives the batch.** The helper sends selections and counts; the server runs `planPaperBatch` itself. A peer cannot hand-craft seats pointing at arbitrary student ids.       |
| D17 | Sheet header | **Delegated sheets name the teacher; self-printed sheets are unchanged.** The existing layout — whose geometry the reader depends on — is not touched for anyone else.                        |
| D18 | Duplicates   | **Warn and allow.** Existing batches for that teacher + quiz are listed with who printed them and when, behind a confirm. Import is idempotent per batch; the harm is two sheets per student. |

### 2.4 Failure modes and aftermath

| #   | Decision             | Choice                                                                                                                                                                                                                                                                                    |
| --- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D19 | No Drive grant       | **Spares-only stack.** Unnamed sheets with real seat markers; students write their names; the owner assigns seats in the review queue, which already supports this.                                                                                                                       |
| D20 | No grant AND no copy | **Deferred copy, never blocked** (revised 2026-09-21). The batch reserves a quiz id and carries a `pendingQuizCopy` marker; the owner's own next sign-in builds the copy, joins the group and clears the marker. They open SpartBoard before they can scan the stack, so nothing is late. |
| D21 | Audit                | **`printedBy` stamped on the batch, plus a `PlcActivityFeed` entry.** The owner sees who printed it in their own import modal, where it matters.                                                                                                                                          |
| D22 | Cleanup              | **Owner always; the helper only until the batch is imported.** Covers the jammed printer and the wrong class without letting a third party delete a batch already on desks.                                                                                                               |

### 2.5 Assumptions carried without a decision

- The role gate applies to the **actor**. A `viewer` cannot print for anyone; anyone can be printed _for_, whatever their role.
- Delegation covers **authored PLC-shared quizzes only** — so no "Paper test" stub creation for a teammate, and no bubbled ANSWER KEY sheet (an authored quiz never gets one, per `QUIZ_PAPER_ANSWER_SHEETS.md` Q16).
- The batch stays **PII-free**. The only new fields are `printedByUid` / `printedByName` / `printedAt`.

---

## 3. Data model

### 3.1 Changed types

- **`PaperBatch`** (`types.ts:4737`) — three new optional fields: `printedByUid`, `printedByName`, `printedAt`. Their absence is what makes a batch self-printed; every existing batch stays untouched. Still no names, no PINs.
- **`PlcFeatureSettings`** (`types.ts:348`) — `printForTeammates?: boolean`, defaulted on in `DEFAULT_PLC_FEATURE_SETTINGS` and merged by `getPlcFeatures(plc)` so legacy and partial maps behave.
- **`PlcActivityType`** (`types.ts:806`) — one new value for the feed entry.

### 3.2 New admin settings doc

`admin_settings/plc_delegated_printing`, shape `{ enabled: boolean }`, default `false`. Rules mirror `firestore.rules:758` (any signed-in user reads, `isAdmin()` writes). Hook and config mirror `hooks/usePaperAnswerSheetsSettings.ts` and `config/paperAnswerSheets.ts`, including the fail-closed error path: an unreadable doc hides the feature.

### 3.3 Unchanged

`firestore.rules:538` stays owner-only. No rule anywhere gains a PLC branch into `users/{uid}/**`. Every cross-user read and write in this plan goes through the callables in §5, which run as admin after proving authorization — the same posture as `importPaperResponses.ts:5-8`.

---

## 4. Authorization, stated once

Every callable in §5 performs, in this order:

1. Caller is authenticated, not a student role, not anonymous.
2. `admin_settings/plc_delegated_printing.enabled === true` **and** `admin_settings/paper_answer_sheets.enabled === true`.
3. The PLC exists, has `printForTeammates` on, and the **caller** is a member whose role is not `viewer`.
4. The **target** is a member of that same PLC.
5. The quiz is shared into that PLC — the `plcs/{plcId}/quizzes/{plcQuizId}` entry resolves to the `syncGroupId` being printed.

Membership is read server-side; the caller's word is never taken for it. Steps 3–5 are read inside the same transaction as any write that depends on them, following `plcQuizSyncJoin.ts:56-75`, so a member removed mid-flow cannot complete the operation.

---

## 5. Cloud Functions

### 5.1 `getTeammatePrintContextV1` (read only — Increment 1)

Input `{ plcId, targetUid, plcQuizId }`. After §4:

1. Find the target's personal quiz by `sync.groupId` under `users/{targetUid}/quizzes`. Report `hasCopy`.
2. Mint the target's offline Drive token. On `needs-consent`, report `driveReachable: false` and continue.
3. Quiz content: the target's Drive file when reachable, else `/synced_quizzes/{groupId}` (D11), reporting which was used.
4. Rosters: metadata from `users/{targetUid}/rosters`, students from Drive — **`{ id, firstName, lastName }` only; `pin` and `email` are dropped before the response is built** (D5).
5. Existing batches for this target + quiz, with `printedBy` and `createdAt` (D18).

Returns everything needed to render the picker. **Writes nothing.**

### 5.2 `createTeammatePaperBatchV1` (Increment 2)

Input `{ plcId, targetUid, plcQuizId, selections, choiceCount, spareCount }`. After §4:

1. If the target has no copy **and** their Drive is reachable: pull canonical content, save a copy to **their** Drive with their offline token, write `users/{targetUid}/quizzes/{newId}`, and call `handleJoinPlcQuizSyncGroup(db, targetUid, plcId, plcQuizId)` (D9, D10). Roll back the quiz doc if the join fails, mirroring `usePlcQuizActions.tsx:327-347`. If their Drive is unreachable, reserve a quiz id instead and stamp `pendingQuizCopy` on the batch (D20) — `usePendingTeammateQuizCopies` builds it in their own session.
2. Validate every selected `rosterId` and `studentId` against the target's real rosters.
3. Run `planPaperBatch` **server-side** (D16) and write `users/{targetUid}/paper_batches/{batchId}` with `printedBy*` stamped.
4. Write the `PlcActivityFeed` entry (D21).
5. Return the batch plus the print payload, so the helper's browser prints without a second round trip.

### 5.3 `withdrawTeammatePaperBatchV1` (Increment 2)

Input `{ plcId, targetUid, batchId }`. After §4, deletes the batch only when `printedByUid === caller.uid` and no response carries that `paperBatchId` (D22). The owner's own delete path is unchanged and needs no function.

### 5.4 Shared helper

`planPaperBatch` moves to a form both `functions/` and the client can call, or is duplicated with a test asserting the two agree on a fixed input. Decide at implementation time; a silent divergence between the two would mis-seat a whole stack.

---

## 6. UI

- **`PlcQuizLibraryBody` row kebab** — "Print answer sheets for a teammate", shown only when the Rollouts switch is on, the PLC feature is on, the caller is a non-viewer, and `canAccessFeature('paper-answer-sheets')` passes.
- **`PlcTeammatePrintModal`** — teacher picker (PLC members, minus the caller), then `getTeammatePrintContextV1`, then the existing `PaperPrintModal` fed with the returned quiz and rosters. Banners for: content came from the synced group (D11), no Drive grant so this is a spares-only stack (D19), the copy landing on their own next sign-in (D20), and batches already printed for this teacher (D18). Printing calls `createTeammatePaperBatchV1`, then `printPaperSheets` and `printPaperTest` in the browser.
- **`PaperPrintModal`** — one new optional `printedForTeacherName` prop threaded to the header (D17). Absent for the self-print path, which renders byte-identically to today.
- **`PaperImportModal`** — show `printedByName` when present, so the owner sees who printed the stack they are scanning.

---

## 7. What is deliberately unchanged

`importPaperResponsesV1`, `publishPaperResultsV1`, `firestore.rules:538`, the sheet geometry in `utils/paperSheetLayout.ts`, the marker format, the reader, the review queue, and the self-print path's printed output. A delegated batch is an ordinary `PaperBatch`; the owner's scan-and-grade flow cannot tell the difference except for the `printedBy` stamp it displays.

---

## 8. Delivery (stacked PRs into `dev-paul`)

1. **Read path** — `getTeammatePrintContextV1`, the Rollouts switch and its hook, the `PlcFeatureSettings` flag, the kebab entry and the teacher picker showing what _would_ print. Writes nothing anywhere. Verifiable against real PLCs without any risk to a colleague's account.
2. **Write path** — `createTeammatePaperBatchV1`, `withdrawTeammatePaperBatchV1`, copy creation and sync join, the activity feed entry, the header change, the import-modal attribution.

The half that writes into someone else's account lands only after the read half is proven, mirroring how the paper feature itself shipped (Increment 1 stood alone).

**Verification.** Rules tests for `admin_settings/plc_delegated_printing` under `tests/rules/`. Unit tests for the §4 authorization ladder — each of the five checks failing independently — following `plcQuizSyncJoin.test.ts` and `detachPlcSyncLinkage.test.ts`, whose stated purpose is pinning exactly this kind of cross-user guard. A test asserting the client and server `planPaperBatch` agree (§5.4). End-to-end verification is two real accounts in the same PLC on the preview deploy, with the switch on for that org only.

---

## 9. Known risks

- **This is the app's first delegation path.** Everything else that crosses teachers is either content the owner published (`synced_*`, `shared_boards`) or server-computed and anonymized (`plcs/{plcId}/aggregates`). The precedent set here will be cited by the next request.
- **A standing entanglement is created for an absent teacher.** D9 does not just create a copy — joining the sync group means `usePlcAutoPullSync` will pull teammates' edits into their library from then on, and their own future edits publish back to the group. That is a durable change to someone's account made while they were out, and it is not undone when the stack is imported. It was chosen knowingly over an unlinked copy; it is the single thing most likely to generate a support question.
- **The PLC toggle is not consent.** Any member can flip `printForTeammates`, including the member who wants to print. It is an off-switch for a PLC that does not want the feature, and the UI copy must not imply otherwise.
- **Drive writes as another user are new ground for quizzes.** The offline-token path is exercised by archive and grade-push functions, none of which create a user-visible file in a teacher's Drive.
- **The `needs-consent` rate no longer gates printing.** `DriveOfflineGrantCard` is dismissible, so many teachers have no offline grant. Since D20 was revised that only costs them a named stack (D19) and a copy that arrives on their next sign-in, not the print itself.
- **Rules ship to shared prod on a `dev-*` push** and cannot be exercised locally.

---

## 10. Out of scope (v1)

- Importing or publishing on a teammate's behalf (D1).
- Quizzes not shared into the PLC (D4).
- Printing for several teammates in one run (D14).
- "Paper test" stub creation for a teammate.
- Any delegation outside a PLC — substitutes, building admins, department chairs.
