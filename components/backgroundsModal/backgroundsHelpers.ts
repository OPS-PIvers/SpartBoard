import { BackgroundPreset } from '@/types';
import { extractYouTubeId } from '@/utils/youtube';

export type BackgroundType =
  | 'all'
  | 'still'
  | 'video'
  | 'color'
  | 'pattern'
  | 'gradient'
  | 'upload';

export interface BackgroundItem {
  id: string;
  label: string;
  type: BackgroundType;
  thumbnailUrl?: string;
  tags: string[];
  category?: string;
}

export function inferType(preset: BackgroundPreset): BackgroundType {
  return extractYouTubeId(preset.url) ? 'video' : 'still';
}

export function filterByType(
  items: BackgroundItem[],
  type: BackgroundType
): BackgroundItem[] {
  if (type === 'all') return items;
  return items.filter((i) => i.type === type);
}

export function filterByTags(
  items: BackgroundItem[],
  selectedTags: string[]
): BackgroundItem[] {
  if (selectedTags.length === 0) return items;
  const sel = new Set(selectedTags);
  return items.filter((i) => i.tags.some((t) => sel.has(t)));
}

export function filterBySearch(
  items: BackgroundItem[],
  query: string
): BackgroundItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter(
    (i) =>
      i.label.toLowerCase().includes(q) ||
      (i.category !== undefined && i.category.toLowerCase().includes(q)) ||
      i.tags.some((t) => t.toLowerCase().includes(q))
  );
}

export function uniqueTagsOf(items: BackgroundItem[]): string[] {
  const set = new Set<string>();
  for (const item of items) for (const tag of item.tags) set.add(tag);
  return [...set].sort();
}
