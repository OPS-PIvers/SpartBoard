import { describe, it, expect } from 'vitest';
import { acceptsItem, ownParentId } from './sourceFolders';

describe('source folder drop rules', () => {
  it('takes back only its own shared items', () => {
    expect(acceptsItem('source:building', 'building:a')).toBe(true);
    expect(acceptsItem('source:building', 'personal:a')).toBe(false);
    expect(acceptsItem('source:building', 'global:a')).toBe(false);
    expect(acceptsItem('source:global', 'global:a')).toBe(true);
    expect(acceptsItem('unit', 'personal:a')).toBe(true);
    expect(acceptsItem(null, 'building:a')).toBe(true);
  });

  it('never parents a new folder inside a source folder', () => {
    expect(ownParentId('source:building')).toBeNull();
    expect(ownParentId('unit')).toBe('unit');
    expect(ownParentId(null)).toBeNull();
  });
});
