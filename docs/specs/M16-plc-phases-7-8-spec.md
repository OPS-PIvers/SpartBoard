# M16 — PLC Roadmap Phases 7-8: Mini-Apps + Guided Learning Sharing

## Backlog Claim Verification

The roadmap status marks Phases 7 and 8 as `[ ]` (unshipped). Code confirms this fully:

- No `hooks/usePlcMiniApps.ts` or `hooks/usePlcGuidedLearning.ts` exist.
- No `hooks/useSyncedMiniAppGroups.ts` or `hooks/useSyncedGuidedLearningGroups.ts` exist.
- `components/plc/sections.ts` `PlcSectionId` union contains no `'miniApps'` or `'guidedLearning'` member.
- `types.ts` contains no `PlcMiniAppEntry` or `PlcGuidedLearningEntry` type.
- `PlcFeatureSettings` (types.ts:312) has only five flags — `quizzes`, `videoActivities`, `notes`, `todos`, `sharedBoards`. Neither `miniApps` nor `guidedLearning` appear.
- `PlcSettingsTab.tsx:36` `FEATURE_ROWS` has exactly five entries; neither new type is present.
- `firestore.rules` PLC block (starting at line 2052) contains `quizzes/`, `video_activities/`, `assignments/` subcollections but no `mini_apps/` or `guided_learning/` blocks.
- `functions/src/index.ts` exports three `joinPlc*SyncGroup` CFs (quiz, assignment, video-activity) — no mini-app or guided-learning variants.
- `PlcAssessmentsBody.tsx` `TYPE_FILTERS` contains only `'quiz'` and `'video-activity'`.
- `assignment_index` rules (firestore.rules:2221) have `kind in ['quiz', 'video-activity']` — `'mini-app'` and `'guided-learning'` are absent.

**The backlog claim is fully accurate.** Zero implementation exists for either phase.

**Critical wildcard confirmed**: Neither `synced_mini_apps` nor `synced_guided_learning` Firestore collections or corresponding client hooks exist anywhere in the codebase. The quiz/VA sync infrastructure was in place before their PLC phases. Phases 7 and 8 must build the LWW sync layer from scratch in addition to the PLC plumbing. This is the dominant lift for both phases.

---

## Architecture Decision

**Recommended approach: mirror Phase 4 (Video Activities) exactly for both new content types, while also standing up the missing LWW sync group infrastructure each type requires.**

The PLC architecture is firmly locked (subcollections under `plcs/{plcId}/`, sync-or-copy import, LWW via `synced_*` canonical docs, CF-gated participant writes). There is no meaningful design space to diverge. The only genuine decisions are scoped below under "Open decisions."

The two phases are independent and should be shipped as separate PRs in order: Phase 7 first (Mini-Apps), then Phase 8 (Guided Learning). Each is independently shippable. Phase 8 can optionally be folded into the same PR as Phase 7 if PR size is not a concern; the roadmap rule favors keeping them separate.

**Template files for both phases** (read before writing any code):

- `hooks/usePlcVideoActivities.ts` — the hook template
- `components/plc/bodies/PlcVideoActivitiesBody.tsx` — the body component template
- `functions/src/plcVideoActivitySyncJoin.ts` — the CF template
- `hooks/useSyncedVideoActivityGroups.ts` — the sync groups hook template
- `firestore.rules` lines 2639–2715 — the `video_activities/` block template
- `components/plc/PlcVideoActivityImportModal.tsx` — the import modal template
- `types.ts` lines 592–623 — `PlcVideoActivityEntry` — the entry type template

---

## Open Decisions (need Paul)

### Decision A: Integration point for the "share with PLC" action on Mini-Apps

Mini-Apps have a different widget shape than Quiz/VA. The `components/widgets/MiniApp/Widget.tsx` manages a library via `useMiniAppSync` (which reads `users/{uid}/miniapps` directly from Firestore — no Drive). There are two options for where to add the share-with-PLC affordance:

1. **Kebab on the personal library row inside `MiniAppManager.tsx`** (mirrors how `VideoActivityManager.tsx` exposes `onShareWithPlc`). This is the exact Phase 4 pattern. The manager receives an `onShareWithPlc` prop the widget wires up. Consistent, low-friction for teachers already in the library.

2. **Separate CTA in the PLC mini-apps tab body only** (via `PlcSharePickerModal`, the pattern from the `plc-polish` follow-up). Teachers pick from their personal library through the PLC tab rather than from the widget itself. Simpler widget-side change, but less discoverable.

**Recommendation**: Option 1, consistent with Phase 4 and the quiz widget. The `MiniAppManager` already has a list row per app; adding a kebab item there is the established pattern. Wire via an `onShareWithPlc?: (appId: string) => void` prop on `MiniAppManager`, passed down from `Widget.tsx`.

### Decision B: Sync content model for Mini-Apps

Mini-Apps store their entire content (`html: string`) as a single field on `MiniAppItem`. There is no Drive file, no `driveFileId`. The synced-quiz/VA infrastructure (`synced_quizzes`, `synced_video_activities`) was built around Drive content; the sync group's canonical doc holds the structured content blob (questions array). For mini-apps:

1. **Inline HTML in the synced group doc** (`synced_mini_apps/{groupId}` stores `{ html, title, version, participants, ... }`). No Drive dependency. The LWW publish path bumps `version` and overwrites `html` transactionally. This is simpler and matches the actual content model.

2. **Drive-backed blob** (store the HTML as a Drive file, matching the VA/Quiz pattern). Unnecessary complexity given MiniAppItem has no Drive history and `useGuidedLearning` already showed that some content types don't need Drive.

**Recommendation**: Option 1, inline HTML. Mini-apps are already Firestore-only (no Drive); forcing a Drive dependency just to mirror the quiz/VA pattern would be the wrong abstraction. The sync group doc stores `{ id, title, html, version, participants, plcId, createdAt, updatedAt, updatedBy }`. This is a deliberate, named divergence from quiz/VA.

### Decision C: Guided Learning and Drive coupling during PLC import

`useGuidedLearning.saveSet` requires Google Drive (`isDriveConnected`). The import path for VA/Quiz checks `isDriveConnected` and gates the import behind a toast if false. Guided Learning has the same constraint. Two approaches:

1. **Maintain the Drive requirement** — import is gated, same as VA. A teacher without Drive connected sees a toast. Consistent with existing `useGuidedLearning.saveSet` behavior.

2. **Firestore-only path for PLC import** — pull canonical content from the synced group, write directly to `users/{uid}/guided_learning/{setId}` with a synthetic `driveFileId: ''` (or a placeholder), and skip Drive. The trade-off is that later editing via the GL editor (which loads from Drive) would fail silently on the imported copy.

**Recommendation**: Option 1, keep the Drive requirement. Guided Learning is fundamentally Drive-backed; a Firestore-only copy would be a dead end (no editor, no re-export). The Drive-required toast is the honest signal. If this becomes a pain point, a Drive-less GL editor surface is the right fix, not a hollow import path.

---

## Phase 7: Mini-Apps PLC Integration

### 7A: Stand Up the Synced Mini-App Groups Infrastructure

This is the larger lift for Phase 7. Mirrors `hooks/useSyncedVideoActivityGroups.ts` but without Drive, with `html` as the content field instead of `youtubeUrl + questions`.

**Files to CREATE:**

**`hooks/useSyncedMiniAppGroups.ts`**

New file. Template: `hooks/useSyncedVideoActivityGroups.ts`.

Exports:

- `useSyncedMiniAppGroupsByIds(syncGroupIds)` — per-doc `onSnapshot` hook, returns `Map<string, SyncedMiniAppGroup>` + `loading`. Mirrors `useSyncedVideoActivityGroupsByIds`.
- `pullSyncedMiniAppContent(groupId)` — `getDoc` one-shot returning `{ title, html, version }`.
- `createSyncedMiniAppGroup({ groupId, uid, title, html, plcId? })` — `setDoc` to `synced_mini_apps/{groupId}`.
- `publishSyncedMiniApp(groupId, { title, html, expectedVersion, uid })` — transactional `runTransaction` with version-precondition, bumps `version`, writes `html`. Returns `{ version }`. Throws `SyncedMiniAppVersionConflictError` on stale version. Also fires a version snapshot (`synced_mini_apps/{groupId}/versions/{version}`) fire-and-forget, mirroring VA.
- `callJoinSyncedMiniAppGroup(shareId)` — callable `joinSyncedMiniAppGroup` (for non-PLC shared mini-app import flows, if needed in future).
- `callLeaveSyncedMiniAppGroup(groupId)` — callable `leaveSyncedMiniAppGroup`.
- `callJoinPlcMiniAppSyncGroup(plcId, plcMiniAppId)` — callable `joinPlcMiniAppSyncGroup` (Phase 7 PLC-specific CF).
- `SyncedMiniAppVersionConflictError` class.
- Re-export `VERSION_HISTORY_LIMIT` from `useSyncedQuizGroups`.

**New types to add to `types.ts`:**

```typescript
// Placed alongside PlcVideoActivityEntry (~line 623)

export interface PlcMiniAppEntry {
  id: string;
  title: string;
  /** Character count of the HTML at share time. Used for display only. */
  charCount: number;
  /** Pointer to canonical /synced_mini_apps/{groupId} doc. */
  syncGroupId: string;
  sharedBy: string;
  sharedByEmail: string;
  sharedByName: string;
  sharedAt: number;
  updatedAt: number;
  /** Soft-delete tombstone (Decision 3.1). */
  deletedAt?: number | null;
}

export interface SyncedMiniAppGroup {
  id: string;
  title: string;
  html: string;
  version: number;
  participants: Record<string, { joinedAt: number }>;
  plcId?: string;
  createdAt: number;
  updatedAt: number;
  updatedBy: string;
}

export interface SyncedMiniAppVersionSnapshot {
  version: number;
  content: { title: string; html: string };
  savedBy: string;
  savedAt: number;
}
```

Also extend `PlcFeatureSettings`:

```typescript
export interface PlcFeatureSettings {
  quizzes: boolean;
  videoActivities: boolean;
  notes: boolean;
  todos: boolean;
  sharedBoards: boolean;
  miniApps: boolean; // NEW — Phase 7
  guidedLearning: boolean; // NEW — Phase 8
}

export const DEFAULT_PLC_FEATURE_SETTINGS: PlcFeatureSettings = {
  quizzes: true,
  videoActivities: true,
  notes: true,
  todos: true,
  sharedBoards: true,
  miniApps: true, // NEW
  guidedLearning: true, // NEW
};
```

The `getPlcFeatures` merge function needs no change — the spread already picks up new keys from `DEFAULT_PLC_FEATURE_SETTINGS`.

**`MiniAppItem`** — no change needed. The sync group stores `title` + `html` directly.

**`MiniAppAssignment`** (types.ts ~line 7169) — add optional PLC-index fields. No `plc?: PlcLinkage` needed on the assignment itself since MiniApp assignments don't export to Google Sheets and the assignment_index write only needs `kind: 'mini-app'`.

### 7B: Cloud Function

**File to CREATE: `functions/src/plcMiniAppSyncJoin.ts`**

Template: `functions/src/plcVideoActivitySyncJoin.ts`. Differences:

- Collection paths: `plcs/{plcId}/mini_apps/{plcMiniAppId}` and `synced_mini_apps/{groupId}`.
- Export: `joinPlcMiniAppSyncGroup`.
- Request type: `{ plcId, plcMiniAppId }`.
- Response type: `JoinPlcMiniAppSyncGroupResponse` (same shape as VA: `{ groupId, version, alreadyJoined }`).

**File to MODIFY: `functions/src/index.ts`**

Add line alongside the three existing PLC sync-join exports:

```typescript
export { joinPlcMiniAppSyncGroup } from './plcMiniAppSyncJoin';
```

### 7C: PLC Mini-Apps Hook

**File to CREATE: `hooks/usePlcMiniApps.ts`**

Template: `hooks/usePlcVideoActivities.ts`. Differences:

- Subcollection path: `plcs/{plcId}/mini_apps`.
- Entry type: `PlcMiniAppEntry`.
- Parser function `parsePlcMiniAppEntry(id, data)` — validates `title is string`, `charCount is number`, `syncGroupId is string`, `sharedBy is string`, `sharedAt is number`, `updatedAt is number`. Defaults `charCount` to 0 if absent (defensive, for legacy entries).
- `ShareMiniAppWithPlcInput`: `{ plcMiniAppId, syncGroupId, title, charCount, sharedByName, sharedByEmail }`.
- Mutators: `shareMiniAppWithPlc`, `mirrorPlcMiniAppHeader`, `unshareMiniAppFromPlc`, `restoreMiniAppInPlc`.
- Standalone `writePlcMiniAppEntry(plcId, uid, input)` — one-shot write used from `Widget.tsx`.
- Uses `usePlcSubcollection` provider pattern (same as VA hook line 138).

### 7D: Extend `useMiniAppAssignments`

**File to MODIFY: `hooks/useMiniAppAssignments.ts`**

`createAssignment` currently writes to `users/{uid}/miniapp_assignments` with no PLC side-effect. Add the PLC index write, mirroring `useQuizAssignments.createAssignment` and `useVideoActivityAssignments.createAssignment`:

- Import `writePlcAssignmentIndexEntry` from `hooks/usePlcAssignmentIndex.ts`.
- In `createAssignment`, after the `setDoc` call succeeds, if `input.plc` is set (new optional field on `CreateMiniAppAssignmentInput`), fire-and-forget `void writePlcAssignmentIndexEntry(...)` with `kind: 'mini-app'`.
- Add `endAssignment` and `reactivateAssignment` status-mirror via `mirrorPlcAssignmentStatus` from `hooks/usePlcAssignmentIndex.ts`, resolved from a `useRef<MiniAppAssignment[]>` mirror (exact pattern from Phase 3/4).

**New field on `CreateMiniAppAssignmentInput`:**

```typescript
/** PLC linkage. Set when the teacher opts into PLC mode at assign time. */
plc?: PlcLinkage;
```

**Note**: `MiniAppAssignment` itself likely does not need `plc?: PlcLinkage` on the Firestore doc — the assignment_index write is a side-effect. But if future status-mirroring needs to look up `plc.id`, the hook reads `assignments` from the snapshot via `useRef`. Confirm whether `MiniAppAssignment` needs a `plc` field on the Firestore doc. The Quiz/VA pattern stores `settings.plc` on the assignment; MiniApp assignments are simpler (no per-assignment settings struct). Recommend adding `plc?: PlcLinkage` to `MiniAppAssignment` in `types.ts` for consistency and so the ref-lookup works for status mirroring.

### 7E: Widen `assignment_index` Firestore Rule

**File to MODIFY: `firestore.rules`**

Lines 2221 and 2245 — both `create` and `update` branches have:

```
&& request.resource.data.kind in ['quiz', 'video-activity']
```

Widen to:

```
&& request.resource.data.kind in ['quiz', 'video-activity', 'mini-app']
```

### 7F: New Firestore Subcollection Rule

**File to MODIFY: `firestore.rules`**

Add a new block after the `video_activities/{plcVideoActivityId}` block (~line 2715), inside `match /plcs/{plcId}`:

```
match /mini_apps/{plcMiniAppId} {
  allow read: if request.auth != null
    && request.auth.uid in get(
         /databases/$(database)/documents/plcs/$(plcId)
       ).data.memberUids;

  allow create: if request.auth != null
    && plcCanEditContent(plcId)
    && request.resource.data.keys().hasOnly([
         'id', 'title', 'charCount', 'syncGroupId',
         'sharedBy', 'sharedByEmail', 'sharedByName',
         'sharedAt', 'updatedAt', 'deletedAt'
       ])
    && plcMiniAppId == request.resource.data.id
    && request.resource.data.sharedBy == request.auth.uid
    && request.resource.data.title is string
    && request.resource.data.charCount is int
    && request.resource.data.charCount >= 0
    && request.resource.data.syncGroupId is string
    && request.resource.data.syncGroupId.size() > 0
    && request.resource.data.sharedByEmail is string
    && request.resource.data.sharedByName is string
    && request.resource.data.sharedAt is int
    && request.resource.data.updatedAt is int
    && plcSubDeletedAtOk();

  allow update: if request.auth != null
    && plcCanEditContent(plcId)
    && request.resource.data.keys().hasOnly([
         'id', 'title', 'charCount', 'syncGroupId',
         'sharedBy', 'sharedByEmail', 'sharedByName',
         'sharedAt', 'updatedAt', 'deletedAt'
       ])
    && request.resource.data.id == resource.data.id
    && request.resource.data.syncGroupId == resource.data.syncGroupId
    && request.resource.data.sharedBy == resource.data.sharedBy
    && request.resource.data.sharedByEmail == resource.data.sharedByEmail
    && request.resource.data.sharedByName == resource.data.sharedByName
    && request.resource.data.sharedAt == resource.data.sharedAt
    && request.resource.data.title is string
    && request.resource.data.charCount is int
    && request.resource.data.charCount >= 0
    && request.resource.data.updatedAt is int
    && plcSubDeletedAtOk();

  allow delete: if request.auth != null
    && plcCanEditContent(plcId);
}
```

Also add `synced_mini_apps` rule block (needed for the sync group):

```
match /synced_mini_apps/{groupId} {
  // Same pattern as synced_video_activities — see ~line 1429.
  // Members are participants map; reads open to any authenticated user
  // (content-addressable by groupId); writes only via CF (participants)
  // or by a current participant (content publish via transaction).
  // ... (mirror synced_video_activities block exactly, swapping collection name)
}
```

Locate and read the `synced_video_activities` rule block before writing the `synced_mini_apps` block. The blocks are symmetric.

### 7G: PLC Dashboard Wiring

**File to MODIFY: `components/plc/sections.ts`**

Add to `PlcSectionId` union:

```typescript
| 'miniApps'
```

Add to `PLC_SECTIONS` array (after `sharedBoards`, before `members`):

```typescript
{
  id: 'miniApps',
  icon: LayoutGrid,  // or AppWindow from lucide-react
  labelKey: 'plcDashboard.tabs.miniApps',
  labelDefault: 'Mini-Apps',
  isEnabled: (features) => features.miniApps,
},
```

Add to `PLC_ROUTE_SECTIONS` set: `'miniApps'`.

**File to MODIFY: `components/plc/PlcDashboard.tsx`**

Add import of the new body component. Add `'miniApps'` case to `renderSection`:

```typescript
case 'miniApps':
  return <PlcMiniAppsBody plc={plc} />;
```

**File to MODIFY: `components/plc/tabs/PlcSettingsTab.tsx`**

Add to `FEATURE_ROWS` array:

```typescript
{
  key: 'miniApps',
  icon: LayoutGrid, // or AppWindow
  titleKey: 'plcDashboard.settings.miniApps.title',
  titleDefault: 'Mini-Apps',
  descriptionKey: 'plcDashboard.settings.miniApps.description',
  descriptionDefault:
    'Share AI-generated mini-apps with the PLC. Members can sync edits or copy into their own library.',
},
```

### 7H: New UI Components

**File to CREATE: `components/plc/bodies/PlcMiniAppsBody.tsx`**

Template: `components/plc/bodies/PlcVideoActivitiesBody.tsx`. Differences:

- No `isDriveConnected` guard on share or import (mini-apps are Firestore-only).
- Import flow: `pullSyncedMiniAppContent(syncGroupId)` returns `{ title, html, version }`. Save to `users/{uid}/miniapps/{id}` via a direct `setDoc` call (no `saveSet` / `saveActivity` — mini-apps don't have Drive). Use the existing `MiniAppItem` shape.
- Edit flow: open `MiniAppEditorModal` against the in-memory `MiniAppItem`. On save, call `publishSyncedMiniApp(syncGroupId, { title, html, expectedVersion, uid })`. No Drive write.
- Share flow: create `synced_mini_apps/{groupId}`, attach sync linkage (add `sync?: { groupId: string; lastSyncedVersion: number }` to `MiniAppItem` — see decision below), write PLC subcoll header.
- "In your library" badge: check `personalBySyncGroup.has(entry.syncGroupId)` where `personalBySyncGroup` is built from `library` (from `useMiniAppSync`) filtered by apps that have `app.sync?.groupId`.
- No version-conflict UI needed on save if the transaction throws `SyncedMiniAppVersionConflictError` — mirror the VA body's conflict handling.
- Use `Film` icon placeholder, replaced by an appropriate `AppWindow` or `LayoutGrid` lucide icon.

**Note on `MiniAppItem` sync linkage**: To support the "In your library" badge and sync import, `MiniAppItem` needs a `sync?: { groupId: string; lastSyncedVersion: number }` field added to `types.ts`. This is analogous to `VideoActivityMetadata.sync` and `QuizMetadata.sync`. The existing `useMiniAppSync` hook reads from `users/{uid}/miniapps` and will surface this field automatically once written. Confirm before proceeding — this is a schema addition to a user-level collection.

**File to CREATE: `components/plc/PlcMiniAppImportModal.tsx`**

Template: `components/plc/PlcVideoActivityImportModal.tsx`. Content: sync-or-copy picker for mini-apps. Copy changes only — replace "video activity" with "mini-app" throughout.

**File to MODIFY: `components/widgets/MiniApp/components/MiniAppManager.tsx`**

Add optional `onShareWithPlc?: (appId: string) => void` prop. When set, add a "Share with PLC" kebab item on each personal library row. Mirror `VideoActivityManager.tsx` pattern (the `onShareWithPlc` prop added in Phase 4).

**File to MODIFY: `components/widgets/MiniApp/Widget.tsx`**

Wire up `handleShareWithPlc(appId)`:

1. Find the `MiniAppItem` from `library` by `appId`.
2. If `app.sync?.groupId` and it's already in a known PLC sync group, toast "Already shared."
3. Otherwise mint `syncGroupId = crypto.randomUUID()`, call `createSyncedMiniAppGroup({ groupId: syncGroupId, uid, title: app.title, html: app.html, plcId })`.
4. Attach sync linkage on the personal app (`setDoc` update to `users/{uid}/miniapps/{appId}` with `sync: { groupId: syncGroupId, lastSyncedVersion: 1 }`).
5. Call `writePlcMiniAppEntry(plcId, uid, { plcMiniAppId: uuid, syncGroupId, title, charCount: app.html.length, ... })`.
6. Rollback shape mirrors `VideoActivityWidget/Widget.tsx handleShareWithPlc` — on linkage write failure, call `callLeaveSyncedMiniAppGroup(syncGroupId)`.

This requires `usePlcs()` in `Widget.tsx` to get the PLC list for `PlcShareTargetModal`. Mirror Phase 4 exactly.

### 7I: Home Tile

**File to CREATE: `components/plc/home/cards/` or a tiles path**

Locate where `VideoActivitiesTile` lives (the glob shows it under `components/plc/` — check `components/plc/home/` directory). Create `MiniAppsTile.tsx` mirroring the video activities tile: count of shared mini-apps + "Open in tab" footer button navigating to `'miniApps'`.

**File to MODIFY: `components/plc/home/PlcHome.tsx`**

Add the `miniApps` tile to the home layout, gated by `features.miniApps`.

---

## Phase 8: Guided Learning PLC Integration

### 8A: Stand Up the Synced Guided Learning Groups Infrastructure

**File to CREATE: `hooks/useSyncedGuidedLearningGroups.ts`**

Template: `hooks/useSyncedVideoActivityGroups.ts`.

The canonical doc (`synced_guided_learning/{groupId}`) stores a content snapshot of the GL set for import, not the full `GuidedLearningSet` with images (Firebase Storage image refs can't be replicated via a canonical doc). Two content model options (see Decision C resolved above — Drive remains canonical):

- The canonical doc stores: `{ id, title, description, stepCount, mode, driveFileId, plcId?, version, participants, createdAt, updatedAt, updatedBy }`. The `driveFileId` is the **sharer's** Drive file. Import pulls the full set from that Drive file.
- Publish/sync path: a peer edits their personal copy, calls `publishSyncedGuidedLearning(groupId, { title, description, steps, expectedVersion, uid })` which updates the canonical doc's version-tracked fields AND writes the full steps to `synced_guided_learning/{groupId}` (similar to how VA questions are stored in the group doc). The Drive replica is a separate concern per teacher.

**Recommended content model for GL sync group**: Store the full `GuidedLearningSet` content minus Firebase Storage image URLs on the canonical doc (steps without `imageUrl` — the image URLs are per-teacher Storage paths, not shareable). On import, create a Drive file from the canonical steps, generating a fresh `driveFileId` for the importer. This mirrors the VA pattern (questions array in canonical doc, fresh Drive file per importer).

Exports:

- `useSyncedGuidedLearningGroupsByIds(ids)` — same shape as VA equivalent.
- `pullSyncedGuidedLearningContent(groupId)` — returns `{ title, description, steps, mode, version }`.
- `createSyncedGuidedLearningGroup({ groupId, uid, title, description, steps, mode, plcId? })`.
- `publishSyncedGuidedLearning(groupId, input)` — transactional, version-precondition.
- `SyncedGuidedLearningVersionConflictError`.
- `callJoinPlcGuidedLearningSyncGroup(plcId, plcGuidedLearningId)`.
- `callLeaveSyncedGuidedLearningGroup(groupId)`.
- `VERSION_HISTORY_LIMIT` re-export.

**New types to add to `types.ts`:**

```typescript
export interface PlcGuidedLearningEntry {
  id: string;
  title: string;
  /** Mirrored from the set's stepCount at share time. */
  stepCount: number;
  /** Pointer to canonical /synced_guided_learning/{groupId} doc. */
  syncGroupId: string;
  sharedBy: string;
  sharedByEmail: string;
  sharedByName: string;
  sharedAt: number;
  updatedAt: number;
  /** Soft-delete tombstone (Decision 3.1). */
  deletedAt?: number | null;
}

export interface SyncedGuidedLearningGroup {
  id: string;
  title: string;
  description?: string;
  steps: GuidedLearningStep[]; // import from the GuidedLearningSet type
  mode: GuidedLearningMode;
  version: number;
  participants: Record<string, { joinedAt: number }>;
  plcId?: string;
  createdAt: number;
  updatedAt: number;
  updatedBy: string;
}

export interface SyncedGuidedLearningVersionSnapshot {
  version: number;
  content: {
    title: string;
    description?: string;
    steps: GuidedLearningStep[];
    mode: GuidedLearningMode;
  };
  savedBy: string;
  savedAt: number;
}
```

Also add `sync?: { groupId: string; lastSyncedVersion: number }` to `GuidedLearningSetMetadata` in `types.ts` (mirrors the existing `QuizMetadata.sync` and `VideoActivityMetadata.sync` patterns, needed for the "In your library" badge and re-import detection).

### 8B: Cloud Function

**File to CREATE: `functions/src/plcGuidedLearningSyncJoin.ts`**

Template: `functions/src/plcVideoActivitySyncJoin.ts`. Differences:

- Collections: `plcs/{plcId}/guided_learning/{plcGuidedLearningId}` and `synced_guided_learning/{groupId}`.
- Export: `joinPlcGuidedLearningSyncGroup`.
- Request: `{ plcId, plcGuidedLearningId }`.

**File to MODIFY: `functions/src/index.ts`**

```typescript
export { joinPlcGuidedLearningSyncGroup } from './plcGuidedLearningSyncJoin';
```

### 8C: PLC Guided Learning Hook

**File to CREATE: `hooks/usePlcGuidedLearning.ts`**

Template: `hooks/usePlcVideoActivities.ts`. Differences:

- Subcollection: `plcs/{plcId}/guided_learning`.
- Entry type: `PlcGuidedLearningEntry`.
- Parser: validates `title is string`, `stepCount is number`, `syncGroupId is string`, etc.
- Mutators: `shareGuidedLearningWithPlc`, `mirrorPlcGuidedLearningHeader`, `unshareGuidedLearningFromPlc`, `restoreGuidedLearningInPlc`.
- Standalone `writePlcGuidedLearningEntry(plcId, uid, input)`.

### 8D: Extend `useGuidedLearningAssignments`

**File to MODIFY: `hooks/useGuidedLearningAssignments.ts`**

`createAssignment` currently writes with no PLC side-effect. Add:

- Fire-and-forget `writePlcAssignmentIndexEntry` with `kind: 'guided-learning'` when `input.plc` is set (new optional field on `CreateAssignmentInput`).
- `archiveAssignment`/`unarchiveAssignment` status mirroring via `mirrorPlcAssignmentStatus` (same `useRef` mirror pattern — the GL hook calls `setStatus` internally, so mirror the status update the same way Phase 3/4 hooks do it from `setStatus`).

The `GuidedLearningAssignment` type in `types.ts` needs `plc?: PlcLinkage` added (matching Quiz/VA assignment shape).

The `CreateAssignmentInput` interface gains `plc?: PlcLinkage`.

### 8E: Widen `assignment_index` Firestore Rule

**File to MODIFY: `firestore.rules`**

Both `create` and `update` branches of `assignment_index`:

```
&& request.resource.data.kind in ['quiz', 'video-activity', 'mini-app', 'guided-learning']
```

(Phase 7 already widened to include `'mini-app'`; Phase 8 adds `'guided-learning'`.)

### 8F: New Firestore Subcollection Rule

**File to MODIFY: `firestore.rules`**

Add inside `match /plcs/{plcId}` after the mini-apps block:

```
match /guided_learning/{plcGuidedLearningId} {
  allow read: if request.auth != null
    && request.auth.uid in get(
         /databases/$(database)/documents/plcs/$(plcId)
       ).data.memberUids;

  allow create: if request.auth != null
    && plcCanEditContent(plcId)
    && request.resource.data.keys().hasOnly([
         'id', 'title', 'stepCount', 'syncGroupId',
         'sharedBy', 'sharedByEmail', 'sharedByName',
         'sharedAt', 'updatedAt', 'deletedAt'
       ])
    && plcGuidedLearningId == request.resource.data.id
    && request.resource.data.sharedBy == request.auth.uid
    && request.resource.data.title is string
    && request.resource.data.stepCount is int
    && request.resource.data.stepCount >= 0
    && request.resource.data.syncGroupId is string
    && request.resource.data.syncGroupId.size() > 0
    && request.resource.data.sharedByEmail is string
    && request.resource.data.sharedByName is string
    && request.resource.data.sharedAt is int
    && request.resource.data.updatedAt is int
    && plcSubDeletedAtOk();

  allow update: if request.auth != null
    && plcCanEditContent(plcId)
    && request.resource.data.keys().hasOnly([
         'id', 'title', 'stepCount', 'syncGroupId',
         'sharedBy', 'sharedByEmail', 'sharedByName',
         'sharedAt', 'updatedAt', 'deletedAt'
       ])
    && request.resource.data.id == resource.data.id
    && request.resource.data.syncGroupId == resource.data.syncGroupId
    && request.resource.data.sharedBy == resource.data.sharedBy
    && request.resource.data.sharedByEmail == resource.data.sharedByEmail
    && request.resource.data.sharedByName == resource.data.sharedByName
    && request.resource.data.sharedAt == resource.data.sharedAt
    && request.resource.data.title is string
    && request.resource.data.stepCount is int
    && request.resource.data.stepCount >= 0
    && request.resource.data.updatedAt is int
    && plcSubDeletedAtOk();

  allow delete: if request.auth != null
    && plcCanEditContent(plcId);
}
```

Also add `synced_guided_learning` rule block, mirroring `synced_video_activities`. The `GuidedLearningStep[]` content is opaque to Firestore rules — the rule validates that `content is map` on the canonical doc and leans on the Cloud Function for shape validation, same posture as VA questions.

### 8G: PLC Dashboard Wiring

**File to MODIFY: `components/plc/sections.ts`**

Add to `PlcSectionId` union: `| 'guidedLearning'`

Add to `PLC_SECTIONS` (after `miniApps`, before `members`):

```typescript
{
  id: 'guidedLearning',
  icon: GraduationCap,  // or BookMarked from lucide-react
  labelKey: 'plcDashboard.tabs.guidedLearning',
  labelDefault: 'Guided Learning',
  isEnabled: (features) => features.guidedLearning,
},
```

Add `'guidedLearning'` to `PLC_ROUTE_SECTIONS`.

**File to MODIFY: `components/plc/PlcDashboard.tsx`**

Add import of `PlcGuidedLearningBody`. Add `'guidedLearning'` case to `renderSection`.

**File to MODIFY: `components/plc/tabs/PlcSettingsTab.tsx`**

Add to `FEATURE_ROWS`:

```typescript
{
  key: 'guidedLearning',
  icon: GraduationCap,
  titleKey: 'plcDashboard.settings.guidedLearning.title',
  titleDefault: 'Guided Learning',
  descriptionKey: 'plcDashboard.settings.guidedLearning.description',
  descriptionDefault:
    'Share guided learning sets with the PLC. Members can sync or copy into their own library.',
},
```

### 8H: New UI Components

**File to CREATE: `components/plc/bodies/PlcGuidedLearningBody.tsx`**

Template: `components/plc/bodies/PlcVideoActivitiesBody.tsx`.

Differences from VA:

- `isDriveConnected` guard on import (GL requires Drive to save a personal set).
- Import "Sync" path: `pullSyncedGuidedLearningContent(syncGroupId)` → reconstruct a `GuidedLearningSet` from the canonical steps → call `useGuidedLearning.saveSet(freshSet)` (Drive write) → call `callJoinPlcGuidedLearningSyncGroup(plcId, plcGuidedLearningId)` → `attachSyncLinkage` on the personal metadata.
- Import "Copy" path: pull content → `saveSet(freshSet)` with no sync linkage.
- Edit flow: load from Drive via `loadSetData(driveFileId)`, open `GuidedLearningEditorModal` (locate in `components/widgets/GuidedLearning/`). On save: `saveSet(updated, meta.driveFileId)` + `publishSyncedGuidedLearning(...)`.
- Version conflict: throw `SyncedGuidedLearningVersionConflictError` → auto-pull via `pullSyncedGuidedLearningContent` + re-run `saveSet`.
- Share flow: `loadSetData(meta.driveFileId)` → `createSyncedGuidedLearningGroup(...)` → attach sync linkage on `GuidedLearningSetMetadata` → `writePlcGuidedLearningEntry(...)`.
- "In your library" badge: `personalBySyncGroup` built from `sets` filtered by `meta.sync?.groupId`.

**File to CREATE: `components/plc/PlcGuidedLearningImportModal.tsx`**

Template: `components/plc/PlcVideoActivityImportModal.tsx`. Replace "video activity" with "guided learning set".

**File to MODIFY: `components/widgets/GuidedLearning/` (manager component)**

Locate the GL library manager (likely `components/widgets/GuidedLearning/components/GuidedLearningManager.tsx` or similar — confirm via glob). Add `onShareWithPlc?: (setId: string) => void` prop. Add "Share with PLC" kebab item. Wire from the parent `Widget.tsx`.

**File to MODIFY: `components/widgets/GuidedLearning/Widget.tsx`** (confirm path)

Wire `handleShareWithPlc(setId)` using the same flow as Mini-Apps: load Drive content → create synced group → attach sync linkage → write PLC subcoll header. Rollback shape mirrors VA/Mini-App.

### 8I: Home Tile

**File to CREATE: `components/plc/home/` (tile path)**

`GuidedLearningTile.tsx` — mirrors Mini-Apps tile, shows step count + "Open in tab" footer.

**File to MODIFY: `components/plc/home/PlcHome.tsx`**

Add `guidedLearning` tile gated by `features.guidedLearning`.

---

## Complete File Map

### Files to CREATE (Phase 7)

| File                                                        | Template                                                                                               |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `hooks/useSyncedMiniAppGroups.ts`                           | `hooks/useSyncedVideoActivityGroups.ts`                                                                |
| `hooks/usePlcMiniApps.ts`                                   | `hooks/usePlcVideoActivities.ts`                                                                       |
| `functions/src/plcMiniAppSyncJoin.ts`                       | `functions/src/plcVideoActivitySyncJoin.ts`                                                            |
| `functions/src/plcMiniAppSyncJoin.test.ts`                  | `functions/src/plcVideoActivitySyncJoin.test.ts`                                                       |
| `components/plc/bodies/PlcMiniAppsBody.tsx`                 | `components/plc/bodies/PlcVideoActivitiesBody.tsx`                                                     |
| `components/plc/PlcMiniAppImportModal.tsx`                  | `components/plc/PlcVideoActivityImportModal.tsx`                                                       |
| `components/plc/home/cards/MiniAppsTile.tsx` (confirm path) | video activities tile                                                                                  |
| `tests/hooks/usePlcMiniApps.test.ts`                        | `tests/hooks/usePlcVideoActivities.test.ts` (if exists) or `tests/hooks/usePlcAssignmentIndex.test.ts` |
| `tests/rules/plcMiniApps.test.ts`                           | `tests/rules/plcAssignmentIndex.test.ts`                                                               |

### Files to CREATE (Phase 8)

| File                                                              | Template                                           |
| ----------------------------------------------------------------- | -------------------------------------------------- |
| `hooks/useSyncedGuidedLearningGroups.ts`                          | `hooks/useSyncedVideoActivityGroups.ts`            |
| `hooks/usePlcGuidedLearning.ts`                                   | `hooks/usePlcVideoActivities.ts`                   |
| `functions/src/plcGuidedLearningSyncJoin.ts`                      | `functions/src/plcVideoActivitySyncJoin.ts`        |
| `functions/src/plcGuidedLearningSyncJoin.test.ts`                 | `functions/src/plcVideoActivitySyncJoin.test.ts`   |
| `components/plc/bodies/PlcGuidedLearningBody.tsx`                 | `components/plc/bodies/PlcVideoActivitiesBody.tsx` |
| `components/plc/PlcGuidedLearningImportModal.tsx`                 | `components/plc/PlcVideoActivityImportModal.tsx`   |
| `components/plc/home/cards/GuidedLearningTile.tsx` (confirm path) | video activities tile                              |
| `tests/hooks/usePlcGuidedLearning.test.ts`                        | same as mini-apps test                             |
| `tests/rules/plcGuidedLearning.test.ts`                           | same as mini-apps rules test                       |

### Files to MODIFY (both phases)

| File                                                          | Change                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `types.ts`                                                    | `PlcMiniAppEntry`, `PlcGuidedLearningEntry`, `SyncedMiniAppGroup`, `SyncedGuidedLearningGroup`, version snapshot types, extend `PlcFeatureSettings` + `DEFAULT_PLC_FEATURE_SETTINGS`, add `sync?` to `MiniAppItem` and `GuidedLearningSetMetadata`, add `plc?` to `MiniAppAssignment` and `GuidedLearningAssignment`, extend `CreateMiniAppAssignmentInput.plc?` and `CreateAssignmentInput.plc?` |
| `firestore.rules`                                             | New `mini_apps/` and `guided_learning/` PLC subcollection blocks; new `synced_mini_apps` and `synced_guided_learning` top-level blocks; widen `assignment_index.kind` union                                                                                                                                                                                                                       |
| `functions/src/index.ts`                                      | Export two new CFs                                                                                                                                                                                                                                                                                                                                                                                |
| `components/plc/sections.ts`                                  | `PlcSectionId` union, `PLC_SECTIONS` array, `PLC_ROUTE_SECTIONS` set (two new entries per phase)                                                                                                                                                                                                                                                                                                  |
| `components/plc/PlcDashboard.tsx`                             | Two new `renderSection` cases and imports                                                                                                                                                                                                                                                                                                                                                         |
| `components/plc/tabs/PlcSettingsTab.tsx`                      | Two new `FEATURE_ROWS` entries                                                                                                                                                                                                                                                                                                                                                                    |
| `hooks/useMiniAppAssignments.ts`                              | PLC index side-effect on `createAssignment`, status mirroring on `endAssignment`/`reactivateAssignment`                                                                                                                                                                                                                                                                                           |
| `hooks/useGuidedLearningAssignments.ts`                       | PLC index side-effect on `createAssignment`, status mirroring on `archiveAssignment`/`unarchiveAssignment`                                                                                                                                                                                                                                                                                        |
| `components/widgets/MiniApp/components/MiniAppManager.tsx`    | `onShareWithPlc` prop + kebab item                                                                                                                                                                                                                                                                                                                                                                |
| `components/widgets/MiniApp/Widget.tsx`                       | `handleShareWithPlc` + `PlcShareTargetModal` wiring                                                                                                                                                                                                                                                                                                                                               |
| `components/widgets/GuidedLearning/Widget.tsx` (confirm path) | Same as MiniApp widget                                                                                                                                                                                                                                                                                                                                                                            |
| `components/widgets/GuidedLearning/` manager component        | `onShareWithPlc` prop + kebab item                                                                                                                                                                                                                                                                                                                                                                |
| `components/plc/home/PlcHome.tsx`                             | Two new tile entries                                                                                                                                                                                                                                                                                                                                                                              |
| `locales/en.json`                                             | All new `plcDashboard.miniApps.*`, `plcDashboard.guidedLearning.*`, and `plcDashboard.settings.miniApps.*`/`guidedLearning.*` keys with English `defaultValue` strings                                                                                                                                                                                                                            |

---

## Data Flow

### Share flow (teacher shares a Mini-App with their PLC)

1. Teacher clicks kebab on a personal mini-app row in `MiniAppManager` → "Share with PLC".
2. `Widget.tsx handleShareWithPlc(appId)`: load `MiniAppItem` from local `library`.
3. Check `app.sync?.groupId` — if already in a PLC sync group, toast "Already shared" and bail.
4. Mint `syncGroupId = crypto.randomUUID()`.
5. Call `createSyncedMiniAppGroup({ groupId: syncGroupId, uid, title: app.title, html: app.html, plcId })`.
6. Attach sync linkage on personal app: `setDoc update` on `users/{uid}/miniapps/{appId}` with `{ sync: { groupId: syncGroupId, lastSyncedVersion: 1 } }`.
7. On linkage failure: call `callLeaveSyncedMiniAppGroup(syncGroupId)` (rollback). Throw.
8. Call `writePlcMiniAppEntry(plcId, uid, { plcMiniAppId: uuid, syncGroupId, title, charCount: app.html.length, ... })`.
9. Success toast. `setShareWithPlcTarget(null)`.

### Import flow (Sync mode)

1. Teacher clicks "Add to my library" on a PLC mini-app row → `PlcMiniAppImportModal` opens.
2. Teacher picks "Sync" → `handleImport(target, 'sync')`.
3. `pullSyncedMiniAppContent(syncGroupId)` → `{ title, html, version }`.
4. Mint fresh `MiniAppItem`, write to `users/{uid}/miniapps/{newId}` via `setDoc`.
5. Call `callJoinPlcMiniAppSyncGroup(plcId, plcMiniAppId)` → `{ groupId, version, alreadyJoined }`.
6. Attach sync linkage: update `users/{uid}/miniapps/{newId}` with `{ sync: { groupId, lastSyncedVersion: Math.max(canonical.version, cf.version) } }`.
7. Success toast.
8. On failure: rollback — `callLeaveSyncedMiniAppGroup(groupId)` + `deleteDoc(users/{uid}/miniapps/{newId})`.

### Assignment index side-effect

When `MiniAppWidget.Widget.tsx` calls `createAssignment` with `plc` set (teacher selected PLC mode at assign time), `useMiniAppAssignments.createAssignment` fires `writePlcAssignmentIndexEntry({ ..., kind: 'mini-app' })` fire-and-forget after the canonical assignment write. The `assignment_index` rule must allow `kind: 'mini-app'` (widened above). The PLC Assignments → In-progress sub-tab surfaces the entry immediately via its live snapshot.

---

## Build Sequence

### Phase 7 — Branch `claude/plc-phase-7-mini-apps`

- [ ] **Step 1: Types** — Add `PlcMiniAppEntry`, `SyncedMiniAppGroup`, `SyncedMiniAppVersionSnapshot` to `types.ts`. Add `sync?` to `MiniAppItem`. Add `plc?` to `MiniAppAssignment`. Extend `PlcFeatureSettings` and `DEFAULT_PLC_FEATURE_SETTINGS` with `miniApps: boolean`. Add `plc?` to `CreateMiniAppAssignmentInput`. Run `pnpm run type-check` — zero errors expected.
- [ ] **Step 2: Firestore rules** — Add `synced_mini_apps` top-level rule block (mirror `synced_video_activities`). Add `mini_apps/` subcollection block inside `match /plcs/{plcId}`. Widen `assignment_index.kind` to include `'mini-app'`. Run `pnpm run test:rules`.
- [ ] **Step 3: Sync groups hook** — Create `hooks/useSyncedMiniAppGroups.ts`. No tests yet. Run `pnpm run type-check`.
- [ ] **Step 4: PLC hook** — Create `hooks/usePlcMiniApps.ts`. Create `tests/hooks/usePlcMiniApps.test.ts`. Run `pnpm run test`.
- [ ] **Step 5: Cloud Function** — Create `functions/src/plcMiniAppSyncJoin.ts`. Create test. Export from `functions/src/index.ts`. Run `pnpm run build:all`.
- [ ] **Step 6: Assignment hook extension** — Modify `hooks/useMiniAppAssignments.ts`. Extend tests. Run `pnpm run test`.
- [ ] **Step 7: Import modal** — Create `components/plc/PlcMiniAppImportModal.tsx`.
- [ ] **Step 8: Body component** — Create `components/plc/bodies/PlcMiniAppsBody.tsx`.
- [ ] **Step 9: Widget wiring** — Modify `MiniAppManager.tsx` + `Widget.tsx`. Run `pnpm run type-check`.
- [ ] **Step 10: Dashboard wiring** — Modify `sections.ts`, `PlcDashboard.tsx`, `PlcSettingsTab.tsx`. Run `pnpm run type-check`.
- [ ] **Step 11: Home tile** — Create `MiniAppsTile.tsx`. Modify `PlcHome.tsx`.
- [ ] **Step 12: i18n** — Add all `plcDashboard.miniApps.*` + `plcDashboard.settings.miniApps.*` keys to `locales/en.json`.
- [ ] **Step 13: Rules tests** — Create `tests/rules/plcMiniApps.test.ts`. Run `pnpm run test:rules`.
- [ ] **Step 14: Validate** — `pnpm run validate`. Fix all lint/format/type errors.
- [ ] **Step 15: CF deploy note** — Document in PR: `firebase deploy --only functions:joinPlcMiniAppSyncGroup` required before Sync import works against real Firebase.

### Phase 8 — Branch `claude/plc-phase-8-guided-learning` (off dev-paul after Phase 7 merges)

- [ ] **Step 1: Types** — Add `PlcGuidedLearningEntry`, `SyncedGuidedLearningGroup`, `SyncedGuidedLearningVersionSnapshot`. Add `sync?` to `GuidedLearningSetMetadata`. Add `plc?` to `GuidedLearningAssignment`. Extend `PlcFeatureSettings` and `DEFAULT_PLC_FEATURE_SETTINGS` with `guidedLearning: boolean`. Add `plc?` to `CreateAssignmentInput`.
- [ ] **Steps 2–13**: Mirror Phase 7 steps 2–13 substituting GL throughout.
- [ ] **Step 14: Validate** — `pnpm run validate`.
- [ ] **Step 15: CF deploy note** — `firebase deploy --only functions:joinPlcGuidedLearningSyncGroup`.

---

## Testing Strategy

### Unit Tests (Vitest)

**Pattern**: Mirror `tests/hooks/usePlcAssignmentIndex.test.ts` (the most complete PLC hook test in the repo).

Required test coverage per hook:

- `usePlcMiniApps` / `usePlcGuidedLearning`:
  - Parser rejects malformed entries (missing required fields).
  - Soft-deleted entries (`deletedAt != null`) drop from the live list.
  - `prevPlcId` render-time reset clears stale data on PLC switch.
  - `shareMiniAppWithPlc` / `shareGuidedLearningWithPlc` writes correctly shaped doc.
  - `mirrorPlcMiniAppHeader` / `mirrorPlcGuidedLearningHeader` patches only `title`/`charCount`/`updatedAt` (does not touch identity fields).
  - `unshareMiniAppFromPlc` / `unshareGuidedLearningFromPlc` writes `deletedAt` tombstone.

- `useMiniAppAssignments` (extended):
  - `createAssignment` with `plc` set fires `writePlcAssignmentIndexEntry` with `kind: 'mini-app'`.
  - `createAssignment` without `plc` set does NOT fire the index write.
  - `endAssignment` mirrors status via `mirrorPlcAssignmentStatus` when `plc.id` is set on the assignment.

- `useGuidedLearningAssignments` (extended):
  - Same shape as mini-app assignment tests, `kind: 'guided-learning'`.

### Firestore Rules Tests (emulator)

**Pattern**: Mirror `tests/rules/plcAssignmentIndex.test.ts`.

Required test coverage per new subcollection:

- Member can read own PLC's mini-app/GL entries.
- Non-member cannot read.
- Member can create with valid schema + `sharedBy == request.auth.uid`.
- Create rejected if `sharedBy != auth.uid`.
- Create rejected if `syncGroupId` is empty string.
- Create rejected with unexpected field.
- Update can change `title`/`charCount`/`stepCount`/`updatedAt`/`deletedAt`.
- Update cannot change identity fields (`id`, `syncGroupId`, `sharedBy`, `sharedByEmail`, `sharedByName`, `sharedAt`).
- Viewer (Decision 3.2) cannot create or update.
- Member can delete.
- `assignment_index` with `kind: 'mini-app'` passes; `kind: 'unknown'` fails.
- `assignment_index` with `kind: 'guided-learning'` passes (after Phase 8).

### Cloud Function Tests

**Pattern**: Mirror `functions/src/plcVideoActivitySyncJoin.test.ts`.

Required test coverage per new CF:

- Unauthenticated request returns `unauthenticated`.
- Missing `plcId`/`plcMiniAppId` returns `invalid-argument`.
- Non-member returns `permission-denied`.
- PLC not found returns `not-found`.
- Entry not found returns `not-found`.
- Entry missing `syncGroupId` returns `failed-precondition`.
- Synced group not found returns `not-found`.
- First join writes participant, returns `alreadyJoined: false`.
- Re-join is idempotent, returns `alreadyJoined: true`, does not bump `version`.

---

## Firestore Collections + Cost/FERPA Implications

### New collections

| Collection                                           | Read scope                                        | Write scope                                                   |
| ---------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------- |
| `synced_mini_apps/{groupId}`                         | Any authenticated user (mirrors `synced_quizzes`) | Participant via transaction (client) or CF (participant join) |
| `synced_mini_apps/{groupId}/versions/{v}`            | Any authenticated user                            | Client (fire-and-forget after publish)                        |
| `synced_guided_learning/{groupId}`                   | Any authenticated user                            | Same as above                                                 |
| `synced_guided_learning/{groupId}/versions/{v}`      | Any authenticated user                            | Client fire-and-forget                                        |
| `plcs/{plcId}/mini_apps/{plcMiniAppId}`              | PLC members only                                  | PLC members (non-viewer)                                      |
| `plcs/{plcId}/guided_learning/{plcGuidedLearningId}` | PLC members only                                  | PLC members (non-viewer)                                      |

### Read cost estimate

- Per teacher per PLC dashboard open: +2 snapshot listeners (one for mini-apps subcoll, one for GL subcoll), each gated on `features.miniApps`/`features.guidedLearning`. Same pattern as existing quiz/VA listeners — cost is proportional to PLC library size, typically small.
- Auto-pull sync (Decision 5.2): synced group `onSnapshot` per synced replica the teacher has imported. Scales with imported content count per teacher. Identical cost model to VA.

### FERPA implications

- `synced_mini_apps` and `synced_guided_learning` canonical docs contain **only teacher-authored content** (html, steps) — no student PII. Read is open to any authenticated user (same posture as `synced_quizzes`). No FERPA concern.
- `plcs/{plcId}/mini_apps/` and `plcs/{plcId}/guided_learning/` are PLC-member-gated. No student PII in these docs. No FERPA concern.
- `assignment_index` entries with `kind: 'mini-app'` / `kind: 'guided-learning'` contain `ownerName`, `ownerEmail` (teacher PII), same as existing quiz entries. The rules and posture are unchanged — members-only read. Existing `sheetUrl` Google-Sheets domain pin is only required for the quiz/VA path (mini-app/GL assignments don't export to sheets). The `sheetUrl` field is already required by the current rule schema for all `assignment_index` entries — confirm whether this must be relaxed or a placeholder URL is acceptable. **Flag for Paul**: the current `assignment_index` rule requires `sheetUrl` on both create and update. Mini-app and GL assignments don't have PLC sheets. The rule must either (a) make `sheetUrl` optional (breaking for existing entries unless guarded) or (b) require a placeholder string for new kinds. **Recommended**: widen the rule to allow `sheetUrl` to be absent when `kind in ['mini-app', 'guided-learning']`. This is a surgical rule change.

### Revised assignment_index rule note

The `keys().hasOnly([...])` list currently includes `sheetUrl`. Mini-app and GL assignments will not write a `sheetUrl`. The rule must be widened:

Option A: Make `sheetUrl` optional in `keys().hasOnly([...])` by moving the `sheetUrl.matches(...)` constraint behind a `&& (!('sheetUrl' in request.resource.data) || request.resource.data.sheetUrl.matches(...))` guard. This is the cleaner path.

Option B: Require callers to pass `sheetUrl: ''` (empty string) for non-sheet kinds. The domain regex `^https://docs[.]google[.]com/spreadsheets/.*$` would reject `''`, so this requires a separate rule branch per kind. Messy.

**Recommend Option A**. Add a note to the PR description explaining the intentional loosening and its safety (the domain-pin only needs to fire on quiz/VA rows that actually link to sheets, not on new kinds).

---

## Risks and Mitigations

**Risk 1: `synced_mini_apps` HTML blob size.** Mini-app HTML can be large (AI-generated, multi-KB). Firestore document limit is 1 MB. A worst-case AI-generated app could push close to this. **Mitigation**: add a client-side guard in `createSyncedMiniAppGroup` rejecting `html.length > 500_000` (500 KB, conservative). Log the rejection via `logError`. Document the limit in the PR.

**Risk 2: GL sync group step content size.** `GuidedLearningStep[]` can be large if the set has many steps with embedded text. Same 1 MB Firestore limit applies. **Mitigation**: `publishSyncedGuidedLearning` should reject if `JSON.stringify(steps).length > 700_000`. Document the limit.

**Risk 3: Missing `attachSyncLinkage` on `useGuidedLearning`.** The `useGuidedLearning` hook does not currently expose an `attachSyncLinkage` function (unlike `useVideoActivity` which does). This function is needed in `PlcGuidedLearningBody` and `useGuidedLearningAssignments` to write `sync.groupId` / `sync.lastSyncedVersion` onto a personal `GuidedLearningSetMetadata` doc. **Mitigation**: add `attachSyncLinkage(setId: string, linkage: { groupId: string; lastSyncedVersion: number }) => Promise<void>` to `useGuidedLearning` and its result type, analogous to `useVideoActivity.attachSyncLinkage`. This is a hook-extension step that must precede the body component work.

**Risk 4: GL editor modal location.** The spec references a `GuidedLearningEditorModal` but its file path is not confirmed. Before writing `PlcGuidedLearningBody`, locate the GL editor component. The MiniApp widget uses `MiniAppEditorModal` at `components/widgets/MiniApp/components/MiniAppEditorModal.tsx`. The GL widget may have an equivalent. If no modal exists, Phase 8 should scope edit-in-place as a follow-up (same decision made in Phase 4 for VA when the Drive-less editor wasn't ready).

**Risk 5: `useMiniAppSync` uses direct `setDoc`/`writeBatch` instead of a hook-level `saveApp` abstraction.** Attaching sync linkage requires an update to the `miniapps` collection doc. Currently there is no `updateApp` abstraction in `useMiniAppSync`. The share flow in `Widget.tsx` will need to call `updateDoc(doc(db, 'users', uid, 'miniapps', appId), { sync: ... })` directly, or `useMiniAppSync` needs to expose an `updateApp` mutator. **Mitigation**: add `updateApp(appId: string, patch: Partial<MiniAppItem>) => Promise<void>` to `useMiniAppSync` and expose it from the hook return. This avoids the widget holding a raw Firestore reference.

**Risk 6: Assignment index `sheetUrl` required field.** Confirmed by reviewing the rule (line 2217): `sheetUrl` is in the `keys().hasOnly([...])` list and has the domain regex match constraint on both `create` and `update`. Mini-app and GL PLC assignments will not have a Google Sheet. The rule must be updated before any assignment index write with `kind: 'mini-app'` or `kind: 'guided-learning'` can succeed. This is a required change for Phases 7 and 8. The change must be deployed alongside the client code or the PLC index write will silently fail (fire-and-forget, logged via `logError`).

---

## PLC Roadmap Doc Updates (post-implementation)

After each phase ships, the implementing agent must:

1. Check the phase box in `docs/PLC_ROADMAP.md`.
2. Fill in "Notes from implementation" with: files changed, surprises, wildcard resolutions (did synced_mini_apps need to be stood up? Yes. GL editor modal status?).
3. Update the "Last updated" timestamp.
4. If either phase diverges from this spec, update the relevant later-phase section to reflect reality.
