import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useQuizCapabilities } from '@/hooks/useQuizCapabilities';

const canAccessFeature = vi.fn<(id: string) => boolean>();
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ canAccessFeature }),
}));

const allow = (ids: string[]) =>
  canAccessFeature.mockImplementation((id) => ids.includes(id));

describe('useQuizCapabilities', () => {
  beforeEach(() => canAccessFeature.mockReset());

  it('is all false when nothing is granted', () => {
    allow([]);
    const { result } = renderHook(() => useQuizCapabilities());
    expect(result.current).toEqual({
      districtLibraryOn: false,
      canUseQuizAi: false,
      canImportFromSchoology: false,
    });
  });

  it('maps each boolean to its feature ids', () => {
    allow(['district-library']);
    expect(
      renderHook(() => useQuizCapabilities()).result.current.districtLibraryOn
    ).toBe(true);
    allow(['schoology-quiz-import']);
    expect(
      renderHook(() => useQuizCapabilities()).result.current
        .canImportFromSchoology
    ).toBe(true);
  });

  it('canUseQuizAi needs both gemini-functions and quiz', () => {
    const run = () => renderHook(() => useQuizCapabilities()).result.current;
    allow(['gemini-functions']);
    expect(run().canUseQuizAi).toBe(false);
    allow(['quiz']);
    expect(run().canUseQuizAi).toBe(false);
    allow(['gemini-functions', 'quiz']);
    expect(run().canUseQuizAi).toBe(true);
  });
});
