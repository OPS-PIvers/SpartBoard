import React, { useState, useCallback } from 'react';
import {
  WidgetData,
  BloomsTaxonomyConfig,
  BloomsDetailConfig,
  BloomsTaxonomyGlobalConfig,
  BloomsTaxonomyBuildingConfig,
} from '@/types';
import { useDashboard } from '@/context/useDashboard';
import { useAuth } from '@/context/useAuth';
import { useWidgetBuildingId } from '@/hooks/useWidgetBuildingId';
import { WidgetLayout } from '@/components/widgets/WidgetLayout';
import { ScaledEmptyState } from '@/components/common/ScaledEmptyState';
import { Triangle } from 'lucide-react';
import { generateBloomsContent } from '@/utils/ai';
import { Pyramid } from './Pyramid';
import { AiPanel } from './AiPanel';
import {
  BLOOMS_LABELS,
  BLOOMS_COLORS,
  CONTENT_CATEGORIES,
  type BloomsLevel,
} from './constants';

export const BloomsTaxonomyWidget: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => {
  const { addWidget, updateWidget, removeWidget, addToast, activeDashboard } =
    useDashboard();
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

  // Find companion detail widget by parentWidgetId back-reference
  const detailWidget =
    activeDashboard?.widgets.find(
      (w) =>
        w.type === 'blooms-detail' &&
        (w.config as BloomsDetailConfig).parentWidgetId === widget.id
    ) ?? null;
  const detailConfig = detailWidget?.config as BloomsDetailConfig | undefined;
  const activeLevel: BloomsLevel | null = detailWidget
    ? (detailConfig?.level as BloomsLevel)
    : null;

  // AI state
  const [aiTopic, setAiTopic] = useState('');
  const [aiResult, setAiResult] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  // Shared AI generation logic
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

  // Handle tier click — spawn, update, or remove companion detail widget
  const handleTierClick = useCallback(
    async (level: BloomsLevel) => {
      if (await tryAiGeneration(level)) return;

      if (activeCategories.length === 0) {
        addToast('No categories enabled. Flip to configure.', 'info');
        return;
      }

      // Toggle off: clicking the same active tier removes the detail
      if (activeLevel === level && detailWidget) {
        removeWidget(detailWidget.id);
        return;
      }

      // Update existing detail widget to new level
      if (detailWidget) {
        updateWidget(detailWidget.id, {
          config: {
            ...detailWidget.config,
            level,
            category: undefined,
          },
        });
        return;
      }

      // Spawn new detail widget below the pyramid
      addWidget('blooms-detail', {
        x: widget.x,
        y: widget.y + widget.h + 10,
        w: widget.w,
        buildingId,
        config: {
          parentWidgetId: widget.id,
          level,
        } satisfies BloomsDetailConfig,
      });
    },
    [
      tryAiGeneration,
      activeCategories.length,
      activeLevel,
      detailWidget,
      widget,
      buildingId,
      addWidget,
      updateWidget,
      removeWidget,
      addToast,
    ]
  );

  // Handle tier drag → sticker creation
  const handleTierDragStart = useCallback(
    (level: BloomsLevel, event: React.DragEvent) => {
      const label = BLOOMS_LABELS[level];
      const color = BLOOMS_COLORS[level];

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

          {/* Pyramid — always fills the widget */}
          <div className="flex-1 min-h-0">
            <Pyramid
              onTierClick={handleTierClick}
              onTierKeyboardActivate={handleTierClick}
              onTierDragStart={handleTierDragStart}
              activeLevel={activeLevel}
            />
          </div>
        </div>
      }
    />
  );
};
