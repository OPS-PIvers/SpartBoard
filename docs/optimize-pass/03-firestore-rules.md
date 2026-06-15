# Firestore security-rules hardening — F6, F24

**Dimension:** correctness · Both touch `firestore.rules`; do them together and run
`pnpm run test:rules` (Firestore emulator + `tests/rules/`). They are file-disjoint
from the F15 email-case fix already shipped in wave 1.

---

## F6 — Building-admin rule compares building IDs without canonicalization

**Impact:** 5 · **Effort:** medium · **Risk:** medium · **Behavior change:** yes
(it changes which building-admin edits are accepted).

### Problem

The building-admin update rule checks `buildingId in
orgMember(orgId).buildingIds` using a raw `in` without canonicalizing IDs. When a
member doc stores canonical IDs (e.g. `high`) but a legacy building doc uses the
old format (e.g. `orono-high-school`) — or vice versa — the `in` silently fails
and the rule **falsely denies** an edit the admin should be allowed to make.

### Evidence

- `firestore.rules:211` — `buildingId in orgMember(orgId).buildingIds`
- `firestore.rules:196-202` — building create rule validates `orgId`/`id` match
- `config/buildings.ts:88-125` — documents the legacy↔canonical ID mapping and that
  canonicalization must happen on **all** paths. The client uses
  `canonicalizeBuildingIds()` / `canonicalizeBuildingKeyedRecord()`, but CEL can't
  reuse those JS functions.

### Approach

Mirror the alias resolution in `firestore.rules`: add a rules helper that maps a
building id through the known legacy→canonical aliases before the membership
check, and apply it to **both** `buildingId` and the values in
`orgMember(orgId).buildingIds`. Keep the alias table in sync with
`config/buildings.ts` (add a comment cross-referencing it so they don't drift).

### Risks

- The CEL alias map must exactly match `config/buildings.ts`; a mismatch
  re-introduces false denials or (worse) false grants. Cover both ID formats in
  tests.

### Acceptance criteria

- A building-admin whose membership is stored in either ID format can edit the
  matching building regardless of the building doc's ID format.
- No admin gains edit rights to a building they don't belong to.
- `tests/rules/` cases for: canonical-member↔legacy-building, legacy-member↔
  canonical-building, and a negative (non-member denied).

---

## F24 — PLC invitation email lacks a length bound

**Impact:** 2 · **Effort:** trivial · **Risk:** low · **Behavior change:** no
(rejects only pathological oversized writes).

### Problem

The `plc_invitations` create/update rules store the invitee email with no size
validation, unlike other collections that bound string fields. A pathologically
long email could bloat the doc; more importantly it's an inconsistency with the
codebase's own validation norms.

### Evidence

- `firestore.rules:2098-2101` — `plc_invitations` create rule, no email length bound
- `firestore.rules:752-776` — `rollout_requests` enforces size bounds on
  name/role/organization (the pattern to follow)
- `firestore.rules:809` — `admin_backgrounds` validates `email.lower()` w/o length

### Approach

Add `request.resource.data.inviteeEmailLower.size() <= 255` (or a tighter 100) to
the `plc_invitations` create and update rules, matching the surrounding validation
style.

### Acceptance criteria

- A normal-length invite still succeeds; an over-limit email is rejected. Add a
  `tests/rules/` case for both.
