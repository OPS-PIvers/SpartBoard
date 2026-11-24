# Web tour authors, and a Web tours list built for a department

Goal: Paul's whole department records, edits, publishes and shares web tours without becoming SpartBoard admins, and the Web tours page stays usable once many people are adding tours across many sites.

Settled with Paul on 2026-11-23. It builds on [CHROME_EXTENSION.md](CHROME_EXTENSION.md) and [WEB_TOURS_UX.md](shipped/WEB_TOURS_UX.md), and on the FreshService build-out on branch `feat/freshservice-article-options` (per-tour folder, tags and keywords; not merged when this was written).

**Code references** were taken at `dev-paul` `4bb32b15c`. Symbol names are authoritative; line numbers are hints.

## Starting facts

- **Everything assumes an admin.** The page gate is `isAdmin && canAccessFeature('web-tours')` (`WebToursGate`, `WebTourIntakePage`, the `WebTourEditorHost` mount in `DashboardView`). Drafts (`building_web_tours`) are `isAdmin()` read and write. Publishing is a client write to `building_guided_learning_tours`, so the rule is the gate. Pictures are client uploads to `web_tour_pictures/{setId}/`, admin-only in `storage.rules`.
- **Rules cannot see a flag grant.** No rules helper reads `beta_grants`, `global_permissions` or `user_roles`. `/admins/{email}` is the only per-person lookup rules do today.
- **The extension needs no new idea of "author".** Its Record tab, Manage tours button and Edit tour link all key off `list.admin` from `webToursListV1`. The recorder has no check of its own; the page it hands steps to and the rules are the gate.
- **A public link dies when its confirmer stops being an admin.** `resolvePublicTour` (`functions/src/tourPublicLink.ts`) latches the link off when `confirmedBy` has no `/admins` doc.
- **Short links are admin-only.** A non-admin's Copy link falls back to the raw `/tour/{setId}` address.
- **No tour records who made it.** Drafts carry no creator. The published copy has `publishedBy` (a uid, overwritten on every publish).
- **Delete lives only inside the editor.** `deleteWebTourDraft` removes the draft and `webTourCleanup` then removes the published copy and pictures.
- **The list has one filter.** A search box (name or website) and one status select (`Filter` in `WebToursPage`).
- **FreshService state is server-only.** `freshservice_articles/{setId}` has no client rule, so the page cannot tell whether a tour has an article.
- **Non-admins have no way in.** The only link to `/web-tours` is inside Admin Settings > Help Center.

## Decisions

### Who is an author

- **A1. A named list.** A new collection `tour_authors/{email}` (lowercased email as the id, like `/admins`), holding `addedBy` and `addedAt`. A person is an author when their doc exists. No flag level, mirror or beta list is involved, so the page, the rules, Storage and the functions all read the same doc.
- **A2. Staff only.** An author must also pass `isDistrictStaff()`. A student, a deactivated member or an account outside the district never qualifies, even with a doc.
- **A3. One helper per layer.**
  - Firestore rules: `isTourAuthor()` is `isAdmin() || (isDistrictStaff() && exists(/tour_authors/{email}))`.
  - Storage rules: the same test with `firestore.exists`.
  - Functions: `resolveCallerIsTourAuthor(db, token)` beside `resolveCallerIsAdmin`, with the same caching.
  - Client: a `useTourAuthor()` hook that reads the caller's own doc once, on the pages that need it. It is not added to `AuthContext`, so no other route pays for it.
- **A4. Admins manage the list on the Web tours page.** An **Authors** button in the header, shown to admins only, opens a dialog: the current authors, an email field with Add, and Remove on each row. Only district addresses are accepted. Authors never see the button.
- **A5. Authors count as admins for two flags only.** For `web-tours` and `freshservice-sync`, an author passes when the flag is enabled, whatever its access level. Every other flag treats them as the teacher they are.
- **A6. Removing an author is immediate.** Their drafts and published tours stay. Public links they confirmed switch off, as they do today when an admin is removed (see P2).

### What an author can do

- **B1. One shared library.** Any author opens, edits, checks and republishes any web tour.
- **B2. Publish directly.** No approval step. Check tour and the student-data checks apply as they do for admins.
- **B3. Web tours only.** An author can create, update and delete a published tour only when its `surface` is `'web'`. SpartBoard live tours stay admin-only.
- **B4. Write with Claude.** `writeWebTourTextV1` accepts an author.
- **B5. Send to FreshService.** `freshserviceV1` accepts an author for `status`, `catalog`, `createCategory`, `createFolder` and `send`. `save` (the site address and default folder) stays admin-only, and so does the FreshService settings button.
- **B6. Public links.** An author can turn a tour's public link on and off (P1 to P3).
- **B7. Short links.** An author can mint a `/r/tour-...` short link for a tour.
- **B8. Their own runs count as author runs.** The `admin` stamp on a run, which makes suggested fixes show after one run, is allowed for authors.
- **B9. What stays admin-only.** Admin Settings, every flag, user management, the Authors list, FreshService settings, SpartBoard live tours and their editor, and the Claude connector's web tour tools.

### Public links

- **P1. A narrow rule.** `admin_settings/tour_public_links/tours/{setId}` gets its own rule: an author may read it, and may write it when `confirmedBy` is their own email. The broad `admin_settings` rule is unchanged.
- **P2. The confirmer check accepts authors.** `resolvePublicTour` keeps a link live while its confirmer is an admin or an author.
- **P3. The controls follow.** `usePublicLinkControls` uses the author test where it uses `isAdmin` today.

### Getting there

- **E1. The extension.** `webToursListV1` returns `admin: true` for an author, so Record, Manage tours and Edit tour appear with no extension release. Manage tours already opens `/web-tours`.
- **E2. The Help Center.** The Help Center shows a **Web tours** link to `/web-tours` to authors and admins.
- **E3. The gate message.** A signed-in non-author sees "Web tours are for tour authors. Ask an admin to add you."

### The list page

- **L1. Author.** A new draft records `createdBy` (`uid`, `email`, `name`), and every save records `updatedBy` the same way. The Tour cell shows "by Name" after the step count. The rule keeps `createdBy` unchanged after creation. Tours made before this show no author.
- **L2. A FreshService column.** Each send stores the article's address, its FreshService status (draft or published) as returned by that send, and `sentAt` on `freshservice_articles/{setId}`. Authors get read access to that collection. The column shows nothing when there is no article, **Draft** or **Published** when there is one (the badge opens the article in FreshService), and **Needs update** when the tour was published after the last send. The status is as of the last send; it does not poll FreshService.
- **L3. Delete from the list.** A **Delete** item in each row's menu, with the editor's confirmation and the same `deleteWebTourDraft` path. An author can delete a tour they created; an admin can delete any. The confirmation says the FreshService article, if there is one, is left in FreshService. The server cleanup also removes the tour's `freshservice_articles` record and its public link record.
- **L4. Filters.** The search box stays. Beside it, four selects: **Website** (the sites the tours start on), **Author** (Anyone, Me, then each author), **Status** (today's list), and **FreshService** (Any, Sent, Not sent, Needs update). They combine. The page remembers the choices per browser.
- **L5. Sort.** Newest change first by default, with name as the other choice.

### Release

- **R1. No new flag.** The permission is off until an admin adds the first author, and the list-page changes sit on a page that is already admin-only behind `web-tours` (Admin, preview). The PR descriptions say so.
- **R2. Old tabs.** Every rule change widens access, and the callables keep their request shapes, so an open tab on the previous release keeps working.
- **R3. Rules size.** Slice 1 adds one helper and about eight call sites. Run `pnpm run check:rules-size` and test with `node scripts/releaseFirestoreRules.mjs spartboard-dev`. If the PR goes over the 1,500-byte budget, move the runs and stats reads (S1) behind the existing counts path rather than adding the label.

## Confirmed by Paul

Five calls the agent made while drafting; Paul confirmed all five on 2026-11-23.

- **L3:** authors delete only their own tours. The shared library covers editing; deleting someone else's tour is a step further.
- **B5:** authors can create FreshService categories and folders, since that is part of the send form.
- **A6 and P2:** removing an author switches off the public links they turned on.
- **L2:** "published to FreshService" is read as "has an article in FreshService", with Draft or Published shown as of the last send.
- **B9:** the Claude connector's web tour tools stay admin-only for now.

## Slices

Each is one PR into `dev-paul`. S4 to S6 need nothing from S1 to S3 and help admins today, so they can go first. S5 needs the FreshService build-out merged.

1. **S1. The author list and the rules.** `tour_authors` collection and its rule (an admin writes; a person reads their own doc). `isTourAuthor()` in `firestore.rules` and `storage.rules`, applied to: drafts; published web tours (B3); `runs` and `stats` reads for web tours; the run `admin` stamp (B8); the public link record (P1); `/tour/` short links (B7); `web_tour_pictures`. Rules tests for each, including a student, a deactivated member and a non-web tour. The Authors dialog (A4) with its tour anchors.
2. **S2. Functions.** `resolveCallerIsTourAuthor`; `writeWebTourTextV1` (B4); `freshserviceV1` per action (B5); `webToursListV1` (E1) and the run stamp in `webTourRunV1`; `resolvePublicTour` (P2). Tests beside each.
3. **S3. The pages.** `useTourAuthor`; `WebToursGate` (E3), `WebTourIntakePage`, the `WebTourEditorHost` mount, `usePublicLinkControls` (P3), `useCanFreshservice` and the editor's `canFresh`; the Help Center link (E2). The FreshService settings button stays behind `isAdmin`.
4. **S4. Author and delete.** `createdBy` and `updatedBy` on drafts with the rule that keeps `createdBy` (L1); "by Name" in the Tour cell; Delete in the row menu with the creator-or-admin test (L3); cleanup of the FreshService and public link records in `cleanUpDeletedWebTour`.
5. **S5. The FreshService column.** Store address, status and `sentAt` at send; the read rule; the column and its three states (L2).
6. **S6. Filters and sort.** The four selects and the sort (L4, L5), with the remembered choices.

After S1 to S3 reach `main`: Paul adds his department on the Authors dialog in prod, and each person installs the extension. That goes in `PAUL_TODO.md` with the PR that ships S3.

## Out of scope

- Approval before publishing, and per-author private tours.
- Changing an existing FreshService folder's visibility, or publishing an article from SpartBoard.
- Backfilling an author onto tours made before S4.
- Granting authorship by department or group membership.
- Authors using the Claude connector's web tour tools.
- Paging the list. It loads every tour; revisit past a few hundred.
