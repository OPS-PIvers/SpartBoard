/**
 * Nightly ClassLink roster sync.
 *
 * Teachers' rosters drift the moment a student changes sections, and the only
 * fix today is a teacher remembering to click Sync. This runs unattended: for
 * every ClassLink-origin roster it re-reads the class from OneRoster, merges
 * it into the roster's Drive file, and reconciles the pin_index sidecar.
 *
 * It can only touch a roster whose teacher granted a server-side refresh
 * token (`users/{uid}/private/googleAuth`) — student names live in Drive, not
 * Firestore, so there is nothing to sync without one. Teachers without a
 * grant are counted and skipped, never failed.
 *
 * PII boundary: the Firestore roster doc stays name-free (see the contract on
 * `ClassRosterMeta`). Counts go to Firestore; the names of who was added or
 * removed are written into the Drive file alongside the students they concern.
 */

import * as admin from 'firebase-admin';
import axios from 'axios';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import {
  CLASSLINK_CLIENT_ID,
  CLASSLINK_CLIENT_SECRET,
  CLASSLINK_TENANT_URL,
  GOOGLE_OAUTH_CLIENT_ID,
  GOOGLE_OAUTH_CLIENT_SECRET,
  GOOGLE_OAUTH_REFRESH_TOKEN_KEY,
  STUDENT_PSEUDONYM_HMAC_SECRET,
} from './secrets';
import {
  ClassLinkStudent,
  ONEROSTER_BASE,
  getOAuthHeaders,
} from './classlinkShared';
import {
  reconcileClassLinkStudents,
  ReconcileBlock,
  SyncStudent,
} from './classlinkRosterReconcile';
import { refreshGoogleAccessTokenForUid } from './googleOAuth';
import { reconcileRosterPinIndex } from './studentIdentity';

const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';
const API_TIMEOUT_MS = 20000;

/** Admin kill switch. Absent doc == disabled: this never runs by default. */
export const SYNC_SETTINGS_PATH = 'admin_settings/classlink_sync';

const ROSTER_PAGE_SIZE = 100;
const MAX_ROSTERS_PER_RUN = 500;
/** Stop early so a long run returns a summary instead of being killed at 540s. */
const RUN_BUDGET_MS = 8 * 60 * 1000;
/** Matches `PIN_INDEX_MAX_ENTRIES` in studentIdentity.ts. */
const PIN_INDEX_MAX_ENTRIES = 200;
/** OneRoster paging. 10 x 200 is far past any real class section. */
const ONEROSTER_PAGE_LIMIT = 200;
const ONEROSTER_MAX_PAGES = 10;

export interface RosterFileContent {
  students: SyncStudent[];
  groups?: { id: string; name: string; studentIds: string[] }[];
  defaultOverridesByStudentId?: Record<string, unknown>;
  lastSync?: {
    at: number;
    added: string[];
    removed: string[];
  };
}

export interface SyncSettings {
  enabled: boolean;
  /** Compute and log every change but write nothing. */
  dryRun: boolean;
}

export interface ClassLinkSyncDeps {
  getAccessToken: (uid: string) => Promise<string>;
  /**
   * `complete: false` means the upstream list may be truncated. Because this
   * job REMOVES students absent from the response, a partial page must never
   * be reconciled — it would read as a mass departure of real students.
   */
  fetchClassStudents: (
    classId: string
  ) => Promise<{ students: ClassLinkStudent[]; complete: boolean }>;
  readRosterFile: (
    accessToken: string,
    fileId: string
  ) => Promise<{ content: RosterFileContent; driveVersion: string }>;
  writeRosterFile: (
    accessToken: string,
    fileId: string,
    content: RosterFileContent
  ) => Promise<void>;
  getDriveVersion: (accessToken: string, fileId: string) => Promise<string>;
  reconcilePinIndex: (
    rosterRef: admin.firestore.DocumentReference,
    rosterData: admin.firestore.DocumentData,
    students: readonly SyncStudent[]
  ) => Promise<void>;
  now: () => number;
}

export interface SyncSummary {
  scanned: number;
  synced: number;
  unchanged: number;
  added: number;
  removed: number;
  skippedNoGrant: number;
  skippedNoFile: number;
  skippedTruncated: number;
  blocked: Record<ReconcileBlock, number>;
  conflicts: number;
  errors: number;
  budgetExhausted: boolean;
}

const emptySummary = (): SyncSummary => ({
  scanned: 0,
  synced: 0,
  unchanged: 0,
  added: 0,
  removed: 0,
  skippedNoGrant: 0,
  skippedNoFile: 0,
  skippedTruncated: 0,
  blocked: { 'empty-upstream': 0, 'mass-removal': 0 },
  conflicts: 0,
  errors: 0,
  budgetExhausted: false,
});

/**
 * Swap in the reconciled students and drop group memberships and standing
 * overrides pointing at students who are gone. Mirrors
 * `pruneRosterFileContent` in `hooks/useRosters.ts`, whose own comment names a
 * ClassLink re-sync as the case it exists for — dangling ids silently shrink
 * select-all targeting.
 */
export function pruneRosterContent(
  content: RosterFileContent,
  students: SyncStudent[]
): RosterFileContent {
  const validIds = new Set(students.map((s) => s.id));
  const defaultOverridesByStudentId: Record<string, unknown> = {};
  for (const [studentId, override] of Object.entries(
    content.defaultOverridesByStudentId ?? {}
  )) {
    if (validIds.has(studentId)) {
      defaultOverridesByStudentId[studentId] = override;
    }
  }
  return {
    ...content,
    students,
    groups: (content.groups ?? []).map((g) => ({
      ...g,
      studentIds: g.studentIds.filter((id) => validIds.has(id)),
    })),
    defaultOverridesByStudentId,
  };
}

/** True when the thrown error is the OAuth layer saying "teacher must re-consent". */
function isNeedsConsent(err: unknown): boolean {
  const details = (err as { details?: { reason?: string } } | null)?.details;
  return details?.reason === 'needs-consent';
}

export async function readSyncSettings(
  db: admin.firestore.Firestore
): Promise<SyncSettings> {
  const snap = await db.doc(SYNC_SETTINGS_PATH).get();
  const data = snap.data();
  return {
    enabled: data?.enabled === true,
    // Any value other than an explicit `false` keeps writes off, so a
    // malformed settings doc fails safe.
    dryRun: data?.dryRun !== false,
  };
}

/**
 * Core sweep. Takes its I/O as `deps` so the whole decision surface — which
 * rosters sync, what blocks, what gets written — is unit-testable without
 * Drive, OneRoster, or the OAuth layer.
 */
export async function runClassLinkRosterSync(
  db: admin.firestore.Firestore,
  deps: ClassLinkSyncDeps,
  settings: SyncSettings
): Promise<SyncSummary> {
  const summary = emptySummary();
  if (!settings.enabled) return summary;

  const startedAt = deps.now();
  // uid -> token, or null once we know this teacher has no grant. Keeps a
  // 40-roster teacher from costing 40 identical refresh attempts.
  const tokenCache = new Map<string, string | null>();

  let cursor: admin.firestore.QueryDocumentSnapshot | undefined;

  while (summary.scanned < MAX_ROSTERS_PER_RUN) {
    if (deps.now() - startedAt > RUN_BUDGET_MS) {
      summary.budgetExhausted = true;
      break;
    }

    let query = db
      .collectionGroup('rosters')
      .orderBy('classlinkClassId')
      .limit(ROSTER_PAGE_SIZE);
    if (cursor) query = query.startAfter(cursor);

    const page = await query.get();
    if (page.empty) break;
    cursor = page.docs[page.docs.length - 1];

    for (const rosterSnap of page.docs) {
      if (deps.now() - startedAt > RUN_BUDGET_MS) {
        summary.budgetExhausted = true;
        break;
      }
      summary.scanned += 1;
      try {
        await syncOneRoster(rosterSnap, deps, settings, summary, tokenCache);
      } catch (err) {
        summary.errors += 1;
        console.error(
          `[classlinkRosterSync] roster ${rosterSnap.ref.path} failed:`,
          err
        );
      }
    }

    if (summary.budgetExhausted || page.size < ROSTER_PAGE_SIZE) break;
  }

  return summary;
}

async function syncOneRoster(
  rosterSnap: admin.firestore.QueryDocumentSnapshot,
  deps: ClassLinkSyncDeps,
  settings: SyncSettings,
  summary: SyncSummary,
  tokenCache: Map<string, string | null>
): Promise<void> {
  const data = rosterSnap.data();
  // `DocumentData` values are `any`; keep them opaque until the guards below.
  const classId: unknown = data.classlinkClassId;
  const driveFileId: unknown = data.driveFileId;
  if (typeof classId !== 'string' || !classId) return;

  // `users/{uid}/rosters/{rosterId}` — the grandparent doc is the owner.
  const uid = rosterSnap.ref.parent.parent?.id;
  if (!uid) return;

  if (typeof driveFileId !== 'string' || !driveFileId) {
    // Roster was never written to Drive (Drive was down at import time).
    // There are no student names to reconcile against.
    summary.skippedNoFile += 1;
    return;
  }

  let token = tokenCache.get(uid);
  if (token === undefined) {
    try {
      token = await deps.getAccessToken(uid);
    } catch (err) {
      if (!isNeedsConsent(err)) throw err;
      token = null;
    }
    tokenCache.set(uid, token);
  }
  if (token === null) {
    summary.skippedNoGrant += 1;
    return;
  }

  const upstream = await deps.fetchClassStudents(classId);
  if (!upstream.complete) {
    summary.skippedTruncated += 1;
    console.warn(
      `[classlinkRosterSync] ${rosterSnap.ref.path}: upstream list may be truncated; skipping`
    );
    return;
  }

  const { content, driveVersion } = await deps.readRosterFile(
    token,
    driveFileId
  );

  const result = reconcileClassLinkStudents(
    content.students,
    upstream.students
  );
  if (result.blocked) {
    summary.blocked[result.blocked] += 1;
    console.warn(
      `[classlinkRosterSync] ${rosterSnap.ref.path} blocked: ${result.blocked}`
    );
    return;
  }

  // Gate on `changed`, not on added/removed: a by-name re-link stamps a stable
  // sourcedId that makes the NEXT sync survive a rename, and dropping it would
  // silently defeat that.
  if (!result.changed) {
    summary.unchanged += 1;
    return;
  }

  summary.added += result.added.length;
  summary.removed += result.removed.length;

  if (settings.dryRun) {
    console.log(
      `[classlinkRosterSync] DRY RUN ${rosterSnap.ref.path}: +${result.added.length} -${result.removed.length}`
    );
    return;
  }

  // Drive has no If-Match on a media upload, so re-read the file version
  // immediately before writing. A teacher who saved this roster while we were
  // merging would otherwise be silently overwritten; we yield to them and
  // pick the roster up on the next run.
  const currentVersion = await deps.getDriveVersion(token, driveFileId);
  if (currentVersion !== driveVersion) {
    summary.conflicts += 1;
    console.warn(
      `[classlinkRosterSync] ${rosterSnap.ref.path} changed mid-sync; skipping`
    );
    return;
  }

  const describe = (c: { firstName: string; lastName: string }): string =>
    `${c.firstName} ${c.lastName}`.trim();

  await deps.writeRosterFile(token, driveFileId, {
    ...pruneRosterContent(content, result.students),
    lastSync: {
      at: deps.now(),
      added: result.added.map(describe),
      removed: result.removed.map(describe),
    },
  });

  // Sidecar before the Firestore stamp: a removed student keeping their
  // pin_index entry would still pass the PIN→SSO gate, so a failure here must
  // not be masked by a roster doc that claims the sync succeeded.
  await deps.reconcilePinIndex(rosterSnap.ref, data, result.students);

  await rosterSnap.ref.update({
    studentCount: result.students.length,
    classlinkSyncedAt: deps.now(),
    // Counts only — names stay in Drive. See the PII note in the file header.
    classlinkSyncSummary: {
      at: deps.now(),
      addedCount: result.added.length,
      removedCount: result.removed.length,
    },
  });
  summary.synced += 1;
}

// ─── Live dependency wiring ───────────────────────────────────────────────────

async function driveGetVersion(
  accessToken: string,
  fileId: string
): Promise<string> {
  const res = await axios.get<{ version?: string }>(
    `${DRIVE_API}/files/${encodeURIComponent(fileId)}`,
    {
      params: { fields: 'version' },
      headers: { Authorization: `Bearer ${accessToken}` },
      timeout: API_TIMEOUT_MS,
    }
  );
  return res.data.version ?? '';
}

/**
 * Read the roster's Drive JSON. Accepts both the v2 envelope and the legacy
 * bare `Student[]`, matching `parseRosterFileBody` in `hooks/useRosters.ts`.
 */
export function parseRosterFileBody(parsed: unknown): RosterFileContent {
  if (Array.isArray(parsed)) return { students: parsed as SyncStudent[] };
  if (parsed && typeof parsed === 'object') {
    const obj = parsed as Record<string, unknown>;
    if (Array.isArray(obj.students)) {
      return {
        students: obj.students as SyncStudent[],
        ...(Array.isArray(obj.groups)
          ? { groups: obj.groups as RosterFileContent['groups'] }
          : {}),
        ...(obj.defaultOverridesByStudentId &&
        typeof obj.defaultOverridesByStudentId === 'object'
          ? {
              defaultOverridesByStudentId:
                obj.defaultOverridesByStudentId as Record<string, unknown>,
            }
          : {}),
      };
    }
  }
  throw new Error('Roster Drive file is not a recognized roster payload');
}

function buildLiveDeps(db: admin.firestore.Firestore): ClassLinkSyncDeps {
  const tenantUrl = CLASSLINK_TENANT_URL.value().replace(/\/$/, '');
  const clientId = CLASSLINK_CLIENT_ID.value();
  const clientSecret = CLASSLINK_CLIENT_SECRET.value();
  const hmacSecret = STUDENT_PSEUDONYM_HMAC_SECRET.value();

  return {
    getAccessToken: async (uid) =>
      (await refreshGoogleAccessTokenForUid(uid)).accessToken,

    fetchClassStudents: async (classId) => {
      const url = `${tenantUrl}${ONEROSTER_BASE}/classes/${encodeURIComponent(
        classId
      )}/students`;
      const students: ClassLinkStudent[] = [];

      for (let page = 0; page < ONEROSTER_MAX_PAGES; page += 1) {
        // OneRoster signs the query string, so the same params must go to
        // both the signature and the request.
        const params = {
          limit: String(ONEROSTER_PAGE_LIMIT),
          offset: String(page * ONEROSTER_PAGE_LIMIT),
        };
        const headers = getOAuthHeaders(
          url,
          params,
          'GET',
          clientId,
          clientSecret
        );
        const res = await axios.get<{ users?: ClassLinkStudent[] }>(url, {
          params,
          headers,
          timeout: API_TIMEOUT_MS,
        });
        const batch = res.data.users ?? [];
        students.push(...batch);
        // A short page is the end of the list — the only positive proof we
        // have that nothing was withheld.
        if (batch.length < ONEROSTER_PAGE_LIMIT) {
          return { students, complete: true };
        }
      }

      // Still full pages at the cap: we cannot prove we saw the whole class,
      // so report it incomplete rather than removing against a partial list.
      return { students, complete: false };
    },

    readRosterFile: async (accessToken, fileId) => {
      // Version BEFORE content, never in parallel. A teacher saving between
      // the two must make the pre-write check fail: reading the version second
      // would record their new version against our stale content, and the
      // check would then wave the overwrite through.
      const driveVersion = await driveGetVersion(accessToken, fileId);
      const body = await axios.get<unknown>(
        `${DRIVE_API}/files/${encodeURIComponent(fileId)}`,
        {
          params: { alt: 'media' },
          headers: { Authorization: `Bearer ${accessToken}` },
          timeout: API_TIMEOUT_MS,
        }
      );
      return { content: parseRosterFileBody(body.data), driveVersion };
    },

    writeRosterFile: async (accessToken, fileId, content) => {
      await axios.patch(
        `${DRIVE_UPLOAD_API}/files/${encodeURIComponent(fileId)}`,
        JSON.stringify({ version: 2, ...content }),
        {
          params: { uploadType: 'media' },
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          timeout: API_TIMEOUT_MS,
        }
      );
    },

    getDriveVersion: driveGetVersion,

    reconcilePinIndex: async (rosterRef, rosterData, students) => {
      const entries = students
        .filter((s) => s.classLinkSourcedId && s.pin)
        .slice(0, PIN_INDEX_MAX_ENTRIES)
        .map((s) => ({
          period: String(rosterData.name ?? ''),
          pin: s.pin,
          classlinkSourcedId: s.classLinkSourcedId as string,
        }));
      await reconcileRosterPinIndex(
        db,
        rosterRef,
        rosterData,
        entries,
        hmacSecret
      );
    },

    now: () => Date.now(),
  };
}

export const classlinkRosterSync = onSchedule(
  {
    // 02:30 America/Chicago — after the SIS's own overnight load and well
    // clear of first period.
    schedule: '30 2 * * *',
    timeZone: 'America/Chicago',
    memory: '512MiB',
    maxInstances: 1,
    timeoutSeconds: 540,
    secrets: [
      CLASSLINK_CLIENT_ID,
      CLASSLINK_CLIENT_SECRET,
      CLASSLINK_TENANT_URL,
      GOOGLE_OAUTH_CLIENT_ID,
      GOOGLE_OAUTH_CLIENT_SECRET,
      GOOGLE_OAUTH_REFRESH_TOKEN_KEY,
      STUDENT_PSEUDONYM_HMAC_SECRET,
    ],
  },
  async () => {
    const db = admin.firestore();
    const settings = await readSyncSettings(db);
    if (!settings.enabled) {
      console.log('[classlinkRosterSync] disabled; set enabled=true to run.');
      return;
    }

    const summary = await runClassLinkRosterSync(
      db,
      buildLiveDeps(db),
      settings
    );
    console.log(
      `[classlinkRosterSync] ${settings.dryRun ? 'DRY RUN ' : ''}` +
        `scanned=${summary.scanned} synced=${summary.synced} ` +
        `unchanged=${summary.unchanged} +${summary.added}/-${summary.removed} ` +
        `noGrant=${summary.skippedNoGrant} noFile=${summary.skippedNoFile} ` +
        `truncated=${summary.skippedTruncated} ` +
        `blocked=${JSON.stringify(summary.blocked)} ` +
        `conflicts=${summary.conflicts} errors=${summary.errors} ` +
        `budgetExhausted=${summary.budgetExhausted}`
    );
  }
);
