// Resource grouping for the `resourcesByCategory` card.

import { useMemo } from 'react';
import { usePlcDocs } from '@/hooks/usePlcDocs';
import { usePlcResources } from '@/hooks/usePlcResources';
import type { PlcDoc, PlcResource, PlcResourceKind } from '@/types';

export interface ResourceItem {
  id: string;
  title: string;
  /** Opens in a new tab; otherwise the item opens the Resources page. */
  url?: string;
}

export interface ResourceCategory {
  label: string;
  items: ResourceItem[];
}

export const PER_CATEGORY = 3;

// Same labels as the Resources page (PlcResourcesBody KIND_META).
const KIND_LABELS: [PlcResourceKind, string][] = [
  ['doc', 'Documents'],
  ['quiz', 'Quizzes'],
  ['video-activity', 'Video Activities'],
  ['assignment', 'Assignments'],
  ['board', 'Boards'],
];

export function groupResources(
  docs: PlcDoc[],
  resources: PlcResource[]
): ResourceCategory[] {
  const out: ResourceCategory[] = [];
  for (const [kind, label] of KIND_LABELS) {
    const items: ResourceItem[] =
      kind === 'doc'
        ? docs
            .filter((d) => !d.deletedAt)
            .map((d) => ({ id: d.id, title: d.title, url: d.url }))
        : [];
    for (const r of resources) {
      if (r.kind !== kind) continue;
      items.push({
        id: r.id,
        title: r.title,
        ...(kind === 'doc' && /^https:\/\//.test(r.refId)
          ? { url: r.refId }
          : {}),
      });
    }
    if (items.length > 0) out.push({ label, items });
  }
  return out;
}

export function useResourceCategories(plcId: string): ResourceCategory[] {
  const { docs } = usePlcDocs(plcId);
  const { resources } = usePlcResources({ plcId });
  return useMemo(() => groupResources(docs, resources), [docs, resources]);
}
