import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  collection,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  orderBy,
} from 'firebase/firestore';
import { deleteField } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { User } from 'firebase/auth';
import {
  ClassRoster,
  ClassRosterMeta,
  RosterGroup,
  RubricSnapshot,
  Student,
  StudentOverride,
} from '@/types';
import { db, functions, isAuthBypass } from '@/config/firebase';
import { useGoogleDrive } from '@/hooks/useGoogleDrive';
import { getLocalIsoDate } from '@/utils/localDate';
import { mapWithConcurrency } from '@/utils/mapWithConcurrency';
import { assignPins } from '@/utils/rosterPins';

/**
 * Phase 3 — rebuild the per-roster pin_index sidecar after a roster save.
 *
 * Posts every (period, pin, classlinkSourcedId) tuple from the saved
 * student list to `commitRosterPinIndexV1`, which writes the non-PII
 * `/users/{uid}/rosters/{rosterId}/pin_index/*` docs that pinLoginV1
 * later reads to bridge a PIN-joining student into the same uid space
 * SSO produces. Skips silently for local rosters (no
 * classLinkSourcedId on any student); the cloud function also short-
 * circuits there. Best-effort: a failure logs and returns — the roster
 * save itself has already succeeded, and the next save will retry.
 */
async function syncRosterPinIndex(
  rosterId: string,
  rosterName: string,
  students: Student[]
): Promise<void> {
  const entries = students
    .filter(
      (s) =>
        typeof s.classLinkSourcedId === 'string' &&
        s.classLinkSourcedId.length > 0 &&
        typeof s.pin === 'string' &&
        s.pin.length > 0
    )
    .map((s) => ({
      period: rosterName,
      pin: s.pin,
      classlinkSourcedId: s.classLinkSourcedId as string,
    }));

  if (entries.length === 0) {
    // Local rosters — no SSO bridge possible. The function itself
    // tolerates an empty `entries` and a missing classlinkClassId,
    // but skipping the round-trip is cheaper.
    return;
  }

  try {
    const callable = httpsCallable<
      { rosterId: string; entries: typeof entries },
      {
        wrote: number;
        deleted: number;
        skippedMalformed?: number;
        skippedReason?: string;
      }
    >(functions, 'commitRosterPinIndexV1');
    const res = await callable({ rosterId, entries });
    // Server-side input validation may silently drop entries with
    // malformed shape (typo'd ClassLink id, missing pin). Surface
    // any such drops to the console so a teacher debugging "why
    // can't this student SSO-bridge" has a breadcrumb to follow.
    // Not a toast: the data is still saved, the affected student
    // just falls back to legacy PIN — same as before Phase 3.
    if (res.data.skippedMalformed && res.data.skippedMalformed > 0) {
      console.warn(
        `[useRosters] commitRosterPinIndexV1 dropped ${res.data.skippedMalformed} malformed entries on roster ${rosterId}`
      );
    }
  } catch (err) {
    console.warn('[useRosters] commitRosterPinIndexV1 failed:', err);
  }
}

/**
 * Parse a raw record (from Drive JSON or Firestore doc) into a Student.
 * Returns null if required fields are missing or malformed. Centralized here so
 * all load paths pick up new optional fields (e.g., classLinkSourcedId) at once.
 */
function parseRawStudent(raw: unknown): Student | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as Record<string, unknown>;
  if (
    typeof s.id !== 'string' ||
    typeof s.firstName !== 'string' ||
    typeof s.lastName !== 'string'
  ) {
    return null;
  }
  const base: Student = {
    id: s.id,
    firstName: s.firstName,
    lastName: s.lastName,
    pin: typeof s.pin === 'string' ? s.pin : '',
  };
  if (typeof s.classLinkSourcedId === 'string') {
    base.classLinkSourcedId = s.classLinkSourcedId;
  }
  if (Array.isArray(s.restrictedStudentIds)) {
    const ids = s.restrictedStudentIds.filter(
      (id): id is string => typeof id === 'string'
    );
    if (ids.length > 0) base.restrictedStudentIds = ids;
  }
  return base;
}

/**
 * In-memory shape of a roster's Drive JSON file body (M17 A4). Version 2 wraps
 * students in an envelope alongside groups and standing accommodation
 * defaults; version 1 (legacy) is a bare `Student[]` array — see
 * `parseRosterFileBody` for the back-compat reader.
 */
interface RosterFileContent {
  students: Student[];
  groups: RosterGroup[];
  defaultOverridesByStudentId: Record<string, StudentOverride>;
}

const emptyRosterFileExtras = (): Pick<
  RosterFileContent,
  'groups' | 'defaultOverridesByStudentId'
> => ({ groups: [], defaultOverridesByStudentId: {} });

function parseRosterGroup(raw: unknown): RosterGroup | null {
  if (!raw || typeof raw !== 'object') return null;
  const g = raw as Record<string, unknown>;
  if (typeof g.id !== 'string' || typeof g.name !== 'string') return null;
  const studentIds = Array.isArray(g.studentIds)
    ? g.studentIds.filter((id): id is string => typeof id === 'string')
    : [];
  return { id: g.id, name: g.name, studentIds };
}

function parseStudentOverride(raw: unknown): StudentOverride | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const override: StudentOverride = {};
  if (
    o.timeMultiplier === 1.5 ||
    o.timeMultiplier === 2 ||
    o.timeMultiplier === 'unlimited'
  ) {
    override.timeMultiplier = o.timeMultiplier;
  }
  if (Array.isArray(o.questionIds)) {
    override.questionIds = o.questionIds.filter(
      (id): id is string => typeof id === 'string'
    );
  }
  if (
    o.hiddenOptionIdsByQuestion &&
    typeof o.hiddenOptionIdsByQuestion === 'object'
  ) {
    // Drive JSON is externally mutable — drop entries that aren't string arrays
    // rather than trusting the shape downstream.
    const hidden: Record<string, string[]> = {};
    for (const [questionId, ids] of Object.entries(
      o.hiddenOptionIdsByQuestion as Record<string, unknown>
    )) {
      if (!Array.isArray(ids)) continue;
      hidden[questionId] = ids.filter(
        (id): id is string => typeof id === 'string'
      );
    }
    override.hiddenOptionIdsByQuestion = hidden;
  }
  if (
    o.rubricOverrideByQuestion &&
    typeof o.rubricOverrideByQuestion === 'object'
  ) {
    // Now that A1's type lands a real shape here, keep only 'points' and
    // object snapshots — a primitive from a hand-edited file would break
    // downstream rubric reads.
    const swaps: Record<string, RubricSnapshot | 'points'> = {};
    for (const [questionId, value] of Object.entries(
      o.rubricOverrideByQuestion as Record<string, unknown>
    )) {
      if (value === 'points') swaps[questionId] = 'points';
      else if (value && typeof value === 'object')
        swaps[questionId] = value as RubricSnapshot;
    }
    override.rubricOverrideByQuestion = swaps;
  }
  if (
    typeof o.tabWarningThreshold === 'number' ||
    o.tabWarningThreshold === 'off'
  ) {
    override.tabWarningThreshold = o.tabWarningThreshold;
  }
  if (typeof o.openAt === 'number') override.openAt = o.openAt;
  if (typeof o.closeAt === 'number') override.closeAt = o.closeAt;
  return override;
}

/**
 * Parses a roster Drive file's raw JSON payload, accepting both the legacy
 * bare `Student[]` body (v1) and the versioned `{version:2, ...}` envelope
 * (v2, M17 A4). Always returns the v2-shaped in-memory content; the writer
 * (`uploadRosterFileToDrive`) always re-serializes as v2 on next save.
 */
function parseRosterFileBody(parsed: unknown): RosterFileContent {
  if (Array.isArray(parsed)) {
    const students = parsed
      .map(parseRawStudent)
      .filter((s): s is Student => s !== null);
    return { students, ...emptyRosterFileExtras() };
  }
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    const body = parsed as Record<string, unknown>;
    if (Array.isArray(body.students)) {
      const students = body.students
        .map(parseRawStudent)
        .filter((s): s is Student => s !== null);
      const groups = Array.isArray(body.groups)
        ? body.groups
            .map(parseRosterGroup)
            .filter((g): g is RosterGroup => g !== null)
        : [];
      const defaultOverridesByStudentId: Record<string, StudentOverride> = {};
      if (
        body.defaultOverridesByStudentId &&
        typeof body.defaultOverridesByStudentId === 'object'
      ) {
        for (const [studentId, rawOverride] of Object.entries(
          body.defaultOverridesByStudentId as Record<string, unknown>
        )) {
          const override = parseStudentOverride(rawOverride);
          if (override) defaultOverridesByStudentId[studentId] = override;
        }
      }
      return { students, groups, defaultOverridesByStudentId };
    }
  }
  throw new Error(
    'Drive roster file is not a valid students array or envelope'
  );
}

/**
 * Drops group memberships and standing overrides referencing student ids no
 * longer present in `students` (M17 A4). Runs on every write — covers both a
 * manual student delete and a ClassLink re-sync's stamped/appended ids
 * (dangling ids would otherwise silently shrink select-all targeting).
 */
function pruneRosterFileContent(content: RosterFileContent): RosterFileContent {
  const validIds = new Set(content.students.map((s) => s.id));
  const groups = content.groups.map((g) => ({
    ...g,
    studentIds: g.studentIds.filter((id) => validIds.has(id)),
  }));
  const defaultOverridesByStudentId: Record<string, StudentOverride> = {};
  for (const [studentId, override] of Object.entries(
    content.defaultOverridesByStudentId
  )) {
    if (validIds.has(studentId))
      defaultOverridesByStudentId[studentId] = override;
  }
  return { students: content.students, groups, defaultOverridesByStudentId };
}

/**
 * Bounded concurrency for the per-roster Drive fan-out in buildRosters.
 *
 * buildRosters fans one Drive download out per roster; an unbounded Promise.all
 * over a teacher with many ClassLink sections fires every request in the same
 * tick and trips Drive's per-user rate limit (429), cascading into roster load
 * failures. A small fixed pool (via mapWithConcurrency) keeps a steady, polite
 * request rate while still loading rosters in parallel.
 *
 * Exported for unit testing the bound; production code uses it only via
 * buildRosters.
 */
export const ROSTER_DRIVE_CONCURRENCY = 4;

/**
 * Drive folder path for per-roster student files.
 * Structure: SpartBoard/Data/Rosters/{rosterId}.json → Student[]
 */
const ROSTER_DRIVE_FOLDER = 'Data/Rosters';

/**
 * localStorage key prefix used to track whether the one-time PII migration
 * (moving students[] from Firestore docs into Drive files) has run.
 * Scoped per-user (appended with user.uid) so that multiple users sharing
 * the same browser profile each get their own migration flag.
 */
const MIGRATION_KEY_PREFIX = 'spart_roster_pii_migrated_v1';

// ─── Mock store (auth-bypass mode) ────────────────────────────────────────────

/**
 * Singleton pattern for mock roster storage in bypass mode.
 * Students are stored in memory alongside roster metadata.
 */
class MockRosterStore {
  private static instance: MockRosterStore;
  private rosters: ClassRoster[] = [];
  private listeners = new Set<(rosters: ClassRoster[]) => void>();

  private constructor() {
    // Singleton — use getInstance()
  }

  static getInstance(): MockRosterStore {
    if (!MockRosterStore.instance) {
      MockRosterStore.instance = new MockRosterStore();
    }
    return MockRosterStore.instance;
  }

  getRosters(): ClassRoster[] {
    return [...this.rosters].sort((a, b) => a.name.localeCompare(b.name));
  }

  addRoster(
    id: string,
    name: string,
    students: Student[],
    meta?: Partial<ClassRosterMeta>
  ): void {
    const withPins = assignPins(students);
    const newRoster: ClassRoster = {
      id,
      name,
      students: withPins,
      driveFileId: null,
      studentCount: withPins.length,
      createdAt: Date.now(),
      ...meta,
    };
    this.rosters.push(newRoster);
    this.notifyListeners();
  }

  updateRoster(id: string, updates: Partial<ClassRoster>): void {
    const index = this.rosters.findIndex((r) => r.id === id);
    if (index >= 0) {
      const updated = { ...this.rosters[index], ...updates };
      if (updates.students !== undefined) {
        updated.students = assignPins(updates.students);
        updated.studentCount = updated.students.length;
      }
      // Same three-field condition as the real updateRoster path, so bypass
      // mode doesn't diverge once defaultOverridesByStudentId gets a writer.
      if (
        updates.students !== undefined ||
        updates.groups !== undefined ||
        updates.defaultOverridesByStudentId !== undefined
      ) {
        const pruned = pruneRosterFileContent({
          students: updated.students,
          groups: updated.groups ?? [],
          defaultOverridesByStudentId:
            updated.defaultOverridesByStudentId ?? {},
        });
        updated.groups = pruned.groups;
        updated.defaultOverridesByStudentId =
          pruned.defaultOverridesByStudentId;
      }
      this.rosters[index] = updated;
      this.notifyListeners();
    }
  }

  setAbsent(id: string, studentIds: string[]): void {
    const index = this.rosters.findIndex((r) => r.id === id);
    if (index >= 0) {
      this.rosters[index] = {
        ...this.rosters[index],
        absent: { date: getLocalIsoDate(), studentIds },
      };
      this.notifyListeners();
    }
  }

  deleteRoster(id: string): void {
    const index = this.rosters.findIndex((r) => r.id === id);
    if (index >= 0) {
      this.rosters.splice(index, 1);
      this.notifyListeners();
    }
  }

  addListener(callback: (rosters: ClassRoster[]) => void): void {
    this.listeners.add(callback);
  }

  removeListener(callback: (rosters: ClassRoster[]) => void): void {
    this.listeners.delete(callback);
  }

  private notifyListeners(): void {
    const sorted = this.getRosters();
    this.listeners.forEach((callback) => callback(sorted));
  }

  reset(): void {
    this.rosters = [];
    this.listeners.clear();
  }
}

const mockRosterStore = MockRosterStore.getInstance();

// ─── Firestore validation ──────────────────────────────────────────────────────

/**
 * Validates and normalises a raw Firestore document into ClassRosterMeta.
 * Note: the `students` field is intentionally ignored — it lives in Drive.
 */
const validateRosterMeta = (
  id: string,
  data: unknown
): ClassRosterMeta | null => {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  if (typeof d.name !== 'string') return null;

  const meta: ClassRosterMeta = {
    id,
    name: d.name,
    driveFileId: typeof d.driveFileId === 'string' ? d.driveFileId : null,
    studentCount: typeof d.studentCount === 'number' ? d.studentCount : 0,
    createdAt: typeof d.createdAt === 'number' ? d.createdAt : Date.now(),
  };
  if (d.absent && typeof d.absent === 'object') {
    const a = d.absent as Record<string, unknown>;
    if (
      typeof a.date === 'string' &&
      Array.isArray(a.studentIds) &&
      a.studentIds.every((id) => typeof id === 'string')
    ) {
      meta.absent = {
        date: a.date,
        studentIds: a.studentIds,
      };
    }
  }
  if (d.origin === 'classlink' || d.origin === 'local') {
    meta.origin = d.origin;
  }
  if (typeof d.classlinkClassId === 'string') {
    meta.classlinkClassId = d.classlinkClassId;
  }
  if (typeof d.classlinkClassCode === 'string') {
    meta.classlinkClassCode = d.classlinkClassCode;
  }
  if (typeof d.classlinkSubject === 'string') {
    meta.classlinkSubject = d.classlinkSubject;
  }
  if (typeof d.classlinkOrgId === 'string') {
    meta.classlinkOrgId = d.classlinkOrgId;
  }
  if (typeof d.classlinkSyncedAt === 'number') {
    meta.classlinkSyncedAt = d.classlinkSyncedAt;
  }
  if (typeof d.testClassId === 'string') {
    meta.testClassId = d.testClassId;
  }
  // The Schoology section this roster is linked to (Item D). Mirrors the
  // canonical lti_course_links doc; must round-trip on read or the linking UI
  // (nudge / SidebarClasses / LinkSchoologyModal) treats a linked section as
  // unlinked forever.
  if (typeof d.ltiContextId === 'string') {
    meta.ltiContextId = d.ltiContextId;
  }
  return meta;
};

/**
 * Optional provenance metadata accepted by `addRoster`. Passed through to the
 * Firestore doc so assignment pickers can treat an imported roster as the
 * single source of truth. Carries the ClassLink fields for real ClassLink
 * imports and `testClassId` for admin test-class imports — both feed
 * `deriveTargetsFromRosterList` to populate session `classIds[]`.
 */
export type RosterCreateMeta = Pick<
  ClassRosterMeta,
  | 'origin'
  | 'classlinkClassId'
  | 'classlinkClassCode'
  | 'classlinkSubject'
  | 'classlinkOrgId'
  | 'classlinkSyncedAt'
  | 'testClassId'
>;

// ─── Hook ──────────────────────────────────────────────────────────────────────

export const useRosters = (user: User | null) => {
  // In-memory rosters include the students array loaded from Drive.
  const [rosters, setRosters] = useState<ClassRoster[]>([]);
  // Keep a ref in sync with the latest rosters so handlers can read the
  // current value without adding `rosters` to their dependency arrays.
  const rostersRef = useRef<ClassRoster[]>(rosters);
  rostersRef.current = rosters;
  const { driveService } = useGoogleDrive();
  const [activeRosterId, setActiveRosterIdState] = useState<string | null>(() =>
    localStorage.getItem('spart_active_roster_id')
  );

  // Cache of rosterId → roster file content already loaded from Drive (avoids re-fetching)
  const studentsCacheRef = useRef<Map<string, RosterFileContent>>(new Map());
  // Roster metadata from Firestore snapshot (no students)
  const metaListRef = useRef<ClassRosterMeta[]>([]);
  // Tracks the last-seen driveFileId per roster to detect changes for cache busting
  const prevDriveFileIdRef = useRef<Map<string, string | null>>(new Map());

  // ─── Helper: upload the roster file envelope to Drive and return the file ID ──
  // Always writes the v2 envelope, even when read in from a legacy v1 file
  // (A4). Known limitation: whole-file overwrite with no ETag/If-Match
  // precondition — two tabs (or a save racing a ClassLink re-sync) editing
  // the same roster is last-write-wins (see `useRosters.ts` A4 note).

  const uploadRosterFileToDrive = useCallback(
    async (
      rosterId: string,
      content: RosterFileContent,
      existingFileId?: string | null
    ): Promise<string> => {
      if (!driveService) throw new Error('Drive not available');
      const pruned = pruneRosterFileContent(content);
      const body = { version: 2 as const, ...pruned };
      const blob = new Blob([JSON.stringify(body)], {
        type: 'application/json',
      });
      // Update in-place when we already have a Drive file to avoid orphaned files
      if (existingFileId) {
        await driveService.updateFileContent(existingFileId, blob);
        return existingFileId;
      }
      const file = await driveService.uploadFile(
        blob,
        `${rosterId}.json`,
        ROSTER_DRIVE_FOLDER
      );
      return file.id;
    },
    [driveService]
  );

  // ─── Helper: load the roster file envelope from Drive by file ID ──────────

  const loadRosterFileFromDrive = useCallback(
    async (driveFileId: string): Promise<RosterFileContent> => {
      if (!driveService) {
        throw new Error('Drive service not available');
      }
      // Throw on failure so the caller can distinguish "genuinely empty
      // roster" from "load failed — retry later". Silently returning [] here
      // poisons the per-roster cache (see buildRosters) and blocks retries
      // after a token refresh.
      const blob = await driveService.downloadFile(driveFileId);
      const text = await blob.text();
      const parsed = JSON.parse(text) as unknown;
      let content: RosterFileContent;
      try {
        content = parseRosterFileBody(parsed);
      } catch {
        // A non-array/non-envelope payload means the Drive file is corrupt or
        // has been replaced with something unexpected. Treat it as a failure
        // rather than a zero-student roster so buildRosters' catch path
        // skips the cache write and retries on the next snapshot.
        throw new Error(
          `Drive roster file ${driveFileId} is not an array of students`
        );
      }
      return { ...content, students: assignPins(content.students) };
    },
    [driveService]
  );

  // ─── Helper: merge metadata + Drive students into full ClassRoster[] ───────

  const buildRosters = useCallback(
    async (metaList: ClassRosterMeta[]): Promise<ClassRoster[]> => {
      // Bounded fan-out: cap concurrent Drive downloads so a teacher with many
      // sections doesn't burst-fire every request in one tick and trip Drive's
      // 429 rate limit. Ordering matches `metaList` exactly (see
      // mapWithConcurrency), so downstream callers see no behavior change.
      return mapWithConcurrency(
        metaList,
        ROSTER_DRIVE_CONCURRENCY,
        async (meta) => {
          let content: RosterFileContent = {
            students: [],
            ...emptyRosterFileExtras(),
          };
          let loadError: string | undefined;
          if (meta.driveFileId) {
            const cached = studentsCacheRef.current.get(meta.id);
            if (cached) {
              content = cached;
            } else if (driveService) {
              try {
                content = await loadRosterFileFromDrive(meta.driveFileId);
                // Only cache on successful load. Legitimate empty rosters
                // still get cached via this success path; transient failures
                // (stale token, network blip) fall through to the catch below
                // so the next snapshot / token refresh can retry.
                studentsCacheRef.current.set(meta.id, content);
              } catch (err) {
                console.error(
                  `Failed to load students for roster ${meta.id}:`,
                  err
                );
                // Do NOT cache the failure. Next snapshot / token refresh /
                // re-subscription will retry automatically. Surface the
                // failure on the roster so the UI can distinguish "0
                // students" from "students unavailable — check Drive".
                loadError =
                  err instanceof Error
                    ? err.message
                    : 'Failed to load roster from Drive';
              }
            } else {
              // Drive service unavailable (not yet signed in / token loading).
              // Flag the failure so the UI doesn't show a misleading empty
              // roster; next snapshot once driveService is ready will retry.
              loadError = 'Google Drive not available — sign in to load roster';
            }
          }
          const roster: ClassRoster = {
            ...meta,
            students: content.students,
            groups: content.groups,
            defaultOverridesByStudentId: content.defaultOverridesByStudentId,
          };
          if (loadError) roster.loadError = loadError;
          return roster;
        }
      );
    },
    [loadRosterFileFromDrive, driveService]
  );

  // ─── One-time migration: move students[] from Firestore docs to Drive ──────

  const runMigrationIfNeeded = useCallback(
    async (
      metaList: ClassRosterMeta[],
      rawSnapDocs: { id: string; data: () => unknown }[]
    ) => {
      if (!driveService || !user) return;
      const migrationKey = `${MIGRATION_KEY_PREFIX}_${user.uid}`;
      if (localStorage.getItem(migrationKey)) return;

      let didMigrate = false;
      let hasFailures = false;

      for (const docSnap of rawSnapDocs) {
        const raw = docSnap.data() as Record<string, unknown>;

        // Only migrate docs that still have a students[] array in Firestore
        if (!Array.isArray(raw.students) || raw.students.length === 0) continue;

        const rawStudents = raw.students as unknown[];
        const students: Student[] = rawStudents
          .map(parseRawStudent)
          .filter((s): s is Student => s !== null);

        const withPins = assignPins(students);

        try {
          const driveFileId = await uploadRosterFileToDrive(docSnap.id, {
            students: withPins,
            ...emptyRosterFileExtras(),
          });
          await updateDoc(doc(db, 'users', user.uid, 'rosters', docSnap.id), {
            driveFileId,
            studentCount: withPins.length,
            students: deleteField(), // Remove PII from Firestore
          });
          studentsCacheRef.current.set(docSnap.id, {
            students: withPins,
            ...emptyRosterFileExtras(),
          });
          // Update local meta
          const idx = metaListRef.current.findIndex((m) => m.id === docSnap.id);
          if (idx >= 0) {
            metaListRef.current[idx] = {
              ...metaListRef.current[idx],
              driveFileId,
              studentCount: withPins.length,
            };
          }
          // Phase 3 — mirrors addRoster/updateRoster's pin_index sync, which this migration path was missing.
          const rosterName =
            typeof raw.name === 'string'
              ? raw.name
              : (metaListRef.current[idx]?.name ?? '');
          if (rosterName) {
            void syncRosterPinIndex(docSnap.id, rosterName, withPins);
          } else {
            // syncRosterPinIndex keys pin_index entries by roster name; without one there is nothing to bridge PIN login against.
            console.warn(
              `[PII Migration] Roster ${docSnap.id} has no name — skipped pin_index sync; re-save the roster to bridge PIN login`
            );
          }
          didMigrate = true;
          console.warn(
            `[PII Migration] Moved students for roster ${docSnap.id} to Drive`
          );
        } catch (err) {
          console.error(
            `[PII Migration] Failed for roster ${docSnap.id}:`,
            err
          );
          hasFailures = true;
        }
      }

      if (
        !hasFailures &&
        (didMigrate ||
          rawSnapDocs.every((d) => {
            const raw = d.data() as Record<string, unknown>;
            return !Array.isArray(raw.students) || raw.students.length === 0;
          }))
      ) {
        localStorage.setItem(migrationKey, '1');
      }
    },
    [driveService, user, uploadRosterFileToDrive]
  );

  // ─── Firestore snapshot listener ──────────────────────────────────────────

  useEffect(() => {
    if (!user) {
      const timer = setTimeout(() => setRosters([]), 0);
      return () => clearTimeout(timer);
    }

    if (isAuthBypass) {
      const callback = (updatedRosters: ClassRoster[]) =>
        setRosters(updatedRosters);
      mockRosterStore.addListener(callback);
      callback(mockRosterStore.getRosters());
      return () => mockRosterStore.removeListener(callback);
    }

    const rostersRef = collection(db, 'users', user.uid, 'rosters');
    const q = query(rostersRef, orderBy('name'));

    let innerUnsubscribe: (() => void) | null = null;

    let currentSnapshotId = 0;

    const handleSnapshot = (rawDocs: { id: string; data: () => unknown }[]) => {
      const snapshotId = ++currentSnapshotId;
      const metaList = rawDocs
        .map((d) => validateRosterMeta(d.id, d.data()))
        .filter((m): m is ClassRosterMeta => m !== null);

      metaListRef.current = metaList;

      // Invalidate cache for any roster whose driveFileId changed (including
      // null→id, id→null, or id→different-id scenarios)
      for (const meta of metaList) {
        const cached = studentsCacheRef.current.get(meta.id);
        const prevFileId = prevDriveFileIdRef.current.get(meta.id) ?? null;
        if (cached && meta.driveFileId !== prevFileId) {
          studentsCacheRef.current.delete(meta.id);
        }
        prevDriveFileIdRef.current.set(meta.id, meta.driveFileId);
      }

      // Run migration first, then build rosters. Sequencing avoids a race
      // where buildRosters reads stale Firestore metadata before migration has
      // written the driveFileIds back to each roster document.
      const runAsync = async () => {
        try {
          await runMigrationIfNeeded(metaList, rawDocs);
          const full = await buildRosters(metaList);
          // Only update state if this is still the most recent snapshot processing pass
          if (snapshotId === currentSnapshotId) {
            setRosters(full);
          }
        } catch (err) {
          console.error('Roster sync error:', err);
        }
      };
      void runAsync();
    };

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => handleSnapshot(snapshot.docs),
      (error) => {
        console.error('Roster subscription error:', error);
        if (error.code === 'failed-precondition') {
          innerUnsubscribe = onSnapshot(rostersRef, (innerSnapshot) =>
            handleSnapshot(innerSnapshot.docs)
          );
        }
      }
    );

    return () => {
      unsubscribe();
      if (innerUnsubscribe) innerUnsubscribe();
    };
  }, [user, buildRosters, runMigrationIfNeeded]);

  // ─── CRUD actions ─────────────────────────────────────────────────────────

  const addRoster = useCallback(
    async (name: string, students: Student[] = [], meta?: RosterCreateMeta) => {
      if (!user) throw new Error('No user');

      if (isAuthBypass) {
        const id = 'mock-roster-id-' + Date.now();
        mockRosterStore.addRoster(id, name, students, meta);
        return id;
      }

      const withPins = assignPins(students);

      // Write metadata-only to Firestore first to get the document ID.
      // ClassLink metadata (origin, classlinkClassId, etc.) is spread in here
      // so the roster doc itself carries its provenance; individual students
      // continue to track their own classLinkSourcedId separately.
      const firestoreData: Omit<ClassRosterMeta, 'id'> = {
        name,
        driveFileId: null,
        studentCount: withPins.length,
        createdAt: Date.now(),
        ...meta,
      };
      const ref = await addDoc(
        collection(db, 'users', user.uid, 'rosters'),
        firestoreData
      );

      // Upload students to Drive (if Drive is available)
      if (driveService && withPins.length > 0) {
        try {
          const driveFileId = await uploadRosterFileToDrive(ref.id, {
            students: withPins,
            ...emptyRosterFileExtras(),
          });
          await updateDoc(doc(db, 'users', user.uid, 'rosters', ref.id), {
            driveFileId,
          });
          studentsCacheRef.current.set(ref.id, {
            students: withPins,
            ...emptyRosterFileExtras(),
          });
        } catch (err) {
          console.error('Failed to upload roster students to Drive:', err);
          // Roster is still usable — Drive sync will retry next time
        }
      } else if (withPins.length > 0) {
        studentsCacheRef.current.set(ref.id, {
          students: withPins,
          ...emptyRosterFileExtras(),
        });
      }

      // Phase 3 — bridge PIN students into the SSO uid space by writing
      // the per-roster pin_index sidecar. Best-effort: a failure logs
      // and continues; the roster is already saved.
      void syncRosterPinIndex(ref.id, name, withPins);

      return ref.id;
    },
    [user, driveService, uploadRosterFileToDrive]
  );

  const updateRoster = useCallback(
    async (id: string, updates: Partial<ClassRoster>) => {
      if (!user) return;

      if (isAuthBypass) {
        mockRosterStore.updateRoster(id, updates);
        return;
      }

      // Separate roster-file-body fields (students, groups, defaults — Drive
      // only, M17 A4) from Firestore roster metadata.
      const { students, groups, defaultOverridesByStudentId, ...metaUpdates } =
        updates;

      if (
        students !== undefined ||
        groups !== undefined ||
        defaultOverridesByStudentId !== undefined
      ) {
        const existingMeta = metaListRef.current.find((m) => m.id === id);
        let cachedContent = studentsCacheRef.current.get(id);

        // A cold cache means "file contents unknown", not "empty". Carrying the
        // empty defaults forward would upload a whole-file overwrite that
        // deletes whichever fields the caller didn't pass (students on a
        // groups-only write, groups/overrides on a students-only write), so
        // hydrate from Drive first and abort if that fails.
        if (cachedContent === undefined) {
          if (!existingMeta?.driveFileId) {
            // No Drive file yet ⇒ nothing has ever been uploaded, so empty is
            // genuinely correct rather than unknown.
            cachedContent = { students: [], ...emptyRosterFileExtras() };
          } else if (!driveService) {
            throw new Error(
              `Cannot update roster ${id}: Drive is unavailable and its saved contents are not loaded`
            );
          } else {
            cachedContent = await loadRosterFileFromDrive(
              existingMeta.driveFileId
            );
            studentsCacheRef.current.set(id, cachedContent);
          }
        }

        const previousContent = cachedContent ?? {
          students: [],
          ...emptyRosterFileExtras(),
        };
        const withPins =
          students !== undefined
            ? assignPins(students)
            : previousContent.students;
        const nextContent = pruneRosterFileContent({
          students: withPins,
          groups: groups ?? previousContent.groups,
          defaultOverridesByStudentId:
            defaultOverridesByStudentId ??
            previousContent.defaultOverridesByStudentId,
        });

        // Optimistically update cache
        studentsCacheRef.current.set(id, nextContent);

        // Reflect in local state immediately
        setRosters((prev) =>
          prev.map((r) =>
            r.id === id
              ? {
                  ...r,
                  students: nextContent.students,
                  studentCount: nextContent.students.length,
                  groups: nextContent.groups,
                  defaultOverridesByStudentId:
                    nextContent.defaultOverridesByStudentId,
                }
              : r
          )
        );

        // Upload to Drive (update in-place when a file already exists)
        if (driveService) {
          try {
            const driveFileId = await uploadRosterFileToDrive(
              id,
              nextContent,
              existingMeta?.driveFileId
            );
            await updateDoc(doc(db, 'users', user.uid, 'rosters', id), {
              ...metaUpdates,
              driveFileId,
              studentCount: nextContent.students.length,
            });
            // Phase 3 — refresh the pin_index sidecar after a successful
            // Drive write. Uses the post-update name when the caller
            // renamed the roster, otherwise the existing meta's name.
            const rosterName =
              typeof metaUpdates.name === 'string' && metaUpdates.name
                ? metaUpdates.name
                : (existingMeta?.name ?? '');
            if (rosterName) {
              void syncRosterPinIndex(id, rosterName, nextContent.students);
            }
          } catch (err) {
            console.error('Failed to upload updated roster to Drive:', err);
            // Revert optimistic updates
            studentsCacheRef.current.set(id, previousContent);
            setRosters((prev) =>
              prev.map((r) =>
                r.id === id
                  ? {
                      ...r,
                      students: previousContent.students,
                      studentCount: previousContent.students.length,
                      groups: previousContent.groups,
                      defaultOverridesByStudentId:
                        previousContent.defaultOverridesByStudentId,
                    }
                  : r
              )
            );
            throw new Error('Failed to save roster changes to Drive');
          }
        } else {
          // Drive unavailable — update count in Firestore at least
          await updateDoc(doc(db, 'users', user.uid, 'rosters', id), {
            ...metaUpdates,
            studentCount: nextContent.students.length,
          });
        }
      } else if (Object.keys(metaUpdates).length > 0) {
        // No student/group/override changes — just update metadata fields
        await updateDoc(doc(db, 'users', user.uid, 'rosters', id), metaUpdates);
      }
    },
    [user, driveService, uploadRosterFileToDrive, loadRosterFileFromDrive]
  );

  const setAbsentStudents = useCallback(
    async (rosterId: string, studentIds: string[]) => {
      if (!user) return;

      const payload = { date: getLocalIsoDate(), studentIds };

      if (isAuthBypass) {
        mockRosterStore.setAbsent(rosterId, studentIds);
        return;
      }

      // Read the current absent payload off a ref that's kept in sync with
      // state in the render body. This avoids the stale-closure problem of
      // reading `rosters` (which would require adding `rosters` to the
      // useCallback deps and re-allocating on every roster change) without
      // relying on side effects inside a functional state updater.
      const previousAbsent = rostersRef.current.find(
        (r) => r.id === rosterId
      )?.absent;

      // Optimistically update local state so the modal reflects the change
      // immediately, before the Firestore snapshot round-trips.
      setRosters((prev) =>
        prev.map((r) => (r.id === rosterId ? { ...r, absent: payload } : r))
      );

      try {
        await updateDoc(doc(db, 'users', user.uid, 'rosters', rosterId), {
          absent: payload,
        });
      } catch (err) {
        console.error('Failed to persist absent list:', err);
        setRosters((prev) =>
          prev.map((r) =>
            r.id === rosterId ? { ...r, absent: previousAbsent } : r
          )
        );
        throw err;
      }
    },
    [user]
  );

  const setActiveRoster = useCallback((id: string | null) => {
    setActiveRosterIdState(id);
    if (id) localStorage.setItem('spart_active_roster_id', id);
    else localStorage.removeItem('spart_active_roster_id');
  }, []);

  const deleteRoster = useCallback(
    async (id: string) => {
      if (!user) return;

      if (isAuthBypass) {
        mockRosterStore.deleteRoster(id);
        if (activeRosterId === id) setActiveRoster(null);
        return;
      }

      // Delete Drive file if we know its ID
      const meta = metaListRef.current.find((m) => m.id === id);
      if (meta?.driveFileId && driveService) {
        driveService.deleteFile(meta.driveFileId).catch((err) => {
          console.error('Failed to delete Drive roster file:', err);
        });
      }

      await deleteDoc(doc(db, 'users', user.uid, 'rosters', id));
      studentsCacheRef.current.delete(id);
      if (activeRosterId === id) setActiveRoster(null);
    },
    [user, activeRosterId, setActiveRoster, driveService]
  );

  return useMemo(
    () => ({
      rosters,
      activeRosterId,
      addRoster,
      updateRoster,
      deleteRoster,
      setActiveRoster,
      setAbsentStudents,
    }),
    [
      rosters,
      activeRosterId,
      addRoster,
      updateRoster,
      deleteRoster,
      setActiveRoster,
      setAbsentStudents,
    ]
  );
};
