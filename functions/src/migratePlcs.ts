/**
 * One-shot PLC migration Cloud Function (Decision 6.1 / PRD §5, §6.1).
 *
 * Admin-only callable that walks every `/plcs/{plcId}` doc and brings it onto
 * the canonical members-map model (Decision 1.2) established by Wave 1:
 *
 *   1. **arrays → members map** — synthesizes `members[uid] = { uid, email,
 *      displayName, role, joinedAt, status }` from the legacy
 *      `memberUids` + `memberEmails` + `leadUid` fields when the canonical
 *      `members` map is absent or incomplete. Lead is `uid === leadUid`;
 *      everyone else is `member`. `displayName` is best-effort from a
 *      `/users/{uid}` lookup, falling back to the email local-part.
 *   2. **exactly one lead** — if `leadUid` is missing/not a member, the first
 *      synthesized member is promoted to `lead` so the one-lead invariant the
 *      rules enforce holds post-migration.
 *   3. **leadUid mirror backfill** — the denormalized `leadUid` is rewritten
 *      from whichever member ends up at role `lead`.
 *   4. **orgId inference** — reuses `resolveOrgIdForDomain(db, '@domain')` over
 *      each active member's email domain (first verified match wins; `null`
 *      when no member domain maps to a verified org). A manually-set `orgId`
 *      is NEVER overwritten.
 *   5. **aggregates skeleton** — if the `contributions` subcollection has any
 *      docs, seeds a single minimal `aggregates/_migration` marker doc so
 *      Wave-3's real `aggregatePlcAssessment` function has a deterministic
 *      placeholder to overwrite. No heavy recomputation here.
 *
 * **Idempotent.** A second run is a no-op on docs already migrated: migration
 * is guarded by a `membersMigratedAt` schema marker AND a "well-formed members
 * map" detection, so re-running never duplicates members, never flips an
 * already-correct lead, never overwrites a manually-set `orgId`, and never
 * re-seeds the aggregates marker.
 *
 * **Dual-shape back-compat (PRD §6.1):** until this runs, the T1/T2 read
 * parsers (`getPlcMembers` / `parsePlc`) already synthesize a members view
 * from the legacy `memberUids` / `memberEmails` / `leadUid` arrays, so the app
 * works *both* pre- and post-migration. This function simply persists that
 * synthesized shape so the map becomes the on-disk source of truth.
 *
 * Cost posture: `memory` / `maxInstances` pinned; root docs are paged and
 * mutated in bounded batched writes (≤ MAX_OPS_PER_BATCH ops per commit).
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { resolveOrgIdForDomain } from './classlinkShared';
import './functionsInit';

const PLCS_COLLECTION = 'plcs';

/**
 * Firestore caps a write batch at 500 ops. Each migrated PLC is a single
 * `set(..., { merge: true })` on the root doc (the aggregates marker, when
 * needed, is a second op), so we keep a comfortable margin under the cap.
 */
const MAX_OPS_PER_BATCH = 200;

/** Page size for the root-doc scan. */
const PLC_PAGE_SIZE = 200;

type MemberStatus = 'active' | 'removed';
type PlcRole = 'lead' | 'coLead' | 'member' | 'viewer';

const VALID_ROLES: ReadonlySet<PlcRole> = new Set([
  'lead',
  'coLead',
  'member',
  'viewer',
]);

/** On-disk member entry (write shape — `joinedAt` may be a server sentinel). */
interface MemberWrite {
  uid: string;
  email: string;
  displayName: string;
  role: PlcRole;
  status: MemberStatus;
  joinedAt: unknown;
}

export interface MigratePlcsResponse {
  /** Total `/plcs` docs scanned. */
  scanned: number;
  /** Docs that received a write (members backfilled / lead or orgId set). */
  migrated: number;
  /** Docs skipped because they were already migrated (idempotent no-op). */
  alreadyMigrated: number;
  /** Docs that got an `orgId` inferred during this run. */
  orgIdInferred: number;
  /** Docs that got an `aggregates/_migration` skeleton seeded this run. */
  aggregatesSeeded: number;
  /** Docs skipped because their shape was unrecoverable (no members at all). */
  skippedEmpty: number;
}

/** True when `value` is a non-empty string. */
function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

/** Lowercased local-part of an email, or '' if not an email. */
function emailLocalPart(email: string): string {
  const at = email.indexOf('@');
  return at > 0 ? email.slice(0, at) : email;
}

/** `@domain` (lowercased, leading '@') from an email, or null when malformed. */
function emailDomainWithAt(email: string): string | null {
  const at = email.lastIndexOf('@');
  if (at < 0 || at === email.length - 1) return null;
  return '@' + email.slice(at + 1).toLowerCase();
}

/**
 * Detect whether a `members` map is already well-formed (the migration
 * already ran, or the doc was created post-Wave-1). Well-formed = a non-empty
 * map where every entry has a string `uid`/`email`, a valid `role`, a
 * `status`, and exactly one `active` member at role `lead`. An EMPTY map is
 * treated as un-migrated (matches T1's empty-map-falls-back-to-arrays
 * semantics), so this returns false for `{}`.
 */
function isWellFormedMembersMap(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0) return false;
  let activeLeads = 0;
  for (const [key, raw] of entries) {
    if (!raw || typeof raw !== 'object') return false;
    const m = raw as Record<string, unknown>;
    if (!isNonEmptyString(m.uid) || m.uid !== key) return false;
    if (typeof m.email !== 'string') return false;
    if (typeof m.displayName !== 'string') return false;
    if (typeof m.role !== 'string' || !VALID_ROLES.has(m.role as PlcRole)) {
      return false;
    }
    if (m.status !== 'active' && m.status !== 'removed') return false;
    if (m.role === 'lead' && m.status === 'active') activeLeads += 1;
  }
  return activeLeads === 1;
}

/**
 * Best-effort displayName lookup from `/users/{uid}`. Returns '' on any miss
 * so the caller can fall back to the email local-part. Cached per-run so two
 * PLCs sharing a member don't double-read.
 */
async function lookupDisplayName(
  db: admin.firestore.Firestore,
  uid: string,
  cache: Map<string, string>
): Promise<string> {
  const cached = cache.get(uid);
  if (cached !== undefined) return cached;
  let name = '';
  try {
    const snap = await db.collection('users').doc(uid).get();
    if (snap.exists) {
      const data = (snap.data() ?? {}) as Record<string, unknown>;
      const candidate = data.displayName ?? data.name;
      if (isNonEmptyString(candidate)) name = candidate;
    }
  } catch {
    // A failed user read must never abort the migration — fall back to ''.
    name = '';
  }
  cache.set(uid, name);
  return name;
}

/**
 * Build the canonical members map for one PLC from its legacy arrays,
 * preserving any already-present canonical entries (so a partially-migrated
 * doc keeps existing `joinedAt`/`displayName`/`role` rather than resetting
 * them). Returns null when there are no members to synthesize at all.
 */
async function buildMembers(
  db: admin.firestore.Firestore,
  data: Record<string, unknown>,
  serverTimestamp: () => unknown,
  nameCache: Map<string, string>
): Promise<Record<string, MemberWrite> | null> {
  const existing =
    data.members && typeof data.members === 'object'
      ? (data.members as Record<string, unknown>)
      : {};

  const leadUid = isNonEmptyString(data.leadUid) ? data.leadUid : '';
  const memberUids = Array.isArray(data.memberUids)
    ? (data.memberUids as unknown[]).filter(isNonEmptyString)
    : [];
  const emails =
    data.memberEmails && typeof data.memberEmails === 'object'
      ? (data.memberEmails as Record<string, unknown>)
      : {};

  // Union of every uid we know about: legacy index + existing map keys.
  const allUids = new Set<string>(memberUids);
  for (const key of Object.keys(existing)) allUids.add(key);
  if (leadUid) allUids.add(leadUid);

  if (allUids.size === 0) return null;

  const out: Record<string, MemberWrite> = {};
  for (const uid of allUids) {
    const prior =
      existing[uid] && typeof existing[uid] === 'object'
        ? (existing[uid] as Record<string, unknown>)
        : undefined;

    // Email: prefer an existing canonical email, then the legacy index.
    const rawEmail =
      (prior && typeof prior.email === 'string' && prior.email) ||
      (typeof emails[uid] === 'string' ? emails[uid] : '');
    const email = rawEmail.trim().toLowerCase();

    // displayName: prefer existing, then /users lookup, then email local-part.
    let displayName =
      prior && isNonEmptyString(prior.displayName) ? prior.displayName : '';
    if (!displayName) displayName = await lookupDisplayName(db, uid, nameCache);
    if (!displayName) displayName = emailLocalPart(email);

    // role: preserve a valid prior role; otherwise lead⇔leadUid, else member.
    let role: PlcRole;
    if (
      prior &&
      typeof prior.role === 'string' &&
      VALID_ROLES.has(prior.role as PlcRole)
    ) {
      role = prior.role as PlcRole;
    } else {
      role = uid === leadUid ? 'lead' : 'member';
    }

    // status: preserve a valid prior status; otherwise active.
    const status: MemberStatus =
      prior && (prior.status === 'active' || prior.status === 'removed')
        ? prior.status
        : 'active';

    // joinedAt: preserve an existing value (Timestamp or number); otherwise
    // stamp a fresh serverTimestamp sentinel.
    const joinedAt =
      prior && prior.joinedAt !== undefined && prior.joinedAt !== null
        ? prior.joinedAt
        : serverTimestamp();

    out[uid] = { uid, email, displayName, role, status, joinedAt };
  }

  // Enforce exactly one ACTIVE lead. Count current active leads.
  const activeMembers = Object.values(out).filter((m) => m.status === 'active');
  if (activeMembers.length === 0) {
    // Every known member is 'removed' — promote nobody; nothing to lead.
    // Return as-is; the caller still backfills the (empty) leadUid mirror.
    return out;
  }
  const activeLeads = activeMembers.filter((m) => m.role === 'lead');
  if (activeLeads.length === 0) {
    // No active lead: promote the leadUid member if active, else the first
    // active member (deterministic: lowest uid for stable re-runs).
    const sorted = [...activeMembers].sort((a, b) =>
      a.uid < b.uid ? -1 : a.uid > b.uid ? 1 : 0
    );
    const promote = sorted.find((m) => m.uid === leadUid) ?? sorted[0];
    promote.role = 'lead';
  } else if (activeLeads.length > 1) {
    // Multiple active leads (legacy corruption): keep the leadUid one (or the
    // lowest-uid lead) and demote the rest to 'coLead' so we don't silently
    // drop a manager's powers.
    const keep =
      activeLeads.find((m) => m.uid === leadUid) ??
      [...activeLeads].sort((a, b) =>
        a.uid < b.uid ? -1 : a.uid > b.uid ? 1 : 0
      )[0];
    for (const lead of activeLeads) {
      if (lead.uid !== keep.uid) lead.role = 'coLead';
    }
  }

  return out;
}

/** The active member at role 'lead', or '' when none. */
function deriveLeadUid(members: Record<string, MemberWrite>): string {
  for (const m of Object.values(members)) {
    if (m.role === 'lead' && m.status === 'active') return m.uid;
  }
  return '';
}

/** Active member uids (denormalized `memberUids` index). */
function deriveMemberUids(members: Record<string, MemberWrite>): string[] {
  return Object.values(members)
    .filter((m) => m.status === 'active')
    .map((m) => m.uid);
}

/** `{ uid: email }` for active members (legacy `memberEmails` mirror). */
function deriveMemberEmails(
  members: Record<string, MemberWrite>
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of Object.values(members)) {
    if (m.status === 'active' && m.email) out[m.uid] = m.email;
  }
  return out;
}

/**
 * Infer `orgId` from the first active member email whose domain maps to a
 * verified org. Returns null when no member domain resolves.
 */
async function inferOrgId(
  db: admin.firestore.Firestore,
  members: Record<string, MemberWrite>
): Promise<string | null> {
  // Deterministic order so re-runs that somehow reach this path agree.
  const active = Object.values(members)
    .filter((m) => m.status === 'active' && m.email)
    .sort((a, b) => (a.uid < b.uid ? -1 : a.uid > b.uid ? 1 : 0));
  const triedDomains = new Set<string>();
  for (const m of active) {
    const domain = emailDomainWithAt(m.email);
    if (!domain || triedDomains.has(domain)) continue;
    triedDomains.add(domain);
    const orgId = await resolveOrgIdForDomain(db, domain);
    if (orgId) return orgId;
  }
  return null;
}

/**
 * Migrate a single PLC root doc. Pure-ish: reads what it needs, returns the
 * patch to apply (or null to skip) plus bookkeeping flags. Does NOT write —
 * the caller batches writes for cost control.
 */
async function planMigration(
  db: admin.firestore.Firestore,
  docSnap: admin.firestore.QueryDocumentSnapshot,
  serverTimestamp: () => unknown,
  nameCache: Map<string, string>
): Promise<{
  patch: Record<string, unknown> | null;
  seedAggregates: boolean;
  orgIdInferred: boolean;
  alreadyMigrated: boolean;
  skippedEmpty: boolean;
}> {
  const data = (docSnap.data() ?? {}) as Record<string, unknown>;

  // Idempotency guard: already migrated when the marker is present AND the
  // on-disk members map is well-formed. Either alone is insufficient — the
  // marker proves intent, the well-formed check proves the data is good.
  const hasMarker = data.membersMigratedAt !== undefined;
  const wellFormed = isWellFormedMembersMap(data.members);
  if (hasMarker && wellFormed) {
    return {
      patch: null,
      seedAggregates: false,
      orgIdInferred: false,
      alreadyMigrated: true,
      skippedEmpty: false,
    };
  }

  const members = await buildMembers(db, data, serverTimestamp, nameCache);
  if (!members) {
    // No members anywhere — unrecoverable shape; leave it untouched so a human
    // can inspect rather than writing an empty/invalid map.
    return {
      patch: null,
      seedAggregates: false,
      orgIdInferred: false,
      alreadyMigrated: false,
      skippedEmpty: true,
    };
  }

  const patch: Record<string, unknown> = {
    members,
    leadUid: deriveLeadUid(members),
    memberUids: deriveMemberUids(members),
    memberEmails: deriveMemberEmails(members),
    membersMigratedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  // orgId: NEVER overwrite a manually-set value. Only infer when absent/null.
  let orgIdInferred = false;
  const existingOrgId = data.orgId;
  if (existingOrgId === undefined || existingOrgId === null) {
    const inferred = await inferOrgId(db, members);
    // Write the field either way so the shape is canonical (null when no
    // match), but only flag "inferred" when we actually resolved an org.
    patch.orgId = inferred;
    if (inferred) orgIdInferred = true;
  }
  // buildingId: leave untouched unless absent — default to null (not
  // trivially derivable from member domains alone).
  if (data.buildingId === undefined) {
    patch.buildingId = null;
  }

  // Aggregates skeleton: seed only if the contributions subcollection has at
  // least one doc and the marker isn't already present.
  let seedAggregates = false;
  const aggMarkerRef = docSnap.ref.collection('aggregates').doc('_migration');
  const aggMarkerSnap = await aggMarkerRef.get();
  if (!aggMarkerSnap.exists) {
    const contribSnap = await docSnap.ref
      .collection('contributions')
      .limit(1)
      .get();
    if (!contribSnap.empty) seedAggregates = true;
  }

  return {
    patch,
    seedAggregates,
    orgIdInferred,
    alreadyMigrated: false,
    skippedEmpty: false,
  };
}

/**
 * Core migration loop. Pages `/plcs`, plans each doc, and applies bounded
 * batched writes. Exported (sans the onCall wrapper) so the unit test can
 * drive it with a stub Firestore.
 */
export async function runMigratePlcs(
  db: admin.firestore.Firestore,
  serverTimestamp: () => unknown
): Promise<MigratePlcsResponse> {
  const result: MigratePlcsResponse = {
    scanned: 0,
    migrated: 0,
    alreadyMigrated: 0,
    orgIdInferred: 0,
    aggregatesSeeded: 0,
    skippedEmpty: 0,
  };

  const nameCache = new Map<string, string>();

  let lastDoc: admin.firestore.QueryDocumentSnapshot | null = null;
  // Pending writes accumulate across pages; flush when we hit the op cap.
  let batch = db.batch();
  let opsInBatch = 0;
  const flush = async (): Promise<void> => {
    if (opsInBatch > 0) {
      await batch.commit();
      batch = db.batch();
      opsInBatch = 0;
    }
  };

  for (;;) {
    let query = db
      .collection(PLCS_COLLECTION)
      .orderBy(admin.firestore.FieldPath.documentId())
      .limit(PLC_PAGE_SIZE);
    if (lastDoc) query = query.startAfter(lastDoc);
    const page = await query.get();
    if (page.empty) break;

    for (const docSnap of page.docs) {
      result.scanned += 1;
      const plan = await planMigration(db, docSnap, serverTimestamp, nameCache);

      if (plan.alreadyMigrated) {
        result.alreadyMigrated += 1;
        continue;
      }
      if (plan.skippedEmpty) {
        result.skippedEmpty += 1;
        continue;
      }
      if (!plan.patch) continue;

      // Merge-set the root patch so we never clobber unrelated fields
      // (features, sharedSheetUrl, name, createdAt, ...).
      batch.set(docSnap.ref, plan.patch, { merge: true });
      opsInBatch += 1;
      result.migrated += 1;
      if (plan.orgIdInferred) result.orgIdInferred += 1;

      if (plan.seedAggregates) {
        const aggRef = docSnap.ref.collection('aggregates').doc('_migration');
        batch.set(
          aggRef,
          {
            schemaVersion: 0,
            placeholder: true,
            seededBy: 'migratePlcs',
            ranAt: serverTimestamp(),
          },
          { merge: true }
        );
        opsInBatch += 1;
        result.aggregatesSeeded += 1;
      }

      if (opsInBatch >= MAX_OPS_PER_BATCH) await flush();
    }

    lastDoc = page.docs[page.docs.length - 1];
    if (page.size < PLC_PAGE_SIZE) break;
  }

  await flush();
  return result;
}

/** Memoized admin check against `/admins/{emailLower}` (existence = admin). */
async function assertCallerIsAdmin(
  db: admin.firestore.Firestore,
  emailLower: string
): Promise<void> {
  const snap = await db.collection('admins').doc(emailLower).get();
  if (!snap.exists) {
    throw new HttpsError(
      'permission-denied',
      'Only site administrators can run the PLC migration.'
    );
  }
}

export const migratePlcs = onCall(
  {
    // Cost posture (PRD §5/§8): pin memory + a single instance so a
    // one-shot backfill can't fan out. 9 min timeout covers a large
    // `/plcs` collection (paged + batched).
    memory: '512MiB',
    maxInstances: 1,
    timeoutSeconds: 540,
  },
  async (request): Promise<MigratePlcsResponse> => {
    if (!request.auth) {
      throw new HttpsError(
        'unauthenticated',
        'The function must be called while authenticated.'
      );
    }
    const callerEmail = request.auth.token.email;
    if (!callerEmail) {
      throw new HttpsError(
        'invalid-argument',
        'Caller must have an email associated with their account.'
      );
    }
    const db = admin.firestore();
    await assertCallerIsAdmin(db, callerEmail.toLowerCase());

    return runMigratePlcs(db, () =>
      admin.firestore.FieldValue.serverTimestamp()
    );
  }
);
