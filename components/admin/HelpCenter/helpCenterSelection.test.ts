import { afterEach, describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import {
  HELP_CENTER_SELECTION_KEY,
  readHelpCenterSelection,
  useHelpCenterSelection,
  writeHelpCenterSelection,
} from './helpCenterSelection';

afterEach(() => writeHelpCenterSelection(null));

describe('helpCenterSelection', () => {
  it('keeps the selection in storage so a reload lands on it', () => {
    writeHelpCenterSelection('item-1');
    expect(window.localStorage.getItem(HELP_CENTER_SELECTION_KEY)).toBe(
      'item-1'
    );
    expect(readHelpCenterSelection()).toBe('item-1');
  });

  it('updates subscribers when another surface selects an item', () => {
    const { result } = renderHook(() => useHelpCenterSelection());
    expect(result.current[0]).toBeNull();
    act(() => writeHelpCenterSelection('item-2'));
    expect(result.current[0]).toBe('item-2');
  });
});
