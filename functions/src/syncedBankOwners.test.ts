import { describe, expect, it } from 'vitest';
import type * as admin from './firebaseAdmin';
import { recordSyncedBankOwner } from './syncedBankOwners';
import { makeStubFirestore } from './testing/stubFirestore';

const change = (
  before?: Record<string, unknown>,
  after?: Record<string, unknown>
) => ({
  before: { data: () => before },
  after: { data: () => after },
});

const asDb = (db: unknown) => db as admin.firestore.Firestore;

describe('recordSyncedBankOwner (security #18)', () => {
  it('records the owner when a shared bank is created', async () => {
    const stub = makeStubFirestore();
    await recordSyncedBankOwner(
      asDb(stub.db),
      'g1',
      change(undefined, { ownerUid: 'a' })
    );
    expect(stub.get('synced_bank_owners/g1')).toMatchObject({ ownerUid: 'a' });
  });

  it('records an older bank from its delete, so the id stays reserved', async () => {
    const stub = makeStubFirestore();
    await recordSyncedBankOwner(
      asDb(stub.db),
      'g1',
      change({ ownerUid: 'a' }, undefined)
    );
    expect(stub.get('synced_bank_owners/g1')).toMatchObject({ ownerUid: 'a' });
  });

  it('never moves an existing record', async () => {
    const stub = makeStubFirestore({
      'synced_bank_owners/g1': { ownerUid: 'a' },
    });
    await recordSyncedBankOwner(
      asDb(stub.db),
      'g1',
      change(undefined, { ownerUid: 'b' })
    );
    expect(stub.get('synced_bank_owners/g1')).toMatchObject({ ownerUid: 'a' });
  });
});
