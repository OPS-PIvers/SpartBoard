# PROPOSAL F6 — Canonicalize building IDs in the building-admin update rule

**Area:** firestore.rules · **Dimension:** correctness · **Impact:** 5 ·
**Effort:** medium · **Risk:** medium · **Behavior change:** YES (it changes which
building-admin edits are accepted).

**Status:** proposal-written. This document is a review proposal only. It does
**not** modify `firestore.rules`, `config/buildings.ts`, or any test. Do not apply
the diff below until the "Decision needed from Paul" section is signed off.

---

## 1. Problem recap

The building-admin branch of the `/organizations/{orgId}/buildings/{buildingId}`
update rule gates the edit on:

```
firestore.rules:211
  buildingId in orgMember(orgId).buildingIds
```

This is a raw CEL `in` over two strings with **no canonicalization**. The app has
two ID spaces for the same building (see `config/buildings.ts:88-114`):

- **Legacy long form** — e.g. `orono-high-school`, written historically by the
  Sidebar / user profiles / Feature Permissions.
- **Canonical short form** — e.g. `high`, written by the Organization Buildings
  admin panel to `members.buildingIds` and to the building doc id.

When the two spaces drift — a member doc stored with canonical `high` but a
building doc still keyed `orono-high-school` (or the reverse) — the raw `in`
silently returns false and the rule **falsely denies** an edit the building admin
is legitimately entitled to make. (No false _grant_ happens today, because `in`
only matches on exact equality — but see Risks: a wrong alias map would.)

The client already resolves this with `canonicalBuildingId()` /
`canonicalizeBuildingIds()` (`config/buildings.ts:124-169`), but CEL cannot call
JS, so the alias table has to be mirrored into the rules file.

### Where the IDs come from

| Path                           | ID format stored                              | Source                                                                       |
| ------------------------------ | --------------------------------------------- | ---------------------------------------------------------------------------- |
| `buildingId` (path segment)    | doc id — canonical _or_ legacy, per data age  | `firestore.rules:189`, create rule pins `data.id == buildingId` at `196-202` |
| `orgMember(orgId).buildingIds` | array — canonical _or_ legacy, per member age | `firestore.rules:115-117`, `211`                                             |

Because either side can independently be in either format, canonicalizing **both**
sides before the `in` is required — canonicalizing only one side still misses the
canonical-member ↔ legacy-building and legacy-member ↔ canonical-building crosses.

---

## 2. Alias pairs (extracted verbatim from `config/buildings.ts:109-114`)

`BUILDING_ID_ALIASES` is the single source of truth. The CEL map below MUST be a
byte-for-byte mirror of it.

| Legacy ID (key)             | Canonical ID (value) |
| --------------------------- | -------------------- |
| `orono-high-school`         | `high`               |
| `orono-middle-school`       | `middle`             |
| `orono-intermediate-school` | `intermediate`       |
| `schumann-elementary`       | `schumann`           |

Notes carried over from `config/buildings.ts`:

- `canonicalBuildingId(id)` returns `BUILDING_ID_ALIASES[id] ?? id` — i.e. an ID
  that is already canonical, or simply unknown, is returned **unchanged**. The CEL
  helper must replicate exactly this "pass through on miss" behavior.
- The seed buildings `orono-community-education` and `orono-discovery-center`
  (`config/buildings.ts:67-85`) have **no** alias entry — they are their own
  canonical IDs and must pass through unchanged. Do not invent aliases for them.

---

## 3. Proposed CEL helper + rule edit (DIFF — DO NOT APPLY)

Two changes, both inside the top-level `match /databases/{database}/documents`
block:

1. Add a `canonicalBuildingId(id)` rules function next to the other org helpers
   (e.g. just after `orgMember(orgId)` at `firestore.rules:117`).
2. Rewrite the membership check at `firestore.rules:211` so **both** `buildingId`
   and every entry of `orgMember(orgId).buildingIds` are canonicalized before the
   `in`.

CEL has no array `.map()`, so the right-hand side is canonicalized by mapping the
member array through a comprehension. Firestore rules support list
comprehensions, so `[canonicalBuildingId(b) for b in <list>]` is expressible; if
the deployed CEL dialect rejects the comprehension form during
`firebase deploy --only firestore:rules` dry-run, fall back to the membership
expansion shown in the **Alternative** block below.

```diff
--- a/firestore.rules
+++ b/firestore.rules
@@ functions block, after orgMember(orgId)
     // Returns the caller's /organizations/{orgId}/members/{email} doc data.
     // Callers must guard with isOrgMember(orgId) first; otherwise get() fails.
     function orgMember(orgId) {
       return get(/databases/$(database)/documents/organizations/$(orgId)/members/$(request.auth.token.email.lower())).data;
     }
+
+    // Maps a legacy long-form building ID to its canonical short form.
+    // MUST stay byte-for-byte in sync with BUILDING_ID_ALIASES in
+    // config/buildings.ts:109-114 — CEL cannot reuse the JS map, so any
+    // building renamed/aliased there has to be mirrored here. A mismatch
+    // silently re-introduces false denials, or (if a wrong pair is added)
+    // false GRANTS to a building the admin does not manage.
+    //
+    // Mirrors canonicalBuildingId() in config/buildings.ts:124 — unknown or
+    // already-canonical IDs pass through unchanged.
+    function canonicalBuildingId(id) {
+      return id == 'orono-high-school' ? 'high'
+           : id == 'orono-middle-school' ? 'middle'
+           : id == 'orono-intermediate-school' ? 'intermediate'
+           : id == 'schumann-elementary' ? 'schumann'
+           : id;
+    }
@@ match /buildings/{buildingId} — allow update, building-admin branch
         allow update: if isSuperAdmin() ||
             ((isDomainAdmin(orgId) ||
               (isBuildingAdmin(orgId) &&
-               buildingId in orgMember(orgId).buildingIds)) &&
+               // Canonicalize BOTH sides before the membership test so a
+               // building admin whose member doc and the building doc are in
+               // different ID formats (legacy vs canonical) is not falsely
+               // denied. See config/buildings.ts:88-114 and PROPOSAL-F6.
+               canonicalBuildingId(buildingId) in
+                 orgMember(orgId).buildingIds
+                   .map(b, canonicalBuildingId(b)))) &&
              request.resource.data.id == resource.data.id &&
              request.resource.data.orgId == resource.data.orgId &&
              request.resource.data.diff(resource.data).affectedKeys().hasOnly([
                'name', 'address', 'grades', 'type', 'adminEmails'
              ]));
```

> **Note on `.map()` syntax:** Firestore Rules CEL exposes the list macro as
> `list.map(item, transform)`. If `firebase validate`/deploy rejects it in this
> dialect, use the comprehension `[canonicalBuildingId(b) for b in
orgMember(orgId).buildingIds]` instead. Both must be confirmed against the
> emulator (`pnpm run test:rules`) and a `firebase deploy --only
firestore:rules` dry-run before merge — see Risks.

### Alternative if list transforms are unavailable in the deployed dialect

If neither `.map()` nor a comprehension validates, canonicalize only the
**buildingId** side and test it against the member array _expanded to include the
legacy form of each canonical entry_ — i.e. test that the canonical buildingId is
in the member list OR that the buildingId's legacy alias is. Concretely, replace
the membership test with a fixed OR over the four known pairs plus the raw match:

```
(buildingId in orgMember(orgId).buildingIds) ||
(canonicalBuildingId(buildingId) in orgMember(orgId).buildingIds)
```

This handles legacy-building ↔ canonical-member and the already-matching cases,
but NOT canonical-building ↔ legacy-member. To cover that fourth cross without a
list transform you must also expand the member side via a helper that checks each
legacy key, which is verbose; prefer the `.map()`/comprehension form above and
only fall back here if the dialect forces it. Flag this limitation to Paul if the
fallback is taken.

---

## 4. Risks

- **Alias-map drift is the core hazard.** The CEL `canonicalBuildingId` is a hand
  copy of `BUILDING_ID_ALIASES` (`config/buildings.ts:109-114`). If the two ever
  diverge:
  - **Missing/incorrect-to-pass-through pair** → reintroduces the exact false
    _denial_ this proposal fixes.
  - **Wrong pair added** (e.g. aliasing a building to one the admin actually
    manages) → a false _GRANT_: a building admin could edit a building they do
    not belong to. This is strictly worse than the status quo. The cross-
    referencing comment in the diff (pointing at `config/buildings.ts:109-114`)
    is mandatory, not optional, to reduce drift risk.
- **CEL dialect / list-macro support.** `.map()` and comprehensions must be
  validated against both the emulator and a real deploy dry-run. A rule that
  passes the emulator but fails `firebase deploy` would block all rules deploys,
  not just this collection. Do a `firebase deploy --only firestore:rules` dry-run
  in CI or locally before merge.
- **No effect on domain-admin / super-admin paths.** The change is scoped to the
  `isBuildingAdmin` branch only; domain and super admins are unaffected. Verify
  the existing passing tests (`firestore-rules-organizations.test.ts:491-555`)
  still pass unchanged.
- **Future retirement.** When the backfill script
  (`scripts/backfill-user-building-ids.js`, referenced at
  `config/buildings.ts:105-107`) has rewritten all stored data to canonical IDs,
  this CEL helper can be deleted alongside `BUILDING_ID_ALIASES`. Add a TODO so
  the two are retired together.

---

## 5. Tests to add (`tests/rules/firestore-rules-organizations.test.ts`)

Add to the existing `describe('organizations/buildings — writes', ...)` block
(`tests/rules/firestore-rules-organizations.test.ts:411`), reusing the existing
`asBuildingAdmin()` / `asDomainAdmin()` actors and the `beforeEach` seed. The
current seed gives the building admin `buildingIds: ['high']` (canonical) and
seeds a `high` building doc, so the new cases need their own seeded fixtures via
`testEnv.withSecurityRulesDisabled(...)` to set up the cross-format pairs.

Three cases, matching the acceptance criteria in `03-firestore-rules.md`:

1. **canonical-member ↔ legacy-building → ALLOW.**
   Member `buildingIds: ['high']` (canonical, already in the default seed); seed
   an additional building doc at id `orono-high-school` (legacy) with
   `id: 'orono-high-school'`, `orgId: ORG_ID`. The building admin updates a
   whitelisted field (e.g. `{ address: '...' }`) on
   `organizations/${ORG_ID}/buildings/orono-high-school` → `assertSucceeds`.

2. **legacy-member ↔ canonical-building → ALLOW.**
   Seed a second building-admin member whose `buildingIds: ['orono-high-school']`
   (legacy) and authenticate as them; update a whitelisted field on the canonical
   `organizations/${ORG_ID}/buildings/high` doc → `assertSucceeds`.

3. **non-member negative → DENY.**
   A building admin whose `buildingIds` contains neither `high` nor any alias of
   it (e.g. `buildingIds: ['middle']`, or the existing out-of-scope actor)
   attempts to update `organizations/${ORG_ID}/buildings/high` (and, for
   thoroughness, the legacy `orono-high-school` doc) → `assertFails` for both.
   This guards against the helper accidentally widening access (the "false grant"
   risk above).

Regression guard: the existing cases at
`firestore-rules-organizations.test.ts:491-531` (canonical-member ↔
canonical-building allow; out-of-scope deny) must continue to pass unchanged —
the new helper must not alter the already-matching path.

Run with `pnpm run test:rules` (boots the Firestore emulator; the emulator does
not run in this CI sandbox per the team's known test gotchas, so this must be run
in an environment that has the emulator available).

---

## 6. Decision needed from Paul

This rule change **alters which building-admin edits Firestore accepts**: edits
that are currently _denied_ due to ID-format drift will start _succeeding_. That
is the intended fix, but it is a behavior change to a security boundary, so it
needs explicit sign-off before merge.

Specifically, please confirm:

1. **Approve the behavior change** — building admins should be able to edit "their"
   building regardless of whether the member doc and building doc use legacy or
   canonical IDs. (Status quo silently denies these.)
2. **Approve the hardcoded CEL alias map** as the mirror of
   `config/buildings.ts:109-114`, accepting the drift-maintenance burden (the two
   tables must be updated together; a mismatch risks a false grant).
3. **Confirm the CEL list-transform approach** (`.map()` / comprehension) is
   acceptable, or direct me to the fallback in §3 if your deploy dialect rejects
   it. This needs a real `firebase deploy --only firestore:rules` dry-run, which
   I cannot run from this sandbox.

No code is changed until these three are approved.
