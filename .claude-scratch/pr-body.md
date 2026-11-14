Security bundle D1 (quiz join PINs). Four of the five findings are fixed here. The fifth (class targeting) is blocked on PT-146 / AB-166 and is explained at the end.

## find_01CzZRKELFwvNRVpgdnvFipK: retired sequential PINs still seat anonymous joiners under ClassLink names

https://claude.ai/security/findings/find_01CzZRKELFwvNRVpgdnvFipK

**Root cause.** When a linked student's short default PIN (`01`, `02`, …) is replaced by a random 6-digit PIN, the old PIN moves to `formerPins`. Two things went wrong after that:

- `pinKeyOk` still let an anonymous joiner create `pin-<period>-01` on a ClassLink-rostered session.
- `buildRosterPinMap` mapped that retired PIN to the student's name on every response, no matter when it was created.

**Fix.**

- **Rules.** The server keeps a list of each teacher's retired PINs at `users/{teacher}/retired_pins/{period__pin}`. It is written only through the Admin SDK, and clients cannot read or write it. On a session with both `rosterIds` and `classIds`, `pinKeyOk` now refuses an anonymous key whose canonical period and PIN are on that list. This holds for any padding: `01`, `1` and `001` are all refused. Unretired short PINs, the same PIN in another period, SSO joins and bridged 6-digit joins are unchanged.
- **Filling the list.** `commitRosterPinIndexV1`, called after every roster save, now takes each linked student's `formerPins` and records them. A client that sends the complete list (`retiredPinsComplete: true`, new clients only) also removes entries no student still holds. This means a sequential PIN freed by a removed student can be reissued to an unlinked student. A call from an old tab only adds entries and never removes any.
- **Nightly ClassLink sync.** The sync does the same for rosters it changes. For rosters it leaves unchanged, it now fills only the retired entries that are missing. This covers rosters that were re-rolled before this list existed.
- **Teacher views.** Re-rolls now stamp `formerPinsAt` (client `utils/rosterPins.ts` and server `classlinkRosterReconcile.ts`). `resolvePinName` gives a former PIN the student's name only when the response's `joinedAt` is earlier than that time. Re-rolls from before this change count as retired on 2026-11-14. The monitor, results, grader, print sort, leaderboard and export all pass `joinedAt`, so a response joined after the re-roll shows as `PIN 01`.
- **Zero-stripping.** The zero-stripped lookup form is now added only for short PINs, so a typed `48213` can no longer borrow the name of a student whose PIN is `048213`.

**Tests.**

- `tests/rules/quizJoinPins.test.ts` ("retired roster PINs…"):
  - `01`, `1` and `001` are denied when `period_1__01` is retired.
  - `02`, period 2 and SSO still succeed.
  - Clients cannot write `retired_pins`.
- `quizScoreboard.test.ts`: a former PIN resolves only before `formerPinsAt`, the legacy cutoff applies when it is missing, and a long PIN is not reachable by stripping zeros.
- `studentIdentity.test.ts`: retired PINs are recorded in canonical form, and pruned only when the list is complete.
- `classlinkRosterSync.test.ts`: the sync fills an unchanged roster.
- `useRosters.test.ts`: the payload carries `formerPins` and `retiredPinsComplete`.

## find_01EPGDhoQ2fyoQdPhH62CDJS: extra quiz seats via leading-zero PIN or period relabel

https://claude.ai/security/findings/find_01EPGDhoQ2fyoQdPhH62CDJS

**Root cause.**

- `keySeg` kept leading zeros, so `4821`, `04821` and `004821` were three separate seats, each starting at `completedAttempts: 0`.
- Students could still change `classPeriod` after create, so a doc made under period 2 could be relabelled as period 1.

**Fix.**

- **One key per PIN.** `pinKeyOk` now builds the PIN segment with leading zeros stripped. A single digit is padded to two, so the usual `01`–`99` roster keys are unchanged. Every padding of one PIN now maps to one doc. The client uses the same form (`quizPinKeySegment` in `utils/quizResponseKey.ts`, through `computeQuizResponseKey`), and so does the paper import (`functions/src/importPaperResponses.ts`).
- **Resuming old docs.** A doc created at the old padded key still resumes: `findExistingResponseDoc` also probes the pre-change key, and the paper import reuses an existing doc at the old key.
- **Period relabel.** The student update branch now refuses a `classPeriod` change on a `pin-` keyed doc unless `keySeg(classPeriod)` still matches the key's period segment. SSO and uid-keyed docs can still change period.
- **Duplicate badging.** Duplicate detection in the teacher monitor (`findDuplicateResponseIds`) now keys each row by its response doc id (`responseDuplicateKey`) instead of `pin-{pin}`. Two docs that share a PIN are both badged.

**Tests.**

- `tests/rules/quizJoinPins.test.ts`:
  - A padded PIN is refused at the padded key and accepted at the canonical key.
  - After a completed `4821` seat exists, `04821` and `004821` are denied at either key.
  - `05`, `5` and `10` keep their usual keys.
  - Relabelling `pin-period_2-4821` to Period 1 is denied, a same-segment rewrite is allowed, and an SSO doc can still change period.
- `utils/quizResponseKey.test.ts`.
- `resolveDisplayName.test.ts`: two docs with the same PIN are both flagged.
- `importPaperResponses.test.ts`: updated to the canonical keys. The existing cases that pre-seed `0001` docs cover the old-key reuse.

## find_01N4wfYu9NmVwHDLmMSzMXN7: unlimited PIN-key create oracle

https://claude.ai/security/findings/find_01N4wfYu9NmVwHDLmMSzMXN7

**Root cause.** The video activity response create rule had no equivalent of the quiz rule that refuses sign-in-length PINs. On a ClassLink-rostered VA session, a free 6-digit `pin-` key could be created while a taken one was refused, and that difference reveals which PINs are taken.

**Fix.** The VA response create rule now refuses an anonymous `pin-` key whose PIN segment has 6 or more alphanumerics on a session with both `rosterIds` and `classIds`, matching quiz `pinKeyOk`. Free and taken keys are now refused alike. The VA client already bridges those PINs through `pinLoginV1`, which counts guesses.

**Tests.** `tests/rules/quizJoinPins.test.ts` ("video activity…"):

- A free and a taken 6-digit key are both denied.
- A short PIN on a rostered session and a long PIN on a session with no roster still succeed.

**Not closed here.** The second gap in the finding is quiz sessions with no `rosterIds` or `classIds`. The client never bridges on those sessions, so a linked student with a 6-digit PIN joins them anonymously by design. Refusing those keys would lock those students out, so that part stays open.

## find_01KD51x3TR48tiyGJVZhj87g: staff can claim a colleague's unowned legacy join code

https://claude.ai/security/findings/find_01KD51x3TR48tiyGJVZhj87g

**Root cause.** `ownsJoinCode` accepted `o == null`, so any staff caller could use, or claim first, a code that had no owner record.

**Fix.** This is AB-47. The PT-1 owner-record backfill (`scripts/backfill-quiz-join-codes.mjs`) ran on prod on 2026-11-10, and a main release has shipped since then. `ownsJoinCode` now requires an owner record that names the caller. AB-47 is removed from `AGENT_BACKLOG.md`.

**Test.** `tests/rules/quizJoinCodeLookup.test.ts`: "refuses a code nobody has claimed" is flipped to `assertFails`.

## find_01LkMVm21xqynqxqW6i8Jhzr: staff can target other teachers' classes via unchecked classIds (not fixed)

https://claude.ai/security/findings/find_01LkMVm21xqynqxqW6i8Jhzr

Not changed in this PR. The fix needs a server-maintained record of which classes each teacher teaches. That record already exists (`verified_classes/{uid}`, `functions/src/verifiedClasses.ts`), and the rules change is planned as AB-166. AB-166 is blocked on PT-146, which fills every teacher's verified class list on prod. Shipping the rule before that fill would refuse assignments from every teacher who has no list yet.

## Regression check

- **SSO and studentRole students:** keyed by uid. Neither the canonical PIN key nor the period check applies to them, and the tests cover both.
- **ClassLink students with 6-digit PINs:** they bridge through `pinLoginV1` as before. The quiz rule for these PINs is unchanged. For video activity, the new rule matches the existing quiz rule.
- **Anonymous PIN students:**
  - Two-digit roster PINs keep the same key.
  - Padded PINs now land on their canonical seat.
  - Docs created before this change still resume, because the client also probes the old key.
  - Unretired short PINs on rostered sessions still join.
  - Long PINs on sessions with no roster, or with only a local roster, still join.
- **Unlinked students on a ClassLink roster:** retired PINs are never reissued while the linked student holds them (both `assignPins` keep them reserved). If the linked student leaves, the next complete sync removes their retired entries.
- **Already-open tabs on the previous client:**
  - A tab that saves a roster sends no `formerPins`, which only adds entries and never removes any.
  - An old tab creating a padded PIN such as `0123` is now refused. That is the exploit this finding asks us to close. Two-digit PINs are unaffected.
  - An old tab creating a session under a code with no owner record is refused. The prod backfill gave every live code an owner, so this affects only codes created after the backfill by a tab that never reloaded (AB-47).
- **Teachers, co-teachers, subs and admins:** teacher and admin response writes are untouched. The retired-PIN check reads the retired list of the session's `teacherUid`. If the roster belongs to a different teacher (a co-teacher's or sub's session), the check finds no list and lets the join through, so nobody is locked out.
- **Paper import:** it writes to the same key a device join uses, and reuses a doc already at the old key.
- **Teacher views of old responses:** a former PIN still names the student on responses that joined before the PIN was retired.
- **Rules size:** +793 bytes compiled against `dev-paul` (220,813 → 221,606), within the 1,500-byte budget.

## Verification

- **Rules emulator:**
  - `quizJoinPins`, `quizJoinCodeLookup`, `securityBatch1A` and `responsePinProbe` pass.
  - The neighbouring quiz suites also pass: `quizPinCollision`, `anonymousJoinStamp`, `studentRoleClassGate`, `pinSignInHardening`, `assignmentModes`, `staffAudience`, `runEndHardening`, `securityBatch2A`, `viewAsStudent` and `quizGameResponses`.
- **Unit tests:** `quizScoreboard`, `resolveDisplayName`, `quizResponseKey`, `useRosters`, `rosterPins`, `assignmentExportShared`, `useQuizSession` and `rosterUtils` pass.
- **Functions:** `studentIdentity`, `classlinkRosterSync`, `classlinkRosterReconcile` and `importPaperResponses` pass.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
