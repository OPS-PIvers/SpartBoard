import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import * as admin from './firebaseAdmin';

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

/** Beta emails stripped: the mirror every signed-in caller may read. */
export const publicView = (d: Record<string, unknown>) => ({
  ...d,
  betaUsers: [],
});

async function sync(
  kind: Kind,
  id: string,
  before: Record<string, unknown> | undefined,
  after: Record<string, unknown> | undefined
) {
  const db = admin.firestore();
  const pub = db.collection(PUBLIC[kind]).doc(id);
  if (after) await pub.set(publicView(after));
  else await pub.delete();
  const was = new Set(betaEmails(before));
  const now = new Set(betaEmails(after));
  const field = kind === 'feature' ? 'features' : 'global';
  const FV = FieldValue;
  const ops: Promise<unknown>[] = [];
  for (const e of now)
    if (!was.has(e))
      ops.push(
        db
          .collection('beta_grants')
          .doc(e)
          .set({ [field]: FV.arrayUnion(id) }, { merge: true })
      );
  for (const e of was)
    if (!now.has(e))
      ops.push(
        db
          .collection('beta_grants')
          .doc(e)
          .set({ [field]: FV.arrayRemove(id) }, { merge: true })
      );
  await Promise.all(ops);
}

export const featurePermissionsMirror = onDocumentWritten(
  'feature_permissions/{id}',
  (event) =>
    sync(
      'feature',
      event.params.id,
      event.data?.before.data(),
      event.data?.after.data()
    )
);

export const globalPermissionsMirror = onDocumentWritten(
  'global_permissions/{id}',
  (event) =>
    sync(
      'global',
      event.params.id,
      event.data?.before.data(),
      event.data?.after.data()
    )
);
