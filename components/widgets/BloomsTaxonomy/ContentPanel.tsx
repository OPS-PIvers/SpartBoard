import React from 'react';
import { ArrowLeft, Plus } from 'lucide-react';
import {
  BLOOMS_COLORS,
  BLOOMS_LABELS,
  CATEGORY_LABELS,
  type BloomsLevel,
  type ContentCategory,
} from './constants';

interface ContentPanelProps {
  level: BloomsLevel;
  category: ContentCategory;
  items: string[];
  categories: ContentCategory[];
  onCategoryChange: (category: ContentCategory) => void;
  onBack: () => void;
  onAddToBoard: () => void;
}

export const ContentPanel: React.FC<ContentPanelProps> = ({
  level,
  category,
  items,
  categories,
  onCategoryChange,
  onBack,
  onAddToBoard,
}) => {
  const color = BLOOMS_COLORS[level];
  const levelLabel = BLOOMS_LABELS[level];
  const catLabel = CATEGORY_LABELS[category];

  return (
    <div className="flex flex-col h-full animate-in fade-in slide-in-from-right-2 duration-200">
      {/* Header with back button */}
      <div
        className="flex items-center shrink-0"
        style={{
          backgroundColor: color,
          padding: 'min(6px, 1.5cqmin) min(10px, 2.5cqmin)',
          borderRadius: 'min(6px, 1.5cqmin)',
          marginBottom: 'min(6px, 1.2cqmin)',
          gap: 'min(4px, 1cqmin)',
        }}
      >
        <button
          onClick={onBack}
          className="text-white/70 hover:text-white transition-colors shrink-0"
          aria-label="Back"
          style={{ padding: 'min(2px, 0.5cqmin)' }}
        >
          <ArrowLeft
            style={{
              width: 'min(16px, 4cqmin)',
              height: 'min(16px, 4cqmin)',
            }}
          />
        </button>
        <span
          className="font-bold text-white truncate"
          style={{
            fontSize: 'min(12px, 3.5cqmin)',
            textShadow: '0 1px 2px rgba(0,0,0,0.2)',
          }}
        >
          {levelLabel}
          <span className="font-normal text-white/70"> &rsaquo; </span>
          {catLabel}
        </span>
      </div>

      {/* Category chip row for switching */}
      <div
        className="flex flex-wrap shrink-0"
        style={{
          gap: 'min(4px, 0.8cqmin)',
          padding: '0 min(4px, 1cqmin)',
          marginBottom: 'min(6px, 1.2cqmin)',
        }}
      >
        {categories.map((cat) => {
          const isSelected = cat === category;
          return (
            <button
              key={cat}
              onClick={() => onCategoryChange(cat)}
              aria-pressed={isSelected}
              className="rounded-full font-medium transition-all duration-150 active:scale-95"
              style={{
                fontSize: 'min(10px, 3cqmin)',
                padding: 'min(3px, 0.7cqmin) min(8px, 2cqmin)',
                backgroundColor: isSelected ? color : 'transparent',
                color: isSelected ? 'white' : 'rgba(255,255,255,0.6)',
                border: isSelected
                  ? '1px solid rgba(255,255,255,0.3)'
                  : '1px solid rgba(255,255,255,0.15)',
              }}
            >
              {CATEGORY_LABELS[cat]}
            </button>
          );
        })}
      </div>

      {/* Scrollable content list */}
      <div
        className="flex-1 min-h-0 overflow-y-auto custom-scrollbar"
        style={{ padding: '0 min(4px, 1cqmin)' }}
      >
        <ul className="flex flex-col" style={{ gap: 'min(4px, 0.8cqmin)' }}>
          {items.map((item, index) => (
            <li
              key={`${level}-${category}-${index}`}
              className="flex items-start text-white/90"
              style={{
                fontSize: 'min(12px, 3.5cqmin)',
                lineHeight: '1.4',
                gap: 'min(6px, 1.2cqmin)',
              }}
            >
              <span
                className="shrink-0 rounded-full"
                style={{
                  width: 'min(5px, 1.2cqmin)',
                  height: 'min(5px, 1.2cqmin)',
                  backgroundColor: color,
                  marginTop: 'min(6px, 1.5cqmin)',
                }}
              />
              {item}
            </li>
          ))}
        </ul>
      </div>

      {/* Add to Board button */}
      <div
        className="shrink-0"
        style={{
          padding: 'min(8px, 1.5cqmin) min(4px, 1cqmin)',
          paddingBottom: 'min(4px, 1cqmin)',
        }}
      >
        <button
          onClick={onAddToBoard}
          className="w-full flex items-center justify-center font-semibold text-white rounded-lg transition-all duration-150 hover:brightness-110 active:scale-[0.98]"
          style={{
            backgroundColor: color,
            fontSize: 'min(11px, 3.5cqmin)',
            padding: 'min(8px, 1.8cqmin)',
            gap: 'min(6px, 1.2cqmin)',
            border: '1px solid rgba(255,255,255,0.2)',
          }}
        >
          <Plus
            style={{
              width: 'min(14px, 3.5cqmin)',
              height: 'min(14px, 3.5cqmin)',
            }}
          />
          Add to Board
        </button>
      </div>
    </div>
  );
};
