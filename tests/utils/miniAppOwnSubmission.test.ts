import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { doc, getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import {
  readOwnMiniAppSubmission,
  resetReceiptRebuilds,
} from '@/utils/miniAppResults';

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db: unknown, ...segs: string[]) => segs.join('/')),
  getDoc: vi.fn(),
}));
vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn() }));
vi.mock('@/config/firebase', () => ({ db: {}, functions: {} }));

const mockGetDoc = getDoc as Mock;
const SUMMARY = 'mini_app_sessions/s1/submissions/p1';
const RECEIPT = 'mini_app_sessions/s1/receipts/p1';
const SESSION = 'mini_app_sessions/s1';
const HIDDEN = { resultsVersion: 2, showCorrectAnswers: false };
const callable = vi.fn();
const denied = Object.assign(new Error('denied'), {
  code: 'permission-denied',
});

function world(docs: Record<string, Record<string, unknown> | 'denied'>) {
  mockGetDoc.mockImplementation((path: string) => {
    const d = docs[path];
    if (d === 'denied') return Promise.reject(denied);
    return Promise.resolve({ exists: () => !!d, data: () => d });
  });
}

describe('readOwnMiniAppSubmission', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetReceiptRebuilds();
    (httpsCallable as Mock).mockReturnValue(callable);
  });

  it('reads the summary when the student may see it', async () => {
    world({ [SUMMARY]: { attemptCount: 2, best: { score: 1 } } });
    await expect(readOwnMiniAppSubmission('s1', 'p1')).resolves.toEqual({
      attemptCount: 2,
      best: { score: 1 },
    });
    expect(doc).not.toHaveBeenCalledWith({}, ...RECEIPT.split('/'));
  });

  it('falls back to the receipt when the summary is teacher-only', async () => {
    world({ [SUMMARY]: 'denied', [RECEIPT]: { attemptCount: 1 } });
    await expect(readOwnMiniAppSubmission('s1', 'p1')).resolves.toEqual({
      attemptCount: 1,
    });
  });

  it('rethrows the summary error when the session does not hide answers', async () => {
    world({ [SUMMARY]: 'denied', [RECEIPT]: 'denied', [SESSION]: {} });
    await expect(readOwnMiniAppSubmission('s1', 'p1')).rejects.toBe(denied);
    expect(callable).not.toHaveBeenCalled();
  });

  it('has the server rebuild a receipt for a submission made before receipts', async () => {
    world({ [SUMMARY]: 'denied', [RECEIPT]: 'denied', [SESSION]: HIDDEN });
    callable.mockResolvedValue({
      data: { receipt: { studentUid: 'u', attemptCount: 1 } },
    });
    await expect(readOwnMiniAppSubmission('s1', 'p1')).resolves.toEqual({
      studentUid: 'u',
      attemptCount: 1,
    });
    expect(callable).toHaveBeenCalledWith({ sessionId: 's1' });
  });

  it('calls the server once per submission, even when it fails', async () => {
    world({ [SUMMARY]: 'denied', [RECEIPT]: 'denied' });
    const boom = new Error('offline');
    callable.mockRejectedValue(boom);
    for (let i = 0; i < 3; i++)
      await expect(readOwnMiniAppSubmission('s1', 'p1', HIDDEN)).rejects.toBe(
        boom
      );
    expect(callable).toHaveBeenCalledTimes(1);
  });

  it('reads nothing submitted as not started', async () => {
    world({ [SUMMARY]: 'denied', [RECEIPT]: 'denied' });
    callable.mockResolvedValue({ data: { receipt: null } });
    await expect(
      readOwnMiniAppSubmission('s1', 'p1', HIDDEN)
    ).resolves.toBeNull();
    await readOwnMiniAppSubmission('s1', 'p1', HIDDEN);
    expect(callable).toHaveBeenCalledTimes(1);
  });

  it('returns null when nothing was submitted', async () => {
    world({});
    await expect(readOwnMiniAppSubmission('s1', 'p1')).resolves.toBeNull();
  });
});
