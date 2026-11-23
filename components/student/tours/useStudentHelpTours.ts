import { useEffect, useState } from 'react';
import {
  collection,
  onSnapshot,
  query,
  where,
  type QueryConstraint,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import { logError } from '@/utils/logError';
import {
  normalizeHelpResourceItem,
  sortHelpItems,
} from '@/utils/helpCenterNormalize';
import type { HelpResourceItem } from '@/types/helpCenter';

// The read rule admits a student only to Published students items, global or in their org.
const studentScope = (orgId: string | null): QueryConstraint[] => [
  where('orgId', '==', orgId),
  where('audience', '==', 'students'),
  where('visible', '==', true),
];

const toTours = (docs: { id: string; data: () => Record<string, unknown> }[]) =>
  docs.flatMap((d) => {
    const item = normalizeHelpResourceItem(d.id, d.data());
    return item?.kind === 'guided-learning' && item.setId ? [item] : [];
  });

/** Published student live tours for this student's org and everyone. */
export function useStudentHelpTours(orgId: string | null): HelpResourceItem[] {
  const [global, setGlobal] = useState<HelpResourceItem[]>([]);
  const [org, setOrg] = useState<{
    orgId: string | null;
    items: HelpResourceItem[];
  }>({ orgId: null, items: [] });

  useEffect(
    () =>
      onSnapshot(
        query(collection(db, 'help_resources'), ...studentScope(null)),
        (snap) => setGlobal(toTours(snap.docs)),
        (err) => logError('useStudentHelpTours global', err)
      ),
    []
  );

  useEffect(() => {
    if (!orgId) return;
    return onSnapshot(
      query(collection(db, 'help_resources'), ...studentScope(orgId)),
      (snap) => setOrg({ orgId, items: toTours(snap.docs) }),
      (err) => logError('useStudentHelpTours org', err, { orgId })
    );
  }, [orgId]);

  const orgItems = orgId && org.orgId === orgId ? org.items : [];
  return sortHelpItems([...global, ...orgItems]);
}
