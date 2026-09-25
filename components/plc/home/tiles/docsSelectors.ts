// Docs tile selector: newest shared docs and notes, merged into one list.

import type { PlcDoc, PlcMember, PlcNote } from '@/types';

export interface RecentDocItem {
  id: string;
  kind: 'doc' | 'note';
  /** The doc or note's own id. */
  sourceId: string;
  title: string;
  author: string;
  at: number;
}

export function selectRecentDocs(
  docs: readonly PlcDoc[],
  notes: readonly PlcNote[],
  members: readonly PlcMember[],
  limit: number
): RecentDocItem[] {
  const names = new Map<string, string>();
  for (const m of members) {
    names.set(m.uid, m.displayName?.trim() || m.email || '');
  }
  const items: RecentDocItem[] = [];
  for (const d of docs) {
    if (d.deletedAt != null) continue;
    items.push({
      id: `doc:${d.id}`,
      kind: 'doc',
      sourceId: d.id,
      title: d.title,
      author: d.createdByName
        ? d.createdByName
        : (names.get(d.createdBy) ?? ''),
      at: d.createdAt,
    });
  }
  for (const n of notes) {
    if (n.deletedAt != null) continue;
    items.push({
      id: `note:${n.id}`,
      kind: 'note',
      sourceId: n.id,
      title: n.title,
      author: names.get(n.lastEditedBy) ?? '',
      at: n.lastEditedAt,
    });
  }
  return items.sort((a, b) => b.at - a.at).slice(0, Math.max(0, limit));
}
