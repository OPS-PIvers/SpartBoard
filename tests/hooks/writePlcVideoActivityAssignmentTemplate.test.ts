/**
 * Unit test for writePlcVideoActivityAssignmentTemplate — Stream B task B5.
 *
 * Asserts:
 *   - The function writes a doc with the locked PlcVideoActivityEntry shape.
 *   - It uses the existing video_activities subcollection (fallback path —
 *     no dedicated VA-template collection exists on this branch).
 *   - On error, it logs (non-fatal) rather than throwing.
 *
 * Mocking: firebase/firestore (setDoc + doc) mocked via vi.hoisted pattern;
 * logError mocked.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoist mock factories so they are available when vi.mock runs
// ---------------------------------------------------------------------------

const { mockSetDoc, mockDoc } = vi.hoisted(() => ({
  mockSetDoc: vi.fn().mockResolvedValue(undefined),
  mockDoc: vi.fn((_db: unknown, ...pathParts: string[]) => ({
    path: pathParts.join('/'),
  })),
}));

const { mockLogError } = vi.hoisted(() => ({
  mockLogError: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('firebase/firestore', () => ({
  setDoc: mockSetDoc,
  doc: mockDoc,
  collection: vi.fn(),
  onSnapshot: vi.fn(),
  orderBy: vi.fn(),
  query: vi.fn(),
  deleteDoc: vi.fn(),
}));

vi.mock('@/config/firebase', () => ({
  db: { _mock: true },
  isAuthBypass: false,
}));

vi.mock('@/context/useAuth', () => ({
  useAuth: vi.fn(() => ({ user: null })),
}));

vi.mock('@/utils/logError', () => ({
  logError: mockLogError,
}));

vi.mock('@/utils/plcWriteNotifications', () => ({
  notifyPlcWriteFailure: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import {
  writePlcVideoActivityAssignmentTemplate,
  type WritePlcVideoActivityAssignmentTemplateInput,
} from '@/hooks/usePlcAssignments';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('writePlcVideoActivityAssignmentTemplate (B5)', () => {
  beforeEach(() => {
    mockSetDoc.mockClear();
    mockDoc.mockClear();
    mockLogError.mockClear();
    mockSetDoc.mockResolvedValue(undefined);
  });

  it('calls setDoc with the correct collection path (video_activities subcollection)', async () => {
    const input: WritePlcVideoActivityAssignmentTemplateInput = {
      plcVideoActivityId: 'va-tmpl-123',
      syncGroupId: 'sync-grp-456',
      title: 'Cell Division',
      youtubeUrl: 'https://youtube.com/watch?v=abc',
      questionCount: 5,
      sharedByName: 'Alice',
      sharedByEmail: 'alice@school.edu',
    };

    await writePlcVideoActivityAssignmentTemplate('plc-99', 'uid-a', input);

    expect(mockSetDoc).toHaveBeenCalledTimes(1);
    // mockDoc receives (db, collection, plcId, subcollection, docId)
    expect(mockDoc).toHaveBeenCalledWith(
      { _mock: true },
      'plcs',
      'plc-99',
      'video_activities',
      'va-tmpl-123'
    );
  });

  it('writes all required PlcVideoActivityEntry fields', async () => {
    const input: WritePlcVideoActivityAssignmentTemplateInput = {
      plcVideoActivityId: 'va-tmpl-999',
      syncGroupId: 'sync-grp-789',
      title: 'Forces & Motion',
      youtubeUrl: 'https://youtube.com/watch?v=xyz',
      questionCount: 3,
      sharedByName: 'Bob',
      sharedByEmail: 'bob@school.edu',
    };

    await writePlcVideoActivityAssignmentTemplate('plc-1', 'uid-b', input);

    const written = mockSetDoc.mock.calls[0][1] as Record<string, unknown>;
    expect(written.id).toBe('va-tmpl-999');
    expect(written.title).toBe('Forces & Motion');
    expect(written.youtubeUrl).toBe('https://youtube.com/watch?v=xyz');
    expect(written.questionCount).toBe(3);
    expect(written.syncGroupId).toBe('sync-grp-789');
    expect(written.sharedBy).toBe('uid-b');
    expect(written.sharedByEmail).toBe('bob@school.edu');
    expect(written.sharedByName).toBe('Bob');
    expect(typeof written.sharedAt).toBe('number');
    expect(typeof written.updatedAt).toBe('number');
  });

  it('logs the error and does not throw when setDoc fails', async () => {
    mockSetDoc.mockRejectedValueOnce(new Error('Firestore write failed'));

    const input: WritePlcVideoActivityAssignmentTemplateInput = {
      plcVideoActivityId: 'va-fail',
      syncGroupId: 'sync-fail',
      title: 'Fail Activity',
      youtubeUrl: '',
      questionCount: 0,
      sharedByName: '',
      sharedByEmail: '',
    };

    await expect(
      writePlcVideoActivityAssignmentTemplate('plc-1', 'uid-a', input)
    ).resolves.toBeUndefined();

    expect(mockLogError).toHaveBeenCalledTimes(1);
    expect(mockLogError.mock.calls[0][0]).toBe(
      'writePlcVideoActivityAssignmentTemplate.write'
    );
  });
});
