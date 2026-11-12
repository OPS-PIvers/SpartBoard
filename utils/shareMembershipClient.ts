import { httpsCallable } from 'firebase/functions';
import { functions } from '@/config/firebase';

export type ShareMembershipRequest =
  | {
      action: 'joinBoard';
      shareId: string;
      role: 'collaborator' | 'viewer';
      displayName?: string;
    }
  | { action: 'leaveBoard'; shareId: string }
  | { action: 'joinCollection'; linkId: string; name?: string }
  | { action: 'leaveCollection'; linkId: string };

// Same wording the share flows showed when these were direct Firestore writes.
const MESSAGES: Record<string, string> = {
  notAllowed: 'Missing or insufficient permissions.',
  notFound: 'No document to update.',
};

/** Joins or leaves a shared board or collection link on the server. */
export async function callShareMembership(
  req: ShareMembershipRequest
): Promise<void> {
  const fn = httpsCallable<ShareMembershipRequest, { changed: boolean }>(
    functions,
    'shareMembershipV1'
  );
  try {
    await fn(req);
  } catch (err) {
    const details = (err as { details?: unknown } | null)?.details;
    const reason =
      details && typeof details === 'object'
        ? (details as { reason?: unknown }).reason
        : undefined;
    if (typeof reason !== 'string' || !(reason in MESSAGES)) throw err;
    throw Object.assign(new Error(MESSAGES[reason]), {
      code: firestoreCode((err as { code?: unknown }).code),
    });
  }
}

// Callable codes carry a "functions/" prefix; callers compare against the bare Firestore codes.
function firestoreCode(code: unknown): unknown {
  return typeof code === 'string' ? code.replace(/^functions\//, '') : code;
}
