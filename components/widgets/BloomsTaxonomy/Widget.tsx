import React, { useState, useCallback, useRef } from 'react';
import {
  WidgetData,
  BloomsTaxonomyConfig,
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
import { RadialMenu } from './RadialMenu';
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
  const enabledCategories =
    config.enabledCategories ??
    defaultEnabledCategories ??
    ([...CONTENT_CATEGORIES] as string[]);

  // Filter categories: intersection of admin-available and user-enabled
  const activeCategories = (CONTENT_CATEGORIES as readonly string[]).filter(
    (cat) => {
      if (availableCategories && !availableCategories.includes(cat))
        return false;
      return enabledCategories.includes(cat);
    }
  ) as ContentCategory[];

  // Content merging: admin overrides > default content
  const getContent = useCallback(
    (level: string, category: string): string[] => {
      return (
        contentOverrides?.[level]?.[category] ??
        DEFAULT_BLOOMS_CONTENT[level]?.[category] ??
        []
      );
    },
    [contentOverrides]
  );

  // State
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [activeMenu, setActiveMenu] = useState<{
    level: BloomsLevel;
    position: { x: number; y: number };
    containerSize: { width: number; height: number };
  } | null>(null);

  // AI state
  const [aiTopic, setAiTopic] = useState('');
  const [aiResult, setAiResult] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  // Handle tier click
  const handleTierClick = useCallback(
    async (level: BloomsLevel, event: React.MouseEvent) => {
      // If AI topic is set and AI is enabled, generate AI content
      if (aiEnabled && aiTopic.trim()) {
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
        return;
      }

      // Otherwise, show radial menu
      if (activeCategories.length === 0) {
        addToast('No categories enabled. Flip to configure.', 'info');
        return;
      }

      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;

      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;

      setActiveMenu({
        level,
        position: { x, y },
        containerSize: { width: rect.width, height: rect.height },
      });
    },
    [aiEnabled, aiTopic, activeCategories.length, addToast]
  );

  // Handle keyboard activation — center menu on the tier element
  const handleTierKeyboardActivate = useCallback(
    (level: BloomsLevel, element: HTMLElement) => {
      if (activeCategories.length === 0) {
        addToast('No categories enabled. Flip to configure.', 'info');
        return;
      }

      const containerRect = containerRef.current?.getBoundingClientRect();
      const tierRect = element.getBoundingClientRect();
      if (!containerRect) return;

      const x = tierRect.left - containerRect.left + tierRect.width / 2;
      const y = tierRect.top - containerRect.top + tierRect.height / 2;

      setActiveMenu({
        level,
        position: { x, y },
        containerSize: {
          width: containerRect.width,
          height: containerRect.height,
        },
      });
    },
    [activeCategories.length, addToast]
  );

  // Handle category selection from radial menu
  const handleCategorySelect = useCallback(
    (category: ContentCategory) => {
      if (!activeMenu) return;
      const { level } = activeMenu;
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

      setActiveMenu(null);
      addToast(`${catLabel} for "${label}" added`, 'success');
    },
    [activeMenu, getContent, addWidget, addToast]
  );

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

  return (
    <WidgetLayout
      padding="p-0"
      content={
        <div
          ref={containerRef}
          className="relative h-full w-full flex flex-col"
        >
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

          {/* Pyramid */}
          <div className="flex-1 min-h-0">
            <Pyramid
              onTierClick={handleTierClick}
              onTierKeyboardActivate={handleTierKeyboardActivate}
              onTierDragStart={handleTierDragStart}
            />
          </div>

          {/* Radial menu overlay */}
          {activeMenu && (
            <RadialMenu
              level={activeMenu.level}
              categories={activeCategories}
              position={activeMenu.position}
              containerSize={activeMenu.containerSize}
              onSelect={handleCategorySelect}
              onClose={() => setActiveMenu(null)}
            />
          )}
        </div>
      }
    />
  );
};
