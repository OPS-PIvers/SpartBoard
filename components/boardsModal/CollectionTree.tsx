import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { FolderOpen } from 'lucide-react';
import type { Collection, Dashboard } from '@/types';
import { CollectionTreeNode } from './CollectionTreeNode';
import { PinnedSection } from './PinnedSection';

interface CollectionTreeProps {
  collections: Collection[];
  boards: Dashboard[];
  selectedCollectionId: string | null;
  onSelectCollection: (id: string | null) => void;
}

export const CollectionTree: React.FC<CollectionTreeProps> = ({
  collections,
  boards,
  selectedCollectionId,
  onSelectCollection,
}) => {
  const { t } = useTranslation();

  // Group collections by parent for O(1) child lookup during recursive render.
  const childrenByParent = useMemo(() => {
    const m = new Map<string | null, Collection[]>();
    for (const c of collections) {
      const bucket = m.get(c.parentCollectionId) ?? [];
      bucket.push(c);
      m.set(c.parentCollectionId, bucket);
    }
    // Sort each bucket by `order`.
    for (const bucket of m.values()) {
      bucket.sort((a, b) => a.order - b.order);
    }
    return m;
  }, [collections]);

  const boardsByCollection = useMemo(() => {
    const m = new Map<string | null, Dashboard[]>();
    for (const b of boards) {
      const key = b.collectionId ?? null;
      const bucket = m.get(key) ?? [];
      bucket.push(b);
      m.set(key, bucket);
    }
    return m;
  }, [boards]);

  const rootCollections = childrenByParent.get(null) ?? [];
  const rootBoards = boardsByCollection.get(null) ?? [];
  const pinnedBoards = useMemo(
    () => boards.filter((b) => b.isPinned),
    [boards]
  );
  const isRootSelected = selectedCollectionId === null;

  return (
    <div className="w-72 shrink-0 border-r border-slate-200 bg-white overflow-y-auto custom-scrollbar flex flex-col">
      <PinnedSection
        pinnedBoards={pinnedBoards}
        selectedCollectionId={selectedCollectionId}
        onSelectCollection={onSelectCollection}
      />

      <div className="px-2 pt-3 pb-2 flex-1">
        <div className="flex items-center gap-1.5 px-2 mb-1.5">
          <FolderOpen className="w-3 h-3 text-slate-500" />
          <span className="text-xxs font-bold text-slate-500 uppercase tracking-widest">
            {t('boardsModal.allBoards', { defaultValue: 'Boards' })}
          </span>
        </div>

        {/* Root selector — clicking shows all root-level Boards in the grid */}
        <div
          className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-sm cursor-pointer transition-colors mb-1 ${
            isRootSelected
              ? 'bg-brand-blue-lighter text-brand-blue-primary font-bold'
              : 'text-slate-700 hover:bg-slate-100'
          }`}
          onClick={() => onSelectCollection(null)}
        >
          <span className="flex-1 truncate">
            {t('boardsModal.rootLabel', {
              defaultValue: 'All Boards (no Collection)',
            })}
          </span>
          <span className="text-xxs text-slate-400">{rootBoards.length}</span>
        </div>

        {rootCollections.map((node) => (
          <CollectionTreeNode
            key={node.id}
            node={node}
            childrenByParent={childrenByParent}
            boardsByCollection={boardsByCollection}
            selectedCollectionId={selectedCollectionId}
            onSelectCollection={onSelectCollection}
            depth={0}
          />
        ))}
      </div>
    </div>
  );
};
