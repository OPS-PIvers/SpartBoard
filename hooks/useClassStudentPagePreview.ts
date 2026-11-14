import { useEffect, useState } from 'react';
import {
  collection,
  getDocs,
  query,
  where,
  type DocumentData,
} from 'firebase/firestore';
import { db, isAuthBypass } from '@/config/firebase';
import {
  KIND_CONFIG,
  SESSION_KINDS,
  buildAssignmentSummary,
  channelForHydratedData,
  isViewOnlySession,
  type AssignmentSummary,
  type KindConfig,
  type SessionKind,
} from '@/hooks/useStudentAssignments';

export type ClassPreviewStatus = 'loading' | 'ready' | 'error';

const statusAllowed = (
  filter: KindConfig['activeFilter'],
  status: unknown
): boolean => {
  if (filter === null) return false;
  if (typeof status !== 'string') return false;
  return 'valueIn' in filter
    ? filter.valueIn.includes(status)
    : status === filter.value;
};

/** True when the student page's own queries would return this session doc. */
export function studentPageListsSession(
  kind: SessionKind,
  data: DocumentData
): boolean {
  const config = KIND_CONFIG[kind];
  if (isViewOnlySession(kind, data)) return false;
  if (config.activeFilter === null) return true;
  const status = (data as Record<string, unknown>).status;
  return (
    statusAllowed(config.activeFilter, status) ||
    statusAllowed(config.endedFilter, status)
  );
}

/** Builds the class's rows from the teacher's own session docs, the way a student in that class with no work yet sees them. */
export function classPreviewAssignments(
  docs: ReadonlyArray<{ kind: SessionKind; id: string; data: DocumentData }>,
  classId: string
): AssignmentSummary[] {
  const classIds = new Set([classId]);
  const byKey = new Map<string, AssignmentSummary>();
  const endedByKind = new Map<SessionKind, AssignmentSummary[]>();
  for (const { kind, id, data } of docs) {
    if (!studentPageListsSession(kind, data)) continue;
    const config = KIND_CONFIG[kind];
    const row = buildAssignmentSummary(
      kind,
      channelForHydratedData(config, data),
      config,
      id,
      data,
      classIds
    );
    if (row.individualTargeting || !row.classIds.includes(classId)) continue;
    if (row.channel === 'ended') {
      // The student page orders ended reads by endedAt, which drops docs without it.
      if (KIND_CONFIG[kind].endedOrderBy && row.endedAt === undefined) continue;
      const list = endedByKind.get(kind) ?? [];
      list.push(row);
      endedByKind.set(kind, list);
      continue;
    }
    byKey.set(row.compositeId, row);
  }
  // The student page reads only the most recent ended sessions per kind.
  for (const [kind, rows] of endedByKind) {
    rows
      .sort((a, b) => (b.endedAt ?? 0) - (a.endedAt ?? 0))
      .slice(0, KIND_CONFIG[kind].endedLimit)
      .forEach((row) => byKey.set(row.compositeId, row));
  }
  return Array.from(byKey.values()).sort((a, b) => {
    const at = a.endedAt ?? a.createdAt ?? 0;
    const bt = b.endedAt ?? b.createdAt ?? 0;
    if (at !== bt) return bt - at;
    return a.title.localeCompare(b.title);
  });
}

async function readKind(
  kind: SessionKind,
  teacherUid: string,
  classId: string
): Promise<{ kind: SessionKind; id: string; data: DocumentData }[]> {
  const config = KIND_CONFIG[kind];
  const col = collection(db, config.collectionName);
  const shapes = [
    query(
      col,
      where('teacherUid', '==', teacherUid),
      where('classIds', 'array-contains', classId)
    ),
  ];
  if (config.dualQuery) {
    shapes.push(
      query(
        col,
        where('teacherUid', '==', teacherUid),
        where('classId', '==', classId)
      )
    );
  }
  const snaps = await Promise.all(shapes.map((q) => getDocs(q)));
  const seen = new Map<string, DocumentData>();
  for (const snap of snaps) {
    for (const d of snap.docs) seen.set(d.id, d.data());
  }
  return Array.from(seen, ([id, data]) => ({ kind, id, data }));
}

/** One read of the teacher's own sessions for one class, for the View Student Page preview. */
export function useClassStudentPagePreview(
  teacherUid: string | null | undefined,
  classId: string,
  projectsEnabled: boolean
): { status: ClassPreviewStatus; assignments: AssignmentSummary[] } {
  const [result, setResult] = useState<{
    key: string;
    status: 'ready' | 'error';
    assignments: AssignmentSummary[];
  } | null>(null);
  const key = `${teacherUid ?? ''}|${classId}`;

  useEffect(() => {
    if (isAuthBypass || !teacherUid || !classId) return;
    let cancelled = false;
    void Promise.allSettled(
      SESSION_KINDS.map((k) => readKind(k, teacherUid, classId))
    ).then((perKind) => {
      if (cancelled) return;
      const failed = perKind.filter((r) => r.status === 'rejected');
      failed.forEach((r) =>
        console.error('[useClassStudentPagePreview] read failed', r.reason)
      );
      setResult({
        key,
        status: failed.length > 0 ? 'error' : 'ready',
        assignments: classPreviewAssignments(
          perKind.flatMap((r) => (r.status === 'fulfilled' ? r.value : [])),
          classId
        ),
      });
    });
    return () => {
      cancelled = true;
    };
  }, [key, teacherUid, classId]);

  if (isAuthBypass || !teacherUid) return { status: 'ready', assignments: [] };
  if (!result || result.key !== key)
    return { status: 'loading', assignments: [] };
  return {
    status: result.status,
    assignments: projectsEnabled
      ? result.assignments
      : result.assignments.filter((a) => a.kind !== 'projects'),
  };
}
