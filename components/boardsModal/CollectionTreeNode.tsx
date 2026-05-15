import React, { useState } from 'react';
import { ChevronRight, Folder } from 'lucide-react';
import type { Collection, Dashboard } from '@/types';

interface CollectionTreeNodeProps {
  node: Collection;
  childrenByParent: Map<string | null, Collection[]>;
  boardsByCollection: Map<string | null, Dashboard[]>;
  selectedCollectionId: string | null;
  onSelectCollection: (id: string | null) => void;
  depth: number;
}

export const CollectionTreeNode: React.FC<CollectionTreeNodeProps> = ({
  node,
  childrenByParent,
  boardsByCollection,
  selectedCollectionId,
  onSelectCollection,
  depth,
}) => {
  const [isExpanded, setIsExpanded] = useState(depth < 1);
  const children = childrenByParent.get(node.id) ?? [];
  const boardCount = (boardsByCollection.get(node.id) ?? []).length;
  const totalCount = boardCount + children.length;
  const isSelected = selectedCollectionId === node.id;
  const hasChildren = children.length > 0;

  return (
    <div>
      <div
        className={`flex items-center gap-1 px-1 py-1 rounded-md text-sm cursor-pointer transition-colors ${
          isSelected
            ? 'bg-brand-blue-lighter text-brand-blue-primary font-bold'
            : 'text-slate-700 hover:bg-slate-100'
        }`}
        style={{ paddingLeft: `${0.25 + depth * 0.75}rem` }}
        onClick={() => onSelectCollection(node.id)}
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            setIsExpanded((v) => !v);
          }}
          aria-label={isExpanded ? 'Collapse' : 'Expand'}
          className={`shrink-0 p-0.5 rounded hover:bg-slate-200 ${
            hasChildren ? 'visible' : 'invisible'
          }`}
        >
          <ChevronRight
            className={`w-3.5 h-3.5 transition-transform ${
              isExpanded ? 'rotate-90' : ''
            }`}
          />
        </button>
        <Folder
          className="w-3.5 h-3.5 shrink-0"
          style={node.color ? { color: node.color } : undefined}
        />
        <span className="flex-1 truncate">{node.name}</span>
        {totalCount > 0 && (
          <span className="text-xxs text-slate-400">{totalCount}</span>
        )}
      </div>

      {isExpanded && children.length > 0 && (
        <div>
          {children.map((child) => (
            <CollectionTreeNode
              key={child.id}
              node={child}
              childrenByParent={childrenByParent}
              boardsByCollection={boardsByCollection}
              selectedCollectionId={selectedCollectionId}
              onSelectCollection={onSelectCollection}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
};
