import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { classLinkService } from '@/utils/classlinkService';
import { httpsCallable } from 'firebase/functions';
import { ClassLinkData } from '@/types';

vi.mock('firebase/functions', () => ({
  httpsCallable: vi.fn(),
  getFunctions: vi.fn(),
}));

vi.mock('@/config/firebase', () => ({
  functions: {},
}));

describe('ClassLinkService', () => {
  const mockClassLinkData: ClassLinkData = {
    classes: [
      {
        sourcedId: 'class-1',
        title: 'Math 101',
        subject: 'Math',
      },
    ],
    studentsByClass: {
      'class-1': [
        {
          sourcedId: 'student-1',
          givenName: 'Alice',
          familyName: 'Smith',
          email: 'alice@example.com',
        },
      ],
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    classLinkService.clearCache();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('fetches rosters and caches them', async () => {
    const mockHttpsCallable = vi
      .fn()
      .mockResolvedValue({ data: mockClassLinkData });
    (httpsCallable as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      mockHttpsCallable
    );

    const result = await classLinkService.getRosters();

    expect(result).toEqual(mockClassLinkData);
    expect(httpsCallable).toHaveBeenCalledWith(
      expect.anything(),
      'getClassLinkRosterV1'
    );
    expect(mockHttpsCallable).toHaveBeenCalledTimes(1);

    // Call again within TTL, should return cached data and not call httpsCallable
    const cachedResult = await classLinkService.getRosters();
    expect(cachedResult).toEqual(mockClassLinkData);
    expect(mockHttpsCallable).toHaveBeenCalledTimes(1); // Still 1
  });

  it('fetches rosters and ignores cache if forceRefresh is true', async () => {
    const mockHttpsCallable = vi
      .fn()
      .mockResolvedValue({ data: mockClassLinkData });
    (httpsCallable as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      mockHttpsCallable
    );

    await classLinkService.getRosters();
    expect(mockHttpsCallable).toHaveBeenCalledTimes(1);

    // Call again with forceRefresh = true
    await classLinkService.getRosters(true);
    expect(mockHttpsCallable).toHaveBeenCalledTimes(2);
  });

  it('refetches rosters if cache TTL has expired', async () => {
    const mockHttpsCallable = vi
      .fn()
      .mockResolvedValue({ data: mockClassLinkData });
    (httpsCallable as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      mockHttpsCallable
    );

    await classLinkService.getRosters();
    expect(mockHttpsCallable).toHaveBeenCalledTimes(1);

    // Advance time by 6 minutes (TTL is 5 minutes)
    vi.advanceTimersByTime(6 * 60 * 1000);

    // Call again, should refetch
    await classLinkService.getRosters();
    expect(mockHttpsCallable).toHaveBeenCalledTimes(2);
  });

  it('throws error when fetching fails', async () => {
    const mockError = new Error('Function failed');
    const mockHttpsCallable = vi.fn().mockRejectedValue(mockError);
    (httpsCallable as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      mockHttpsCallable
    );

    await expect(classLinkService.getRosters()).rejects.toThrow(
      'Function failed'
    );
  });
});
