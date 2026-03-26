import React from 'react';
import { CustomBlockType } from '@/types';
import {
  BLOCK_CATEGORIES,
  BLOCK_ICONS,
  BLOCK_LABELS,
} from '@/components/widgets/CustomWidget/types';

interface BlockPaletteProps {
  onSelectBlock: (blockType: CustomBlockType) => void;
}

const BLOCK_DESCRIPTIONS: Record<CustomBlockType, string> = {
  text: 'Static text content',
  heading: 'Large title text',
  image: 'Display an image',
  reveal: 'Hidden content revealed by trigger',
  'flip-card': 'Two-sided flip card',
  'conditional-label': 'Text changed by connections',
  badge: 'Earned achievement badge',
  'traffic-light': 'Red/yellow/green indicator',
  divider: 'Horizontal line',
  spacer: 'Empty spacing',
  'cb-button': 'Clickable action button',
  counter: 'Number with +/- controls',
  toggle: 'On/off switch',
  stars: 'Star rating 1-5',
  'text-input': 'Text entry field',
  poll: 'Multiple choice voting',
  'multiple-choice': 'Quiz question with correct answer',
  'match-pair': 'Connect matching pairs',
  hotspot: 'Clickable image areas',
  'sort-bin': 'Drag items to categories',
  progress: 'Progress bar',
  timer: 'Countdown timer',
  score: 'Running score display',
  checklist: 'Checkable to-do list',
};

export const BlockPalette: React.FC<BlockPaletteProps> = ({
  onSelectBlock,
}) => {
  return (
    <div className="flex flex-col gap-4 overflow-y-auto">
      {BLOCK_CATEGORIES.map((category) => (
        <div key={category.id}>
          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 px-1">
            {category.label}
          </h4>
          <div className="grid grid-cols-2 gap-1.5">
            {category.blocks.map((blockType) => (
              <button
                key={blockType}
                type="button"
                onClick={() => onSelectBlock(blockType)}
                className="flex items-start gap-2 p-2 rounded-lg bg-slate-700/60 hover:bg-slate-600/60 border border-slate-600 hover:border-slate-500 text-left transition-colors group"
              >
                <span className="text-lg leading-none mt-0.5 shrink-0">
                  {BLOCK_ICONS[blockType]}
                </span>
                <div className="min-w-0">
                  <div className="text-xs font-medium text-slate-200 group-hover:text-white truncate">
                    {BLOCK_LABELS[blockType]}
                  </div>
                  <div className="text-xs text-slate-500 leading-tight mt-0.5 line-clamp-1">
                    {BLOCK_DESCRIPTIONS[blockType]}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};
