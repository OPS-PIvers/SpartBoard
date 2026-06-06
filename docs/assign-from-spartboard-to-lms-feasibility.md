# Feasibility: "Assign to the LMS directly from SpartBoard"

**Status:** Feasibility findings **+ Google Classroom build IMPLEMENTED** (flag-gated, see §8). Schoology unchanged (Option A).
**Date:** 2026-06-05 · **Author:** spike session on `dev-paul`
**Goal being evaluated:** invert today's model so a teacher creates a SpartBoard **quiz** or **video activity (VA)** assignment in Google Classroom and/or Schoology **entirely from SpartBoard's UI** (a single "Assign to Classroom / Schoology" button), while the **student** still sees and launches it **inside the LMS** exactly as today (embedded runner + grade passback).

---

## 0. Verdict (read this first)

| Platform             | Tool-initiated assign feasible?                                    | Confidence | Headline reason                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Recommended action                                                                                                                              |
| -------------------- | ------------------------------------------------------------------ | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **Google Classroom** | ✅ **Yes**                                                         | High       | Google documents a "partner-first" flow: SpartBoard creates the coursework (`courses.courseWork.create`) then attaches its own add-on (`addOnAttachments.create`, **no `addOnToken` needed because SpartBoard owns the coursework**). Reuses ~all existing add-on infra; **unlocks the due-date sync that is impossible today**.                                                                                                                                 | Buildable, bounded — **but gated on a product decision** (see §5) and one operational prerequisite (a new restricted scope).                    |
| **Schoology**        | ⚠️ **Split** — _embedded_ assign **No**, _redirect_ assign **Yes** | High       | You **cannot** create an _embedded_ LTI-launch assignment from any API (Deep Linking is platform-initiated only — confirmed in market by Extempore, which resorts to a redirect). But the Schoology **REST API can create a plain assignment + push grades back** (this is exactly Extempore's "API integration"), which **does** achieve teacher single-pane — at the cost of the embedded student experience + a whole new admin-provisioned REST integration. | Default: keep the LTI picker (Option A). Build the REST/redirect model (Option B) **only if** teacher single-pane outranks embedded student UX. |

> **Correction (added after review):** an earlier draft said "creating an assignment in Schoology is not possible." That was imprecise. Creating a **plain** assignment via REST _is_ possible (Orono's Extempore integration proves it). What's impossible is creating an **embedded LTI-launch** assignment via API. See §4 for the corrected, fuller picture.

**The cruel irony:** the _bigger_ audience (most secondary teachers use Schoology) only gets the _worse_ (redirect) model or no change; the platform with the _clean_ tool-initiated path (Classroom) has the _smaller_ audience (~7–10 teachers + grades 3–5). Weigh ROI accordingly (§5, §6).

---

## 1. The two make-or-break questions, answered

The handoff framed two crux questions. Targeted research against the official Google and Schoology developer docs resolved both with high confidence.

### 1a. Google Classroom — "Can SpartBoard create the coursework, and does that unlock due-date sync?" → **YES to both.**

Google explicitly supports **"partner-first" (a.k.a. third-party-first / SaaS-initiated) attachment creation**. From the official guide _Create attachments outside of Google Classroom_:

- Eligible teacher path: **(a)** `courses.courseWork.create` an assignment, then **(b)** `courses.courseWork.addOnAttachments.create` an add-on attachment on it.
- On the `addOnAttachments.create` reference, the `addOnToken` query param is _"Optional… required for in-Classroom attachment creation but optional for partner-first attachment creation,"_ and only errors _"if not provided for partner-first attachment creation **and the developer projects that created the attachment and its parent stream item do not match.**"_
- Because SpartBoard's own project creates the parent coursework, **the projects match → no `addOnToken` is required.** This is precisely the iframe-launch token we _don't_ have outside Classroom, and the docs confirm we don't need it.

**Due-date unlock:** today's code declines to sync the due date for a documented reason — `functions/src/classroomAddonAuth.ts:885`:

> _"The due date is intentionally NOT synced here. An add-on cannot set the parent assignment's due date — Google restricts `courses.courseWork.patch` to the developer project that CREATED the coursework, and add-on attachments live under coursework the teacher created in Classroom's own composer (→ PERMISSION_DENIED)."_

In the partner-first model **SpartBoard IS the creating project**, so it sets `dueDate`/`dueTime` at create time and may `patch` it later. The exact blocker the codebase documents is dissolved by inverting who creates the coursework. (Confirm live in Spike A — see §3.)

### 1b. Schoology — split answer: _embedded_ assign = **NO**, _redirect_ assign = **YES**

**You cannot create an _embedded_ LTI-launch assignment from any API.** Three confirmations:

1. **Deep Linking is platform-initiated only.** _developers.schoology.com → App Platform → LTI Apps:_ _"Schoology only generates Deep Linking Launches from the 'Add Materials' dropdown in a Course."_ There is **no documented API** for a tool to insert an LTI launch into a section from outside Schoology.
2. **The REST `assignments` endpoint can't make an LTI launch.** `POST /v1/sections/{section_id}/assignments` accepts `title`, `description`, `due`, `max_points`, `grading_category`, `allow_dropbox`, `assignees`… — **no field for an external tool, LTI URL, tool provider, or launch.** `type` (`assignment`/`discussion`/`assessment`) is **read-only**. A REST-created assignment is a plain gradebook column + dropbox.
3. **Market proof.** Orono's own **Extempore** integration is the tell: Extempore is a serious EdTech vendor with a Schoology integration, and _even they_ create only a **redirect** — a plain assignment shell whose description says "log into Extempore" plus a URL. If an embedded launch were creatable via API, Extempore would do it. (Tellingly, Extempore ships _two_ Schoology integrations — an API/redirect one **and** a separate LTI 1.3 one — precisely because neither model does everything.)

**But a _plain_ assignment + grade passback via REST is absolutely possible** — this is what I got wrong in the first draft, and what Extempore's "API integration" actually does:

- **Create:** `POST /v1/sections/{section_id}/assignments` (plain assignment: title, `max_points`, `due`, description with a SpartBoard link). Confirmed against the REST docs; confirmed in market by Extempore.
- **Grade back:** `PUT /v1/sections/{section_id}/grades` with `enrollment_id` + `assignment_id` + `grade` (+ optional `comment`). This is a REST grade push — **independent of LTI AGS** — so grade passback survives even without an LTI launch.
- **Auth:** Schoology REST is **OAuth 1.0a**; two-legged uses an admin-issued consumer key (acts at the admin's level across sections). This is a _separate_ integration from SpartBoard's LTI 1.3 (OAuth2/JWT) — SpartBoard has **zero** Schoology REST code today.

**The unavoidable trade:** a REST-created item is a plain assignment/link, so the **student leaves Schoology** to do the quiz in SpartBoard (redirect), authenticating to SpartBoard directly (SSO/join code) instead of via an embedded LTI launch. You gain teacher single-pane; you lose the embedded student experience. **You cannot have both on Schoology** — that's the fundamental constraint, and it's why even Extempore ships both models. Details + effort in §4.

> **Note on AGS:** LTI Advantage AGS lets a tool create a gradebook **line item** (a column) via the AGS REST surface — but a bare line item is **not student-launchable**. It's a dead end for _creating an assignment_; the REST `grades` endpoint above is the viable grade-back path for the redirect model.

---

## 2. What we'd reuse vs. build — Google Classroom

The current add-on is **student-initiated** (student launches from Classroom; teacher attaches in the GC composer). Inverting to **teacher-initiated** reuses most of the stack. Citations are to current code verified this session.

### Already built — reuse as-is

| Capability                                                                                                               | Where                                                                                                                                                                                                                                                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Teacher Google token w/ scope popup                                                                                      | `components/classroomAddon/gisOAuth.ts` — `ensureGis()`, `requestAccessToken(scope, loginHint)`                                                                                                                                                                                                                            |
| Add-on **attachment create** call (builds the `teacherViewUri`/`studentViewUri`/`studentWorkReviewUri`/`maxPoints` body) | `functions/src/classroomAddonAuth.ts` — `classroomAddonNet.createAttachment()`                                                                                                                                                                                                                                             |
| Teacher-of-course verification                                                                                           | `verifyTeacherOfCourse()` → `GET /v1/courses/{id}/teachers/me`                                                                                                                                                                                                                                                             |
| Course → roster link (targeting + grade-push auth gate)                                                                  | `classroom_course_links/{courseId}` via `linkClassroomCourse`; "Link to Google Classroom" UI in `components/layout/sidebar/SidebarClasses.tsx`                                                                                                                                                                             |
| **Teacher-initiated grade passback** (the whole thing)                                                                   | CF `pushClassroomGradesForAssignment`; `resolveSubmissionId` + `patchStudentSubmissionGrade` (PATCHes `…/addOnAttachments/{attachmentId}/studentSubmissions/{submissionId}?updateMask=pointsEarned`); client `utils/classroomGradePush.ts` + `utils/runClassroomGradePush.ts`; buttons already in QuizResults / VA Results |
| Student handshake → `studentRole` token, `classIds:["classroom:<courseId>"]`, embedded runner                            | `classroomAddonLoginV1`; `components/classroomAddon/StudentSpikeRoute.tsx` (mounts `QuizStudentApp` / VA)                                                                                                                                                                                                                  |
| Course picker against `courses.list`                                                                                     | already used by `SidebarClasses.tsx` (`classroom.courses.readonly`)                                                                                                                                                                                                                                                        |
| Assignment data model (`dueAt`, `classroomAttachment` on session + assignment)                                           | `types.ts` (`QuizAssignmentSettings.dueAt`, `VideoActivitySessionOptions.dueAt`, `ClassroomAttachmentLink`); `hooks/useQuizAssignments.ts` / `useVideoActivityAssignments.ts` `createAssignment`                                                                                                                           |

Because the grade-push path PATCHes the **add-on attachment's** student submissions (not coursework-level submissions), and a partner-created coursework still carries an add-on attachment with `maxPoints`, **grade passback works unchanged.** This is the single biggest reuse win.

### Net-new work

1. **New OAuth scope: `classroom.coursework.students`** (restricted) — required to `courses.courseWork.create`/`.patch`. Added to the teacher token request alongside the existing `classroom.addons.teacher`.
   - ⚠️ **Operational prerequisite (do not skip): declare this scope on the Google Workspace Marketplace listing _before_ shipping.** Adding an undeclared restricted scope is exactly what caused the org-wide _"Account Restricted"_ sign-in outage documented in `knowledge_oauth_marketplace_scope_block` — the listing governs trust, so fresh grants for an undeclared scope are denied org-wide while cached tokens keep working (the "fine at 8am, broken by afternoon" pattern). Update the listing's declared scopes (and/or keep the prod client Trusted in API Controls). Internal consent screen exempts **verification/CASA**, **not** the Marketplace scope-coverage gate.
2. **Eligibility check + graceful fallback.** Call `userProfiles.checkUserCapability` for `CREATE_ADD_ON_ATTACHMENT`. Eligible → create coursework + add-on attachment (embedded launch, grade passback). Ineligible → create coursework with **Link Material** (plain SpartBoard URL; no embedded add-on grade passback). For Orono this fallback rarely fires (see §5 license note), but it keeps the button from hard-failing.
3. **New CF (or extend `createClassroomAttachment`)** to, in one server call: `POST /v1/courses/{courseId}/courseWork` (`title`, `description`, `workType:"ASSIGNMENT"`, `state:"PUBLISHED"`, `maxPoints`, `dueDate`+`dueTime`, optional `assigneeMode`) → then `addOnAttachments.create` on the returned `courseWork.id` (partner-first, no token) → persist `classroomAttachment` linkage on the session + assignment (as the attach flow already does) → return ids.
4. **Dashboard entry point:** an "Assign to Google Classroom" action in the quiz/VA assign UI → course picker (reuse `courses.list`) → due date (already collected) → confirm. This is the only genuinely new UI; it can borrow the `AddonShell` kit and the existing `TeacherDiscoveryRoute` picker logic.
5. **Due date:** set `dueDate`/`dueTime` at create; optionally `patch` on later edit (now permitted). The picker already collects `dueAt`.

**Effort:** moderate / bounded. The hard parts (OAuth, attachment create, grade passback, student handshake, identity bridge) already exist and are battle-tested. New surface is one `courseWork.create` call, an eligibility check, a course-picker entry point, and the scope/Marketplace ops.

---

## 3. Suggested Spike A (Google Classroom) — verify-before-build

Small, throwaway, on a test course (mirror the original add-on de-risk approach):

1. With a test teacher who has the **Teaching & Learning / Education Plus** license, `checkUserCapability(CREATE_ADD_ON_ATTACHMENT)` → eligible.
2. `courses.courseWork.create` an assignment with `dueDate`/`dueTime` + `maxPoints`. **Confirm the due date appears in Classroom and is `patch`-able** (the headline unlock).
3. `addOnAttachments.create` on it **without `addOnToken`** (point `studentViewUri` at the existing student route + `?code=`/`?sessionId=`). Confirm the attachment renders and a test student launches the real runner.
4. Run the **existing** `pushClassroomGradesForAssignment` against it. Confirm a DRAFT grade lands and rolls up correctly on partner-created coursework.
5. Confirm behavior for an **ineligible** teacher (capability check → Link Material fallback creates the assignment as a link).

If 1–4 pass, the build is a thin wrapper around proven parts. **Test must run against prod** (LTI/add-on launches don't reach dev preview — `TOOL_ORIGIN` is hardcoded to prod), so gate UI behind a flag and stage the scope/Marketplace change first.

---

## 4. Schoology — the two feasible models and the trade between them

There are exactly **two** workable shapes (you cannot combine them — embedded XOR teacher-single-pane):

### Option A — keep today's LTI Deep-Linking picker _(status quo, recommended default)_

`components/lti/LtiDeepLinkPicker.tsx` + `functions/src/lti/`, shipped and working (PRs #1867/#1868).

- ✅ **Embedded** student experience (student never leaves Schoology), server-minted `studentRole` token, AGS grade passback, due-date sync.
- ❌ Teacher must **start in Schoology** ("Add Materials → SpartBoard"). Not single-pane.

### Option B — Extempore-style REST/redirect _(achieves single-pane; sacrifices embedded)_

Teacher clicks "Assign to Schoology" **in SpartBoard** → SpartBoard REST-creates a plain assignment in the chosen section (description carries a SpartBoard launch link + `max_points` + `due`) → student opens it from Schoology, **redirects to SpartBoard** to take it → teacher reviews in SpartBoard → SpartBoard REST-pushes grades back to the assignment.

- ✅ **Teacher single-pane** (the actual stated goal) and grade passback both work.
- ❌ **Student redirects out of Schoology** (the thing Paul said he doesn't want).
- **What it costs to build (all net-new — SpartBoard has zero Schoology REST today):**
  1. **A Schoology admin must issue a REST API consumer key/secret** (OAuth 1.0a, two-legged, from the admin _Integration_ menu) with roster-read + assignment-write + grade-write. This is a **bigger, district-admin trust grant** than the per-teacher LTI app, and SpartBoard would hold a powerful key. (Per-teacher 3-legged keys are an alternative but mean clunky per-teacher key entry, and many districts restrict key generation to admins.) _Aside:_ SpartBoard's installed LTI app already surfaces an "OAuth Consumer Key/Secret" — its actual cross-section write scope is unverified and would need checking before assuming it suffices.
  2. **OAuth 1.0a request signing** in functions (SpartBoard's LTI stack is OAuth2/JWT — no OAuth1 today).
  3. **Section + enrollment mapping:** resolve the teacher's SpartBoard class → Schoology `section_id`, and each SpartBoard student → Schoology `enrollment_id` (via email) for grade push — a new roster-read path (reading Schoology enrollments via REST; PII resolved on read, not persisted).
  4. **Student identity on redirect:** since there's no LTI launch, the student authenticates to SpartBoard directly. For Orono this can be **cleaner than Extempore's "log into X"** — the link carries a join code and students Google-SSO automatically (Orono students have Google accounts), landing full-screen in the runner.

**Honest read:** Option B's headline gain (teacher single-pane) costs exactly the thing Paul said he values (the embedded student experience), and buys a sizeable new admin-provisioned OAuth1 integration on top. For the larger Schoology audience that's a poor trade _unless_ teacher single-pane is reprioritized above embedded student UX. **Recommendation: stay on Option A** unless that reprioritization happens — in which case Option B is genuinely buildable (medium-large effort), and the SSO-join redirect above is the way to make it least painful.

**Dead ends (for completeness):** an AGS line item alone (column, not launchable); a Document/Web-Content/SCORM material (not an LTI launch); browser-automating "Add Materials" (unsupported/ToS). None of these change the A-vs-B picture.

---

## 5. The decision this actually surfaces (please read before approving a build)

This idea revives a direction the team **previously analyzed and deferred**, recorded in `project_classroom_grade_passback`:

> _"The 'SpartBoard-first auto-post to Classroom' / two-way-street idea was analyzed and **deferred**… Keep honoring the docs' \*\*'do NOT add `classroom.coursework._`'\*_ — Paul wants to discuss before any coursework-create scope is added."_

The Google Classroom build in §2 **is** that decision: it requires adding `classroom.coursework.students`. So this is the discuss-first moment. Inputs for the call:

- **Benefit:** true single-pane teacher UX **and** the due-date sync that is otherwise impossible on Classroom (the one thing today's add-on cannot do).
- **Cost / risk:**
  - A **new restricted scope** + a **Marketplace listing update** that, if mishandled, reproduces a prior org-wide outage (`knowledge_oauth_marketplace_scope_block`). This is the same scope-coverage gate that already bit production once.
  - **Per-teacher license dependency** (Teaching & Learning / Education Plus). _This is not a new barrier_ — Classroom add-ons already require it, and the existing SpartBoard add-on works live, so current GC-using teachers already have it. Still worth confirming coverage across the GC cohort (incl. grades 3–5 teachers), since unlicensed teachers silently fall back to a plain link.
  - **Audience:** small (~7–10 teachers + grades 3–5). The majority (Schoology) gets nothing from this work.
- **Honors existing constraints:** teacher-initiated grade push (not fire-on-completion); correctness-based grades; PII-free identity (HMAC pseudonyms, names resolved on read); cost-conscious (no new always-on Firestore listeners — assign is a one-shot CF call).

---

## 6. Recommended next steps

1. **Decision (Paul):** is the due-date unlock + single-pane worth adding `classroom.coursework.students` and updating the Marketplace listing, for the Classroom-only audience? (§5.)
2. **If yes →** run **Spike A** (§3) on a test course to confirm partner-first create + due-date patch + grade roll-up, _after_ staging the scope/Marketplace change. Then build the thin wrapper + dashboard entry point behind a flag; ship via `dev-paul → main` (regular merge, CI deploys).
3. **Schoology — DECIDED 2026-06-05: Option A (keep the current LTI picker). No REST/redirect build.** Paul prioritized the embedded student experience over teacher single-pane. Option B (Extempore-style REST/redirect) is documented above and confirmed feasible, but **parked** — revisit only if teachers specifically ask to start the assign in SpartBoard and accept students redirecting out. If ever revived, scope a Spike B: get a Schoology admin REST key, confirm `POST /sections/{id}/assignments` + `PUT /sections/{id}/grades` round-trip on a test section, prototype the SSO-join redirect.

---

## 7. Implementation status (Google Classroom — built 2026-06-05, flag-gated)

The §2/§3 Google Classroom partner-first build is **implemented on `dev-paul`**, gated behind `CLASSROOM_ASSIGN_ENABLED` (`config/constants.ts`, ships **OFF**). Schoology is untouched (Option A stands — no `functions/src/lti/*` or LTI-picker changes).

**What shipped:**

- **Server** (`functions/src/classroomAddonAuth.ts`, additive): new callable **`assignToClassroomV1`** + net helpers `checkUserCapability`, `createCourseWork`, `patchCourseWorkMaterials`; `createAttachment` now takes an optional token (partner-first passes `null`). Exported in `functions/src/index.ts`. The shared `buildRunnerContentQuery` is extracted so `createClassroomAttachment` and the new CF mint **identical** student-launch URIs (behavior-preserving refactor; existing tests green). Pure `dueAtToClassroomDue` emits the chosen UTC date at **23:59 UTC** (end-of-day in Central, no day-early roll).
- **Flow:** owns-session gate (`{quiz|video_activity}_sessions/{id}.teacherUid === auth.uid`) → teaches-course gate (`verifyTeacherOfCourse`, fail-closed) → `checkUserCapability(CREATE_ADD_ON_ATTACHMENT)` → `courseWork.create` (PUBLISHED, ALL_STUDENTS, maxPoints, **dueDate/dueTime**) → eligible: `addOnAttachments.create` **with no `addOnToken`**; ineligible (or attachment failure): **Link-Material** fallback → ensures `classroom_course_links/{courseId}.teacherUid` so the existing grade-push CF authorizes the teacher. **Grade passback reuses `pushClassroomGradesForAssignment` unchanged.**
- **Client:** `requestClassroomAssignToken` (adds the `classroom.coursework.students` scope), `utils/classroomCourses.ts` (`listTeacherCourses`), `utils/assignToClassroom.ts` (callable + linkage persist — session-doc first, mirroring TeacherDiscoveryRoute), `components/classroomAddon/AssignToClassroomModal.tsx` (course picker + due date), and flag-gated "Assign to Google Classroom" kebab actions in the Quiz + Video-Activity managers.
- **Tests:** `assignToClassroomV1` branch coverage (eligible/ineligible/safety-net/both gates/no-hijack/URL shapes) + `dueAtToClassroomDue` + the partner-first net URLs in `classroomAddonAuth.test.ts`; client linkage helpers in `tests/utils/assignToClassroom.test.ts`. Full type-check, lint (`--max-warnings 0`), and format pass; existing add-on + manager-assign suites green.

**Before flipping `CLASSROOM_ASSIGN_ENABLED` to `true` (operational, NOT code — Paul's action):**

1. **Declare `classroom.coursework.students` on the Workspace Marketplace listing** (and keep the prod OAuth client Trusted in Admin → API Controls) **first** — an undeclared restricted scope reproduces the org-wide "Account Restricted" outage (`knowledge_oauth_marketplace_scope_block`). The flag-OFF default means the scope is never requested until this is staged.
2. **Run Spike A (§3) on prod** (add-on launches don't reach dev preview): verify partner-first create + due-date patch + add-on attachment (no token) + grade roll-up on a test course, incl. the ineligible Link-Material fallback.
3. Flip the flag in a deliberate `dev-paul → main` merge (regular merge commit; CI deploys functions + hosting).

## 8. Sources

**Google Classroom (official):**

- [Create attachments outside of Google Classroom (partner-first journey)](https://developers.google.com/classroom/add-ons/developer-guides/third-party-first-journey) — the eligible/ineligible flow, `checkUserCapability(CREATE_ADD_ON_ATTACHMENT)`, "An add-on token is not required if creating an attachment on an assignment that you created," license requirement verbatim.
- [Method: courses.courseWork.addOnAttachments.create](https://developers.google.com/workspace/classroom/reference/rest/v1/courses.courseWork.addOnAttachments/create) — `addOnToken` optional for partner-first when creating projects match.
- [Interact with attachments](https://developers.google.com/classroom/add-ons/developer-guides/attachment-interactions) · [Add-on requirements](https://developers.google.com/workspace/classroom/add-ons/requirements)

**Schoology (official):**

- [LTI Apps (App Platform)](https://developers.schoology.com/app-platform/lti-apps/) — "Schoology only generates Deep Linking Launches from the 'Add Materials' dropdown in a Course"; Deep Linking is platform-initiated.
- [REST API: Assignment](https://developers.schoology.com/api-documentation/rest-api-v1/assignment/) — fields; `type` read-only; no external-tool/LTI fields.
- [REST API v1 index](https://developers.schoology.com/api-documentation/rest-api-v1/) — resource catalog (no LTI/external-tool creator).
- [Course materials: external tools (PowerSchool)](https://uc.powerschool-docs.com/en/schoology/latest/course-materials-external-tools) — external tools are LTI launches added via the UI; grading is opt-in.
- [REST API: Grade](https://developers.schoology.com/api-documentation/rest-api-v1/grade/) — `PUT /sections/{id}/grades` (`enrollment_id`, `assignment_id`, `grade`) → the REST grade-push path for Option B.
- [REST API: Authentication](https://developers.schoology.com/api-documentation/authentication/) — OAuth 1.0a; two-legged consumer key from the admin _Integration_ menu.

**Extempore (the redirect-model precedent Paul cited):**

- [Admin: Integrating Schoology with Extempore](https://help.extemporeapp.com/en/articles/5669326-admin-integrating-schoology-with-extempore) + [LMS Integrations (API)](https://help.extemporeapp.com/en/articles/6555830-lms-integrations-api) — API integration: admin setup, auto-rosters, assignment sync + grade sync (the redirect model).
- [LTI 1.3 – Connecting Extempore Assessments to your LMS](https://help.extemporeapp.com/en/articles/8680233-lti-1-3-connecting-extempore-assessments-to-your-lms) — Extempore's _separate_ LTI 1.3 integration (proof both models coexist because neither does everything).

**Internal (verified this session):**

- `functions/src/classroomAddonAuth.ts:885` (due-date / `courses.courseWork.patch` restriction comment) · `classroomAddonNet.createAttachment` / `pushClassroomGradesForAssignment`
- `components/classroomAddon/gisOAuth.ts:109` (current `classroom.addons.teacher` scope; `classroom.coursework.students` absent)
- `functions/src/lti/deepLink.ts`, `ags.ts`, `launchEndpoints.ts`, `config.ts` (LTI is 100% Deep-Linking; no Schoology REST integration exists)
- Memory: `knowledge_lti_classroom_parity`, `knowledge_oauth_marketplace_scope_block`, `project_classroom_grade_passback`, `project_spartboard_orono_only_tenancy`, `project_schoology_lti_app`
