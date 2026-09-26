# Quiz join-code lookup — closing the `quiz_sessions` list hole

## The hole

`quiz_sessions` answers `allow read: if request.auth != null`, and `read` is `get` **plus**
`list`. Any signed-in caller — including an anonymous PIN student who joined one quiz — can open
the console and read back every quiz session on the account: every teacher's assignment titles,
class targeting, published-score state and public question bodies.

PR #3133 closed exactly this on the other four session collections by splitting `read` into a
permissive `get` and a scoped `list`. It could not close `quiz_sessions`, because the PIN join
resolves a code with `where('code','==',code)`, and **a `list` rule is evaluated once against the
query with an empty `resource`**, so it cannot prove a filter on `code` was supplied. No rule can
tell that query apart from a bare enumeration.

## The fix

Pointer documents at `quiz_join_codes/{code}/sessions/{sessionId}`, holding
`{ sessionId, teacherUid, createdAt }`.

The code moves out of a query filter and into the **document path**, where knowing it is provable
by construction: a caller must already hold the code to address the collection at all. That makes
the lookup a path-scoped `list` of one tiny subcollection, followed by a `get` on each session by
id — both of which a rule can express precisely.

Rejected alternatives:

- **A callable that resolves the code with the Admin SDK.** Needs no backfill, but puts a Cloud
  Function cold start on the busiest student path in the app — thirty K-2 students typing a PIN at
  the same moment — and makes joining fail whenever Functions is degraded. Firestore reads are
  cached, cheaper and fail with the rest of the app rather than on their own.
- **A single `quiz_join_codes/{code}` doc holding the current session id.** Last-writer-wins on a
  shared document: one teacher's session creation would overwrite another's pointer for the same
  code, and the review screen could no longer reach an older session whose code was recycled. The
  per-session subcollection gives every pointer a single owner.

## Rollout

The three phases exist because a merge to `dev-paul` ships **rules** to the shared production
project while the client only reaches a preview channel. Production browsers run whatever is on
`main`. Tightening the rule before the new client is in production would break every PIN join in
the district instantly.

### Phase 1 — this change (safe to deploy on its own)

- `quiz_join_codes` rules: any authed caller (including anonymous) may `get`/`list` the pointers
  under a code; only the owning teacher may create one; pointers are immutable and owner-deletable.
- `createAssignment` writes the pointer in the same batch as the session, so a session can never
  commit without one. `deleteAssignment` removes it.
- All six join-by-code call sites go through `findQuizSessionsByCode()` in
  `utils/quizJoinCodes.ts`.
- That helper reads pointers **and** runs the legacy `where('code')` query, unioning the results.
  Sessions that predate this change have no pointer, so the legacy query is what still finds them.
  Either branch failing alone is tolerated; only a total failure surfaces an error.
- `quiz_sessions` read rules are **unchanged**. Nothing is closed yet.

### Phase 2 — after this reaches production and the backfill has run

1. Ship phase 1 to `main` so production browsers resolve codes through pointers.
2. Run the backfill (below) with `--apply`, so every live session has a pointer.
3. Set `LEGACY_CODE_QUERY_ENABLED = false` in `utils/quizJoinCodes.ts` and delete
   `sessionsByLegacyQuery`.
4. Replace the `quiz_sessions` read rule with the same split the other four collections use:

```
allow get: if request.auth != null;
allow list: if request.auth != null && sessionListScoped();
```

Check `MAX_POINTERS_PER_CODE` before flipping: the pointer path reads only the newest N pointers
per code, and once the legacy query is gone a session past that cap is no longer reachable by code
— which the review screen depends on. The dry run's per-code counts say whether any real code is
anywhere near it.

`sessionListScoped()` is the helper PR #3133 added. After phase 1 the only remaining `list`
queries against `quiz_sessions` are the two My Assignments class shapes in
`hooks/useStudentAssignments.ts` (`classId in [...]` and `classIds array-contains-any [...]`),
which that helper already proves.

**Measured, not assumed** (Firestore emulator v1.21.0, 2026-09-18): with the phase-2 rule applied,
the bare enumeration is denied for an anonymous student, a `studentRole` student and a teacher; the
old `where('code','==',code)` query is denied; a teacher aiming `teacherUid` at a colleague is
denied; and the anonymous pointer lookup, the get-by-id, both My Assignments shapes and the
Completed channel (`status == 'ended'` + `orderBy('endedAt')` + `limit(50)`) all still pass. The
phase-2 flip is a three-line rules change with no further client work.

### Phase 3 — cleanup

Once no session predates phase 1, `tests/rules/sessionListScoping.test.ts`'s
"quiz_sessions (intentionally unscoped)" case flips to an `assertFails`.

## Backfill

`scripts/backfill-quiz-join-codes.mjs`. Dry run by default; `--apply` writes; `--all` also covers
ended sessions (the review screen resolves those by code too). Idempotent — a pointer that already
exists is left alone — so it is safe to re-run, and safe to run repeatedly between phase 1 and
phase 2 to catch sessions created by a browser still on an old bundle.

```
node scripts/backfill-quiz-join-codes.mjs --all            # dry run, writes a JSON report
node scripts/backfill-quiz-join-codes.mjs --all --apply
```

The dry run reports sessions it cannot migrate: a missing `teacherUid`, or a `code` that is not
canonical `[A-Z0-9]`. Those need a look before phase 2, because a session without a pointer stops
being joinable the moment the rule tightens.
