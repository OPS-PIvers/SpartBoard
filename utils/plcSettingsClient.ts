import { httpsCallable } from 'firebase/functions';
import { functions } from '@/config/firebase';
import { plcMembershipErrorMessage } from '@/utils/plcMembershipClient';
import { guardPlcCallable } from '@/utils/plcViewAsCallable';

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
  const plcId = typeof req.plcId === 'string' ? req.plcId : 'new';
  const ws =
    typeof req.workspaceId === 'string' ? `/workspaces/${req.workspaceId}` : '';
  return guardPlcCallable(
    [
      {
        op: req.action === 'delete' ? 'delete' : 'set',
        path: `plcs/${plcId}${ws}`,
        data: req,
      },
    ],
    () => run(req)
  );
}

async function run(req: { action: string } & Data): Promise<PlcSettingsResult> {
  const fn = httpsCallable<Data, PlcSettingsResult>(functions, 'plcSettingsV1');
  try {
    return (await fn(req)).data;
  } catch (err) {
    const reason = (err as { details?: { reason?: unknown } } | null)?.details
      ?.reason;
    // A malformed write showed the rules' refusal before it moved server-side.
    const message =
      reason === 'invalid'
        ? 'Missing or insufficient permissions.'
        : plcMembershipErrorMessage(err);
    if (message === null) throw err;
    throw Object.assign(new Error(message), {
      code: (err as { code?: unknown }).code,
    });
  }
}
