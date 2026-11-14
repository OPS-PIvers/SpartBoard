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
  const now = new Set(betaEmails(live));
  const touched = new Set([
    ...betaEmails(before),
    ...betaEmails(after),
    ...now,
  ]);
  const field = kind === 'feature' ? 'features' : 'global';
  const FV = FieldValue;
  const ops: Promise<unknown>[] = [];
  for (const e of touched)
    ops.push(
      db
        .collection('beta_grants')
        .doc(e)
        .set(
          { [field]: now.has(e) ? FV.arrayUnion(id) : FV.arrayRemove(id) },
          { merge: true }
        )
    );
  await Promise.all(ops);
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
