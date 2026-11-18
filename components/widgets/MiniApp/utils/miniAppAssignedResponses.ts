import type { DocumentData } from 'firebase/firestore';
import type { MiniAppAssignment } from '@/types';
import type { AssignedResponse } from '@/utils/assignedStatus';
import { miniAppAssignedResponse } from '@/utils/assignedAdapters';

/** Submissions carry no class, so all count against one handled class and unopened ones stay Ready. */
export function miniAppRowResponses(
  a: Pick<MiniAppAssignment, 'periodAccess'>,
  docs: readonly DocumentData[]
): AssignedResponse[] {
  const rows = Object.entries(a.periodAccess ?? {});
  const [key, row] =
    rows.find(([, r]) => r.state !== 'closed' || r.closedAt != null) ??
    rows[0] ??
    [];
  return docs.map(() => miniAppAssignedResponse(key, row?.label));
}
