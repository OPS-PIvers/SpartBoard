import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

const getDoc = vi.fn();
const setDoc = vi.fn();
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...path: string[]) => ({ path: path.join('/') }),
  getDoc: (...args: unknown[]) => getDoc(...args) as unknown,
  setDoc: (...args: unknown[]) => setDoc(...args) as unknown,
}));
vi.mock('@/config/firebase', () => ({ db: {}, isAuthBypass: false }));
vi.mock('@/utils/viewAsTab', () => ({
  viewAsBlocksWrite: () => false,
  viewAsAuditsWrite: () => false,
}));

import { useResultsPrintChoice } from './useResultsPrintChoice';
import { applyPreset } from '@/utils/quizResultsPrintPresets';

const same = <T>(c: T) => c;

describe('useResultsPrintChoice', () => {
  beforeEach(() => {
    localStorage.clear();
    getDoc.mockReset();
    setDoc.mockReset().mockResolvedValue(undefined);
  });

  it('takes the choice saved on the account', async () => {
    getDoc.mockResolvedValue({
      data: () => ({
        resultsPrintChoice: {
          preset: null,
          options: { ...applyPreset('full-report'), showScore: false },
        },
      }),
    });
    const { result } = renderHook(() =>
      useResultsPrintChoice('t1', 'full-report', same)
    );
    expect(result.current[0].preset).toBe('full-report');
    await waitFor(() => expect(result.current[0].preset).toBeNull());
    expect(result.current[0].options.showScore).toBe(false);
  });

  it('saves a change to the account, replacing the whole field', async () => {
    getDoc.mockResolvedValue({ data: () => undefined });
    const { result } = renderHook(() =>
      useResultsPrintChoice('t1', 'full-report', same)
    );
    const next = {
      preset: 'missed-only' as const,
      options: applyPreset('missed-only'),
    };
    act(() => result.current[1](next));
    expect(result.current[0]).toEqual(next);
    await waitFor(() => expect(setDoc).toHaveBeenCalled());
    const [ref, data, opts] = setDoc.mock.calls[0] as unknown[];
    expect(ref).toEqual({ path: 'users/t1/userProfile/profile' });
    expect(data).toEqual({ resultsPrintChoice: next });
    expect(opts).toEqual({ mergeFields: ['resultsPrintChoice'] });
  });

  it('keeps a change made before the account copy arrives', async () => {
    let resolve: (v: unknown) => void = () => undefined;
    getDoc.mockReturnValue(new Promise((r) => (resolve = r)));
    const { result } = renderHook(() =>
      useResultsPrintChoice('t1', 'full-report', same)
    );
    act(() =>
      result.current[1]({
        preset: 'student-copy',
        options: applyPreset('student-copy'),
      })
    );
    await act(() => {
      resolve({
        data: () => ({
          resultsPrintChoice: {
            preset: 'missed-only',
            options: applyPreset('missed-only'),
          },
        }),
      });
      return Promise.resolve();
    });
    expect(result.current[0].preset).toBe('student-copy');
  });
});
