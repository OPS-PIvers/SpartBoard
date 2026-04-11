import React, { useState } from 'react';
import { Plus, ArrowLeft, X } from 'lucide-react';
import {
  WidgetData,
  BloomsDetailConfig,
  BloomsTaxonomyGlobalConfig,
  BloomsTaxonomyBuildingConfig,
  BloomsTaxonomyConfig,
  type BloomsCategoryKey,
} from '@/types';
import { useDashboard } from '@/context/useDashboard';
import { useAuth } from '@/context/useAuth';
import { useWidgetBuildingId } from '@/hooks/useWidgetBuildingId';
import { WidgetLayout } from '@/components/widgets/WidgetLayout';
import { DEFAULT_BLOOMS_CONTENT } from './defaultContent';
import {
  BLOOMS_COLORS,
  BLOOMS_LABELS,
  CONTENT_CATEGORIES,
  CATEGORY_LABELS,
  type ContentCategory,
} from './constants';

type DetailView =
  | { view: 'categories' }
  | { view: 'content'; category: ContentCategory };

export const BloomsDetailWidget: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => {
  const { addWidget, removeWidget, addToast, activeDashboard } = useDashboard();
  const { featurePermissions } = useAuth();

  const config = widget.config as BloomsDetailConfig;
  const { parentWidgetId, level } = config;
  const buildingId = useWidgetBuildingId(widget) ?? '';

  // Read admin building config from feature permissions
  const bloomsPerm = featurePermissions.find(
    (p) => p.widgetType === 'blooms-taxonomy'
  );
  const globalConfig = bloomsPerm?.config as
    | BloomsTaxonomyGlobalConfig
    | undefined;
  const buildingConfig: BloomsTaxonomyBuildingConfig =
    globalConfig?.buildingDefaults?.[buildingId] ?? {};
  const { availableCategories, contentOverrides, defaultEnabledCategories } =
    buildingConfig;

  // Read parent widget to get user's enabled categories
  const parentWidget = activeDashboard?.widgets.find(
    (w) => w.id === parentWidgetId
  );
  const parentConfig = parentWidget?.config as BloomsTaxonomyConfig | undefined;
  const enabledCategories = parentConfig?.enabledCategories ??
    defaultEnabledCategories ?? [...CONTENT_CATEGORIES];

  // Filter categories: intersection of admin-available and user-enabled
  const activeCategories = CONTENT_CATEGORIES.filter((cat) => {
    if (availableCategories && !availableCategories.includes(cat)) return false;
    return enabledCategories.includes(cat);
  });

  // Content merging: admin overrides > default content
  const getContent = (category: BloomsCategoryKey): string[] => {
    return (
      contentOverrides?.[level]?.[category] ??
      DEFAULT_BLOOMS_CONTENT[level]?.[category] ??
      []
    );
  };

  const [viewState, setViewState] = useState<DetailView>({
    view: 'categories',
  });

  // Reset to categories when level changes from parent
  const [prevLevel, setPrevLevel] = useState(level);
  if (level !== prevLevel) {
    setPrevLevel(level);
    setViewState({ view: 'categories' });
  }

  const color = BLOOMS_COLORS[level];
  const label = BLOOMS_LABELS[level];

  const handleClose = () => {
    removeWidget(widget.id);
  };

  const handleAddToBoard = () => {
    if (viewState.view !== 'content') return;
    const { category } = viewState;
    const items = getContent(category);
    const catLabel = CATEGORY_LABELS[category];

    const esc = (s: string) =>
      s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    const formatted = `<b>${esc(label)} \u2014 ${esc(catLabel)}</b><br><br>${items.map((item) => `\u2022 ${esc(item)}`).join('<br>')}`;

    addWidget('text', {
      config: {
        content: formatted,
        bgColor: color + '22',
        fontSize: 16,
        fontColor: '#1e293b',
      },
    });

    addToast(`${catLabel} for "${label}" added`, 'success');
  };

  return (
    <WidgetLayout
      padding="p-0"
      content={
        <div className="h-full w-full flex flex-col animate-in fade-in slide-in-from-bottom-4 duration-300">
          {/* Header */}
          <div
            className="flex items-center justify-between shrink-0"
            style={{
              backgroundColor: color,
              padding: 'min(8px, 2cqmin) min(12px, 3cqmin)',
            }}
          >
            <div
              className="flex items-center"
              style={{ gap: 'min(6px, 1.5cqmin)' }}
            >
              {viewState.view === 'content' && (
                <button
                  onClick={() => setViewState({ view: 'categories' })}
                  className="text-white/70 hover:text-white transition-colors shrink-0"
                  aria-label="Back to categories"
                  style={{ padding: 'min(2px, 0.5cqmin)' }}
                >
                  <ArrowLeft
                    style={{
                      width: 'min(18px, 5cqmin)',
                      height: 'min(18px, 5cqmin)',
                    }}
                  />
                </button>
              )}
              <span
                className="font-bold text-white truncate"
                style={{
                  fontSize: 'min(14px, 5cqmin)',
                  textShadow: '0 1px 2px rgba(0,0,0,0.2)',
                }}
              >
                {label}
                {viewState.view === 'content' && (
                  <>
                    <span className="font-normal text-white/70">
                      {' '}
                      &rsaquo;{' '}
                    </span>
                    {CATEGORY_LABELS[viewState.category]}
                  </>
                )}
              </span>
            </div>
            <button
              onClick={handleClose}
              className="text-white/70 hover:text-white transition-colors shrink-0"
              aria-label="Close detail panel"
              style={{ padding: 'min(2px, 0.5cqmin)' }}
            >
              <X
                style={{
                  width: 'min(18px, 5cqmin)',
                  height: 'min(18px, 5cqmin)',
                }}
              />
            </button>
          </div>

          {/* Categories view */}
          {viewState.view === 'categories' && (
            <div
              className="flex-1 min-h-0 flex flex-col"
              style={{ padding: 'min(10px, 2.5cqmin)' }}
            >
              <div
                className="grid grid-cols-2"
                style={{ gap: 'min(8px, 2cqmin)' }}
              >
                {activeCategories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() =>
                      setViewState({ view: 'content', category: cat })
                    }
                    className="text-white font-semibold rounded-lg transition-all duration-150 hover:brightness-110 active:scale-95 text-center"
                    style={{
                      backgroundColor: color + 'CC',
                      fontSize: 'min(12px, 4cqmin)',
                      padding: 'min(12px, 3cqmin) min(8px, 2cqmin)',
                      border: '1px solid rgba(255,255,255,0.2)',
                    }}
                  >
                    {CATEGORY_LABELS[cat]}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Content view */}
          {viewState.view === 'content' && (
            <div className="flex-1 min-h-0 flex flex-col">
              {/* Category chip row */}
              <div
                className="flex flex-wrap shrink-0"
                style={{
                  gap: 'min(4px, 1cqmin)',
                  padding: 'min(8px, 2cqmin) min(10px, 2.5cqmin)',
                }}
              >
                {activeCategories.map((cat) => {
                  const isSelected = cat === viewState.category;
                  return (
                    <button
                      key={cat}
                      onClick={() =>
                        setViewState({ view: 'content', category: cat })
                      }
                      aria-pressed={isSelected}
                      className="rounded-full font-medium transition-all duration-150 active:scale-95"
                      style={{
                        fontSize: 'min(10px, 3.5cqmin)',
                        padding: 'min(4px, 1cqmin) min(10px, 2.5cqmin)',
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
                style={{ padding: '0 min(10px, 2.5cqmin)' }}
              >
                <ul
                  className="flex flex-col"
                  style={{ gap: 'min(5px, 1.2cqmin)' }}
                >
                  {getContent(viewState.category).map((item, index) => (
                    <li
                      key={`${level}-${viewState.category}-${index}`}
                      className="flex items-start text-white/90"
                      style={{
                        fontSize: 'min(13px, 4cqmin)',
                        lineHeight: '1.4',
                        gap: 'min(8px, 2cqmin)',
                      }}
                    >
                      <span
                        className="shrink-0 rounded-full"
                        style={{
                          width: 'min(6px, 1.5cqmin)',
                          height: 'min(6px, 1.5cqmin)',
                          backgroundColor: color,
                          marginTop: 'min(7px, 1.8cqmin)',
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
                  padding: 'min(8px, 2cqmin) min(10px, 2.5cqmin)',
                }}
              >
                <button
                  onClick={handleAddToBoard}
                  className="w-full flex items-center justify-center font-semibold text-white rounded-lg transition-all duration-150 hover:brightness-110 active:scale-[0.98]"
                  style={{
                    backgroundColor: color,
                    fontSize: 'min(12px, 4cqmin)',
                    padding: 'min(10px, 2.5cqmin)',
                    gap: 'min(6px, 1.5cqmin)',
                    border: '1px solid rgba(255,255,255,0.2)',
                  }}
                >
                  <Plus
                    style={{
                      width: 'min(16px, 4.5cqmin)',
                      height: 'min(16px, 4.5cqmin)',
                    }}
                  />
                  Add to Board
                </button>
              </div>
            </div>
          )}
        </div>
      }
    />
  );
};
