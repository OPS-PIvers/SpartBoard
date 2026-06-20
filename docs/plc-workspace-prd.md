# PLC Collaborative Workspace — PRD

> **One-line goal:** Turn **My PLC** from a content-distribution-and-aggregation tool into an opinionated, professional-grade **collaborative workspace for teacher teams**, built around the real PLC ritual — _plan a common assessment → each teacher runs it → review the pooled data together → decide reteach/intervention_ — with the **live PLC meeting** as the hero moment.

- **Status:** Draft for implementation
- **Author:** Paul Ivers (decisions) + Claude (spec)
- **Date:** 2026-06-19
- **Branch convention:** `dev-paul-plc-workspace` off `dev-paul`; one PR per wave into `dev-paul` (never squash `dev-paul`→`main`).
- **Validate with:** `pnpm run validate` (type-check:all + lint `--max-warnings 0` + format:check + root & functions tests). Rules: `pnpm run test:rules`.

---

## 0. Context — what already exists (read before implementing)

This PRD is the **next evolution**, not a from-scratch build. A prior redesign already shipped (see [`docs/superpowers/plans/2026-05-20-plc-collaborative-redesign.md`](superpowers/plans/2026-05-20-plc-collaborative-redesign.md) and [`docs/PLC_ROADMAP.md`](PLC_ROADMAP.md)). **Do not re-litigate or rebuild what's live:**

**Already shipped (the baseline this PRD builds on):**

- **Left-rail dashboard shell** — [`components/plc/PlcDashboard.tsx`](../components/plc/PlcDashboard.tsx) (a `fixed inset-0 z-modal` overlay), [`components/plc/PlcDashboardRail.tsx`](../components/plc/PlcDashboardRail.tsx), single source of truth nav in [`components/plc/sections.ts`](../components/plc/sections.ts). Current sections: **Home · Quizzes · Video Activities · Shared Data · Docs · To-Dos · Shared Boards · Members · Resources · Settings**.
- **In-PLC authoring already exists** — [`components/plc/authoring/PlcAuthorQuizModal.tsx`](../components/plc/authoring/PlcAuthorQuizModal.tsx), `PlcAuthorVideoActivityModal.tsx`, [`components/plc/assignments/PlcAssignmentConfigModal.tsx`](../components/plc/assignments/PlcAssignmentConfigModal.tsx), wired via `PlcNewQuizAssignmentModal` / `PlcNewVideoActivityAssignmentModal`. Teachers **can** author + assign a quiz/VA inside the PLC today. The gap is only that the **Home QuickCreateBar buttons navigate instead of opening these modals**, and creation isn't framed as "the team's common assessment."
- **Sharing/sync spine** — pointer-doc + canonical-content split: `plcs/{id}/quizzes` & `video_activities` are headers pointing at `synced_quizzes/{groupId}` / `synced_video_activities/{groupId}` (with `participants` map + monotonic `version`). Import = sync (live-linked, manual pull) or copy (frozen fork). Three sync-join Cloud Functions: `plcQuizSyncJoin`, `plcAssignmentSyncJoin`, `plcVideoActivitySyncJoin`.
- **Filterable Shared Data** — [`components/plc/sharedData/PlcSharedDataBody.tsx`](../components/plc/sharedData/PlcSharedDataBody.tsx) aggregates `PlcContribution` docs **client-side**.
- **Native multi-note editor (BUILT BUT UNWIRED)** — [`components/plc/bodies/NotesBody.tsx`](../components/plc/bodies/NotesBody.tsx) + [`hooks/usePlcNotes.ts`](../hooks/usePlcNotes.ts) are a complete two-pane shared notebook (debounced patch-saves, teammate reconciliation, full i18n, rules exist for `plcs/{id}/notes`). The live "Docs" section uses the **Google-embed** [`PlcDocsBody.tsx`](../components/plc/docs/PlcDocsBody.tsx) instead. `PlcNotesTab.tsx` is a thin shim over `NotesBody`. **We will wire `NotesBody` up** (see Wave 2).
- **Google-Docs embed** — Docs section, gated by the `notes` feature flag.
- **Admin push** — [`components/admin/PlcResourcesManager/`](../components/admin/PlcResourcesManager/) → `plc_resources` → PLC Resources inbox.
- **Strong Firestore rules** — uniform membership gate, `keys().hasOnly()` schema lock-down, attribution immutability, anti-phish URL pins, deterministic invite ids, `isAcceptingPlcInvite()` / `isLeavingPlc()` helpers (`firestore.rules` ~L1455–2186).
- **i18n** — 254 PLC keys fully translated across `en/de/es/fr`.

**What this PRD adds (the gap):** real-time collaboration (**presence, activity feed, notifications, comments, optimistic concurrency**), the **live meeting + Common Assessment hero**, a **proper members/roles model + routing**, a **PII-safe server-side analytics pipeline**, **soft-delete/trash, version history, sync hardening**, and the **infra/migration** to support it.

---

## 1. The decision record (locked)

Every decision below was explicitly confirmed with the stakeholder. They are the contract for this build.

| #                        | Decision          | Locked answer                                                                                                                                                                       |
| ------------------------ | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------ | ---------------------------- |
| **Framing**              |                   |                                                                                                                                                                                     |
| 0.1                      | Core identity     | **Opinionated teacher-team hub** around the PLC ritual (not a generic Notion/Slack).                                                                                                |
| 0.2                      | Hero moment       | **The live PLC meeting** (projected, whole team in a room). Async sharing is the substrate.                                                                                         |
| 0.3                      | Addressing        | **First-class route `/plc/:id/:section`** via `App.tsx`'s existing manual pathname routing.                                                                                         |
| **Foundation**           |                   |                                                                                                                                                                                     |
| 1.1                      | Tenancy           | Add **optional `orgId` / `buildingId`** to the PLC root; keep PLCs top-level.                                                                                                       |
| 1.2                      | Roles             | Replace parallel arrays with a **`members` map** `{uid → {role, email, displayName, joinedAt, status}}`, roles `lead                                                                | coLead | member | viewer`; add `transferLead`. |
| 1.3                      | Time              | **`serverTimestamp()` on all PLC writes.**                                                                                                                                          |
| 1.4                      | Data layer        | A **`PlcProvider` context + selectors** (mirrors the repo's `canvas-store` / `useDashboardActions` selector pattern).                                                               |
| **Collaboration core**   |                   |                                                                                                                                                                                     |
| 2.1                      | Presence          | **Coarse per-section** ("who's here + which section"), Firestore heartbeat + TTL (no RTDB — forced long-polling).                                                                   |
| 2.2                      | Activity          | **Minimal materialized** `/plcs/{id}/activity` append-only log.                                                                                                                     |
| 2.3                      | Notifications     | **In-app unread badges now**; opt-in weekly email digest later. No per-event spam.                                                                                                  |
| 2.4                      | Concurrency       | **Optimistic version precondition → conflict toast → reload** (reuse `SyncedQuizVersionConflictError`). No CRDT.                                                                    |
| 2.5                      | Docs              | **Native structured meeting-notes** (wire up `NotesBody`) **and** keep Google-Doc embed.                                                                                            |
| 2.5b                     | Notes shape       | **Structured meeting notes**: agenda → decisions → action items; action items become to-dos (assignee/due) and can link a Data card.                                                |
| 2.6                      | Comments          | **Scoped comments + @mentions**, starting on **Shared Data result cards**, then assessments/notes.                                                                                  |
| **Safety & permissions** |                   |                                                                                                                                                                                     |
| 3.1                      | Ownership         | Keep **PLC-owned** + **soft-delete with undo / Trash / restore**, logged to activity.                                                                                               |
| 3.2                      | Viewer role       | Add a minimal **read-only `viewer`** role.                                                                                                                                          |
| 3.3                      | Student PII       | **Anonymized by default** — members see aggregates only; the owning teacher always sees their own named roster; opt-in to expose named rows.                                        |
| 3.4                      | Admin recovery    | Site admins can **reassign lead / dissolve** within their org.                                                                                                                      |
| **Hero & surface**       |                   |                                                                                                                                                                                     |
| 4.0                      | Meeting Mode      | **Distinct guided, projector-optimized `/plc/:id/meeting` surface.**                                                                                                                |
| 4.0b                     | Meeting records   | Each session saves an **archived, exportable meeting record**.                                                                                                                      |
| 4.0c                     | Common Assessment | New **first-class object**; team designates it; results aggregate to one canonical id (kills heuristic title-matching); tracks "who's run it."                                      |
| 4.1                      | Home              | **Calm activity-driven digest** (since-you-were-here, who's here, common-assessment status, Start/Resume meeting, your action items). No bento. Fix QuickCreate to actually create. |
| 4.2                      | Authoring         | **Create-in-PLC** (one step). _Mostly wiring — the modals already exist._                                                                                                           |
| 4.3                      | Search            | **Per-PLC search** now; ⌘K palette later.                                                                                                                                           |
| 4.4                      | Cleanup           | Wire/delete dead seams, remove `PlcPlaceholderTab`, collapse tab/body shims, converge dual quiz/assignment collections.                                                             |
| 4.5                      | New IA            | **Loop-ordered rail:** Home · Meeting · Assessments (quizzes + video activities unified) · Data · Notes & Docs · To-Dos · Boards · Members · Resources · Settings (Trash inside).   |
| **Sync depth**           |                   |                                                                                                                                                                                     |
| 5.1                      | Version history   | **Lightweight bounded snapshots + restore.**                                                                                                                                        |
| 5.2                      | Pull model        | **Auto-pull when local has no edits; prompt on conflict.**                                                                                                                          |
| 5.3                      | Orphan GC         | **`detachSyncLinkage` API + scheduled cleanup function.**                                                                                                                           |
| **Infra & delivery**     |                   |                                                                                                                                                                                     |
| 6.0                      | Analytics arch    | **Server-side pre-aggregation** → anonymized summary docs members read; raw named responses readable only by owner. (Solves PII + cost + Meeting-Mode speed together.)              |
| 6.1                      | Migration         | **One-time Cloud Function** (arrays→members map, infer `orgId` from domains, backfill aggregates) + **dual-shape back-compat reads** during rollout.                                |
| 6.2                      | Scope             | **Full target, sequenced into dependency-correct waves**, each independently shippable/verifiable.                                                                                  |
| 6.3                      | Quality           | **Wave 0 test safety-net before rewriting**; hard NFRs (i18n in 4 locales, rules + rules-tests for every new shape, `validate` green per wave).                                     |

---

## 2. Target architecture

### 2.1 Routing — make the PLC a destination (Decision 0.3)

`App.tsx` already does manual pathname routing (no react-router). Add a `/plc` branch:

- `/plc` → PLC index hub (your PLCs + "PLCs in my building" directory).
- `/plc/:plcId` → PLC dashboard (defaults to `home`).
- `/plc/:plcId/:section` → a specific section (`home | meeting | assessments | data | notes | todos | boards | members | resources | settings`).
- `/plc/:plcId/meeting` and `/plc/:plcId/meeting/:meetingId` → Meeting Mode (live / specific record).

Implementation:

- Keep `PlcDashboard` mounting inside the teacher app shell, but drive `activeSection` from the pathname and push history on section change (`history.pushState`) so back/forward and refresh work. The current `useState<PlcSectionId>('home')` becomes pathname-derived.
- Keep the sidebar [`SidebarPlcs`](../components/layout/sidebar/SidebarPlcs.tsx) launcher; clicking a PLC navigates to `/plc/:id` rather than setting overlay state.
- Deep links must be **shareable** ("send the team this exact view") — this is the foundation for the meeting hero (paste a link, everyone lands on the same data view).

### 2.2 Data layer — `PlcProvider` + selectors (Decision 1.4)

Create `context/PlcContext.tsx` + `context/usePlc*.ts` selector hooks, mirroring the repo's recent `canvas-store` / `useDashboardActions` migration (see commits #2015, #2008, #2004). A single provider mounted at the PLC route subscribes **once** to the PLC root, members, presence, activity, todos, notes, docs, assessments, aggregates — and fans out via cheap selectors. This:

- **Dedupes listeners** (today per-component hooks create duplicate `onSnapshot` subscriptions when a subcollection renders in multiple surfaces).
- Gives **presence + activity** a single home.
- **Standardizes error contracts** (today `usePlcContributions` returns `string`, others `Error`; some hooks skip the auth guard).
- Enforces the **"only the active section's heavy data mounts"** rule (presence/activity/members always on; contributions/aggregates lazy per section).

Migrate the existing `usePlc*` hooks to read from the provider (keep their public shapes where possible to limit churn).

---

## 3. Data model changes

> **Storage rule (locked, do not violate):** PLC-owned content stays in **subcollections under `plcs/{plcId}/...`** (automatically gated by the parent membership check — no per-doc `plcId` + extra `get()`). New top-level collections only when cross-PLC reads demand it (`plc_resources` precedent).

### 3.1 Members map + roles (Decision 1.2)

Replace `Plc.memberUids: string[]` + `memberEmails: Record<string,string>` with a rich map, **plus keep a denormalized `memberUids` index** (Firestore can't `array-contains`-query a map, and [`usePlcs`](../hooks/usePlcs.ts) lists PLCs via `where('memberUids','array-contains',uid)`).

```ts
// types.ts
export type PlcRole = 'lead' | 'coLead' | 'member' | 'viewer';

export interface PlcMember {
  uid: string;
  email: string; // lowercased
  displayName: string;
  role: PlcRole;
  joinedAt: number; // ms (resolved from serverTimestamp on read)
  status: 'active' | 'removed';
}

export interface Plc {
  id: string;
  name: string;
  orgId?: string | null; // NEW (Decision 1.1) — inferred from member domains
  buildingId?: string | null; // NEW (optional)
  members: Record<string, PlcMember>; // NEW canonical membership
  memberUids: string[]; // KEEP — denormalized index for array-contains list query
  // leadUid: REMOVED as source of truth → derived from members where role==='lead'
  //          (keep a denormalized leadUid for back-compat reads during rollout)
  leadUid: string; // denormalized convenience mirror of the lead member
  sharedSheetUrl?: string | null;
  features?: PlcFeatureSettings;
  createdAt: number; // serverTimestamp
  updatedAt: number; // serverTimestamp
}
```

- **Helpers:** `getPlcMembers(plc): PlcMember[]`, `getPlcRole(plc, uid): PlcRole | null`, `isPlcLeadOrCoLead(plc, uid)`, `canEditPlcContent(plc, uid)` (`role !== 'viewer'`). Keep `getPlcMemberEmails` / `getPlcTeammateEmails` ([`utils/plc.ts`](../utils/plc.ts)) working by reading the map (fall back to legacy arrays during rollout).
- **New mutators** (in the provider / `usePlcs`): `setMemberRole(uid, role)`, `transferLead(toUid)`, `removeMember(uid)`, `leavePlc()`. `transferLead` and role changes are **lead/co-lead only**.
- **Invariant:** exactly one `lead`; `transferLead` is the only way to move it; a lead cannot leave without transferring (the existing "transfer leadership before leaving" copy finally becomes real).

### 3.2 Server timestamps (Decision 1.3)

- All PLC writes use `serverTimestamp()`. Type fields stay typed `number`; **parsers convert** `Timestamp → millis` on read (`ts?.toMillis?.() ?? 0`), and tolerate legacy numeric values during rollout.
- Rules change `... is int` → `... is timestamp` for new writes, but **keep accepting `int`** on update branches during the back-compat window (see Migration). A follow-up tightens to timestamp-only after backfill.

### 3.3 Presence (Decision 2.1)

```ts
// /plcs/{plcId}/presence/{uid}
export interface PlcPresence {
  uid: string;
  displayName: string;
  section: PlcSectionId | 'meeting';
  lastActiveAt: number; // serverTimestamp, heartbeat ~45s
}
```

- Client writes its own presence doc (`docId == uid`) on mount + every ~45s while the dashboard is open; deletes it on unmount / `pagehide` (best-effort).
- "Who's here" = presence docs where `lastActiveAt` within ~90s (client-filtered).
- A scheduled GC function prunes stale presence docs (> 5 min) so abandoned tabs don't linger.

### 3.4 Activity log (Decision 2.2)

```ts
// /plcs/{plcId}/activity/{eventId}  (append-only)
export type PlcActivityType =
  | 'member_joined'
  | 'member_left'
  | 'role_changed'
  | 'assessment_created'
  | 'assessment_shared'
  | 'assessment_results_ready'
  | 'meeting_held'
  | 'note_created'
  | 'comment_added'
  | 'item_deleted'
  | 'item_restored';

export interface PlcActivityEvent {
  id: string;
  type: PlcActivityType;
  actorUid: string;
  actorName: string;
  targetType?: string; // 'assessment' | 'note' | 'comment' | 'dataCard' | ...
  targetId?: string;
  targetTitle?: string;
  createdAt: number; // serverTimestamp
}
```

- Written from the mutation paths (best-effort, fire-and-forget, never blocks the canonical write — mirror the existing `writePlcAssignmentIndexEntry` posture).
- **Bounded:** the activity listener loads the latest N (e.g. `limit(50)`); a scheduled GC trims events older than ~90 days.
- **Unread:** per-user private doc `/users/{uid}/plc_state/{plcId}` `{ lastSeenAt }` (owner-only). "Since you were here" = activity where `createdAt > lastSeenAt`; the sidebar badge counts them.

### 3.5 Comments + @mentions (Decision 2.6)

```ts
// /plcs/{plcId}/comments/{commentId}
export interface PlcComment {
  id: string;
  targetType: 'dataCard' | 'assessment' | 'note'; // start with dataCard
  targetId: string; // e.g. assessmentId or assessmentId:questionId
  authorUid: string;
  authorName: string;
  body: string;
  mentions: string[]; // member uids; each mention → an activity event + unread for that user
  createdAt: number; // serverTimestamp
  editedAt?: number | null;
  deletedAt?: number | null; // soft-delete
}
```

### 3.6 Common Assessment + server-side aggregates (Decisions 4.0c, 6.0, 3.3)

This is the **PII fix and the meeting data spine** in one.

```ts
// /plcs/{plcId}/assessments/{assessmentId}  — the team's designated common assessment
export interface PlcCommonAssessment {
  id: string;
  title: string;
  kind: 'quiz' | 'video-activity';
  syncGroupId: string; // canonical content (synced_quizzes / synced_video_activities)
  unitLabel?: string;
  opensAt?: number | null;
  dueAt?: number | null;
  status: 'planning' | 'active' | 'reviewing' | 'closed';
  createdBy: string;
  createdAt: number; // serverTimestamp
  updatedAt: number;
  deletedAt?: number | null; // soft-delete
}

// /plcs/{plcId}/aggregates/{assessmentId}  — ANONYMIZED, member-readable, written by a Cloud Function
export interface PlcAssessmentAggregate {
  assessmentId: string;
  schemaVersion: number;
  teacherCount: number;
  studentCount: number;
  teamAveragePercent: number;
  perQuestion: Array<{
    questionId: string;
    text: string;
    correctPercent: number; // 0-100, across all teachers' students
    points: number;
  }>;
  perTeacher: Array<{
    teacherUid: string;
    teacherName: string;
    classCount: number;
    averagePercent: number;
    studentCount: number; // NO student names, NO per-student rows
  }>;
  ranAt: number; // serverTimestamp
}
```

**Pipeline:**

1. Each teacher's raw graded responses keep landing as today in `PlcContribution` at `/plcs/{plcId}/contributions/{quizId}_{teacherUid}` (embedded `responses[]` carry student names — **this is the PII**).
2. **Rules tighten:** `contributions` become **readable only by the owning teacher** (`resource.data.teacherUid == request.auth.uid`). Members no longer read raw PII.
3. A **Cloud Function** (`onWrite` of a contribution, debounced/batched) recomputes `/plcs/{plcId}/aggregates/{assessmentId}` — anonymized rollups only. Members read **aggregates**; `PlcSharedDataBody` and Meeting Mode switch their data source from raw contributions to aggregates.
4. **Owning teacher's own named roster** stays visible to that teacher (reads their own contribution). **Opt-in** flag (per teacher, per assessment) can expose named rows to the team later — out of scope for v1 beyond the schema hook.

> This simultaneously (a) enforces the FERPA boundary in **rules**, (b) makes Meeting Mode reads **fast and cheap** (one small doc, not every teacher's raw responses), and (c) **caps read cost** (today the whole unbounded `contributions` subcollection streams to every member).

### 3.7 Meeting records (Decisions 4.0, 4.0b)

```ts
// /plcs/{plcId}/meetings/{meetingId}
export interface PlcMeeting {
  id: string;
  heldAt: number; // serverTimestamp
  facilitatorUid: string;
  attendeeUids: string[]; // captured from presence at meeting time
  assessmentIds: string[]; // common assessments reviewed
  agenda?: string;
  decisions: Array<{
    id: string;
    text: string;
    linkedDataCard?: { assessmentId: string; questionId?: string };
  }>;
  actionItems: Array<{
    id: string;
    text: string;
    assigneeUid?: string;
    dueAt?: number | null;
    todoId?: string;
  }>;
  notesBody?: string;
  status: 'in-progress' | 'completed';
  createdBy: string;
  updatedAt: number;
  deletedAt?: number | null;
}
```

- Action items can spawn `plcs/{id}/todos` entries (assignee/due — see 3.9) via the linked `todoId`.
- Export to PDF/Sheet for district accountability (reuse the existing Drive/Sheet helpers used by `sharedSheetUrl`).

### 3.8 Native structured meeting notes (Decisions 2.5, 2.5b)

Extend the **existing** `PlcNote` (don't rebuild — wire up [`NotesBody`](../components/plc/bodies/NotesBody.tsx) + [`usePlcNotes`](../hooks/usePlcNotes.ts)):

```ts
export interface PlcNote {
  id: string;
  title: string;
  body: string; // markdown (lightweight rich-text)
  kind?: 'freeform' | 'meeting'; // NEW — meeting notes get the agenda→decisions→actions template
  meetingId?: string | null; // NEW — link to a PlcMeeting record
  createdBy: string;
  createdAt: number; // serverTimestamp
  lastEditedBy: string;
  lastEditedAt: number; // serverTimestamp
  version?: number; // NEW — optimistic concurrency (Decision 2.4)
  deletedAt?: number | null; // NEW — soft-delete
}
```

### 3.9 To-dos with assignee/due (supports meeting action items)

Extend the existing `PlcTodo` (the roadmap already flagged `assignedTo` as a deferred non-breaking extension):

```ts
export interface PlcTodo {
  id: string;
  text: string;
  done: boolean;
  assigneeUid?: string | null; // NEW
  dueAt?: number | null; // NEW
  meetingId?: string | null; // NEW — provenance from a meeting action item
  createdBy: string;
  createdAt: number; // serverTimestamp
  deletedAt?: number | null; // NEW — soft-delete
}
```

### 3.10 Soft-delete + version history (Decisions 3.1, 5.1)

- Add `deletedAt?: number | null` to member-deletable content: `notes`, `todos`, `docs`, `quizzes`, `video_activities`, `assessments`, `meetings`, `comments`.
- **Trash view** (inside Settings): lists `deletedAt != null`; restore sets it null; both actions log to activity. A scheduled GC hard-deletes after 30 days.
- **Version snapshots:** `/synced_quizzes/{groupId}/versions/{versionId}` (bounded last N, e.g. 10) `{ version, content, savedBy, savedAt }`; "Restore version" copies a snapshot back to canonical (bumps `version`). Same for `synced_video_activities`.

---

## 4. Firestore rules changes

Follow the **existing PLC rules discipline exactly** (it is a project strength — do not regress):

1. Gate reads on membership. With the members map, the gate becomes `request.auth.uid in get(plcDoc).data.members` (map-key check) **or** the denormalized `... in resource.data.memberUids` — keep both consistent.
2. `keys().hasOnly([...])` schema lock-down on every new doc shape.
3. Pin user-controlled URL fields to canonical hosts (anti-phish; e.g. `docs.google.com` for notes' Google links).
4. Split `create` vs `update` so `update` can check existing `resource.data` for immutability/ownership.
5. Every new collection ships with an emulator rules test under `tests/rules/` (mirror `plcOverviewAndContent.test.ts` / `plcDocs.test.ts`).

New/changed rule blocks:

- **`/plcs/{plcId}` root:** accept the `members` map + `orgId`/`buildingId`; new mutually-exclusive update branches — `isTransferringLead()`, `isChangingMemberRole()` (lead/co-lead only), `isAdminManagingPlc()` (Decision 3.4 — site admin within same `orgId` may set `leadUid`/dissolve), plus the existing accept-invite / leave / features / sheet-url branches. Keep all branches mutually exclusive.
- **`/plcs/{plcId}/presence/{uid}`:** member may read all; may write only `docId == request.auth.uid`; schema-locked.
- **`/plcs/{plcId}/activity/{eventId}`:** member read; create-only with `actorUid == request.auth.uid`; **no update/delete by clients** (GC via function/Admin SDK).
- **`/plcs/{plcId}/comments/{commentId}`:** member read; create with `authorUid == request.auth.uid`; update limited to `body`/`editedAt`/`deletedAt` by author (or `deletedAt` by any member for tidy — soft-delete posture); identity immutable.
- **`/plcs/{plcId}/assessments/{assessmentId}`:** member CRUD (PLC-owned); identity/`createdBy` immutable; `syncGroupId` pinned; soft-delete via `deletedAt`.
- **`/plcs/{plcId}/aggregates/{assessmentId}`:** member **read-only**; **writes server-only** (Admin SDK / function) — clients cannot write aggregates.
- **`/plcs/{plcId}/contributions/{id}`:** tighten **read to owner only** (`resource.data.teacherUid == request.auth.uid`). This is the PII fix — verify no member-read path remains.
- **`/plcs/{plcId}/meetings/{meetingId}`:** member CRUD; soft-delete; identity immutable.
- **`/plcs/{plcId}/notes`, `/todos`:** widen `keys().hasOnly` for the new fields (`version`, `assigneeUid`, `dueAt`, `meetingId`, `kind`, `deletedAt`); add the `version` precondition pattern on note updates (Decision 2.4).
- **`/users/{uid}/plc_state/{plcId}`:** owner-only (`lastSeenAt`).
- **`/synced_*/{groupId}/versions/{versionId}`:** participant read; writes server-side or participant-create-only, identity immutable.

---

## 5. Cloud Functions

| Function                 | Trigger                                               | Purpose                                                                                                                                                                                                     |
| ------------------------ | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `aggregatePlcAssessment` | `onWrite` `plcs/{id}/contributions/{cid}` (debounced) | Recompute anonymized `/aggregates/{assessmentId}`. **Core of Decisions 6.0 + 3.3.**                                                                                                                         |
| `migratePlcs`            | callable (admin) / one-shot                           | Arrays→members map, infer `orgId` from member email domains (match `/organizations/{orgId}/domains`), backfill `leadUid` mirror, seed `aggregates` from existing contributions. **Decision 6.1.**           |
| `detachPlcSyncLinkage`   | callable                                              | Cleanly remove a participant from a synced group on unshare (today there is no detach API — see roadmap "orphanedGroup" gap). **Decision 5.3.**                                                             |
| `gcPlcOrphans`           | scheduled (nightly)                                   | Delete empty/self-only synced groups; trim activity > 90d; prune stale presence; hard-delete `deletedAt` content > 30d. **Decisions 5.3, 3.4, 3.1.**                                                        |
| `plcWeeklyDigest`        | scheduled (weekly)                                    | Opt-in email digest off the activity log; reuse `firestore-send-email` + `invite-emails`-style kill switch from [`plcInviteEmails.ts`](../functions/src/plcInviteEmails.ts). **Decision 2.3 (later wave).** |

Pin `memory` / `maxInstances` on all PLC functions (cost posture). Each function ships with a `*.test.ts` mirroring the existing `plc*SyncJoin.test.ts` (membership gate, schema gates, idempotency).

---

## 6. UX surfaces

### 6.1 New IA / rail (Decision 4.5)

Reorder + consolidate `sections.ts`:

```
Home · Meeting · Assessments · Data · Notes & Docs · To-Dos · Boards · Members · Resources · Settings
```

- **Assessments** unifies the current separate **Quizzes** + **Video Activities** sections into one library with a type filter (matches the Common Assessment abstraction). Preserve the existing `PlcQuizzesBody` / `PlcVideoActivitiesTabsBody` internals; present them under one section with tabs/filter.
- **Notes & Docs** unifies native meeting notes (`NotesBody`) + Google-Doc embeds (`PlcDocsBody`).
- **Meeting** is new (6.2).
- **Trash** lives inside **Settings** (not its own rail item).
- Keep feature-flag gating via `getPlcFeatures`.

### 6.2 Meeting Mode (Decisions 4.0, 4.0b, 4.0c) — the hero

A distinct, projector-legible surface at `/plc/:id/meeting`. Guided flow:

1. **Pick** the common assessment (or create/designate one).
2. **Review** — large-type pooled data from `/aggregates/{assessmentId}`: team average, weakest questions (sorted by `correctPercent`), per-class compare, "who's run it yet." Anonymized. Each data card is **commentable** (2.6).
3. **Decide** — capture decisions (free text, optionally linked to a weak question/data card).
4. **Act** — spin up action items → `plcs/{id}/todos` with assignee/due.
5. **Save** — writes a `PlcMeeting` record (attendees from presence) + a `meeting_held` activity event; exportable.

Design: brand-calm, glanceable across a room, large hierarchy, minimal chrome. Reuse `PlcAnalyticsBody` / `PlcAggregateSection` rendering where it fits, but sized for projection.

### 6.3 Home (Decision 4.1)

Replace static Home with a calm activity-driven digest:

- **Presence strip** ("who's here now" + section).
- **Common assessment status** banner ("Unit 4 CFA — 3 of 4 ran it · Ready to review") + **Start/Resume Meeting** CTA.
- **Since you were here** (activity since `lastSeenAt`).
- **Your action items** (todos assigned to you, with due dates).
- **Jump back in** (recent sections/items).
- **Fix QuickCreate** — wire the three buttons to the **existing** authoring modals (`PlcNewQuizAssignmentModal` / `PlcAuthorQuizModal`, VA equivalents, add-doc) instead of mere navigation. (Decision 4.2 — mostly wiring.)
- **No bento** (it was deliberately removed; do not reintroduce per-user layout config).

### 6.4 Search (Decision 4.3)

Per-PLC search box across assessments / quizzes / VAs / docs / notes / boards (client-side over the provider's already-loaded lists + a light query for the rest). Defer ⌘K palette.

### 6.5 Cleanup (Decision 4.4)

- Wire `NotesBody`/`PlcNotesTab` into the live Notes & Docs section; remove the dead-seam ambiguity.
- Remove unused `PlcPlaceholderTab.tsx`.
- Collapse the `tabs/*` shims that merely wrap `bodies/*` where they add nothing.
- Converge the legacy dual `assignments` vs `quizzes` collections / `unifyAssignableQuizzes` into one canonical assignable list feeding Assessments.

---

## 7. Wave-by-wave build plan

Each wave is a shippable PR with its own validation gate. **Resolve dependencies in order.** Within a wave, file-disjoint work can parallelize (mirror the prior plan's stream model).

### Wave 0 — Safety net (prerequisite; Decision 6.2/6.3)

Backfill tests under the surfaces about to change, **before** rewriting:

- `PlcDashboard` render test (none exists).
- The untested root-doc rule branches (`isAcceptingPlcInvite`, `isLeavingPlc`, sheet-url, features, lead-can't-vacate).
- `usePlcContributions` parser (incl. reject-on-malformed).
- Import/share modal tests (`PlcQuizImportModal`, `PlcSharePickerModal`, `PlcNewQuizAssignmentModal`).
- **Exit:** `pnpm run validate` + `pnpm run test:rules` green; coverage exists on `PlcDashboard`, root rules, contributions.

### Wave 1 — Foundation (Decisions 0.3, 1.1–1.4, 6.1)

- `/plc/:id/:section` routing in `App.tsx`; sidebar launcher navigates; back/refresh/deep-link work.
- `PlcProvider` + selector hooks; migrate existing `usePlc*` hooks onto it; dedupe listeners; unify error contracts.
- `members` map + roles + `transferLead`/`setMemberRole`/`removeMember`/`leavePlc`; denormalized `memberUids` index maintained on every write; `leadUid` mirror.
- `serverTimestamp()` on all writes; parsers tolerate Timestamp + legacy number; rules accept timestamp (dual-accept int during rollout).
- `orgId`/`buildingId` fields + same-org invite default + "PLCs in my building" directory at `/plc`.
- `migratePlcs` Cloud Function + dual-shape back-compat reads.
- **Exit:** existing PLC features work unchanged through the new provider + routing; migration runs on a copy of prod data without loss; `validate` + `test:rules` green; new rule branches tested.

### Wave 2 — Collaboration core (Decisions 2.1–2.6, 3.1)

- **Presence** (`/presence/{uid}`, heartbeat, "who's here" strip, per-section).
- **Activity log** (`/activity`) written from mutation paths; `lastSeenAt` + unread badge.
- **Native structured meeting notes** — wire up `NotesBody`; add markdown + the agenda→decisions→action-items template; `version` precondition (optimistic concurrency, reuse `SyncedQuizVersionConflictError` pattern); keep Google-Doc embed alongside.
- **Comments + @mentions** on data cards (and notes/assessments); mention → activity + unread.
- **Soft-delete + Trash/restore + undo** across content; deletes logged to activity.
- **Exit:** two browsers show each other's presence; an edit conflict surfaces the toast (no silent loss); a deleted item is restorable; comments + @mention notify; `validate`/`test:rules` green.

### Wave 3 — Hero: Common Assessment + Meeting Mode + analytics (Decisions 4.0/4.0b/4.0c, 6.0, 3.3, 4.1)

- **Common Assessment** object + designate/track-who-ran-it; converge aggregation onto its canonical id (kill heuristic title-matching).
- **`aggregatePlcAssessment`** function + `/aggregates`; **tighten `contributions` read to owner-only** (PII fix); switch Shared Data + Meeting Mode to read aggregates.
- **Meeting Mode** guided surface at `/plc/:id/meeting`; **meeting records** (`/meetings`) + export.
- **Activity-driven Home** + fixed QuickCreate.
- **Exit:** a member can no longer read another teacher's raw student names (rules test proves it); aggregates render in Data + Meeting; a full meeting produces a saved record + todos; Home shows since-you-were-here + meeting CTA; `validate`/`test:rules` green.

### Wave 4 — Depth, safety & polish (Decisions 3.2, 3.4, 5.1–5.3, 4.3, 4.4, 4.5, 2.3)

- **Viewer role** + **admin recovery** (reassign lead / dissolve within org).
- **Version history** snapshots + restore; **auto-pull-when-safe** + conflict prompt; **`detachPlcSyncLinkage`** + **`gcPlcOrphans`**.
- **Per-PLC search**; **IA reorg** (unify Assessments + Notes&Docs, add Meeting to rail, Trash in Settings); **cleanup** (remove `PlcPlaceholderTab`, collapse shims, converge dual collections).
- **Opt-in weekly digest** (`plcWeeklyDigest`).
- **Exit:** a viewer can read but not edit; an admin can recover an abandoned PLC; a bad synced edit is restorable; orphan GC runs; search finds across sections; rail matches the locked IA; `validate`/`test:rules` green.

---

## 8. Non-functional requirements (hard gates)

- **Cost / scale (Decision 6.1):** no unbounded member reads of raw contributions (replaced by aggregates); activity/comments/versions are bounded + paginated; presence GC'd; only the active section's heavy data mounts; pin `memory`/`maxInstances` on functions; **no per-member email/doc fan-out** (single shared aggregate/digest docs).
- **i18n (Decision 6.3):** every new string → key + English `defaultValue` in `locales/en.json`, present in `de/es/fr`. Migrate the hardcoded `throw new Error` toast strings in [`usePlcs.ts`](../hooks/usePlcs.ts) while touching it. The `plcDashboardLocales` / `sidebarPlcsLocales` i18n tests must stay green.
- **Rules (Decision 6.3):** every new doc shape → `keys().hasOnly` + immutability pins + membership gate + a `tests/rules/` suite. No collection ships without rules tests.
- **Accessibility / brand:** calm, glanceable, projector-legible (Meeting Mode especially); WCAG AA contrast (use `text-slate-300/200` on dark surfaces, not `400/500`); respect `prefers-reduced-motion`; keyboard nav + focus rings on all interactive elements; screen-reader labels on icon-only buttons.
- **Verification:** `pnpm run validate` + `pnpm run test:rules` green at every wave exit. (Note: emulator can't run in this dev environment — CI enforces; verify on the dev preview URL.)

---

## 9. Risks & mitigations

| Risk                                                                          | Mitigation                                                                                                                                               |
| ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Members-map migration breaks the `array-contains` list query.**             | Keep denormalized `memberUids` index; maintain it on every membership write; dual-shape reads during rollout.                                            |
| **`serverTimestamp()` migration breaks parsers/rules/tests.**                 | Parsers convert Timestamp→millis and tolerate legacy numbers; rules dual-accept `int`/`timestamp` during rollout; tighten after backfill.                |
| **PII tightening hides data the UI still reads.**                             | Switch Shared Data + Meeting to aggregates **before** tightening contribution reads; rules test proves member-read denial; owner still reads own roster. |
| **Aggregation function lag** (results land but aggregate not yet recomputed). | Show "updating…" state; function is idempotent + debounced; Meeting Mode reads latest aggregate + `ranAt`.                                               |
| **Orphaned synced groups during the unshare/rollback gap.**                   | `detachPlcSyncLinkage` + `gcPlcOrphans`; keep the existing `logError` orphan tags to observe rate.                                                       |
| **Big subsystem with real users.**                                            | Wave 0 safety net first; waves independently shippable; migration tested on a prod copy; back-compat reads.                                              |
| **Scope creep into a Notion clone.**                                          | Decisions 0.1/2.x cap collaboration to "just-enough glue" serving the meeting loop; no CRDT, no general channels, no configurable bento.                 |

---

## 10. Out of scope (v1)

- CRDT / live character-by-character co-editing (optimistic concurrency only).
- General chat/channels (comments are object-scoped only).
- ⌘K command palette (per-PLC search only).
- Time-boxed guest links (viewer role only).
- Per-teacher named-data opt-in UI beyond the schema hook (default anonymized).
- Mini-apps / Guided Learning PLC integration (roadmap Phases 7/8 — orthogonal).
- Per-user configurable Home/bento (deliberately removed; not returning).

---

## 11. Open questions (resolve before the affected wave)

- **Org inference fallback:** if a member's email domain maps to no `/organizations/{orgId}/domains`, leave `orgId` null (PLC stays tenancy-free) — confirm that's acceptable for cross-district PLCs.
- **Aggregate granularity:** confirm per-class compare uses `PlcContributionResponse.classPeriod` as the class key (it's the only class signal in the current contribution shape).
- **Meeting attendees source:** confirm "attendees = members present (presence) during the meeting session" vs. a manual check-in. Default: auto from presence, editable before save.
- **Digest cadence/default:** weekly, opt-in, default **off** (calm brand) — confirm.

---

## 12. Key files index (anchors for implementers)

- Shell/IA: [`components/plc/PlcDashboard.tsx`](../components/plc/PlcDashboard.tsx), [`PlcDashboardRail.tsx`](../components/plc/PlcDashboardRail.tsx), [`sections.ts`](../components/plc/sections.ts)
- Home: [`components/plc/home/PlcHome.tsx`](../components/plc/home/PlcHome.tsx) + `home/cards/*`
- Sharing heart: [`components/plc/bodies/PlcQuizLibraryBody.tsx`](../components/plc/bodies/PlcQuizLibraryBody.tsx), `unifyAssignableQuizzes.ts`
- Native notes (wire up): [`components/plc/bodies/NotesBody.tsx`](../components/plc/bodies/NotesBody.tsx), [`hooks/usePlcNotes.ts`](../hooks/usePlcNotes.ts), `tabs/PlcNotesTab.tsx`
- Authoring (exists): [`components/plc/authoring/PlcAuthorQuizModal.tsx`](../components/plc/authoring/PlcAuthorQuizModal.tsx), `PlcAuthorVideoActivityModal.tsx`, `assignments/PlcAssignmentConfigModal.tsx`, `PlcNewQuizAssignmentModal.tsx`
- Analytics: [`components/plc/sharedData/PlcSharedDataBody.tsx`](../components/plc/sharedData/PlcSharedDataBody.tsx), `bodies/PlcAnalyticsBody.tsx`, `common/library/plcAnalyticsAggregate.ts`, [`hooks/usePlcContributions.ts`](../hooks/usePlcContributions.ts)
- Membership/invites: [`hooks/usePlcs.ts`](../hooks/usePlcs.ts), `usePlcInvitations.ts`, `components/plc/bodies/MembersBody.tsx`, `auth/PlcInviteAcceptance.tsx`, [`functions/src/plcInviteEmails.ts`](../functions/src/plcInviteEmails.ts)
- Sync joins: [`functions/src/plcQuizSyncJoin.ts`](../functions/src/plcQuizSyncJoin.ts), `plcAssignmentSyncJoin.ts`, `plcVideoActivitySyncJoin.ts`
- Types: [`types.ts`](../types.ts) L203–644 (`Plc`, `PlcMember`\*, `PlcContribution`, `PlcNote`, `PlcTodo`, `PlcDoc`, `PlcResource`, `PlcInvitation`), L3471 (`PlcLinkage`)
- Rules: [`firestore.rules`](../firestore.rules) L1323–2186 (synced groups, `/plcs`, invites, resources)
- Prior context: [`docs/PLC_ROADMAP.md`](PLC_ROADMAP.md), [`docs/superpowers/plans/2026-05-20-plc-collaborative-redesign.md`](superpowers/plans/2026-05-20-plc-collaborative-redesign.md)

---

_Generated from a `/grill-me` design session on 2026-06-19. Every Section 1 decision was explicitly confirmed by the stakeholder._
