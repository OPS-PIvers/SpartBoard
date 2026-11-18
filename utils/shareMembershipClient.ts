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

/** Who hosts a share, resolved on the server from the host's account. */
export interface ShareHostInfo {
  hostStaff: boolean;
  hostName?: string;
  /** The share was created after board `boardId`: someone re-created it at an old id. */
  shareNewer?: boolean;
}

/** Reads the share host from the server; the share doc's own host name is not trusted. */
export async function fetchShareHost(
  shareId: string,
  boardId?: string
): Promise<ShareHostInfo> {
  const fn = httpsCallable<
    { action: 'shareHost'; shareId: string; boardId?: string },
    ShareHostInfo
  >(functions, 'shareMembershipV1');
  const res = await fn({
    action: 'shareHost',
    shareId,
    ...(boardId ? { boardId } : {}),
  });
  return res.data;
}
