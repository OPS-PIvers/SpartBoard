import { useEffect, useMemo, useState } from 'react';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import { useAuth } from '@/context/useAuth';
import { logError } from '@/utils/logError';
import {
  DEFAULT_GRADEBOOK_SETTINGS,
  GRADEBOOK_COLLECTIONS,
  PLC_GRADEBOOK_META_ID,
  type GradebookClassStateDoc,
  type GradebookColumnConfig,
  type GradebookKind,
  type GradebookMark,
  type GradebookSettingsBody,
} from '@/utils/gradebook/gradebookCore';
import type { FinalScoreOverlay } from '@/utils/gradebook/finalScoreOverlay';

export interface FinalScoreOverlayTarget {
  kind: GradebookKind;
  sessionId: string | null | undefined;
  /** The session's owner; the overlay only loads for the owner's own sessions. */
  teacherUid: string | null | undefined;
  dueAt?: number | null;
  closeAt?: number | null;
}

type SettingsPick = Pick<GradebookSettingsBody, 'flags' | 'autoFlags'>;

const DEFAULT_PICK: SettingsPick = {
  flags: DEFAULT_GRADEBOOK_SETTINGS.flags,
  autoFlags: DEFAULT_GRADEBOOK_SETTINGS.autoFlags,
};

/** First roster (sorted) with a saved configuration decides the flag set; otherwise the built-in defaults. */
export async function resolveSettingsForRosters(
  uid: string,
  rosterIds: readonly string[]
): Promise<SettingsPick> {
  for (const rosterId of [...new Set(rosterIds)].sort()) {
    const classSnap = await getDoc(
      doc(db, 'users', uid, GRADEBOOK_COLLECTIONS.userClasses, rosterId)
    );
    const ref = classSnap.exists()
      ? (classSnap.data() as GradebookClassStateDoc).configRef
      : null;
    if (!ref) continue;
    const settingsRef =
      ref.source === 'personal'
        ? doc(
            db,
            'users',
            uid,
            GRADEBOOK_COLLECTIONS.userSettings,
            ref.configId
          )
        : ref.source === 'district'
          ? doc(db, GRADEBOOK_COLLECTIONS.districtConfigs, ref.configId)
          : doc(db, 'plcs', ref.plcId, 'meta', PLC_GRADEBOOK_META_ID);
    const settingsSnap = await getDoc(settingsRef);
    if (!settingsSnap.exists()) continue;
    const body = settingsSnap.data() as Partial<GradebookSettingsBody>;
    return {
      flags: Array.isArray(body.flags) ? body.flags : DEFAULT_PICK.flags,
      autoFlags:
        typeof body.autoFlags === 'boolean'
          ? body.autoFlags
          : DEFAULT_PICK.autoFlags,
    };
  }
  return DEFAULT_PICK;
}

function marksQuery(uid: string, sessionId: string) {
  return query(
    collection(db, GRADEBOOK_COLLECTIONS.marks),
    where('ownerUid', '==', uid),
    where('sessionId', '==', sessionId)
  );
}

function rosterIdsOf(marks: ReadonlyMap<string, GradebookMark>): string[] {
  const ids = new Set<string>();
  for (const m of marks.values()) for (const r of m.rosterIds ?? []) ids.add(r);
  return [...ids].sort();
}

/** One-shot read for push paths that run outside a Results view. Null unless the gradebook flag is on and the caller owns the session. */
export async function loadFinalScoreOverlay(
  target: FinalScoreOverlayTarget & { uid: string | null | undefined },
  gradebookOn: boolean
): Promise<FinalScoreOverlay | null> {
  const { uid, sessionId, teacherUid, kind } = target;
  if (!gradebookOn || !uid || !sessionId || teacherUid !== uid) return null;
  try {
    const [marksSnap, columnSnap] = await Promise.all([
      getDocs(marksQuery(uid, sessionId)),
      getDoc(doc(db, GRADEBOOK_COLLECTIONS.columns, sessionId)),
    ]);
    const marks = new Map<string, GradebookMark>();
    marksSnap.forEach((d) => {
      const m = d.data() as GradebookMark;
      marks.set(m.studentUid, m);
    });
    const settings = await resolveSettingsForRosters(uid, rosterIdsOf(marks));
    return {
      kind,
      sessionId,
      ownerUid: uid,
      marks,
      column: columnSnap.exists()
        ? (columnSnap.data() as GradebookColumnConfig)
        : null,
      flagDefs: settings.flags,
      autoFlags: settings.autoFlags,
      dueAt: target.dueAt ?? null,
      closeAt: target.closeAt ?? null,
    };
  } catch (err) {
    logError('loadFinalScoreOverlay', err, { sessionId, kind });
    return null;
  }
}

/** D9 overlay for a Results view; null with no listeners unless the flag is on and the teacher owns the session. */
export function useFinalScoreOverlay(
  target: FinalScoreOverlayTarget
): FinalScoreOverlay | null {
  const { user, canAccessFeature } = useAuth();
  const uid = user?.uid ?? null;
  const { kind, sessionId, teacherUid } = target;
  const active =
    canAccessFeature('gradebook') && !!uid && !!sessionId && teacherUid === uid;
  const key = active ? `${uid}|${sessionId}` : null;

  const [marksState, setMarksState] = useState<{
    key: string;
    marks: Map<string, GradebookMark>;
  } | null>(null);
  const [columnState, setColumnState] = useState<{
    key: string;
    column: GradebookColumnConfig | null;
  } | null>(null);
  const [settingsState, setSettingsState] = useState<{
    key: string;
    settings: SettingsPick;
  } | null>(null);

  useEffect(() => {
    if (!key || !uid || !sessionId) return;
    const unsubMarks = onSnapshot(
      marksQuery(uid, sessionId),
      (snap) => {
        const marks = new Map<string, GradebookMark>();
        snap.forEach((d) => {
          const m = d.data() as GradebookMark;
          marks.set(m.studentUid, m);
        });
        setMarksState({ key, marks });
      },
      (err) => logError('useFinalScoreOverlay.marks', err, { sessionId })
    );
    const unsubColumn = onSnapshot(
      doc(db, GRADEBOOK_COLLECTIONS.columns, sessionId),
      (snap) =>
        setColumnState({
          key,
          column: snap.exists() ? (snap.data() as GradebookColumnConfig) : null,
        }),
      (err) => logError('useFinalScoreOverlay.column', err, { sessionId })
    );
    return () => {
      unsubMarks();
      unsubColumn();
    };
  }, [key, uid, sessionId]);

  const marks = marksState?.key === key ? marksState.marks : null;
  const rosterKey = marks ? rosterIdsOf(marks).join(',') : '';
  const settingsKey = key ? `${key}|${rosterKey}` : null;

  useEffect(() => {
    if (!settingsKey || !uid) return;
    let cancelled = false;
    resolveSettingsForRosters(uid, rosterKey ? rosterKey.split(',') : [])
      .then((settings) => {
        if (!cancelled) setSettingsState({ key: settingsKey, settings });
      })
      .catch((err: unknown) => {
        logError('useFinalScoreOverlay.settings', err, { sessionId });
        if (!cancelled)
          setSettingsState({ key: settingsKey, settings: DEFAULT_PICK });
      });
    return () => {
      cancelled = true;
    };
  }, [settingsKey, uid, rosterKey, sessionId]);

  const column = columnState?.key === key ? columnState.column : null;
  const settings =
    settingsState?.key === settingsKey ? settingsState.settings : DEFAULT_PICK;
  const dueAt = target.dueAt ?? null;
  const closeAt = target.closeAt ?? null;

  return useMemo(() => {
    if (!key || !uid || !sessionId || !marks) return null;
    return {
      kind,
      sessionId,
      ownerUid: uid,
      marks,
      column,
      flagDefs: settings.flags,
      autoFlags: settings.autoFlags,
      dueAt,
      closeAt,
    };
  }, [key, uid, sessionId, marks, column, settings, kind, dueAt, closeAt]);
}
