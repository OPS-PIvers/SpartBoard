import type {
  Collection,
  Dashboard,
  LinkedCollectionBoard,
  LinkedCollectionSection,
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

/** The link doc's `sections` and `boards` for a Synced / View-Only share, root boards with no section. */
export function linkedCollectionLayout(
  tree: CopyShareTree,
  shareIdByBoard: Map<string, string>
): { sections: LinkedCollectionSection[]; boards: LinkedCollectionBoard[] } {
  const rootId = tree.sections[0]?.id;
  const siblingCount = new Map<string | null, number>();
  const sections: LinkedCollectionSection[] = [];
  for (const section of tree.sections.slice(1)) {
    const parentId =
      section.parentId && section.parentId !== rootId ? section.parentId : null;
    const order = siblingCount.get(parentId) ?? 0;
    siblingCount.set(parentId, order + 1);
    sections.push({
      id: section.id,
      name: section.name,
      parentId,
      order,
      ...(section.color !== undefined && { color: section.color }),
    });
  }
  const boards: LinkedCollectionBoard[] = [];
  for (const entry of tree.boardEntries) {
    const shareId = shareIdByBoard.get(entry.id);
    if (!shareId) continue;
    boards.push({
      shareId,
      name: entry.name,
      order: entry.order,
      ...(entry.sectionId !== rootId && { sectionId: entry.sectionId }),
    });
  }
  return { sections, boards };
}

const isLive = (c: Collection) =>
  !!c.linkedCollectionId && !c.linkedCollectionEnded;

/** True when the collection, a parent or a sub-collection is already in a live share. */
export function touchesLiveCollectionShare(
  collection: Collection,
  collections: Collection[]
): boolean {
  const byId = new Map(collections.map((c) => [c.id, c]));
  const seen = new Set<string>();
  for (
    let c: Collection | undefined = collection;
    c && !seen.has(c.id);
    c = c.parentCollectionId ? byId.get(c.parentCollectionId) : undefined
  ) {
    seen.add(c.id);
    if (isLive(c)) return true;
  }
  const queue = [collection.id];
  const visited = new Set(queue);
  while (queue.length > 0) {
    const parentId = queue.shift();
    for (const child of collections) {
      if (child.parentCollectionId !== parentId || visited.has(child.id)) {
        continue;
      }
      if (isLive(child)) return true;
      visited.add(child.id);
      queue.push(child.id);
    }
  }
  return false;
}
