import React from 'react';
import { X } from 'lucide-react';
import {
  BLOOMS_COLORS,
  BLOOMS_LABELS,
  CATEGORY_LABELS,
  type BloomsLevel,
  type ContentCategory,
} from './constants';

interface CategoryPanelProps {
  level: BloomsLevel;
  categories: ContentCategory[];
  onSelect: (category: ContentCategory) => void;
  onClose: () => void;
}

export const CategoryPanel: React.FC<CategoryPanelProps> = ({
  level,
  categories,
  onSelect,
  onClose,
}) => {
  const color = BLOOMS_COLORS[level];
  const label = BLOOMS_LABELS[level];

  return (
    <div className="flex flex-col animate-in fade-in slide-in-from-bottom-2 duration-200">
      {/* Header */}
      <div
        className="flex items-center justify-between shrink-0"
        style={{
          backgroundColor: color,
          padding: 'min(6px, 1.5cqmin) min(10px, 2.5cqmin)',
          borderRadius: 'min(6px, 1.5cqmin)',
          marginBottom: 'min(8px, 1.5cqmin)',
        }}
      >
        <span
          className="font-bold text-white truncate"
          style={{
            fontSize: 'min(13px, 4cqmin)',
            textShadow: '0 1px 2px rgba(0,0,0,0.2)',
          }}
        >
          {label}
        </span>
        <button
          onClick={onClose}
          className="text-white/70 hover:text-white transition-colors shrink-0"
          aria-label="Close"
          style={{ padding: 'min(2px, 0.5cqmin)' }}
        >
          <X
            style={{ width: 'min(16px, 4cqmin)', height: 'min(16px, 4cqmin)' }}
          />
        </button>
      </div>

      {/* 2x3 grid of category buttons */}
      <div
        className="grid grid-cols-2"
        style={{
          gap: 'min(6px, 1.2cqmin)',
          padding: '0 min(4px, 1cqmin)',
        }}
      >
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => onSelect(cat)}
            className="text-white font-semibold rounded-lg transition-all duration-150 hover:brightness-110 active:scale-95 text-center"
            style={{
              backgroundColor: color + 'CC',
              fontSize: 'min(11px, 3.5cqmin)',
              padding: 'min(8px, 1.8cqmin) min(6px, 1.2cqmin)',
              border: '1px solid rgba(255,255,255,0.2)',
            }}
          >
            {CATEGORY_LABELS[cat]}
          </button>
        ))}
      </div>
    </div>
  );
};
