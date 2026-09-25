/** D35 — a group's latest events for the board's expanded row; mount only while expanded. */

import { useEffect, useState } from 'react';
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import type { ProjectGroupEvent } from '@/types';
import { logError } from '@/utils/logError';
import { RUNS_COLLECTION } from '@/utils/projectRunWrites';

interface Snapshot {
  key: string;
  events: ProjectGroupEvent[];
}

export function useProjectGroupEvents(
  runId: string | null | undefined,
  groupId: string | null | undefined,
  count = 5
): { events: ProjectGroupEvent[]; loading: boolean } {
  const key = runId && groupId ? `${runId}/${groupId}/${count}` : '';
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);

  useEffect(() => {
    if (!runId || !groupId) return undefined;
    const current = `${runId}/${groupId}/${count}`;
    return onSnapshot(
      query(
        collection(db, RUNS_COLLECTION, runId, 'groups', groupId, 'events'),
        orderBy('at', 'desc'),
        limit(count)
      ),
      (snap) =>
        setSnapshot({
          key: current,
          events: snap.docs.map((d) => ({
            ...(d.data() as Omit<ProjectGroupEvent, 'id'>),
            id: d.id,
          })),
        }),
      (error) => {
        logError('useProjectGroupEvents', error, { runId, groupId });
        setSnapshot({ key: current, events: [] });
      }
    );
  }, [count, groupId, runId]);

  if (!key) return { events: [], loading: false };
  const live = snapshot?.key === key ? snapshot : null;
  return { events: live?.events ?? [], loading: !live };
}
