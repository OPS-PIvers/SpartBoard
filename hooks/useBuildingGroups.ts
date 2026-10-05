import { httpsCallable } from 'firebase/functions';
import { functions } from '@/config/firebase';

export interface CreateBuildingGroupRequest {
  orgId: string;
  buildingId: string;
  name: string;
  leadEmail: string;
  coLeadEmails: string[];
  autoRoster: boolean;
}

/** Admin-only: create a building group and backfill it when auto-roster is on. */
export async function callCreateBuildingGroup(
  req: CreateBuildingGroupRequest
): Promise<{ plcId: string; added: number }> {
  const fn = httpsCallable<
    CreateBuildingGroupRequest,
    { plcId: string; added: number }
  >(functions, 'createBuildingGroupV1');
  return (await fn(req)).data;
}

/** Admin-only: rename, switch auto-roster, and add everyone whose building matches. */
export async function callSyncBuildingGroup(req: {
  plcId: string;
  autoRoster?: boolean;
  name?: string;
}): Promise<{ added: number; autoRoster: boolean }> {
  const fn = httpsCallable<
    { plcId: string; autoRoster?: boolean; name?: string },
    { added: number; autoRoster: boolean }
  >(functions, 'syncBuildingGroupV1');
  return (await fn(req)).data;
}
