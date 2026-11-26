import React from 'react';
import { useTranslation } from 'react-i18next';
import { tourAttr, tourFieldAttr } from '@/config/tourAnchors';
import { BackgroundType } from './backgroundsHelpers';
import { SearchField } from '@/components/common/SearchField';

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

  const typeLabel = (bgType: BackgroundType): string => {
    switch (bgType) {
      case 'all':
        return t('backgrounds.typeAll', { defaultValue: 'All' });
      case 'still':
        return t('backgrounds.typeStill', { defaultValue: 'Stills' });
      case 'video':
        return t('backgrounds.typeVideo', { defaultValue: 'Video' });
      case 'color':
        return t('backgrounds.colors', { defaultValue: 'Colors' });
      case 'pattern':
        return t('backgrounds.patterns', { defaultValue: 'Patterns' });
      case 'gradient':
        return t('backgrounds.gradients', { defaultValue: 'Gradients' });
      case 'upload':
        return t('backgrounds.typeUpload', { defaultValue: 'Uploads' });
    }
  };

  return (
    <div className="sticky top-0 z-10 bg-white border-b border-slate-100 px-4 py-3 flex flex-col gap-2">
      <SearchField
        value={search}
        onChange={onSearchChange}
        placeholder={t('backgrounds.searchPlaceholder', {
          defaultValue: 'Search backgrounds…',
        })}
        anchor={tourAttr('backgrounds.search')}
      />

      {availableTypes.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {availableTypes.map((tt) => (
            <button
              key={tt}
              {...tourFieldAttr('backgrounds.type-filter', 'backgrounds', tt)}
              type="button"
              onClick={() => onTypeChange(tt)}
              className={`px-2.5 py-1 text-xxs font-bold uppercase tracking-wider rounded-full transition-colors ${
                type === tt
                  ? 'bg-brand-blue-primary text-white'
                  : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
              }`}
            >
              {typeLabel(tt)}
            </button>
          ))}
        </div>
      )}

      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((tag) => {
            const active = selectedTags.includes(tag);
            return (
              // no-tour-anchor: tag names are generated from the catalog
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
