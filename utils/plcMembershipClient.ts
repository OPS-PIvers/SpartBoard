import { httpsCallable } from 'firebase/functions';
import { functions } from '@/config/firebase';
import type { PlcRole } from '@/types';
import i18n from '@/i18n/index';

type NonLeadRole = Exclude<PlcRole, 'lead'>;

export type PlcMembershipRequest =
  | { action: 'acceptInvite'; inviteId: string }
  | { action: 'leave'; plcId: string }
  | { action: 'removeMember'; plcId: string; uid: string }
  | { action: 'setRole'; plcId: string; uid: string; role: NonLeadRole }
  | { action: 'transferLead'; plcId: string; uid: string }
  | { action: 'adminReassignLead'; plcId: string; uid: string }
  | {
      action: 'adminSetMember';
      plcId: string;
      target: { uid: string; email: string; displayName: string };
      role: NonLeadRole;
    }
  | { action: 'adminRemoveMember'; plcId: string; uid: string };

export interface PlcMembershipResult {
  changed: boolean;
  targetName?: string;
}

const PLC_ERROR_KEYS = new Set([
  'plcNotFound',
  'leadCannotLeave',
  'leadCannotBeRemoved',
  'notAMember',
  'targetNotActiveMember',
  'cannotDemoteLead',
  'alreadyLead',
  'notActiveMember',
]);

// Invite reasons keep the wording the accept flow showed before it moved server-side.
const INVITE_MESSAGES: Record<string, string> = {
  inviteNotFound: 'Could not accept this invitation. Try again in a moment.',
  inviteWrongAccount: 'Invitation is addressed to a different account',
  inviteNotPending: 'Invitation is no longer pending',
};

/** The message for a refusal from plcMembershipV1, or null to rethrow the original error. */
export function plcMembershipErrorMessage(err: unknown): string | null {
  const details = (err as { details?: unknown } | null)?.details;
  const reason =
    details && typeof details === 'object'
      ? (details as { reason?: unknown }).reason
      : undefined;
  if (typeof reason !== 'string') return null;
  if (PLC_ERROR_KEYS.has(reason)) return i18n.t(`plc.errors.${reason}`);
  if (reason in INVITE_MESSAGES) return INVITE_MESSAGES[reason];
  // Same text Firestore showed when the rules refused this write.
  if (reason === 'notAllowed') return 'Missing or insufficient permissions.';
  return null;
}

/** Runs one PLC membership change on the server (accept invite, leave, remove, roles, lead). */
export async function callPlcMembership(
  req: PlcMembershipRequest
): Promise<PlcMembershipResult> {
  const fn = httpsCallable<PlcMembershipRequest, PlcMembershipResult>(
    functions,
    'plcMembershipV1'
  );
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
