import { describe, it, expect } from 'vitest';
import {
  inferType,
  filterByType,
  filterByTags,
  filterBySearch,
  uniqueTagsOf,
  BackgroundItem,
} from '@/components/backgroundsModal/backgroundsHelpers';
import { BackgroundPreset } from '@/types';

const makePreset = (
  over: Partial<BackgroundPreset> = {}
): BackgroundPreset => ({
  id: 'p1',
  url: 'https://example.com/p1.jpg',
  label: 'Preset 1',
  active: true,
  accessLevel: 'public',
  betaUsers: [],
  createdAt: 0,
  ...over,
});

const makeItem = (over: Partial<BackgroundItem> = {}): BackgroundItem => ({
  id: 'i1',
  label: 'Item 1',
  type: 'still',
  tags: [],
  ...over,
});

describe('inferType', () => {
  it('returns "video" for YouTube URLs', () => {
    expect(
      inferType(makePreset({ url: 'https://youtube.com/watch?v=dQw4w9WgXcY' }))
    ).toBe('video');
    expect(inferType(makePreset({ url: 'https://youtu.be/dQw4w9WgXcY' }))).toBe(
      'video'
    );
  });

  it('returns "still" for image URLs', () => {
    expect(
      inferType(makePreset({ url: 'https://example.com/photo.jpg' }))
    ).toBe('still');
  });
});

describe('filterByType', () => {
  it('returns all items when type is "all"', () => {
    const items = [
      makeItem({ id: 'a', type: 'still' }),
      makeItem({ id: 'b', type: 'video' }),
    ];
    expect(filterByType(items, 'all')).toHaveLength(2);
  });

  it('filters to matching type', () => {
    const items = [
      makeItem({ id: 'a', type: 'still' }),
      makeItem({ id: 'b', type: 'video' }),
    ];
    expect(filterByType(items, 'video')).toEqual([items[1]]);
  });
});

describe('filterByTags', () => {
  it('returns all when no tags selected', () => {
    const items = [
      makeItem({ id: 'a', tags: ['calm'] }),
      makeItem({ id: 'b', tags: [] }),
    ];
    expect(filterByTags(items, [])).toHaveLength(2);
  });

  it('returns items matching ANY selected tag (union)', () => {
    const items = [
      makeItem({ id: 'a', tags: ['calm', 'holiday'] }),
      makeItem({ id: 'b', tags: ['holiday'] }),
      makeItem({ id: 'c', tags: ['nature'] }),
    ];
    expect(filterByTags(items, ['holiday']).map((i) => i.id)).toEqual([
      'a',
      'b',
    ]);
    expect(filterByTags(items, ['calm', 'nature']).map((i) => i.id)).toEqual([
      'a',
      'c',
    ]);
  });
});

describe('filterBySearch', () => {
  it('returns all when query is empty or whitespace', () => {
    const items = [
      makeItem({ id: 'a', label: 'Forest' }),
      makeItem({ id: 'b', label: 'Ocean' }),
    ];
    expect(filterBySearch(items, '')).toHaveLength(2);
    expect(filterBySearch(items, '  ')).toHaveLength(2);
  });

  it('matches label case-insensitively', () => {
    const items = [
      makeItem({ id: 'a', label: 'Forest' }),
      makeItem({ id: 'b', label: 'Ocean' }),
    ];
    expect(filterBySearch(items, 'for').map((i) => i.id)).toEqual(['a']);
  });

  it('matches category', () => {
    const items = [
      makeItem({ id: 'a', category: 'Nature' }),
      makeItem({ id: 'b', category: 'Seasons' }),
    ];
    expect(filterBySearch(items, 'nature').map((i) => i.id)).toEqual(['a']);
  });

  it('matches tags', () => {
    const items = [
      makeItem({ id: 'a', tags: ['calm'] }),
      makeItem({ id: 'b', tags: ['energetic'] }),
    ];
    expect(filterBySearch(items, 'calm').map((i) => i.id)).toEqual(['a']);
  });
});

describe('uniqueTagsOf', () => {
  it('returns deduped sorted tag union', () => {
    const items = [
      makeItem({ tags: ['calm', 'holiday'] }),
      makeItem({ tags: ['holiday', 'nature'] }),
    ];
    expect(uniqueTagsOf(items)).toEqual(['calm', 'holiday', 'nature']);
  });

  it('returns empty array when no tags', () => {
    expect(uniqueTagsOf([makeItem({ tags: [] })])).toEqual([]);
  });
});
