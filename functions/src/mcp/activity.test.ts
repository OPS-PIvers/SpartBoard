// Coverage for the Claude connector's write-budget, activity log and
// pre-edit revision snapshot helpers (CC-D9, CC-D16) — load-bearing for
// every write every connector tool makes, previously untested.
import { describe, expect, it } from 'vitest';
import type * as admin from 'firebase-admin';
import { makeStubFirestore } from '../testing/stubFirestore';
import { DAILY_WRITE_LIMIT, LOG_TTL_MS } from './config';
import {
  logActivity,
  reserveWrite,
  snapshotRevision,
  ToolError,
  type ToolContext,
} from './activity';

type Firestore = admin.firestore.Firestore;

function makeCtx(stub: ReturnType<typeof makeStubFirestore>): ToolContext {
  return {
    db: stub.db as unknown as Firestore,
    uid: 'u1',
    email: 'teacher@orono.k12.mn.us',
    grantId: 'g1',
  };
}

/** A batch that commits each `set` immediately against the stub store — the
 * functions under test never rely on multi-op atomicity, only on the shape
 * of what gets written. */
function fakeBatch(): admin.firestore.WriteBatch {
  return {
    set: (
      ref: { set: (data: Record<string, unknown>) => Promise<void> },
      data: Record<string, unknown>
    ) => {
      void ref.set(data);
      return undefined;
    },
  } as unknown as admin.firestore.WriteBatch;
}

describe('reserveWrite', () => {
  it('allows writes under the daily cap and increments the counter', async () => {
    const stub = makeStubFirestore();
    const ctx = makeCtx(stub);
    await reserveWrite(ctx, 1_000);
    expect(stub.get('users/u1/claude_usage/1970-01-01')).toMatchObject({
      writes: 1,
    });
    await reserveWrite(ctx, 1_000);
    expect(stub.get('users/u1/claude_usage/1970-01-01')).toMatchObject({
      writes: 2,
    });
  });

  it('throws once the daily cap is reached, without incrementing further', async () => {
    const stub = makeStubFirestore({
      'users/u1/claude_usage/1970-01-01': { writes: DAILY_WRITE_LIMIT },
    });
    const ctx = makeCtx(stub);
    await expect(reserveWrite(ctx, 1_000)).rejects.toThrow(ToolError);
    await expect(reserveWrite(ctx, 1_000)).rejects.toThrow(
      new RegExp(`${DAILY_WRITE_LIMIT}`)
    );
    expect(stub.get('users/u1/claude_usage/1970-01-01')).toMatchObject({
      writes: DAILY_WRITE_LIMIT,
    });
  });

  it('resets the cap on a new UTC day, keyed by date', async () => {
    const stub = makeStubFirestore({
      'users/u1/claude_usage/1970-01-01': { writes: DAILY_WRITE_LIMIT },
    });
    const ctx = makeCtx(stub);
    const nextDay = Date.parse('1970-01-02T00:00:00.000Z');
    await reserveWrite(ctx, nextDay);
    expect(stub.get('users/u1/claude_usage/1970-01-02')).toMatchObject({
      writes: 1,
    });
    // Yesterday's doc is untouched.
    expect(stub.get('users/u1/claude_usage/1970-01-01')).toMatchObject({
      writes: DAILY_WRITE_LIMIT,
    });
  });

  it('sets an expireAt TTL field on the usage doc', async () => {
    const stub = makeStubFirestore();
    const ctx = makeCtx(stub);
    await reserveWrite(ctx, 5_000);
    const doc = stub.get('users/u1/claude_usage/1970-01-01') as {
      expireAt: { toMillis: () => number };
    };
    expect(doc.expireAt.toMillis()).toBe(5_000 + LOG_TTL_MS);
  });
});

describe('logActivity', () => {
  it('writes the entry with grantId/at stamped and revisionId defaulted to null', () => {
    const stub = makeStubFirestore();
    const ctx = makeCtx(stub);
    const batch = fakeBatch();
    logActivity(
      ctx,
      batch,
      { action: 'create', itemType: 'quiz', itemId: 'q1', title: 'A Quiz' },
      2_000
    );
    const [written] = Array.from(stub.store.entries()).filter(([path]) =>
      path.startsWith('users/u1/claude_activity/')
    );
    expect(written[1]).toMatchObject({
      action: 'create',
      itemType: 'quiz',
      itemId: 'q1',
      title: 'A Quiz',
      revisionId: null,
      grantId: 'g1',
      at: 2_000,
    });
  });

  it('truncates an overlong title to 200 characters', () => {
    const stub = makeStubFirestore();
    const ctx = makeCtx(stub);
    const batch = fakeBatch();
    const longTitle = 'x'.repeat(500);
    logActivity(
      ctx,
      batch,
      {
        action: 'update',
        itemType: 'flashcard_set',
        itemId: 'f1',
        title: longTitle,
      },
      3_000
    );
    const [written] = Array.from(stub.store.entries()).filter(([path]) =>
      path.startsWith('users/u1/claude_activity/')
    );
    expect((written[1].title as string).length).toBe(200);
  });

  it('keeps an explicit revisionId when provided', () => {
    const stub = makeStubFirestore();
    const ctx = makeCtx(stub);
    const batch = fakeBatch();
    logActivity(
      ctx,
      batch,
      {
        action: 'restore',
        itemType: 'rubric',
        itemId: 'r1',
        title: 'R',
        revisionId: 'rev-123',
      },
      4_000
    );
    const [written] = Array.from(stub.store.entries()).filter(([path]) =>
      path.startsWith('users/u1/claude_activity/')
    );
    expect(written[1].revisionId).toBe('rev-123');
  });
});

describe('snapshotRevision', () => {
  it('stores the pre-edit data and returns the new revision id', () => {
    const stub = makeStubFirestore();
    const ctx = makeCtx(stub);
    const batch = fakeBatch();
    const data = { title: 'Old title', questions: [{ id: 'q1' }] };
    const id = snapshotRevision(
      ctx,
      batch,
      { itemType: 'quiz', itemId: 'q1', title: 'Old title', data },
      6_000
    );
    expect(typeof id).toBe('string');
    const stored = stub.get(`users/u1/claude_revisions/${id}`) as {
      itemType: string;
      itemId: string;
      title: string;
      data: unknown;
      createdAt: number;
    };
    expect(stored).toMatchObject({
      itemType: 'quiz',
      itemId: 'q1',
      title: 'Old title',
      data,
      createdAt: 6_000,
    });
  });

  it('truncates the snapshotted title to 200 characters', () => {
    const stub = makeStubFirestore();
    const ctx = makeCtx(stub);
    const batch = fakeBatch();
    const longTitle = 'y'.repeat(300);
    const id = snapshotRevision(
      ctx,
      batch,
      { itemType: 'video_activity', itemId: 'v1', title: longTitle, data: {} },
      7_000
    );
    const stored = stub.get(`users/u1/claude_revisions/${id}`) as {
      title: string;
    };
    expect(stored.title.length).toBe(200);
  });

  it('sets an expireAt TTL field on the revision doc', () => {
    const stub = makeStubFirestore();
    const ctx = makeCtx(stub);
    const batch = fakeBatch();
    const id = snapshotRevision(
      ctx,
      batch,
      { itemType: 'mini_app', itemId: 'm1', title: 'M', data: {} },
      8_000
    );
    const stored = stub.get(`users/u1/claude_revisions/${id}`) as {
      expireAt: { toMillis: () => number };
    };
    expect(stored.expireAt.toMillis()).toBe(8_000 + LOG_TTL_MS);
  });
});
