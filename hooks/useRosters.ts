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
import { User } from 'firebase/auth';
import { ClassRoster, ClassRosterMeta, Student } from '../types';
import { db, isAuthBypass } from '../config/firebase';
import { useGoogleDrive } from './useGoogleDrive';
import { getLocalIsoDate } from '../utils/localDate';

/**
 * Assigns zero-padded sequential PINs to students that don't have one yet.
 * Returns a new array — does not mutate the input.
 */
function assignPins(students: Student[]): Student[] {
  return students.map((s, i) => ({
    ...s,
    pin: s.pin || String(i + 1).padStart(2, '0'),
  }));
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
  return meta;
};

/**
 * Optional ClassLink metadata accepted by `addRoster`. Passed through to the
 * Firestore doc so assignment pickers can treat a ClassLink-imported roster as
 * the single source of truth (no more "is it ClassLink or local?" branching).
 */
export type RosterCreateMeta = Pick<
  ClassRosterMeta,
  | 'origin'
  | 'classlinkClassId'
  | 'classlinkClassCode'
  | 'classlinkSubject'
  | 'classlinkOrgId'
  | 'classlinkSyncedAt'
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

  // Cache of rosterId → Student[] already loaded from Drive (avoids re-fetching)
  const studentsCacheRef = useRef<Map<string, Student[]>>(new Map());
  // Roster metadata from Firestore snapshot (no students)
  const metaListRef = useRef<ClassRosterMeta[]>([]);
  // Tracks the last-seen driveFileId per roster to detect changes for cache busting
  const prevDriveFileIdRef = useRef<Map<string, string | null>>(new Map());

  // ─── Helper: upload Student[] to Drive and return the file ID ─────────────

  const uploadStudentsToDrive = useCallback(
    async (
      rosterId: string,
      students: Student[],
      existingFileId?: string | null
    ): Promise<string> => {
      if (!driveService) throw new Error('Drive not available');
      const blob = new Blob([JSON.stringify(students)], {
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

  // ─── Helper: load Student[] from Drive by file ID ─────────────────────────

  const loadStudentsFromDrive = useCallback(
    async (driveFileId: string): Promise<Student[]> => {
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
      // A non-array payload means the Drive file is corrupt or has been
      // replaced with something unexpected. Treat it as a failure rather
      // than a zero-student roster so buildRosters' catch path skips the
      // cache write and retries on the next snapshot.
      if (!Array.isArray(parsed)) {
        throw new Error(
          `Drive roster file ${driveFileId} is not an array of students`
        );
      }
      const students = (parsed as unknown[])
        .map(parseRawStudent)
        .filter((s): s is Student => s !== null);
      return assignPins(students);
    },
    [driveService]
  );

  // ─── Helper: merge metadata + Drive students into full ClassRoster[] ───────

  const buildRosters = useCallback(
    async (metaList: ClassRosterMeta[]): Promise<ClassRoster[]> => {
      return Promise.all(
        metaList.map(async (meta) => {
          let students: Student[] = [];
          let loadError: string | undefined;
          if (meta.driveFileId) {
            const cached = studentsCacheRef.current.get(meta.id);
            if (cached) {
              students = cached;
            } else if (driveService) {
              try {
                students = await loadStudentsFromDrive(meta.driveFileId);
                // Only cache on successful load. Legitimate empty rosters
                // still get cached via this success path; transient failures
                // (stale token, network blip) fall through to the catch below
                // so the next snapshot / token refresh can retry.
                studentsCacheRef.current.set(meta.id, students);
              } catch (err) {
                console.error(
                  `Failed to load students for roster ${meta.id}:`,
                  err
                );
                // Do NOT cache the failure. Next snapshot / token refresh /
                // re-subscription will retry automatically. Surface the
                // failure on the roster so the UI can distinguish "0
                // students" from "students unavailable — check Drive".
                students = [];
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
          const roster: ClassRoster = { ...meta, students };
          if (loadError) roster.loadError = loadError;
          return roster;
        })
      );
    },
    [loadStudentsFromDrive, driveService]
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
          const driveFileId = await uploadStudentsToDrive(docSnap.id, withPins);
          await updateDoc(doc(db, 'users', user.uid, 'rosters', docSnap.id), {
            driveFileId,
            studentCount: withPins.length,
            students: deleteField(), // Remove PII from Firestore
          });
          studentsCacheRef.current.set(docSnap.id, withPins);
          // Update local meta
          const idx = metaListRef.current.findIndex((m) => m.id === docSnap.id);
          if (idx >= 0) {
            metaListRef.current[idx] = {
              ...metaListRef.current[idx],
              driveFileId,
              studentCount: withPins.length,
            };
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
    [driveService, user, uploadStudentsToDrive]
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
          const driveFileId = await uploadStudentsToDrive(ref.id, withPins);
          await updateDoc(doc(db, 'users', user.uid, 'rosters', ref.id), {
            driveFileId,
          });
          studentsCacheRef.current.set(ref.id, withPins);
        } catch (err) {
          console.error('Failed to upload roster students to Drive:', err);
          // Roster is still usable — Drive sync will retry next time
        }
      } else if (withPins.length > 0) {
        studentsCacheRef.current.set(ref.id, withPins);
      }

      return ref.id;
    },
    [user, driveService, uploadStudentsToDrive]
  );

  const updateRoster = useCallback(
    async (id: string, updates: Partial<ClassRoster>) => {
      if (!user) return;

      if (isAuthBypass) {
        mockRosterStore.updateRoster(id, updates);
        return;
      }

      // Separate student data from metadata
      const { students, ...metaUpdates } = updates;

      if (students !== undefined) {
        const withPins = assignPins(students);

        // Capture previous students for rollback
        const previousStudents = studentsCacheRef.current.get(id) ?? [];
        const previousCount = previousStudents.length;

        // Optimistically update cache
        studentsCacheRef.current.set(id, withPins);

        // Reflect in local state immediately
        setRosters((prev) =>
          prev.map((r) =>
            r.id === id
              ? { ...r, students: withPins, studentCount: withPins.length }
              : r
          )
        );

        // Upload to Drive (update in-place when a file already exists)
        if (driveService) {
          try {
            const existingMeta = metaListRef.current.find((m) => m.id === id);
            const driveFileId = await uploadStudentsToDrive(
              id,
              withPins,
              existingMeta?.driveFileId
            );
            await updateDoc(doc(db, 'users', user.uid, 'rosters', id), {
              ...metaUpdates,
              driveFileId,
              studentCount: withPins.length,
            });
          } catch (err) {
            console.error('Failed to upload updated roster to Drive:', err);
            // Revert optimistic updates
            studentsCacheRef.current.set(id, previousStudents);
            setRosters((prev) =>
              prev.map((r) =>
                r.id === id
                  ? {
                      ...r,
                      students: previousStudents,
                      studentCount: previousCount,
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
            studentCount: withPins.length,
          });
        }
      } else if (Object.keys(metaUpdates).length > 0) {
        // No student changes — just update metadata fields
        await updateDoc(doc(db, 'users', user.uid, 'rosters', id), metaUpdates);
      }
    },
    [user, driveService, uploadStudentsToDrive]
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
