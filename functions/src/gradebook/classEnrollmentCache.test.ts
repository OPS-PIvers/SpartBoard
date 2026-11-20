import { describe, it, expect, vi, beforeEach } from 'vitest';

const loadTaughtClassStudentUids = vi.fn();
vi.mock('./projectMemberAuthority', () => ({ loadTaughtClassStudentUids }));
vi.mock('../firebaseAdmin', () => ({
  apps: [{ name: '[DEFAULT]' }],
  initializeApp: vi.fn(),
  firestore: Object.assign(vi.fn(), {
    FieldValue: { serverTimestamp: vi.fn() },
  }),
}));
vi.mock('firebase-functions/v2', () => ({ setGlobalOptions: vi.fn() }));

import {
  __resetClassEnrollmentCache,
  defaultClassEnrollment,
} from './gradeProjection';
import { RosterUnavailableError } from './rosterUnavailable';

type Db = Parameters<typeof defaultClassEnrollment>[0];
const db = {} as Db;

beforeEach(() => {
  __resetClassEnrollmentCache();
  loadTaughtClassStudentUids.mockReset();
});

describe('defaultClassEnrollment', () => {
  it('caches an empty roster answer so repeat writes skip ClassLink', async () => {
    loadTaughtClassStudentUids.mockResolvedValue({
      uids: new Set<string>(),
      degraded: null,
    });
    const enrolled = defaultClassEnrollment(db);
    expect(await enrolled('t1', 'c1', 'u1')).toBe(false);
    expect(await enrolled('t1', 'c1', 'u2')).toBe(false);
    expect(loadTaughtClassStudentUids).toHaveBeenCalledTimes(1);
  });

  it('asks again after a degraded answer and throws so the event retries', async () => {
    const down = new RosterUnavailableError(new Error('down'));
    loadTaughtClassStudentUids.mockResolvedValue({
      uids: new Set<string>(),
      degraded: down,
    });
    const enrolled = defaultClassEnrollment(db);
    await expect(enrolled('t1', 'c1', 'u1')).rejects.toBe(down);
    await expect(enrolled('t1', 'c1', 'u1')).rejects.toBe(down);
    expect(loadTaughtClassStudentUids).toHaveBeenCalledTimes(2);
  });
});
