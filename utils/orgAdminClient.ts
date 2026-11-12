import { httpsCallable } from 'firebase/functions';
import { functions } from '@/config/firebase';

type Data = Record<string, unknown>;

export type OrgAdminRequest =
  | { action: 'createOrg'; record: Data }
  | { action: 'updateOrg'; orgId: string; patch: Data }
  | { action: 'addBuilding'; orgId: string; record: Data }
  | { action: 'updateBuilding'; orgId: string; id: string; patch: Data }
  | { action: 'removeBuilding'; orgId: string; id: string }
  | { action: 'addDomain'; orgId: string; record: Data }
  | { action: 'removeDomain'; orgId: string; id: string }
  | {
      action: 'saveRoles';
      orgId: string;
      upserts: Array<{
        id: string;
        name: string;
        blurb: string;
        color: string;
        perms: Data;
      }>;
      systemPerms: Array<{ id: string; perms: Data }>;
      deletes: string[];
    }
  | { action: 'updateMembers'; orgId: string; ids: string[]; patch: Data }
  | { action: 'removeMembers'; orgId: string; ids: string[] };

// Same wording the Admin Settings toasts showed when these were direct Firestore writes.
const MESSAGES: Record<string, string> = {
  notAllowed: 'Missing or insufficient permissions.',
  notFound: 'No document to update.',
  alreadyExists: 'Document already exists.',
};

/** The message for a refusal from orgAdminV1, or null to rethrow the original error. */
export function orgAdminErrorMessage(err: unknown): string | null {
  const details = (err as { details?: unknown } | null)?.details;
  const reason =
    details && typeof details === 'object'
      ? (details as { reason?: unknown }).reason
      : undefined;
  return typeof reason === 'string' && reason in MESSAGES
    ? MESSAGES[reason]
    : null;
}

// Calls run one at a time so typed edits (one call per keystroke) land in order.
let tail: Promise<unknown> = Promise.resolve();

/** Runs one Admin Settings organization write on the server, after any still in flight. */
export function callOrgAdmin(req: OrgAdminRequest): Promise<void> {
  const run = tail.catch(() => undefined).then(() => send(req));
  tail = run;
  return run;
}

async function send(req: OrgAdminRequest): Promise<void> {
  const fn = httpsCallable<OrgAdminRequest, { changed: number }>(
    functions,
    'orgAdminV1'
  );
  try {
    await fn(req);
  } catch (err) {
    const message = orgAdminErrorMessage(err);
    if (message === null) throw err;
    throw Object.assign(new Error(message), {
      code: (err as { code?: unknown }).code,
    });
  }
}
