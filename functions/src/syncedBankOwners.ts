// Records who first owned each synced_question_banks id, so rules refuse anyone else re-creating it after a delete.
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import * as admin from './firebaseAdmin';
import './functionsInit';

type Doc = Record<string, unknown>;

interface Change {
  before: { data: () => Doc | undefined };
  after: { data: () => Doc | undefined };
}

export const SYNCED_BANK_OWNERS = 'synced_bank_owners';

/** Writes the owner record once; a later write never moves it. */
export async function recordSyncedBankOwner(
  db: admin.firestore.Firestore,
  groupId: string,
  change: Change | undefined
): Promise<void> {
  const data = change?.after.data() ?? change?.before.data();
  const ownerUid = data?.ownerUid;
  if (typeof ownerUid !== 'string' || !ownerUid) return;
  try {
    await db
      .collection(SYNCED_BANK_OWNERS)
      .doc(groupId)
      .create({ ownerUid, at: Date.now() });
  } catch (err) {
    if ((err as { code?: unknown }).code !== 6) throw err;
  }
}

export const syncedBankOwnerRegistry = onDocumentWritten(
  {
    document: 'synced_question_banks/{groupId}',
    memory: '256MiB',
    maxInstances: 10,
  },
  async (event) => {
    await recordSyncedBankOwner(
      admin.firestore(),
      event.params.groupId,
      event.data
    );
  }
);
