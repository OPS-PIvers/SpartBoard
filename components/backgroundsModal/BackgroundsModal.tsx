import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/common/Modal';
import { useBackgrounds } from '@/hooks/useBackgrounds';
import { useDashboard } from '@/context/useDashboard';
import { useAuth } from '@/context/useAuth';
import {
  BackgroundItem,
  BackgroundType,
  filterByType,
  filterByTags,
  filterBySearch,
  uniqueTagsOf,
} from './backgroundsHelpers';
import { extractYouTubeId } from '@/utils/youtube';
import { BackgroundsLeftRail, RailSection } from './BackgroundsLeftRail';
import { BackgroundsFilterBar } from './BackgroundsFilterBar';
import { BackgroundsGrid } from './BackgroundsGrid';
import { BackgroundsUploadsPanel } from './BackgroundsUploadsPanel';
import { BackgroundsCustomColorPicker } from './BackgroundsCustomColorPicker';
import { BackgroundsCustomGradientPicker } from './BackgroundsCustomGradientPicker';

interface BackgroundsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const BackgroundsModal: React.FC<BackgroundsModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { t } = useTranslation();
  const { presets, colors, patterns, gradients } = useBackgrounds();
  const { activeDashboard, setBackground, addToast } = useDashboard();
  const { favoriteBackgrounds, recentBackgrounds, toggleFavoriteBackground } =
    useAuth();

  const [section, setSection] = useState<RailSection>({ kind: 'favorites' });
  const [search, setSearch] = useState('');
  const [type, setType] = useState<BackgroundType>('all');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  // Flatten all background sources into BackgroundItem[]
  const allItems = useMemo<BackgroundItem[]>(() => {
    const fromPresets: BackgroundItem[] = presets.map((p) => ({
      id: p.id,
      label: p.label,
      type: extractYouTubeId(p.id)
        ? ('video' as BackgroundType)
        : ('still' as BackgroundType),
      thumbnailUrl: p.thumbnailUrl,
      tags: p.tags,
      category: p.category,
    }));
    const fromColors: BackgroundItem[] = colors.map((c) => ({
      id: c.id,
      label: c.id,
      type: 'color' as BackgroundType,
      tags: [],
    }));
    const fromPatterns: BackgroundItem[] = (
      patterns as Array<{ id: string; label?: string }>
    ).map((p) => ({
      id: p.id,
      label: p.label ?? p.id,
      type: 'pattern' as BackgroundType,
      tags: [],
    }));
    const fromGradients: BackgroundItem[] = (
      gradients as Array<{ id: string; label?: string }>
    ).map((g) => ({
      id: g.id,
      label: g.label ?? g.id,
      type: 'gradient' as BackgroundType,
      tags: [],
    }));
    return [...fromPresets, ...fromColors, ...fromPatterns, ...fromGradients];
  }, [presets, colors, patterns, gradients]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const i of allItems) if (i.category) set.add(i.category);
    return [...set].sort();
  }, [allItems]);

  /** Synthesize a minimal BackgroundItem for IDs not found in allItems (uploads, custom colors/gradients). */
  const resolveBackgroundItem = (
    id: string,
    byId: Map<string, BackgroundItem>
  ): BackgroundItem | undefined => {
    const preset = byId.get(id);
    if (preset) return preset;
    if (id.startsWith('custom:')) {
      const value = id.slice('custom:'.length);
      const isGradient = value.startsWith('linear-gradient(');
      return {
        id,
        label: isGradient ? 'Custom Gradient' : 'Custom Color',
        type: isGradient ? 'gradient' : 'color',
        tags: [],
        // No thumbnailUrl — BackgroundThumbnail will render the CSS background
      };
    }
    if (id.startsWith('https://') || id.startsWith('http://')) {
      return {
        id,
        label: 'Uploaded Image',
        type: 'upload',
        thumbnailUrl: id,
        tags: [],
      };
    }
    return undefined;
  };

  // Pre-filter by rail section
  const sectionItems = useMemo<BackgroundItem[]>(() => {
    const byId = new Map(allItems.map((i) => [i.id, i]));
    switch (section.kind) {
      case 'favorites':
        return favoriteBackgrounds
          .map((id) => resolveBackgroundItem(id, byId))
          .filter(Boolean) as BackgroundItem[];
      case 'recent':
        return recentBackgrounds
          .map((id) => resolveBackgroundItem(id, byId))
          .filter(Boolean) as BackgroundItem[];
      case 'category':
        return allItems.filter((i) => i.category === section.name);
      case 'colors':
        return allItems.filter((i) => i.type === 'color');
      case 'patterns':
        return allItems.filter((i) => i.type === 'pattern');
      case 'gradients':
        return allItems.filter((i) => i.type === 'gradient');
      case 'uploads':
        return [];
    }
  }, [section, allItems, favoriteBackgrounds, recentBackgrounds]);

  // Available type chips depend on the section
  const availableTypes = useMemo<BackgroundType[]>(() => {
    const types = new Set<BackgroundType>();
    for (const i of sectionItems) types.add(i.type);
    if (types.size > 1) return ['all', ...[...types].sort()];
    return [];
  }, [sectionItems]);

  const availableTags = useMemo(
    () => uniqueTagsOf(sectionItems),
    [sectionItems]
  );

  const visibleItems = useMemo(() => {
    let items = sectionItems;
    items = filterByType(items, type);
    items = filterByTags(items, selectedTags);
    items = filterBySearch(items, search);
    return items;
  }, [sectionItems, type, selectedTags, search]);

  const handleSelect = (id: string) => {
    setBackground(id);
  };

  const handleToggleFavorite = (id: string) => {
    toggleFavoriteBackground(id).catch(() => {
      addToast(
        t('backgrounds.favoriteSaveFailed', {
          defaultValue: 'Could not save favorite. Please try again.',
        }),
        'error'
      );
    });
  };

  const handleToggleTag = (tag: string) =>
    setSelectedTags((cur) =>
      cur.includes(tag) ? cur.filter((x) => x !== tag) : [...cur, tag]
    );

  const emptyState = (() => {
    if (section.kind === 'favorites' && favoriteBackgrounds.length === 0) {
      return (
        <div className="p-8 text-center text-sm text-slate-400">
          {t('backgrounds.emptyFavorites', {
            defaultValue: 'No favorites yet — hover a background and tap ★',
          })}
        </div>
      );
    }
    if (section.kind === 'recent' && recentBackgrounds.length === 0) {
      return (
        <div className="p-8 text-center text-sm text-slate-400">
          {t('backgrounds.emptyRecent', {
            defaultValue: 'No recent backgrounds yet.',
          })}
        </div>
      );
    }
    if (visibleItems.length === 0) {
      return (
        <div className="p-8 text-center text-sm text-slate-400">
          {t('backgrounds.emptyFiltered', {
            defaultValue: 'No backgrounds match your filters.',
          })}
        </div>
      );
    }
    return null;
  })();

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="max-w-5xl"
      className="h-[85vh]"
      contentClassName="px-0 pb-0 flex"
      title={t('backgrounds.title', { defaultValue: 'Backgrounds' })}
    >
      <BackgroundsLeftRail
        categories={categories}
        active={section}
        onSelect={(s) => {
          setSection(s);
          setSearch('');
          setType('all');
          setSelectedTags([]);
        }}
      />
      <div className="flex-1 flex flex-col min-w-0">
        <BackgroundsFilterBar
          search={search}
          onSearchChange={setSearch}
          type={type}
          onTypeChange={setType}
          availableTypes={availableTypes}
          tags={availableTags}
          selectedTags={selectedTags}
          onToggleTag={handleToggleTag}
        />
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {section.kind === 'uploads' ? (
            <BackgroundsUploadsPanel
              activeBackground={activeDashboard?.background}
            />
          ) : (
            <>
              {section.kind === 'colors' && (
                <div className="p-4 pb-0">
                  <BackgroundsCustomColorPicker
                    activeBackground={activeDashboard?.background}
                  />
                </div>
              )}
              {section.kind === 'gradients' && (
                <div className="p-4 pb-0">
                  <BackgroundsCustomGradientPicker
                    activeBackground={activeDashboard?.background}
                  />
                </div>
              )}
              <BackgroundsGrid
                items={visibleItems}
                activeId={activeDashboard?.background}
                favoriteIds={favoriteBackgrounds}
                onSelect={handleSelect}
                onToggleFavorite={handleToggleFavorite}
                emptyState={emptyState}
              />
            </>
          )}
        </div>
      </div>
    </Modal>
  );
};
