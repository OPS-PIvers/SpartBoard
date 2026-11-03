import { describe, it, expect, afterEach } from 'vitest';
import {
  clearBoxSelection,
  getBoxSelection,
  setBoxSelection,
  toggleBoxSelected,
} from './boxSelectionStore';

describe('boxSelectionStore', () => {
  afterEach(clearBoxSelection);

  it('dedupes and keeps the same array when nothing changes', () => {
    setBoxSelection(['a', 'b', 'a']);
    const first = getBoxSelection();
    expect(first).toEqual(['a', 'b']);
    setBoxSelection(['a', 'b']);
    expect(getBoxSelection()).toBe(first);
  });

  it('toggles one widget in and out', () => {
    toggleBoxSelected('a');
    toggleBoxSelected('b');
    toggleBoxSelected('a');
    expect(getBoxSelection()).toEqual(['b']);
  });
});
