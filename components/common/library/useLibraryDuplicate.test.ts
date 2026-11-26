import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { useLibraryDuplicate } from './useLibraryDuplicate';

describe('useLibraryDuplicate', () => {
  it('toasts the copy title on success', async () => {
    const addToast = vi.fn();
    const { result } = renderHook(() =>
      useLibraryDuplicate({
        duplicate: () => Promise.resolve({ title: 'Unit 1 (Copy)' }),
        addToast,
      })
    );
    await act(() => result.current.duplicate({ id: 'a' }));
    expect(addToast).toHaveBeenCalledWith(
      'Duplicated as "Unit 1 (Copy)".',
      'success'
    );
  });

  it('ignores a second click while the first is running', async () => {
    let release!: () => void;
    const duplicate = vi.fn(
      () =>
        new Promise<{ title: string }>((done) => {
          release = () => done({ title: 'x' });
        })
    );
    const { result } = renderHook(() =>
      useLibraryDuplicate({ duplicate, addToast: vi.fn() })
    );
    let first!: Promise<void>;
    act(() => {
      first = result.current.duplicate({ id: 'a' });
    });
    expect(result.current.isDuplicating('a')).toBe(true);
    await act(() => result.current.duplicate({ id: 'a' }));
    release();
    await act(() => first);
    expect(duplicate).toHaveBeenCalledTimes(1);
  });

  it('uses the fixed error message when one is given', async () => {
    const addToast = vi.fn();
    const onError = vi.fn();
    const { result } = renderHook(() =>
      useLibraryDuplicate({
        duplicate: () => Promise.reject(new Error('raw')),
        addToast,
        errorMessage: 'Could not duplicate.',
        onError,
      })
    );
    await act(() => result.current.duplicate({ id: 'a' }));
    expect(addToast).toHaveBeenCalledWith('Could not duplicate.', 'error');
    expect(onError).toHaveBeenCalled();
  });
});
