import React from 'react';
import { BackgroundItem } from './backgroundsHelpers';
import { BackgroundThumbnail } from './BackgroundThumbnail';

interface BackgroundsGridProps {
  items: BackgroundItem[];
  activeId?: string;
  favoriteIds: string[];
  onSelect: (id: string) => void;
  onToggleFavorite: (id: string) => void;
  emptyState?: React.ReactNode;
}

export const BackgroundsGrid: React.FC<BackgroundsGridProps> = ({
  items,
  activeId,
  favoriteIds,
  onSelect,
  onToggleFavorite,
  emptyState,
}) => {
  if (items.length === 0 && emptyState) return <>{emptyState}</>;

  const favSet = new Set(favoriteIds);

  return (
    <div className="grid grid-cols-4 gap-3 p-4">
      {items.map((item) => (
        <BackgroundThumbnail
          key={item.id}
          item={item}
          isActive={item.id === activeId}
          isFavorite={favSet.has(item.id)}
          onSelect={onSelect}
          onToggleFavorite={onToggleFavorite}
        />
      ))}
    </div>
  );
};
