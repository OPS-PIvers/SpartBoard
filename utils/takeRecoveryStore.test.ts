import { describe, it, expect } from 'vitest';
import {
  TAKE_RECOVERY_TTL_MS,
  hasRecoverableContent,
  memoryTakeRecoveryStore,
  parseRecoveredTake,
  takeRecoveryKey,
} from './takeRecoveryStore';

const key = takeRecoveryKey({
  sessionId: 's1',
  responseKey: 'r1',
  questionId: 'q1',
});

describe('takeRecoveryKey', () => {
  it('scopes a take to session, response and question', () => {
    expect(key).toBe('s1/r1/q1');
  });
});

describe('parseRecoveredTake', () => {
  it('keeps a well-formed record and drops non-blob chunks', () => {
    const blob = new Blob(['a']);
    expect(
      parseRecoveredTake({
        key,
        mimeType: 'audio/webm',
        startedAt: 5,
        updatedAt: 9,
        chunks: [blob, 'junk'],
        log: '{"v":1}',
        micState: 'bogus',
      })
    ).toEqual({
      key,
      mimeType: 'audio/webm',
      startedAt: 5,
      updatedAt: 9,
      chunks: [blob],
      log: '{"v":1}',
    });
  });

  it('rejects records missing a key, times or chunks', () => {
    expect(parseRecoveredTake(null)).toBeNull();
    expect(parseRecoveredTake({ key: '', mimeType: 'a' })).toBeNull();
    expect(
      parseRecoveredTake({ key, mimeType: 'a', startedAt: 1, updatedAt: 2 })
    ).toBeNull();
  });
});

describe('memoryTakeRecoveryStore', () => {
  it('collects chunks for a begun take and tracks the last write time', async () => {
    const store = memoryTakeRecoveryStore();
    await store.begin(key, 'audio/webm', 1000);
    await store.appendChunk(key, new Blob(['a']), 2000);
    await store.appendChunk(key, new Blob(['b']), 3000);
    const take = await store.load(key, 4000);
    expect(take?.chunks).toHaveLength(2);
    expect(take?.updatedAt).toBe(3000);
    expect(take && hasRecoverableContent(take)).toBe(true);
  });

  it('ignores chunks for a take that was never begun or already wiped', async () => {
    const store = memoryTakeRecoveryStore();
    await store.appendChunk(key, new Blob(['a']), 2000);
    expect(await store.load(key, 3000)).toBeNull();
    await store.begin(key, 'audio/webm', 1000);
    await store.remove(key);
    await store.appendChunk(key, new Blob(['a']), 2000);
    expect(await store.load(key, 3000)).toBeNull();
  });

  it('starts over when a new take begins under the same key', async () => {
    const store = memoryTakeRecoveryStore();
    await store.begin(key, 'audio/webm', 1000);
    await store.appendChunk(key, new Blob(['a']), 2000);
    await store.begin(key, 'audio/webm', 5000);
    const take = await store.load(key, 6000);
    expect(take?.chunks).toHaveLength(0);
    expect(take && hasRecoverableContent(take)).toBe(false);
  });

  it('keeps the latest drawing log and the mic state', async () => {
    const store = memoryTakeRecoveryStore();
    await store.begin(key, '', 1000, { micState: 'denied' });
    await store.setLog(key, '{"v":0}', 1500);
    await store.setLog(key, '{"v":1}', 2000);
    const take = await store.load(key, 3000);
    expect(take?.log).toBe('{"v":1}');
    expect(take?.micState).toBe('denied');
    expect(take && hasRecoverableContent(take)).toBe(true);
  });

  it('drops a take 24 hours after capture started', async () => {
    const store = memoryTakeRecoveryStore();
    await store.begin(key, 'audio/webm', 1000);
    await store.appendChunk(key, new Blob(['a']), 2000);
    expect(
      await store.load(key, 1000 + TAKE_RECOVERY_TTL_MS - 1)
    ).not.toBeNull();
    expect(await store.load(key, 1000 + TAKE_RECOVERY_TTL_MS)).toBeNull();
    expect(await store.load(key, 0)).toBeNull();
  });

  it('removeExpired sweeps only old takes', async () => {
    const store = memoryTakeRecoveryStore();
    const other = takeRecoveryKey({
      sessionId: 's1',
      responseKey: 'r1',
      questionId: 'q2',
    });
    await store.begin(key, 'audio/webm', 0);
    await store.begin(other, 'audio/webm', TAKE_RECOVERY_TTL_MS);
    await store.removeExpired(TAKE_RECOVERY_TTL_MS + 1);
    expect(await store.load(key, 0)).toBeNull();
    expect(await store.load(other, TAKE_RECOVERY_TTL_MS + 1)).not.toBeNull();
  });

  it('wipes every question of one response on submit and nothing else', async () => {
    const store = memoryTakeRecoveryStore();
    const q2 = takeRecoveryKey({
      sessionId: 's1',
      responseKey: 'r1',
      questionId: 'q2',
    });
    const otherResponse = takeRecoveryKey({
      sessionId: 's1',
      responseKey: 'r10',
      questionId: 'q1',
    });
    for (const k of [key, q2, otherResponse]) {
      await store.begin(k, 'audio/webm', 1000);
    }
    await store.removeForResponse('s1', 'r1');
    expect(await store.load(key, 2000)).toBeNull();
    expect(await store.load(q2, 2000)).toBeNull();
    expect(await store.load(otherResponse, 2000)).not.toBeNull();
  });
});
