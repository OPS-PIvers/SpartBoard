import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useLibraryView } from './useLibraryView';

const options = (onViewModeChange: (m: 'grid' | 'list') => void) => ({
  items: [{ id: 'a' }],
  searchFields: (i: { id: string }) => i.id,
  sortComparators: {},
  onViewModeChange,
});

describe('useLibraryView view mode', () => {
  it('notifies once per real change, even under StrictMode', () => {
    const onViewModeChange = vi.fn();
    const { result } = renderHook(
      () => useLibraryView(options(onViewModeChange)),
      { wrapper: React.StrictMode }
    );
    act(() => result.current.toolbarProps.onViewModeChange?.('list'));
    expect(onViewModeChange).toHaveBeenCalledTimes(1);
    expect(onViewModeChange).toHaveBeenCalledWith('list');
    act(() => result.current.toolbarProps.onViewModeChange?.('list'));
    expect(onViewModeChange).toHaveBeenCalledTimes(1);
  });
});
