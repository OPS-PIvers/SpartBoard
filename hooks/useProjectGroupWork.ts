/** A group's work links from `private/work` (D40), falling back to the legacy group-doc field. */

import { useEffect, useState } from 'react';
import { onSnapshot } from 'firebase/firestore';
import { db } from '@/config/firebase';
import type { ProjectGroupWork, ProjectWorkLink } from '@/types';
import { logError } from '@/utils/logError';
import { groupWorkRef } from '@/utils/projectRunWrites';

export interface ProjectGroupWorkState {
  workLinks: ProjectWorkLink[];
  /** Set only while `private/work` is missing; pass to `writeWorkLink`/`removeWorkLinkWrite`. */
  legacySeed: ProjectWorkLink[] | undefined;
  loading: boolean;
}

interface Snapshot {
  key: string;
  exists: boolean;
  links: ProjectWorkLink[];
}

export function useProjectGroupWork(
  runId: string | null | undefined,
  groupId: string | null | undefined,
  legacyLinks: ProjectWorkLink[] | undefined
): ProjectGroupWorkState {
  const key = runId && groupId ? `${runId}/${groupId}` : '';
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);

  useEffect(() => {
    if (!runId || !groupId) return undefined;
    const current = `${runId}/${groupId}`;
    return onSnapshot(
      groupWorkRef(db, runId, groupId),
      (snap) => {
        const data = snap.exists()
          ? (snap.data() as Partial<ProjectGroupWork>)
          : null;
        setSnapshot({
          key: current,
          exists: snap.exists(),
          links: Array.isArray(data?.workLinks) ? data.workLinks : [],
        });
      },
      (error) => {
        logError('useProjectGroupWork', error, { runId, groupId });
        setSnapshot({ key: current, exists: false, links: [] });
      }
    );
  }, [groupId, runId]);

  // A snapshot for another group is stale; treat it as still loading.
  const live = snapshot?.key === key ? snapshot : null;
  if (!key) return { workLinks: [], legacySeed: undefined, loading: false };
  if (!live) {
    return {
      workLinks: legacyLinks ?? [],
      legacySeed: undefined,
      loading: true,
    };
  }
  if (live.exists) {
    return { workLinks: live.links, legacySeed: undefined, loading: false };
  }
  const legacy = legacyLinks ?? [];
  return { workLinks: legacy, legacySeed: legacy, loading: false };
}
