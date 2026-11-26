import { httpsCallable } from 'firebase/functions';
import { functions } from '@/config/firebase';
import { plcMembershipErrorMessage } from '@/utils/plcMembershipClient';

type Data = Record<string, unknown>;

export interface PlcSettingsResult {
  plcId?: string;
  url?: string;
  workspaceId?: string;
  checkInId?: string;
  listed?: boolean;
}

/** Runs one PLC settings, learning target, gradebook or mentoring workspace write on the server. */
export async function callPlcSettings(
  req: { action: string } & Data
): Promise<PlcSettingsResult> {
  const fn = httpsCallable<Data, PlcSettingsResult>(functions, 'plcSettingsV1');
  try {
    return (await fn(req)).data;
  } catch (err) {
    const message = plcMembershipErrorMessage(err);
    if (message === null) throw err;
    throw Object.assign(new Error(message), {
      code: (err as { code?: unknown }).code,
    });
  }
}
