import React, { useState, useCallback } from 'react';
import {
  WidgetData,
  BloomsTaxonomyConfig,
  BloomsTaxonomyGlobalConfig,
  BloomsTaxonomyBuildingConfig,
  type BloomsLevelKey,
  type BloomsCategoryKey,
} from '@/types';
import { useDashboard } from '@/context/useDashboard';
import { useAuth } from '@/context/useAuth';
import { useWidgetBuildingId } from '@/hooks/useWidgetBuildingId';
import { WidgetLayout } from '@/components/widgets/WidgetLayout';
import { ScaledEmptyState } from '@/components/common/ScaledEmptyState';
import { Triangle } from 'lucide-react';
import { generateBloomsContent } from '@/utils/ai';
import { Pyramid } from './Pyramid';
import { CategoryPanel } from './CategoryPanel';
import { ContentPanel } from './ContentPanel';
import { AiPanel } from './AiPanel';
import { DEFAULT_BLOOMS_CONTENT } from './defaultContent';
import {
  BLOOMS_LABELS,
  BLOOMS_COLORS,
  CONTENT_CATEGORIES,
  CATEGORY_LABELS,
  type BloomsLevel,
  type ContentCategory,
} from './constants';

type ViewState =
  | { view: 'pyramid' }
  | { view: 'categories'; level: BloomsLevel }
  | { view: 'content'; level: BloomsLevel; category: ContentCategory };

export const BloomsTaxonomyWidget: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => {
  const { addWidget, addToast } = useDashboard();
  const { featurePermissions } = useAuth();
  const buildingId = useWidgetBuildingId(widget) ?? '';

  const config = widget.config as BloomsTaxonomyConfig;

  // Read admin building config from feature permissions
  const bloomsPerm = featurePermissions.find(
    (p) => p.widgetType === 'blooms-taxonomy'
  );
  const globalConfig = bloomsPerm?.config as
    | BloomsTaxonomyGlobalConfig
    | undefined;
  const buildingConfig: BloomsTaxonomyBuildingConfig =
    globalConfig?.buildingDefaults?.[buildingId] ?? {};
  const {
    availableCategories,
    aiEnabled = false,
    contentOverrides,
    defaultEnabledCategories,
  } = buildingConfig;

  // Honor admin's defaultEnabledCategories when widget has no saved setting
  const enabledCategories = config.enabledCategories ??
    defaultEnabledCategories ?? [...CONTENT_CATEGORIES];

  // Filter categories: intersection of admin-available and user-enabled
  const activeCategories = CONTENT_CATEGORIES.filter((cat) => {
    if (availableCategories && !availableCategories.includes(cat)) return false;
    return enabledCategories.includes(cat);
  });

  // Content merging: admin overrides > default content
  const getContent = useCallback(
    (level: BloomsLevelKey, category: BloomsCategoryKey): string[] => {
      return (
        contentOverrides?.[level]?.[category] ??
        DEFAULT_BLOOMS_CONTENT[level]?.[category] ??
        []
      );
    },
    [contentOverrides]
  );

  // View state
  const [viewState, setViewState] = useState<ViewState>({ view: 'pyramid' });

  // AI state
  const [aiTopic, setAiTopic] = useState('');
  const [aiResult, setAiResult] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  // Shared AI generation logic for both click and keyboard activation
  const tryAiGeneration = useCallback(
    async (level: BloomsLevel): Promise<boolean> => {
      if (!aiEnabled || !aiTopic.trim()) return false;
      setAiLoading(true);
      setAiResult(null);
      try {
        const text = await generateBloomsContent(
          `Generate Bloom's Taxonomy "${BLOOMS_LABELS[level]}" level content for the topic: "${aiTopic.trim()}". Include question stems, action verbs, and activity ideas. Format as a readable list.`
        );
        setAiResult(text || 'No content generated. Please try again.');
      } catch {
        addToast('AI generation failed. Please try again.', 'error');
      } finally {
        setAiLoading(false);
      }
      return true;
    },
    [aiEnabled, aiTopic, addToast]
  );

  // Handle tier click/keyboard activation — transition to categories view
  const handleTierClick = useCallback(
    async (level: BloomsLevel) => {
      if (await tryAiGeneration(level)) return;

      // Allow deselecting the active tier even if categories are disabled
      setViewState((prev) => {
        if (prev.view !== 'pyramid' && 'level' in prev && prev.level === level)
          return { view: 'pyramid' };

        if (activeCategories.length === 0) {
          addToast('No categories enabled. Flip to configure.', 'info');
          return prev;
        }

        return { view: 'categories', level };
      });
    },
    [tryAiGeneration, activeCategories.length, addToast]
  );

  // Handle category selection — transition to content view
  const handleCategorySelect = useCallback(
    (category: ContentCategory) => {
      if (viewState.view !== 'categories' && viewState.view !== 'content')
        return;
      setViewState({ view: 'content', level: viewState.level, category });
    },
    [viewState]
  );

  // Add content as a text widget on the board
  const handleAddToBoard = useCallback(() => {
    if (viewState.view !== 'content') return;
    const { level, category } = viewState;
    const items = getContent(level, category);
    const label = BLOOMS_LABELS[level];
    const catLabel = CATEGORY_LABELS[category];
    const color = BLOOMS_COLORS[level];

    // Format content for the text widget (escape HTML to prevent XSS from admin overrides)
    const esc = (s: string) =>
      s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    const formatted = `<b>${esc(label)} — ${esc(catLabel)}</b><br><br>${items.map((item) => `• ${esc(item)}`).join('<br>')}`;

    addWidget('text', {
      config: {
        content: formatted,
        bgColor: color + '22',
        fontSize: 16,
        fontColor: '#1e293b',
      },
    });

    addToast(`${catLabel} for "${label}" added`, 'success');
  }, [viewState, getContent, addWidget, addToast]);

  // Handle tier drag → sticker creation
  const handleTierDragStart = useCallback(
    (level: BloomsLevel, event: React.DragEvent) => {
      const label = BLOOMS_LABELS[level];
      const color = BLOOMS_COLORS[level];

      // Create an inline SVG data URI as the sticker image
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 60"><rect width="200" height="60" rx="12" fill="${color}"/><text x="100" y="38" font-family="sans-serif" font-size="22" font-weight="bold" fill="white" text-anchor="middle">${label}</text></svg>`;
      const url = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;

      event.dataTransfer.setData(
        'application/sticker',
        JSON.stringify({ url, ratio: 200 / 60 })
      );
      event.dataTransfer.effectAllowed = 'copy';
    },
    []
  );

  if (activeCategories.length === 0 && !aiEnabled) {
    return (
      <WidgetLayout
        padding="p-0"
        content={
          <ScaledEmptyState
            icon={Triangle}
            title="No Categories"
            subtitle="Flip to enable categories, or ask your admin."
          />
        }
      />
    );
  }

  const activeLevel = viewState.view !== 'pyramid' ? viewState.level : null;

  return (
    <WidgetLayout
      padding="p-0"
      content={
        <div className="relative h-full w-full flex flex-col">
          {/* AI panel at top (only when enabled) */}
          {aiEnabled && (
            <AiPanel
              topic={aiTopic}
              onTopicChange={setAiTopic}
              result={aiResult}
              loading={aiLoading}
              onDismiss={() => setAiResult(null)}
            />
          )}

          {/* Pyramid — takes proportional space based on view state */}
          <div
            className="min-h-0 transition-all duration-200"
            style={{
              flex: viewState.view === 'pyramid' ? '1 1 0%' : '0 0 55%',
            }}
          >
            <Pyramid
              onTierClick={handleTierClick}
              onTierKeyboardActivate={handleTierClick}
              onTierDragStart={handleTierDragStart}
              activeLevel={activeLevel}
            />
          </div>

          {/* Category panel */}
          {viewState.view === 'categories' && (
            <div className="shrink-0" style={{ padding: 'min(8px, 1.5cqmin)' }}>
              <CategoryPanel
                level={viewState.level}
                categories={activeCategories}
                onSelect={handleCategorySelect}
                onClose={() => setViewState({ view: 'pyramid' })}
              />
            </div>
          )}

          {/* Content panel */}
          {viewState.view === 'content' && (
            <div
              className="flex-1 min-h-0 flex flex-col"
              style={{ padding: 'min(8px, 1.5cqmin)', paddingTop: 0 }}
            >
              <ContentPanel
                level={viewState.level}
                category={viewState.category}
                items={getContent(viewState.level, viewState.category)}
                categories={activeCategories}
                onCategoryChange={(cat) =>
                  setViewState({
                    view: 'content',
                    level: viewState.level,
                    category: cat,
                  })
                }
                onBack={() =>
                  setViewState({ view: 'categories', level: viewState.level })
                }
                onAddToBoard={handleAddToBoard}
              />
            </div>
          )}
        </div>
      }
    />
  );
};
