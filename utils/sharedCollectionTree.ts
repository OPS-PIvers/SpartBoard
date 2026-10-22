import type {
  Collection,
  Dashboard,
  SharedCollectionBoardEntry,
  SharedCollectionSection,
} from '@/types';
import type { CopyShareTree } from '@/hooks/useSharedCollection';
import { flattenSharedCollection } from './subShareSnapshot';

/** A collection's boards and sub-collection tree for its Share dialog (D1). */
export function shareCollectionTree(
  collection: Collection,
  collections: Collection[],
  dashboards: Dashboard[]
): { boards: Dashboard[]; tree: CopyShareTree } {
  const flat = flattenSharedCollection(collection, collections, dashboards);
  return {
    boards: flat.orderedBoards,
    tree: { sections: flat.sections, boardEntries: flat.boards },
  };
}

export interface CopyImportTree {
  /** Sub-collections to create, each after its parent; `parentId` null means the imported root. */
  children: {
    id: string;
    name: string;
    color?: string;
    parentId: string | null;
  }[];
  /** Board id to the section it sits in; boards missing here go in the root. */
  sectionOf: Map<string, string>;
}

/** Plans the sub-collections a copy import rebuilds from a share's flat section list (COLLECTION_SHARING D1). */
export function planCopyImportTree(share: {
  sections?: SharedCollectionSection[];
  boards?: SharedCollectionBoardEntry[];
}): CopyImportTree {
  const sections = Array.isArray(share.sections) ? share.sections : [];
  const rootId = sections[0]?.id;
  const placed = new Set<string>();
  const children: CopyImportTree['children'] = [];
  for (const section of sections.slice(1)) {
    if (typeof section?.id !== 'string' || placed.has(section.id)) continue;
    if (section.id === rootId) continue;
    const parentId =
      section.parentId && placed.has(section.parentId)
        ? section.parentId
        : null;
    placed.add(section.id);
    children.push({
      id: section.id,
      name:
        typeof section.name === 'string' && section.name.trim()
          ? section.name
          : 'Collection',
      ...(typeof section.color === 'string' && { color: section.color }),
      parentId,
    });
  }
  const sectionOf = new Map<string, string>();
  for (const entry of Array.isArray(share.boards) ? share.boards : []) {
    if (
      typeof entry?.id === 'string' &&
      typeof entry.sectionId === 'string' &&
      placed.has(entry.sectionId)
    ) {
      sectionOf.set(entry.id, entry.sectionId);
    }
  }
  return { children, sectionOf };
}
