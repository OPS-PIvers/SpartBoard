import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import { doc, getDoc, increment, updateDoc } from 'firebase/firestore';

import {
  SHORT_LINKS_COLLECTION,
  recordShortLinkClick,
  resolveShortLink,
} from '@/utils/shortLinksApi';
import type { ShortLink } from '@/types';

vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  getDoc: vi.fn(),
  increment: vi.fn(),
  updateDoc: vi.fn(),
}));

vi.mock('@/config/firebase', () => ({
  db: { __brand: 'db' },
}));

const mockDoc = doc as Mock;
const mockGetDoc = getDoc as Mock;
const mockIncrement = increment as Mock;
const mockUpdateDoc = updateDoc as Mock;

const sampleLink: ShortLink = {
  code: 'abcd1234',
  destination: 'https://example.com/lesson',
  createdBy: 'uid-1',
  createdByEmail: 'teacher@school.org',
  createdAt: 1000,
  updatedAt: 2000,
  clicks: 5,
  lastClickedAt: 3000,
};

describe('shortLinksApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // doc() returns a ref we can assert on; increment() returns a sentinel.
    mockDoc.mockImplementation((_db: unknown, ...segments: string[]) => ({
      __ref: segments.join('/'),
    }));
    mockIncrement.mockImplementation((n: number) => ({ __increment: n }));
    mockUpdateDoc.mockResolvedValue(undefined);
  });

  it('exposes the canonical collection name', () => {
    expect(SHORT_LINKS_COLLECTION).toBe('short_links');
  });

  describe('resolveShortLink', () => {
    it('returns null when the code does not exist', async () => {
      mockGetDoc.mockResolvedValue({
        exists: () => false,
        data: () => undefined,
      });

      const result = await resolveShortLink('missing');

      expect(result).toBeNull();
      expect(mockDoc).toHaveBeenCalledWith(
        { __brand: 'db' },
        'short_links',
        'missing'
      );
      // A non-existent code must never surface stale data.
      expect(mockGetDoc).toHaveBeenCalledTimes(1);
    });

    it('returns the link data when the code exists', async () => {
      mockGetDoc.mockResolvedValue({
        exists: () => true,
        data: () => sampleLink,
      });

      const result = await resolveShortLink('abcd1234');

      expect(result).toEqual(sampleLink);
      expect(mockDoc).toHaveBeenCalledWith(
        { __brand: 'db' },
        'short_links',
        'abcd1234'
      );
    });

    it('propagates read errors instead of swallowing them', async () => {
      mockGetDoc.mockRejectedValue(new Error('offline'));

      await expect(resolveShortLink('abcd1234')).rejects.toThrow('offline');
    });
  });

  describe('recordShortLinkClick', () => {
    it('atomically increments clicks and stamps lastClickedAt', async () => {
      const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1234567890);

      await recordShortLinkClick('abcd1234');

      expect(mockDoc).toHaveBeenCalledWith(
        { __brand: 'db' },
        'short_links',
        'abcd1234'
      );
      expect(mockIncrement).toHaveBeenCalledWith(1);
      expect(mockUpdateDoc).toHaveBeenCalledTimes(1);
      const [, payload] = mockUpdateDoc.mock.calls[0] as [
        unknown,
        { clicks: unknown; lastClickedAt: number },
      ];
      expect(payload).toEqual({
        clicks: { __increment: 1 },
        lastClickedAt: 1234567890,
      });

      nowSpy.mockRestore();
    });

    it('rejects when the counter write fails (caller swallows it)', async () => {
      mockUpdateDoc.mockRejectedValue(new Error('permission-denied'));

      await expect(recordShortLinkClick('abcd1234')).rejects.toThrow(
        'permission-denied'
      );
    });
  });
});
