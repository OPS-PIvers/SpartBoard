# PLC Collaborative Workspace — remaining manual work

**Status (2026-06-20):** The PLC collaborative workspace (and the wider `dev-paul`
backlog) **is released to production** — `dev-paul → main` merged as `1a82a164`
([PR #2027](https://github.com/OPS-PIvers/SpartBoard/pull/2027)); pushing `main`
runs `firebase-deploy.yml` (rules + functions + hosting → live site). All CI was
green at merge, including the emulator `Firestore Rules Tests`.

Everything in the [PRD](plc-workspace-prd.md) shipped, plus all review follow-ups
(crash guards, digest pagination + BCC, transfer/admin-recovery members-diff
tightening). **Nothing else is pending in code.** What's left is operational.

---

## ✅ TODO 1 — Run the one-time PLC data migration (`migratePlcs`)

This backfills existing PLC root docs into the new shape: legacy arrays →
canonical `members` map, infers `orgId` from member email domains, backfills the
`leadUid` mirror, repairs any legacy multi-lead corruption, and seeds the
`/aggregates` skeleton.

- **It is deployed but has NOT been run** (it's an admin callable with no UI
  trigger). Dual-shape reads keep un-migrated PLCs working, so this is **safe to
  defer but should be done** so existing teams get the members map, building
  directory, and aggregates.
- **Runner:** [`functions/scripts/run-migrate-plcs.cjs`](../functions/scripts/run-migrate-plcs.cjs)
  — Admin SDK script with a read-only dry-run. Idempotent (safe to re-run).

```bash
# 1. Authenticate to the spartboard project (pick one):
gcloud auth application-default login
#   …or: export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account-key.json
#        (SA needs Firestore read+write on `spartboard`)

# 2. DRY RUN first — read-only, writes NOTHING; reports exactly what would change:
node functions/scripts/run-migrate-plcs.cjs --dry-run

# 3. If the scope looks right, perform it:
pnpm -C functions build
node functions/scripts/run-migrate-plcs.cjs --commit
```

Defaults to project `spartboard` (override with `GCLOUD_PROJECT`) — confirm
that's correct before `--commit`.

## ✅ TODO 2 — Verify the production release

- Confirm the `main` **Deployment** workflow for `1a82a164` finished green
  (`gh run list --branch main`).
- Smoke-test the live PLC surfaces, especially:
  - **PII boundary:** in a PLC with **2+ teachers**, a non-owning member sees
    aggregates (no `permission-denied`) and never sees another teacher's raw
    student names; the owning teacher still sees her own roster.
  - Two-browser **presence**; **Meeting Mode**; the org **"PLCs in my building"**
    directory (reads the slim `/plcIndex`, no member emails exposed).

## ℹ️ TODO 3 — Optional / later

- The weekly digest (`plcWeeklyDigest`) is **opt-in and kill-switched OFF**
  (`global_permissions/plc-digest`, `enabled` defaults false). Turn it on only
  after confirming a `from` address is configured for the `firestore-send-email`
  extension (recipients are BCC'd; the visible `To` is the sender).

---

_For full context see [`plc-workspace-prd.md`](plc-workspace-prd.md). This file
tracks only what a human still needs to do post-release._
