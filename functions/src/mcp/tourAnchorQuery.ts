// list_tour_anchors: a namespace summary with no filter, else one page of matching anchors.
import { TOUR_ANCHOR_LIST, type TourAnchorEntry } from './tourAnchorList';

export const ANCHOR_PAGE = 100;

export interface AnchorQuery {
  search?: string;
  namespace?: string;
  surface?: string;
  scope?: TourAnchorEntry['scope'];
  widget_type?: string;
  cursor?: string;
}

const namespaceOf = (id: string) => id.split('.')[0];

const onWidget = (a: TourAnchorEntry, type: string) =>
  (a.routes ?? []).some((r) => r.widget_type === type) ||
  (a.keys ?? []).some((k) => k === type || k.startsWith(`${type}#`));

export function queryTourAnchors(
  q: AnchorQuery,
  list: readonly TourAnchorEntry[] = TOUR_ANCHOR_LIST
) {
  if (!q.search && !q.namespace && !q.surface && !q.scope && !q.widget_type) {
    const byNamespace = new Map<string, TourAnchorEntry[]>();
    for (const a of list) {
      const ns = namespaceOf(a.id);
      byNamespace.set(ns, [...(byNamespace.get(ns) ?? []), a]);
    }
    return {
      anchor_count: list.length,
      namespaces: [...byNamespace]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([namespace, anchors]) => ({
          namespace,
          count: anchors.length,
          example: anchors[0].label,
        })),
      note: 'Pass namespace, surface, search, scope or widget_type to list anchors.',
    };
  }
  const words = (q.search ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  const matches = list.filter(
    (a) =>
      words.every((w) => `${a.id} ${a.label}`.toLowerCase().includes(w)) &&
      (!q.namespace || namespaceOf(a.id) === q.namespace) &&
      (!q.scope || a.scope === q.scope) &&
      (!q.surface ||
        (a.routes ?? []).some(
          (r) =>
            r.surface === q.surface || r.surface.startsWith(`${q.surface}.`)
        )) &&
      (!q.widget_type || onWidget(a, q.widget_type))
  );
  const start = Math.max(0, Number(q.cursor) || 0);
  const anchors = matches.slice(start, start + ANCHOR_PAGE);
  return {
    count: matches.length,
    anchors,
    next_cursor:
      start + ANCHOR_PAGE < matches.length ? String(start + ANCHOR_PAGE) : null,
  };
}
