# SpartBoard — Repo Improvement Plan

**Generated:** 2026-07-13 · **Method:** read-only multi-agent survey (backlog re-verification, correctness, security, performance/cost, test coverage, DX/CI) against current code on `claude/repo-improvement-planning-zih6en`.

> This is an advisory, recommendation-led plan. Nothing here has been implemented. Each item is self-contained enough for another agent to pick up. Effort legend: **S** <½ day · **M** ½–2 days · **L** multi-day / wide blast radius. 🔒 = security/data-isolation. Items requiring `firebase deploy --only firestore:rules` are flagged **[rules-deploy]**.

## How this plan was built

Six parallel read-only survey agents examined the repo. The most important finding is meta: **the 2026-06-23 backlog audit (`docs/remaining-todos-audit.md`) is materially stale** — a single hardening PR (`6a08458`, 2026-06-26) plus `908ed91`/`5721e4c` shipped **M1, M2, M4, M5, M6, LO4, LO10** without updating the audit. Those seven items are DONE. The audit should be refreshed (see H0 below) so future runs don't re-plan finished work.

Everything below excludes items already tracked as open in `docs/remaining-todos-audit.md` and `docs/scheduled-tasks/*.md`, except where a survey found new evidence that changes their status.

---

## Tier 1 — Do first (security + correctness, small effort, high blast radius)

These are the highest payoff-to-effort items. All are S except S1's siblings. Recommend batching the rules changes (S2–S5) into one PR with emulator tests.

### S1 — 🔒 Mini-app teacher iframe runs same-origin (auth-token exposure) · **S**

- **File:** `components/widgets/MiniApp/Widget.tsx:1283`
- **Problem:** teacher runner uses `sandbox="allow-scripts allow-forms allow-popups allow-modals allow-same-origin"`. `allow-scripts` + `allow-same-origin` on a `srcDoc` frame gives the frame the app's real origin, so mini-app JS can reach `window.parent`, `parent.document`, and the origin's IndexedDB `firebaseLocalStorageDb` where the Firebase Auth token lives. Mini-app HTML is **not** author-trusted: it's AI-generated, paste-imported, and distributed via world-readable `global_mini_apps`. A poisoned app → teacher account takeover.
- **Fix:** drop `allow-same-origin` (the student runner at `components/miniApp/MiniAppStudentApp.tsx:419` already omits it — proof the tightening is safe). The `postMessage` submission protocol works cross-origin. Verify via the mini-app runner; no rules deploy.
- **Verified:** yes — both iframe attribute strings confirmed by direct read.

### S2 — 🔒 [rules-deploy] Activity-wall moderation is bypassable by direct write · **S**

- **File:** `firestore.rules:3705-3719` (client enforcement at `components/activityWall/ActivityWallStudentApp.tsx:365`)
- **Problem:** the `create` rule accepts `status in ['approved','pending']` unconditionally and never consults the parent session's `moderationEnabled`. A student (enrolled or anon PIN-join) can direct-write `status:'approved'` with arbitrary ≤5000-char `content`, skipping the approval queue straight onto the projected classroom wall — defeating the K-12 safety control.
- **Fix:** when the parent session's `moderationEnabled == true`, force `request.resource.data.status == 'pending'` (read the session doc via the existing `get()`, mirroring `awSessionClassId()`). Only teacher/admin updates (already gated at :3729) may flip to `approved`. Add a `tests/rules/` case.
- **Verified:** yes — rule text confirmed.

### S3 — 🔒 [rules-deploy] Activity-wall submissions: no owner binding, no per-student cap · **M**

- **File:** `firestore.rules:3705-3719`
- **Problem:** `create` pins no owner (`submittedByUid` never compared to `request.auth.uid`) and `{submissionId}` is a free wildcard with no cap. One student can flood thousands of ≤5KB docs, each optionally triggering the Drive-archive Cloud Function per photo — griefing + Firestore/Storage/Functions cost, with no attribution.
- **Fix:** require an owner field bound to `request.auth.uid`; key docs deterministically per participant (as quiz/VA responses do) or enforce a rules-visible counter. Keep the photo-archive size guard.

### S4 — 🔒 [rules-deploy] `nextup_sessions/entries` accept unvalidated writes from any authed user · **M**

- **File:** `firestore.rules:3318-3320` — `allow create: if request.auth != null;` with no class gate, owner field, shape, or size validation.
- **Problem:** any authenticated principal district-wide (incl. unrelated anon student sessions) can write arbitrary docs into any teacher's Next Up buffer. Lower impact than S2/S3 (entries are teacher-read-only) but the write surface is completely ungated.
- **Fix:** add `passesStudentClassGateCompat(...)`, pin owner to `request.auth.uid`, validate shape/size with `hasOnly([...])`.
- **Verified:** yes — rule text confirmed.

### S5 — 🔒 [rules-deploy] Legacy `sessions/{userId}/students` cross-session record injection · **M**

- **File:** `firestore.rules:2815-2830`
- **Problem:** `create` requires only `request.auth.uid == studentId`; `{userId}` is unconstrained, no class/PIN gate, no field validation. A student can inject presence records into any teacher's legacy session and write arbitrary fields into their own doc. Griefing (no PII), but compounds the already-tracked broad `sessions` read.
- **Fix:** gate `create` on the parent session existing/active; constrain writable fields with `hasOnly([...])`. Best folded into the planned CF join-code work for the broad-read item. **Also has zero rules-test coverage** — see T2.

### C1 — Duplicate "My First Board" on first sign-in · **S**

- **File:** `context/DashboardContext.tsx:2003-2029`
- **Problem:** the default-board creation block is guarded only by `updatedDashboards.length === 0 && !migrated`, with **no in-flight ref guard** — unlike the sibling migration block (2039-2075) which has `migrationStartedForUidRef`. For a brand-new teacher with no local data, `migrated` never flips true, so two empty initial `onSnapshot` deliveries (cache then server) can both pass the gate before the async `void saveDashboard(defaultDb)` reflects → two "My First Board" docs.
- **Fix:** add a `defaultBoardCreatedForUidRef` mirroring the migration guard. The asymmetry with the sibling block strongly indicates an oversight.

---

## Tier 2 — Correctness bugs (live-session reliability)

Ranked by teacher-visible impact. All in `hooks/useLiveSession.ts` except C4.

### C2 — Teacher-removed student is never ejected · **S**

- **File:** `hooks/useLiveSession.ts:255-262` (status listener) vs `364-379` (`removeStudent` → `deleteDoc`)
- **Problem:** the student status subscription only acts inside `if (docSnap.exists())`. `removeStudent` deletes the doc → snapshot fires with `!exists()` → handler does nothing (no `else`). The session-doc subscription stays alive, so a removed student keeps viewing/participating. (Contrast `endSession`, which sets status `'disconnected'` — doc still exists — so only the delete path is unhandled.)
- **Fix:** add an `else` branch that clears `individualFrozen`/`studentId` and flags removal.

### C3 — PIN-uniqueness check is a TOCTOU race · **M**

- **File:** `hooks/useLiveSession.ts:319-337`
- **Problem:** `joinSession` does `getDocs` → check `pinInUse` → `setDoc` with no transaction. Two students entering the same PIN concurrently both read before either writes → both pass → duplicate PINs. Also scans `'disconnected'` docs, so a departed student's PIN stays blocked.
- **Fix:** move the uniqueness check into a transaction, or accept the client race and add a backing rule/CF. At minimum exclude `'disconnected'` from the scan.

### C4 — `useStudentAssignments` breaks for students in >30 classes · **M**

- **File:** `hooks/useStudentAssignments.ts:511-512` (also 429/378)
- **Problem:** passes the full `ids` array into `array-contains-any` / `in`, which Firestore caps at 30. An SSO student with >30 `classIds` claims → `buildQuery` throws `invalid-argument` inside `onSnapshot` setup → all buckets route to `handleError` → `/my-assignments` shows **zero** assignments (hard failure, not degraded). Teacher-side hooks already chunk elsewhere.
- **Fix:** chunk `ids` into ≤30 groups and union results.

### C5 — Session join-code collisions resolve to an arbitrary teacher · **M**

- **File:** `hooks/useLiveSession.ts:413-417` (gen) / `285-293` (join)
- **Problem:** `startSession` mints a 6-char code with `Math.random().toString(36)...padEnd(6,'0')` and **no global uniqueness check**; `joinSession` resolves `where('code','==',...)` then blindly takes `docs[0]`. Two concurrent sessions can collide (padEnd concentrates the tail keyspace); a student joins the wrong teacher's session. Low per-join probability, high blast radius district-wide.
- **Fix:** add a global short-code registry (or CF-minted codes) with collision retry; reject joins when >1 active session shares a code.

---

## Tier 3 — Performance & cost (mechanical wins first)

### P1 — Admin console (+ recharts) statically bundled for every teacher · **S**

- **Files:** `components/layout/sidebar/Sidebar.tsx:33`, `components/admin/AdminSettings.tsx:21-30`
- **Problem:** `AdminSettings` is a static import in the always-rendered Sidebar chunk; it statically pulls `AnalyticsManager` → `recharts` (~hundreds of KB gzip) plus the whole Organization/Templates/PLC admin surface — shipped to 100% of users though only admins can open it. The admin button is render-gated (`isAdmin`) but the module isn't code-split.
- **Fix:** wrap the `AdminSettings` import in `React.lazy`/`Suspense`, mounted only when `isAdmin` (same pattern already used for Sidebar/Dock in `DashboardView.tsx:69-75`). Likely the largest single non-widget bundle win.

### P2 — `tesseract.js` eagerly imported in Webcam widget · **S**

- **File:** `components/widgets/Webcam/Widget.tsx:21` (used only at :186 behind a user OCR action, `ocrMode !== 'gemini'`)
- **Fix:** convert to `const Tesseract = await import('tesseract.js')` inside the handler. Every Webcam user currently pays ~1.7MB unpacked even if they never OCR or always use the Gemini path.

### P3 — Add explicit chunks + a bundle-size regression guard · **S**

- **File:** `vite.config.ts:44-59`
- **Fix:** after P1/P2 land, add explicit `manualChunks` for `recharts` and `tesseract.js`, and a CI bundle-size check (`rollup-plugin-visualizer` or a `chunkSizeWarningLimit` assertion) so a future static import can't silently pull them back into an eager chunk.

### P4 — No client-side image compression on any upload path · **M**

- **File:** `hooks/useStorage.ts` — all nine image uploaders (`uploadBackgroundImage`, `uploadSticker`, `uploadDisplayImage`, `uploadHotspotImage`, `uploadAdminBackground`, `uploadAdminSticker`, `uploadAdminLogo`, `uploadCatalystImage`, `uploadWeatherImage`) call `uploadBytes`/`uploadFile` on the raw `File`.
- **Problem:** a 12MP phone JPEG (5–15MB) uploads verbatim, then re-fetches full-size on every board render (backgrounds especially). Direct Storage egress cost + student-device first-paint latency.
- **Fix:** canvas downscale/re-encode (cap long edge ~2000px, JPEG q~0.82) before upload for background/sticker/hotspot/display paths; skip PDFs/AV.

### P5 — `useBackgrounds` keeps always-on listeners on near-static data · **S**

- **File:** `hooks/useBackgrounds.ts:38-64` — permanent `onSnapshot` (1 admin / 2 non-admin) on `admin_backgrounds` for the modal lifetime, though that collection changes only when an admin edits a preset.
- **Fix:** one-shot `getDocs` on modal open with a manual refresh affordance. Low $ but clean and low-risk.

---

## Tier 4 — Test coverage (highest-risk gaps first)

The nightly `docs/scheduled-tasks/test-coverage.md` tracks utils/functions/widget gaps but has **zero coverage of Firestore-rules tests or E2E** — the two biggest blind spots.

### T1 — 🔒 Rules tests for the student-session PIN collection · **S**

- `sessions/{userId}/students` (`firestore.rules:2815-2830`) has **0** rules tests despite well-covered siblings (`quiz_sessions/responses`). Pairs directly with S5. One focused file following the `plcPresence.test.ts` pattern.

### T2 — 🔒 Rules tests for `short_links` click-increment guard · **S**

- `firestore.rules:667-679` has a bespoke `clicks == resource.data.clicks + 1` + ±300000ms timestamp guard letting anon click-tracking bypass admin-only writes. Easy to loosen accidentally (drop the timestamp bound → replay/spam). No test references `short_links`.

### T3 — 🔒 Rules tests for ungated/quota collections · **M**

- No dedicated tests for `ai_usage` (prefix-range quota trick, `firestore.rules:3574-3582` — off-by-one leaks quota data), `classroom_course_links`, `rollout_requests`, `admin_backgrounds`, `lti_session_memberships`, `nextup_sessions`, `shared_notebooks`, `shared_video_activity_assignments`. Cluster into 2–3 files, quota/PII first.

### T4 — E2E for the core student journeys · **L**

- All 10 `tests/e2e/*.spec.ts` assume an authenticated session. Missing: sign-in/auth landing, **student PIN-join** (the single most-used student flow), and a full **quiz-session** journey (teacher creates → student joins → answers → teacher ends). The quiz hooks have heavy unit coverage but no browser-level journey test. Start with PIN-join (**M**), then quiz-session (**L**).

### T5 — Tests for untracked risk hooks & Cloud Functions · **M**

- 23 untested hooks not covered by the journal's (completed) hooks item — highest-risk: `useStudentIdleTimeout.ts` (auto-logout security boundary) and `useStudentClassDirectory.ts` (roster/PII). Plus 5 untested `functions/src` files: `expireSubShares.ts` (irreversible scheduled delete — test first), `driveArchive.ts`, `embedProxy.ts` (allow-list logic), `syncedQuizGroups.ts`, `syncedVideoActivityGroups.ts`.

---

## Tier 5 — DX / CI / hygiene (small, opportunistic)

### D1 — Add `.nvmrc` pinning Node 24 · **S**

- `package.json` engines `>=24` and `functions/` pinned `24`, CI runs 24, but no `.nvmrc` — local dev silently runs 22 with `Unsupported engine` warnings. Add `.nvmrc` with `24`.

### D2 — Fix README install command drift · **S**

- `README.md:79` says `pnpm install`; the correct command is `pnpm run install:all` (root + `functions/`). Developers following the README fail `type-check:all`/`validate`. Recurring per `docs/routines/debugger.md`.

### D3 — Security-relevant dependency lag · **M** (tracked, worth scheduling)

- `docs/scheduled-tasks/dependency-audit.md` tracks major-version lag; the security-relevant one is functions' `jose` 4.15.9 → 6.2.3 (JWT verification for LTI/student identity). Schedule the jose + `@google/genai` bumps with AI-flow + LTI regression testing before the toolchain (typescript/vite/tailwind) majors.

### E1 — S6: `embedProxy` fail-open default · **S** (low)

- `functions/src/embedProxy.ts:209-217` returns `isEmbeddable: true` on HEAD-probe failure. Not SSRF (blocklist + `maxRedirects:0` hold), but fail-open nudges the UI to embed a frame a stricter check would reject. Return `false`/"unknown" on probe failure.

---

## Tier 6 — Larger product / design work (queued specs — need Paul's decisions)

These are already specced in `docs/specs/` (read each spec's "Open Decisions (Need Paul)" first) or tracked in the backlog. Listed here for roadmap completeness; each is **L** and should not be auto-started.

| Item                                                      | Status                                                        | Spec / source                                                                |
| --------------------------------------------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| H1 — Monitor & Results real redesign (Quiz/VA)            | Open (still the reskin)                                       | `docs/specs/H1-monitor-results-redesign-spec.md`                             |
| H2 — Rostered sign-in join links (4 student widgets)      | Open (TODO at `ActivityWall/Widget.tsx:1809`)                 | `docs/specs/H2-rostered-join-links-spec.md`                                  |
| M12 — Written-response rubrics (Phase 3)                  | Spec only                                                     | `docs/specs/M12-written-response-rubrics-spec.md`                            |
| M13 — Student-landing overhaul                            | Not started                                                   | `docs/specs/M13-student-landing-overhaul-spec.md`                            |
| M16 — PLC Phases 7–8 (MiniApps + Guided Learning sharing) | Zero impl                                                     | `docs/specs/M16-plc-phases-7-8-spec.md`                                      |
| LO12 — 9 new Nexus candidate connections                  | `proposed` (the Nexus system itself is live — 36 connections) | `docs/nexus.md:311-351` / `docs/specs/LO12-nexus-widget-connections-spec.md` |

**Paul-owned ops gates (unchanged, blocked on non-code):** L3 OAuth branding (needs custom domain), L4 legal sign-off, L5 Classroom Add-On Phase 0B, L1 `CLASSROOM_ASSIGN_ADMIN_ONLY` flip.

**Still-open smaller tech-debt (verified unchanged from the 2026-06-23 audit):** LO2 (dual role-resolution, intentional partial), LO8 (`userTier` hardcoded domains), LO9 (Drawing `hostUid` for synced boards), LO11 (link-shortener per-click event log — `LinksPanel` UI now exists, event log doesn't), LO13 (dual-query, blocked on `classIds` backfill), LO14 (DashboardContext churn — now **253** `useDashboard()` call sites, worse than the audit's ~192), LO15 (build hygiene).

---

## H0 — Refresh the stale backlog audit · **S** (do alongside this plan)

`docs/remaining-todos-audit.md` should be updated to move **M1, M2, M4, M5, M6, LO4, LO10** to §5 (already-shipped) with their commit evidence (`6a08458`, `908ed91`, `5721e4c`), mark LO11 partial, and correct LO14's count to 253. Left stale, it will keep sending future runs to re-plan finished work.

---

## Recommended execution order

1. **S1** (mini-app sandbox — client-only, ship immediately; account-takeover class).
2. **One rules PR:** S2 + S3 + S4 + S5 with emulator tests (T1, T2 alongside) — single `firestore:rules` deploy.
3. **C1, C2** (small correctness, high teacher-visible impact).
4. **P1, P2, P3** (mechanical bundle wins + regression guard).
5. **H0 + D1 + D2** (housekeeping; cheap, prevents wasted future effort).
6. Then C3/C4/C5, P4/P5, T3/T4/T5 as scheduled work; Tier 6 only after Paul resolves the open spec decisions.
