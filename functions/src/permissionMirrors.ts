import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import * as admin from './firebaseAdmin';
import { excludedEmails } from './permissionExclusion';

if (!admin.apps.length) {
  admin.initializeApp();
}

type Kind = 'feature' | 'global';
const PUBLIC: Record<Kind, string> = {
  feature: 'feature_permissions_public',
  global: 'global_permissions_public',
};

export const betaEmails = (
  d: Record<string, unknown> | undefined
): string[] => {
  const raw = d?.betaUsers;
  if (!Array.isArray(raw)) return [];
  return [
    ...new Set(
      raw
        .filter((e): e is string => typeof e === 'string')
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean)
    ),
  ];
};

/** Beta and excluded emails stripped: the mirror every signed-in caller may read. */
export const publicView = (d: Record<string, unknown>) => {
  const rest = { ...d, betaUsers: [] };
  delete rest.excludedUsers;
  return rest;
};

/** Re-reads the live source so stale/reordered events cannot overwrite newer state. */
export async function sync(
  kind: Kind,
  id: string,
  before: Record<string, unknown> | undefined,
  after: Record<string, unknown> | undefined
) {
  const db = admin.firestore();
  const srcPath = `${kind === 'feature' ? 'feature_permissions' : 'global_permissions'}/${id}`;
  const liveSnap = await db.doc(srcPath).get();
  const live = liveSnap.exists ? liveSnap.data() : undefined;
  const pub = db.collection(PUBLIC[kind]).doc(id);
  if (live) await pub.set(publicView(live));
  else await pub.delete();
  // Each person's grant doc holds their own beta grants and their own exclusions.
  const FV = FieldValue;
  const updates = new Map<string, Record<string, unknown>>();
  const track = (
    field: string,
    emails: (d: Record<string, unknown> | undefined) => string[]
  ) => {
    const now = new Set(emails(live));
    for (const e of new Set([...emails(before), ...emails(after), ...now]))
      updates.set(e, {
        ...updates.get(e),
        [field]: now.has(e) ? FV.arrayUnion(id) : FV.arrayRemove(id),
      });
  };
  track(kind === 'feature' ? 'features' : 'global', betaEmails);
  track(
    kind === 'feature' ? 'excludedFeatures' : 'excludedGlobal',
    excludedEmails
  );
  await Promise.all(
    [...updates].map(([e, update]) =>
      db.collection('beta_grants').doc(e).set(update, { merge: true })
    )
  );
}

const OPTS = { retry: true } as const;

export const featurePermissionsMirror = onDocumentWritten(
  { document: 'feature_permissions/{id}', ...OPTS },
  (event) =>
    sync(
      'feature',
      event.params.id,
      event.data?.before.data(),
      event.data?.after.data()
    )
);

export const globalPermissionsMirror = onDocumentWritten(
  { document: 'global_permissions/{id}', ...OPTS },
  (event) =>
    sync(
      'global',
      event.params.id,
      event.data?.before.data(),
      event.data?.after.data()
    )
);
