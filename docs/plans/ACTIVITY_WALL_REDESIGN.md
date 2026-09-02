# Activity Wall — Padlet-lite redesign

Rebuilds the Activity Wall widget, student submission page, and shared gallery. Scope was
settled in a design interview on 2026-09-02; this document is the contract and the input to
`/pauls-skills:mass-plan-implementation`. Every item below is self-contained: an implementer
should be able to build it from the item text plus the code, without this conversation.

Out of scope (separate follow-ups): LTI / Google Classroom pickers for walls, the
"my-classes" restructure of `/my-assignments`, teacher-uploaded custom banners.

## Why

A teacher needs a collaborative board without a paid Padlet. The current widget is a prototype:
the creation screen leads with disconnected "Word Cloud / Padlet" modes, students join through
a base64 `?data=` link with an anonymous sign-in, there is no open/closed state, no submission
cap, no appearance, photos archive to Drive only while the teacher's widget is open, and the
gallery page can clobber a signed-in teacher's session. The rebuild keeps the "simple is good"
brief: layout first, toggles for what students may post, one link, one gallery.

## Product decisions (settled — do not re-litigate)

| Decision          | Answer                                                                                                                                                                                      |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Layouts           | Wall, Columns, Table, Timeline, Map, Word Cloud. All functional. Layout is the first choice, shown as a visual card grid; everything else is one form with grouped sections.                |
| Timeline          | Free-text label per post plus drag order. No real dates.                                                                                                                                    |
| Map               | Real map tiles (Leaflet + OpenStreetMap). Student drops a pin and attaches a card.                                                                                                          |
| Word Cloud        | Its own layout with single word/phrase input. No cards behind it, no photo/link types.                                                                                                      |
| Submission types  | Text always on. Photo, external link, file (PDF/doc), video are per-wall toggles.                                                                                                           |
| Long-term storage | **Nothing student-uploaded persists in Firebase Storage.** Storage is a transit buffer; a server-side job archives to the teacher's Drive via the stored refresh token and deletes staging. |
| Drive visibility  | Domain-restricted (`type: domain`, teacher's email domain) unless the wall allows guests, then `anyone` with link.                                                                          |
| Student access    | Direct link only, no join code. Link routes through student SSO. Per-wall "Allow guests" keeps an anonymous path (admins/testing).                                                          |
| Attribution       | Identity always recorded on the submission. Per-wall toggle controls whether names show in the gallery.                                                                                     |
| Caps              | Optional max posts per student, default unlimited.                                                                                                                                          |
| Student editing   | Teacher toggles whether students may edit / delete their own posts while the wall is open.                                                                                                  |
| Open/closed       | Prominent toggle on the widget front face and in library rows. Closed wall shows students a "Closed" screen; gallery still displays.                                                        |
| Teacher powers    | Approve/reject, delete, move between columns/cells, pin, edit post text.                                                                                                                    |
| Reuse             | Posts persist per wall. "Clear posts" and "Duplicate wall" actions.                                                                                                                         |
| Widget front face | Live preview of the active wall with open/closed state, pending-moderation count, share, "Open gallery". Library and creation live in a modal.                                              |
| Library           | Search, sort by recent, appearance thumbnails. No folders in this pass.                                                                                                                     |
| Gallery           | Chrome-free, live, reached by an `/r/<code>` short link opened in a new tab. Never signs in anonymously when a user already exists. Likes/comments stay as per-wall toggles, default off.   |
| Appearance        | Solid colors, gradients, admin backgrounds library (`admin_backgrounds`).                                                                                                                   |
| Migration         | Legacy walls migrate in place on first load.                                                                                                                                                |
| Delivery          | Phased PRs on `dev-paul`.                                                                                                                                                                   |

## Constraints discovered in code (do not re-derive)

| Fact                                                                                                                                                                                                                        | Source                                                                                    | Consequence                                                                                                                                                                                                           |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Walls live in `/users/{uid}/activity_wall_activities/{id}` via `useActivityWallLibrary`; `config.activities` is a deprecated legacy field with a one-shot migration.                                                        | `hooks/useActivityWallLibrary.ts`, `Widget.tsx:605-656`                                   | New fields go on the library entry. Keep the migration; extend it.                                                                                                                                                    |
| The widget mirrors the active wall into `activity_wall_sessions/{uid}_{activityId}` with `setDoc(merge)` whenever `activeActivityId` changes.                                                                               | `Widget.tsx:446-472`                                                                      | Every field students need (layout, sections, allowed types, open state, caps, appearance) must be mirrored there; students never read the library doc.                                                                |
| `RemoteActivityWallControl.tsx` reads `config.activities` and duplicates `encodeActivityData`/`buildPublicActivityLink` verbatim.                                                                                           | `components/remote/controls/RemoteActivityWallControl.tsx`                                | Any rebuild must update the remote control in the same PR or it breaks silently.                                                                                                                                      |
| Student page signs in anonymously and decodes a base64url `?data=` payload; no `studentRole` detection at all.                                                                                                              | `ActivityWallStudentApp.tsx:5, 67-96, 336-339`                                            | SSO support is new work. Quiz/GL/MiniApp detect SSO via `getIdTokenResult().claims.studentRole === true` — copy that.                                                                                                 |
| `/student/login?next=` only allows `/quiz` and `/join`.                                                                                                                                                                     | `utils/studentJoinRouting.ts:21-33`                                                       | Add `/activity-wall` to the allowlist.                                                                                                                                                                                |
| `/my-assignments` lists walls with `hrefFrom: /activity-wall/{sessionId}`.                                                                                                                                                  | `hooks/useStudentAssignments.ts:268-284`                                                  | The new student route must accept `/activity-wall/{sessionId}` with no query params.                                                                                                                                  |
| Rules already gate `studentRole` callers by `classIds` on submission create and force `status` by `moderationEnabled`.                                                                                                      | `firestore.rules:4226-4242`                                                               | Extend, don't replace. `keys().hasOnly([...])` whitelist must grow with every new submission field.                                                                                                                   |
| Rules detect anonymous via `request.auth.token.firebase.sign_in_provider == 'anonymous'`; SSO via `isStudentRoleUser()`.                                                                                                    | `firestore.rules:26-28, 4195`                                                             | "Allow guests" is enforceable server-side.                                                                                                                                                                            |
| One-doc-per-student pattern: deterministic doc IDs keyed by uid (quiz responses, poll votes, wall likes).                                                                                                                   | `firestore.rules:3272-3314, 4295-4326, 1398`                                              | Per-student cap = submission id `{uid}__{n}`; rules check the regex and `int(id.split('__')[1]) < maxPostsPerStudent`.                                                                                                |
| Photo archive: client uploads to `activity_wall_photos/{sessionId}/{submissionId}`; the teacher widget calls `archiveActivityWallPhoto` with a **client** access token; function sets Drive perm `anyone`, deletes Storage. | `driveArchive.ts:159-318`, `Widget.tsx:875-1068`, `storage.rules:112-143`                 | Archive only happens while a teacher's widget is open. Replace with a server-driven pipeline.                                                                                                                         |
| Server-side refresh tokens exist: `refreshGoogleAccessTokenForUid(uid)` throws `failed-precondition` / `needs-consent` when none is stored. Quiz media archive already uses it.                                             | `functions/src/googleOAuth.ts:317-327`, `quizMediaArchive.ts:664`                         | New archive uses this. Teachers without a stored token get a "Connect Drive" prompt (existing `utils/googleOAuthRefresh.ts` enrollment flow).                                                                         |
| Quiz media archive pattern: transactional claim, `attemptCount`, `failed` → `lost` after 5 attempts, hourly `sweepStuckQuizArchives`, Storage cleanup as a separate pass.                                                   | `quizMediaArchive.ts:81-87, 703-957`, `sweepStuckQuizArchives.ts`                         | Mirror this shape for walls.                                                                                                                                                                                          |
| Function tests mock `./googleOAuth` at the module boundary and inject a deps object into an exported core.                                                                                                                  | `functions/src/quizMediaArchive.test.ts:1-60`                                             | New archive core must be `archiveActivityWallMediaCore(deps, ...)` for the same reason.                                                                                                                               |
| No "new-client marker" convention exists in the archive code. The only analog is a per-session opt-in boolean (`finalizeIdleQuizAttempts.ts:142`).                                                                          | grep of `functions/src`                                                                   | Backward compatibility with the prod client is handled by keeping the old callable and making both paths claim transactionally (see item P1-4).                                                                       |
| Gallery route signs in anonymously if `auth.currentUser` is null on mount, before Firebase restores a persisted session.                                                                                                    | `ActivityWallGalleryView.tsx:102-120`                                                     | This is the "Drive disconnect on Gallery View" bug. Fix: wait for the first `onAuthStateChanged` emission before deciding.                                                                                            |
| `/activity-wall/**` mounts under `DialogProvider` + `StudentIdleTimeoutGuard`; `/r/:code` mounts with zero providers.                                                                                                       | `App.tsx:523-529, 776-797`                                                                | Gallery gets its own provider-free branch like `/r`.                                                                                                                                                                  |
| `short_links` create is admin-only; teachers cannot mint one. `get` is public.                                                                                                                                              | `firestore.rules:732-744`, `hooks/useShortLinks.ts:99-222`                                | Rules extension: any non-anonymous user may create a code whose `destination` path is `/activity-wall/gallery/<shareId>` on the app origin and `createdBy == uid`.                                                    |
| Library shell with search/sort/cards exists and is used by Quiz, GL, VA, MiniApp managers.                                                                                                                                  | `components/common/library/{LibraryShell,LibraryToolbar,LibraryGrid,LibraryItemCard}.tsx` | The wall library uses it; no hand-rolled list.                                                                                                                                                                        |
| dnd-kit is installed and used (`components/common/SortableList.tsx`, `LibraryDndContext.tsx`). No map or word-cloud library. Word cloud is hand-rolled in `Widget.tsx:163-259`.                                             | `package.json`                                                                            | Reuse dnd-kit for teacher drag. Add `leaflet` + `react-leaflet` (and `@types/leaflet`). Move the word cloud helpers into a shared util.                                                                               |
| Backgrounds: `useBackgrounds()` returns `{presets, colors, patterns, gradients}`; presets are `admin_backgrounds` docs filtered by access level. Gradients are Tailwind class strings.                                      | `hooks/useBackgrounds.ts`, `config/backgrounds.ts`, `types.ts:7201-7218`                  | Wall appearance stores `{kind, value}` where kind is color, gradient, or image and value is the Tailwind class or the preset image URL. Student and gallery pages must not import `useBackgrounds` (needs `useAuth`). |
| No link-preview fetcher exists. `functions/src/embedProxy.ts` is the SSRF-guarded fetch template (https only, closed allowlist, 1MB cap, `maxRedirects: 0`).                                                                | `functions/src/embedProxy.ts`                                                             | New `fetchLinkPreview` callable follows its guards but with an open host list and private-IP blocking instead of an allowlist.                                                                                        |
| CSP headers in `firebase.json` are `frame-ancestors` only.                                                                                                                                                                  | `firebase.json:70-95`                                                                     | OpenStreetMap tiles and Drive thumbnails load without header changes.                                                                                                                                                 |
| Activity Wall has no i18n; strings are English literals.                                                                                                                                                                    | grep                                                                                      | Stay consistent: English literals, no `t()` in this pass.                                                                                                                                                             |
| Dev branch pushes deploy rules, indexes, Storage rules, and Functions to the shared prod project.                                                                                                                           | repo memory                                                                               | Rules/functions changes must stay backward compatible with the currently deployed client at every merge.                                                                                                              |

## Data model

All new fields are optional in TypeScript so legacy documents still parse. Normalizers supply
defaults.

### `ActivityWallLibraryEntry` (`/users/{uid}/activity_wall_activities/{id}`)

```ts
layout: 'wall' | 'columns' | 'table' | 'timeline' | 'map' | 'wordcloud';   // default from legacy mode: text→'wordcloud', photo→'wall'
sections?: { id: string; label: string }[];                              // columns layout (ordered)
tableRows?: { id: string; label: string }[];                             // table layout
tableCols?: { id: string; label: string }[];
mapCenter?: { lat: number; lng: number; zoom: number };                  // map layout
allowedTypes: { photo: boolean; link: boolean; file: boolean; video: boolean }; // text always on; ignored for wordcloud
appearance: { kind: 'color' | 'gradient' | 'image'; value: string };    // Tailwind class or preset URL; default {kind:'gradient', value:'bg-gradient-to-br from-slate-900 to-slate-700'}
moderationEnabled: boolean;
allowGuests: boolean;                 // legacy anonymous/pin modes → true; name/name-pin → true (identity was never real)
showNames: boolean;                   // legacy 'name' | 'name-pin' → true, else false
maxPostsPerStudent: number;           // 0 = unlimited
allowStudentEdit: boolean;
allowStudentDelete: boolean;
acceptingResponses: boolean;          // default true on create
classIds?: string[]; rosterIds?: string[]; // unchanged
createdAt; updatedAt;                 // unchanged
```

`mode` and `identificationMode` remain on the type as deprecated and are still written (derived
from `layout`/`showNames`/`allowGuests`) until the remote control and the prod client stop
reading them (item P3-3 removes them).

### `ActivityWallSession` (`activity_wall_sessions/{uid}_{activityId}`)

Mirrors every field above except `createdAt`, plus `updatedAt`, `publiclyShared`, and
`driveVisibility: 'domain' | 'anyone'` (computed from `allowGuests` at mirror time so the
archive function does not need the library doc).

### `ActivityWallSubmission` (`.../submissions/{submissionId}`)

```ts
id: string;                     // `${authorUid}__${n}` when maxPostsPerStudent > 0, else random
type: 'text' | 'word' | 'photo' | 'link' | 'file' | 'video';
content: string;                // text/word body, link URL, or (after archive) Drive URL
title?: string;                 // optional card title (not for word)
authorUid: string;              // always present, SSO pseudonym uid or anonymous uid
isGuest: boolean;               // sign_in_provider == 'anonymous'
participantLabel?: string;      // first name from sessionStorage for SSO, "Guest" otherwise
status: 'approved' | 'pending';
submittedAt: number; editedAt?: number;
sectionId?: string;             // columns
cellKey?: string;               // table: `${rowId}|${colId}`
order?: number;                 // timeline sort key (float; teacher drag re-spaces)
label?: string;                 // timeline caption
lat?: number; lng?: number;     // map
pinned?: boolean;
linkPreview?: { title?: string; description?: string; image?: string; domain: string };
fileName?: string; mimeType?: string; sizeBytes?: number;
storagePath?: string;           // transit only; deleted on archive
archiveStatus?: 'firebase' | 'syncing' | 'archived' | 'failed' | 'lost';
attemptCount?: number; archiveStartedAt?; archivedAt?; archiveError?;
driveFileId?: string; driveUrl?: string;
```

Legacy submissions have no `type`: normalize `content` starting with `http` on a photo wall as
`photo`, otherwise `text`.

### Storage paths

`activity_wall_media/{sessionId}/{submissionId}/{fileName}`. Caps enforced in `storage.rules`:
image 15 MB, video 200 MB, file (`application/pdf`, docx/pptx/xlsx MIME set) 25 MB. Create
requires the session doc to exist and `acceptingResponses == true`. The old
`activity_wall_photos` block stays until P3-3.

### Drive layout

`SpartBoard / Activity Walls / <wall title> (<activityId short>) / <fileName>`. Reuse the folder
helpers in `driveArchive.ts`. Image URL for rendering: `https://drive.google.com/thumbnail?id=<id>&sz=w2000`
(works for domain-restricted files when the viewer's browser is signed into a domain account).
Video: `https://drive.google.com/file/d/<id>/preview` in an iframe. File: `https://drive.google.com/file/d/<id>/view`
as a link. The `lh3.googleusercontent.com/d/` form is not used for new archives.

## Routes

| Path                               | Providers           | Component                                  |
| ---------------------------------- | ------------------- | ------------------------------------------ |
| `/activity-wall/{sessionId}`       | Dialog + idle guard | `ActivityWallStudentApp` (submission page) |
| `/activity-wall/gallery/{shareId}` | none                | `ActivityWallGalleryView` (chrome-free)    |
| `/r/{code}`                        | none                | existing redirect → gallery                |

The `?data=` payload link is removed. Teacher "Copy link" yields
`${origin}/student/login?next=/activity-wall/{sessionId}` when `allowGuests` is false and
`${origin}/activity-wall/{sessionId}` when true. The student page itself, when it finds no
user and `allowGuests` is false, redirects to `/student/login?next=<current path>`.

## Phases and items

Each item has: model tier for the implementer, key files, done-when, and notes. Items within a
phase are file-disjoint unless stated. **Protected files** (owned by the orchestrator, shipped as
small dedicated PRs from implementers' `concerns`): `firestore.rules`, `storage.rules`,
`firestore.indexes.json`, `firebase.json`, `.github/workflows/*`. Implementers describe the exact
rule text they need in `concerns`; the rule text is drafted below so they can quote it.

### Phase 1 — data model, pipeline, auth (must land before Phase 2)

#### P1-1 Types, normalizers, and defaults — `sonnet`

Key files: `types.ts:1662-1850`, `utils/activityWallNormalize.ts`, `hooks/useActivityWallLibrary.ts`, `config/widgetDefaults.ts:143-152`, `tests/utils/activityWallLibraryNormalize.test.ts`, `tests/hooks/useActivityWallLibrary.test.ts`.

Do: add the fields from "Data model" to `ActivityWallLibraryEntry`, `ActivityWallSession`, `ActivityWallSubmission`, and new `ActivityWallLayout` / `ActivityWallSubmissionType` / `ActivityWallAppearance` types. Extend `normalizeActivityWallLibraryEntry` to derive `layout`, `allowedTypes`, `allowGuests`, `showNames` from legacy `mode` / `identificationMode` per the mapping in the data model, and to default every new field. Add `normalizeActivityWallSubmission(id, data)` and `normalizeActivityWallSession(id, data)` in the same util. Add `buildDefaultWall(defaults)` that returns a blank entry (replaces `buildBlankActivity` in `Widget.tsx:261`). Export a pure `mirrorSessionFromEntry(entry, uid): ActivityWallSession` that computes `driveVisibility`.

Done when: unit tests cover the legacy mapping for all four legacy identification modes and both legacy modes, and `pnpm run type-check` passes with no other file changed except necessary type-only fixes.

Notes: `ActivityWallActivity` (the pre-library type) stays untouched. Do not touch `Widget.tsx` beyond swapping `buildBlankActivity` to the new util if the type change forces it.

#### P1-2 Server-driven Drive archive pipeline — `opus`

Key files: new `functions/src/activityWallArchive.ts`, new `functions/src/activityWallArchive.test.ts`, new `functions/src/sweepActivityWallArchives.ts`, `functions/src/index.ts`, reference `functions/src/quizMediaArchive.ts`, `functions/src/sweepStuckQuizArchives.ts`, `functions/src/driveArchive.ts`, `functions/src/googleOAuth.ts`.

Do:

1. `archiveActivityWallMediaCore(deps, { sessionId, submissionId })` mirroring `archiveQuizArtifactCore`: transactional claim (`archiveStatus` must be `firebase` or `failed` with `attemptCount < 5`, set `syncing` + `archiveStartedAt`), read `storagePath`, metadata size guard, download, get access token via `refreshGoogleAccessTokenForUid(teacherUid)` (teacherUid from the session doc), ensure folder path, upload, set permission based on `session.driveVisibility` (`{type:'domain', domain: <teacher email domain>, role:'reader', allowFileDiscovery:false}` or `{type:'anyone', role:'reader'}`), write `driveFileId`, `driveUrl` (per Drive layout above), `content = driveUrl` for photo/video/file, `archiveStatus: 'archived'`, `archivedAt`, delete `storagePath` field, then delete the Storage object as a separate step with `storageCleanupPending` on failure. Teacher email domain comes from `admin.auth().getUser(teacherUid).email`.
2. Failure handling identical to quiz media: `attemptCount++`, `failed` until 5 attempts then `lost`; `needs-consent` errors write `archiveError: 'needs-consent'` and do not count toward attempts (the teacher must connect Drive). Missing Storage object or disallowed MIME is unrecoverable → `lost`.
3. Trigger: `onDocumentCreated('activity_wall_sessions/{sessionId}/submissions/{submissionId}')` that calls the core when `storagePath` is set and `archiveStatus == 'firebase'`. Also `onDocumentUpdated` when `archiveStatus` transitions to `firebase` (student replaced their file).
4. `sweepActivityWallArchives`: hourly `onSchedule`, collection-group query on `submissions` where `archiveStatus in ['firebase','failed']` and `archiveStartedAt`/`submittedAt` older than 10 minutes, capped at 500 per run, re-run the core. Additionally, list Storage under `activity_wall_media/` and `activity_wall_photos/` and delete any object older than 7 days whose submission is `lost` or missing; mark such submissions `lost`. Bucket listing uses `bucket.getFiles({ prefix, autoPaginate:false, maxResults:500 })`.
5. Modify the existing `archiveActivityWallPhoto` callable so its claim step is transactional and it no-ops (returns `{skipped:true}`) when `archiveStatus != 'firebase'`. Do not remove it; the deployed prod client still calls it.
6. Tests: mirror `quizMediaArchive.test.ts` mocks. Cover: success path with both permission types, needs-consent path, lost after 5 attempts, no-op when already syncing, sweeper deletes a 7-day-old orphan.

Done when: `pnpm -C functions test` and `pnpm -C functions run type-check` pass; the index requirement is listed in `concerns` as: collection group `submissions`, fields `archiveStatus ASC, submittedAt ASC, __name__ ASC`.

Notes: memory `1GiB`, timeout 300 s for the trigger (video up to 200 MB). Stream download to a temp file, not into memory, for anything over 50 MB. Never log Drive tokens or file contents.

#### P1-3 Link preview callable — `sonnet`

Key files: new `functions/src/linkPreview.ts`, new `functions/src/linkPreview.test.ts`, `functions/src/index.ts`, reference `functions/src/embedProxy.ts`.

Do: `fetchLinkPreview` `onCall` (auth required, anonymous allowed) taking `{ url }`. Guards: `https:` only, hostname must resolve to a public IP (reject RFC1918, loopback, link-local, 0.0.0.0/8, ::1, fc00::/7), follow at most 2 redirects re-validating each hop, 5 s timeout, 1 MB read cap, `text/html` only. Parse `og:title`, `og:description`, `og:image`, `<title>`, and return `{ title, description, image, domain }` with `image` only if it is an `https:` absolute URL. YouTube (`youtube.com/watch`, `youtu.be`) short-circuits to `{ domain:'youtube.com', videoId }` without fetching. Rate-limit per uid: 30 calls per 10 minutes using an in-memory map keyed by uid (best effort; document that it's per instance). Tests cover SSRF rejections, a parsed page, and the YouTube shortcut with mocked `fetch`.

Done when: functions tests and type-check pass.

#### P1-4 Rules and Storage rules (protected; orchestrator PR) — `opus`

Key files: `firestore.rules:4188-4280, 732-744`, `storage.rules:112-143`, `firestore.indexes.json`, `tests/rules/sharedActivityWalls.test.ts`, new `tests/rules/activityWallSubmissions.test.ts`.

Rule changes to draft:

- `activity_wall_sessions/{sessionId}/submissions` create: keep existing gates; add
  - `awSession().acceptingResponses != false`;
  - if `request.auth.token.firebase.sign_in_provider == 'anonymous'` then `awSession().allowGuests == true`;
  - `request.resource.data.authorUid == request.auth.uid`;
  - `type in ['text','word','photo','link','file','video']` and if `type` is photo/link/file/video then `awSession().allowedTypes[type] == true`; `type == 'word'` only when `awSession().layout == 'wordcloud'`;
  - cap: if `awSession().maxPostsPerStudent > 0` then `submissionId.matches('^' + request.auth.uid + '__[0-9]{1,3}$') && int(submissionId.split('__')[1]) < awSession().maxPostsPerStudent`;
  - grow the `hasOnly` whitelist with every new field.
- submissions update: allow author (`resource.data.authorUid == request.auth.uid`) when `awSession().allowStudentEdit == true && acceptingResponses != false`, restricted to `content, title, label, sectionId, cellKey, lat, lng, editedAt, linkPreview, storagePath, archiveStatus, fileName, mimeType, sizeBytes` and `status` unchanged. Owner/admin update keeps the existing broad whitelist plus `pinned, order, sectionId, cellKey, status, content, title`.
- submissions delete: add author when `awSession().allowStudentDelete == true`.
- `short_links` create: also allow when `request.auth.token.firebase.sign_in_provider != 'anonymous' && request.resource.data.createdBy == request.auth.uid && request.resource.data.destination.matches('^https://[^/]+/activity-wall/gallery/[A-Za-z0-9_-]+$')`.
- `storage.rules`: new `activity_wall_media/{sessionId}/{submissionId}/{fileName}` block per "Storage paths"; read for owner/admin or any authed when `publiclyShared`; delete for owner/admin. Create requires `firestore.get(session).data.acceptingResponses != false`.
- Index from P1-2.

Tests: new rules test file covering guest gating, closed wall, cap (`uid__0` ok, `uid__3` denied at max 3, foreign uid denied), type gating, student edit/delete toggles, teacher short-link create limited to gallery destinations.

Notes: rules tests are CI-only on this machine (memory `rules-emulator-local-limit`). Ship after P1-1 merges but before any Phase 2 client PR merges.

#### P1-5 Student submission page rebuilt on SSO — `opus`

Key files: `components/activityWall/ActivityWallStudentApp.tsx` (rewrite), `components/activityWall/ActivityWallStudentApp.test.tsx`, `utils/studentJoinRouting.ts:21-33`, `hooks/useStudentAssignments.ts:268-284`, new `components/activityWall/submission/*` (form pieces per type), new `components/activityWall/useActivityWallStudentSession.ts`, new `hooks/useResolvedFirebaseUser.ts`.

Do:

1. `useResolvedFirebaseUser()` shared hook: subscribes `onAuthStateChanged`, exposes `{ user, resolved }` where `resolved` flips true after the first emission. Never signs in by itself.
2. Route: read `sessionId` from `/activity-wall/{sessionId}`. Drop the `?data=` decoder. Subscribe with `onSnapshot` to the session doc (students must see open/closed flips live; the old one-shot comment is obsolete because rules now enforce state server-side).
3. Auth: after `resolved`, if user has `studentRole` claim → proceed. Else if `session.allowGuests` → `signInAnonymously`. Else → `window.location.replace('/student/login?next=' + encodeURIComponent(pathname))`. Add `/activity-wall` to `resolveNextTarget`.
4. Screens: loading; not found; closed ("This wall is closed" with the wall title on the wall's appearance); form; submitted (with "Post another" when under cap, and "Your posts" list with edit/delete when the toggles allow, listing only `authorUid == uid` docs via a query).
5. Form by layout: wall/columns/table/timeline/map/wordcloud pick their extra field (section select, row+col selects, label text, map pin picker using Leaflet, single-word input with 40-char cap). Type picker shows only enabled types. Text always available except wordcloud.
6. Uploads: `uploadBytesResumable` to `activity_wall_media/{sessionId}/{submissionId}/{safeFileName}` with a progress bar, then write the submission with `archiveStatus:'firebase'`. Client-side MIME/size checks matching the Storage caps. Submission id is `${uid}__${n}` when capped, where `n` is the lowest free slot found from the user's own posts query.
7. Links: call `fetchLinkPreview`; on failure post with `{ domain }` only.
8. Appearance: page background renders `session.appearance` (Tailwind class or image URL) without importing `useBackgrounds`.
9. Students never see other students' posts on this page.

Done when: component tests cover SSO pass-through, guest fallback, redirect when guests disallowed, closed screen, cap exhaustion, and one upload flow with mocked Storage. `pnpm run lint` and targeted tests pass.

Notes: this is `skipScaling`-irrelevant (full page), use normal Tailwind. Light theme like other student pages. Keep the file under ~600 lines by splitting per-type inputs into `submission/`.

#### P1-6 Chrome-free gallery route and Drive-logout fix — `sonnet`

Key files: `App.tsx:498-506, 776-797`, `components/activityWall/ActivityWallGalleryView.tsx`, `components/activityWall/ActivityWallGalleryView.test.tsx`, `tests/perf/pageLoadPerf.test.tsx` (gallery case).

Do: move `/activity-wall/gallery/*` to its own provider-free branch in `App.tsx` mirroring `/r`. Replace the local `useAnonymousFirebaseUser` with `useResolvedFirebaseUser` from P1-5 (if P1-5 has not merged, create the hook here and P1-5 adopts it; coordinate via orchestrator). Only call `signInAnonymously` when `resolved && !user`. Remove any header controls that are not viewer-facing (there are none today; confirm). Add a body-level `data-chrome-free` root that fills the viewport with the wall appearance from the session doc (subscribe to the session doc, not just the share doc). Rendering of layouts is Phase 2; in this item the existing card grid stays.

Done when: a test asserts `signInAnonymously` is not called when a user exists at first emission, and is called when the first emission is null.

Notes: P1-5 and P1-6 share `hooks/useResolvedFirebaseUser.ts`; whichever merges first owns it, the other rebases.

### Phase 2 — teacher widget and layouts (after Phase 1 merges)

#### P2-1 Shared wall rendering package — `opus`

Key files: new `components/activityWall/render/` (`WallLayout.tsx`, `ColumnsLayout.tsx`, `TableLayout.tsx`, `TimelineLayout.tsx`, `MapLayout.tsx`, `WordCloudLayout.tsx`, `SubmissionCard.tsx`, `LayoutRouter.tsx`, `index.ts`), new `utils/activityWallWordCloud.ts` (moved from `Widget.tsx:155-259`), `package.json` (add `leaflet`, `react-leaflet`, `@types/leaflet`), `index.css` or a Leaflet CSS import in `MapLayout.tsx`.

Do: one `LayoutRouter` that takes `{ session, submissions, mode: 'widget'|'gallery'|'teacher', appearance, showNames, onMove?, onPin?, onEdit?, onDelete?, onApprove?, onReject? }` and renders the right layout. `SubmissionCard` renders by `type`: text/word, photo (`<img>` from `driveUrl` or transit `getDownloadURL` while `archiveStatus != 'archived'`, with the existing probe/fallback), link (preview card, YouTube iframe), video (Drive preview iframe, or "Processing…" while archiving), file (icon + name + open link). Pending cards show a "Pending" ribbon in `teacher` mode and are hidden otherwise. Pinned cards sort first. `teacher` mode wires dnd-kit: drag between columns/cells and reorder in timeline, calling `onMove(submissionId, patch)`. Sizes use `cqmin` per CLAUDE.md in `widget` mode; `gallery` mode uses viewport units. Map: `react-leaflet` `MapContainer` with OSM tiles and attribution, markers with popups holding the card. Word cloud: reuse the moved helpers, cap at 80 words, `wordColor` unchanged.

Done when: a Vitest render test per layout with fixture submissions; `pnpm run lint` clean.

Notes: Leaflet CSS must be imported once; do it inside `MapLayout.tsx` so it lazy-loads with the layout. Lazy-load `MapLayout` via `React.lazy` so Leaflet is not in the main bundle.

#### P2-2 Wall editor (layout picker + settings form) — `opus`

Key files: new `components/widgets/ActivityWall/editor/` (`WallEditorModal.tsx`, `LayoutPicker.tsx`, `SectionsEditor.tsx`, `AppearancePicker.tsx`, `SubmissionTypesToggles.tsx`, `ModerationAndAccess.tsx`, `LimitsAndEditing.tsx`), `components/widgets/ActivityWall/buildingDefaults.ts`, `components/admin/ActivityWallConfigurationPanel.tsx`, `tests/components/activityWallBuildingDefaults.test.ts`.

Do: modal with step 1 = layout card grid (six cards with an inline SVG/emoji sketch each and one-line description). Step 2 = one scrollable form: Title + Prompt; layout-specific structure (columns list, table rows/cols lists, map center picker, none for wall/timeline/wordcloud); Submission types (hidden for wordcloud); Appearance (`AppearancePicker`: colors from `BACKGROUND_COLORS`, gradients from `BACKGROUND_GRADIENTS`, image presets from `useBackgrounds().presets` in a swatch grid); Moderation & access (Require moderation, Allow guests, Show names, ClassLink target classes — keep existing `classIds` UI); Limits & editing (max posts per student 0/1/3/5/custom, students may edit, students may delete). Save writes via `useActivityWallLibrary.saveActivity`. Editing an existing wall opens on step 2 with a "Change layout" link back to step 1 (warn that posts keep their fields). Building defaults: extend admin panel and resolver with `defaultLayout`, `defaultAllowGuests`, `defaultShowNames`, `defaultMaxPostsPerStudent`; keep old fields mapped.

Done when: unit tests for the resolver mapping and a render test that step 1 → step 2 hides types for wordcloud.

Notes: Settings panels use normal Tailwind. Use the shared `CollapsibleSection` from `components/common/library/` for the form groups.

#### P2-3 Widget front face, library modal, moderation, remote control — `opus`

Key files: `components/widgets/ActivityWall/Widget.tsx` (rewrite to < 700 lines; move logic to hooks), new `components/widgets/ActivityWall/hooks/useActivityWallSession.ts` (session mirror + submissions listener + actions), new `components/widgets/ActivityWall/WallLibraryModal.tsx` (on `LibraryShell`/`LibraryToolbar`/`LibraryGrid`/`LibraryItemCard`), new `components/widgets/ActivityWall/ModerationDrawer.tsx`, `components/widgets/ActivityWall/Settings.tsx`, `components/widgets/ActivityWall/Widget.test.tsx`, `components/remote/controls/RemoteActivityWallControl.tsx` + test, `components/widgets/ActivityWall/ShareModal.tsx`.

Do:

1. `useActivityWallSession(uid, entry)`: mirrors `mirrorSessionFromEntry` on change (keep `setDoc merge`), subscribes submissions, exposes `approve/reject/deletePost/movePost/pinPost/editPost/clearPosts/setAcceptingResponses`. `setAcceptingResponses` writes both the library entry and the session doc. `clearPosts` batch-deletes submissions in chunks of 400 (Drive files untouched). Remove all archive-triggering code (`Widget.tsx:875-1068`); replace with a read-only "Drive sync" indicator that counts `failed`/`lost`/`needs-consent` and, for `needs-consent`, shows a "Connect Google Drive" button using the enrollment flow in `utils/googleOAuthRefresh.ts`.
2. Front face: header (title, layout icon, Open/Closed pill button that toggles, pending count badge opening `ModerationDrawer`, Share, "Open gallery" opening the share link in a new tab, Library button). Body: `LayoutRouter` in `widget` mode with `teacher` actions on hover/long-press. Empty state via `ScaledEmptyState`. No active wall: `ScaledEmptyState` with "Choose a wall" opening the library.
3. Library modal: search, sort recent/title, cards show appearance swatch, layout icon, open/closed chip, post count (from a lightweight `getCountFromServer` per visible card, cached). Actions: Open on board, Edit, Duplicate (copies settings, new id, no posts), Clear posts (confirm), Delete (confirm; also deletes the session doc's submissions in chunks).
4. Moderation drawer: pending list with approve/reject/edit text; approved list with delete/pin/edit.
5. Migration: keep `Widget.tsx:605-756` logic in a `useLegacyActivityWallMigration` hook; extend it to also write the new fields via the normalizer.
6. Remote control: read walls from `useActivityWallLibrary` instead of `config.activities`; Start/Pause becomes Open/Closed (`setAcceptingResponses`); remove the duplicated `?data=` link builder; the QR toggle spawns the new student URL.
7. Share modal: after creating the share doc, also create a `short_links` doc via `createShortLinkAtomic` (`hooks/useShortLinks.ts`) with destination `${origin}/activity-wall/gallery/${shareId}` and show the `/r/<code>` URL as the primary copy target; keep the long URL as secondary.
8. `spawnQrWidget` and copy-link use the new student URL rules from "Routes".

Done when: widget tests cover open/closed toggle writes both docs, moderation approve, duplicate, and the remote control test is updated. `pnpm run lint` clean.

Notes: this item depends on P2-1 and P2-2 and should be dispatched after both open PRs exist (it can branch from a combined base). Keep `DashboardActionsContext` usage, not `useDashboard()`, in the canvas path.

#### P2-4 Gallery renders all layouts — `sonnet`

Key files: `components/activityWall/ActivityWallGalleryView.tsx`, its test.

Do: replace the card grid with `LayoutRouter` in `gallery` mode; respect `showNames`; keep likes/comments wired to the share doc subcollections and only render them when the share toggles are on and the viewer is not anonymous (per decision: anonymous viewers are read-only). Header is a single slim bar: title, prompt, live post count. Apply appearance full-bleed. Add a small hint banner when an image fails to load on a `driveVisibility: 'domain'` wall: "Sign in to your school Google account to see photos."

Done when: tests for showNames on/off and anonymous viewer hides composer.

### Phase 3 — polish and cleanup (after Phase 2 merges)

#### P3-1 Visual pass against the design system — `opus`

Key files: everything under `components/widgets/ActivityWall/`, `components/activityWall/`.

Do: run `/pauls-skills:deslop --ui` style audit against CLAUDE.md "Design Context": glass surfaces, Lexend, restrained color, `cqmin` scaling on the front face, WCAG AA text on dark surfaces (`text-slate-300`+), `prefers-reduced-motion`, keyboard focus rings on every control, `aria-label` on icon buttons, projector legibility of the gallery. Capture before/after screenshots with the Vite dev server for the PR.

#### P3-2 my-assignments continuity — `sonnet`

Key files: `hooks/useStudentAssignments.ts:268-284`, `components/student/MyAssignmentsPage.tsx`.

Do: wall rows show open/closed state (session `acceptingResponses`) and a secondary "View gallery" link when `publiclyShared` is true and a share exists (store `latestShareCode` on the session doc when the share modal creates a short link, written by P2-3; this item only reads it). Closed walls with a gallery still list under active.

#### P3-3 Remove legacy paths — `sonnet`

Key files: `functions/src/driveArchive.ts`, `functions/src/index.ts`, `storage.rules` (protected), `types.ts`, `components/widgets/ActivityWall/*`, `components/remote/controls/RemoteActivityWallControl.tsx`.

Do: after the new client has been in production for at least one week (orchestrator gates this), delete `archiveActivityWallPhoto`, the `activity_wall_photos` Storage block, the `?data=` decoder remnants, and the deprecated `mode` / `identificationMode` writes. Keep the read-side normalization forever.

## Verification matrix (orchestrator, before each phase merge)

| Check                                                       | How                                                                                                                                                                                                                                                 |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Prod client + new rules do not break                        | Rules test file P1-4 includes legacy-shaped submission create (no `type`, no `authorUid` is **not** allowed — confirm old client is gone before enforcing `authorUid`; until then make `authorUid` required only when `awSession().layout` exists). |
| Drive archive without teacher online                        | Create a submission with `storagePath` in the emulator with `refreshGoogleAccessTokenForUid` mocked; assert `archived` and Storage delete called.                                                                                                   |
| Drive-logout bug fixed                                      | P1-6 test plus manual: sign in as teacher, open gallery in same tab, return, Drive still connected.                                                                                                                                                 |
| Student cap                                                 | Rules test: `uid__2` allowed at max 3, `uid__3` denied.                                                                                                                                                                                             |
| Storage never long-term                                     | Sweeper test: 7-day-old orphan deleted.                                                                                                                                                                                                             |
| All six layouts render in widget, gallery, and student form | Render tests from P2-1 and P1-5; screenshots in P3-1.                                                                                                                                                                                               |

## Open assumptions (flag to Paul if any is wrong)

1. Staged uploads that can never archive (teacher never connects Drive) are deleted from Storage after 7 days and marked `lost`; the teacher sees a count in the widget.
2. Wall/gallery pages are English-only like the rest of the Activity Wall.
3. Rules will require `authorUid` on new submissions only when the session doc carries a `layout` field, so the currently deployed client keeps working until P3-3.
4. Map layout uses OpenStreetMap's public tile server under its usage policy (low volume, attribution shown). If volume grows, switch to a hosted tile provider.
