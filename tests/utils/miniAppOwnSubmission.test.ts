import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { doc, getDoc } from 'firebase/firestore';
import { readOwnMiniAppSubmission } from '@/utils/miniAppResults';

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db: unknown, ...segs: string[]) => segs.join('/')),
  getDoc: vi.fn(),
}));
vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn() }));
vi.mock('@/config/firebase', () => ({ db: {}, functions: {} }));

const mockGetDoc = getDoc as Mock;
const SUMMARY = 'mini_app_sessions/s1/submissions/p1';
const RECEIPT = 'mini_app_sessions/s1/receipts/p1';
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
  beforeEach(() => vi.clearAllMocks());

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

  it('rethrows the summary error when there is no receipt either', async () => {
    world({ [SUMMARY]: 'denied', [RECEIPT]: 'denied' });
    await expect(readOwnMiniAppSubmission('s1', 'p1')).rejects.toBe(denied);
  });

  it('returns null when nothing was submitted', async () => {
    world({});
    await expect(readOwnMiniAppSubmission('s1', 'p1')).resolves.toBeNull();
  });
});
