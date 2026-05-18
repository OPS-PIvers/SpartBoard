import React from 'react';
import { useTranslation } from 'react-i18next';
import { Search } from 'lucide-react';
import { BackgroundType } from './backgroundsHelpers';

interface BackgroundsFilterBarProps {
  search: string;
  onSearchChange: (v: string) => void;
  type: BackgroundType;
  onTypeChange: (t: BackgroundType) => void;
  availableTypes: BackgroundType[]; // hide chips that don't apply to current rail section
  tags: string[];
  selectedTags: string[];
  onToggleTag: (tag: string) => void;
}

const TYPE_LABELS: Record<BackgroundType, string> = {
  all: 'All',
  still: 'Stills',
  video: 'Video',
  color: 'Colors',
  pattern: 'Patterns',
  gradient: 'Gradients',
  upload: 'Uploads',
};

export const BackgroundsFilterBar: React.FC<BackgroundsFilterBarProps> = ({
  search,
  onSearchChange,
  type,
  onTypeChange,
  availableTypes,
  tags,
  selectedTags,
  onToggleTag,
}) => {
  const { t } = useTranslation();

  return (
    <div className="sticky top-0 z-10 bg-white border-b border-slate-100 px-4 py-3 flex flex-col gap-2">
      <div className="relative">
        <Search
          size={14}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
        />
        <input
          type="search"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={t('backgrounds.searchPlaceholder', {
            defaultValue: 'Search backgrounds…',
          })}
          className="w-full pl-8 pr-3 py-1.5 text-sm bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-brand-blue-primary focus:ring-2 focus:ring-brand-blue-primary/20"
        />
      </div>

      {availableTypes.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {availableTypes.map((tt) => (
            <button
              key={tt}
              type="button"
              onClick={() => onTypeChange(tt)}
              className={`px-2.5 py-1 text-xxs font-bold uppercase tracking-wider rounded-full transition-colors ${
                type === tt
                  ? 'bg-brand-blue-primary text-white'
                  : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
              }`}
            >
              {TYPE_LABELS[tt]}
            </button>
          ))}
        </div>
      )}

      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((tag) => {
            const active = selectedTags.includes(tag);
            return (
              <button
                key={tag}
                type="button"
                onClick={() => onToggleTag(tag)}
                className={`px-2.5 py-1 text-xxs font-bold rounded-full transition-colors ${
                  active
                    ? 'bg-amber-400 text-white'
                    : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                }`}
              >
                {tag}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
