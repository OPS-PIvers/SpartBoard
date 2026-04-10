import React from 'react';
import { WidgetData, BloomsTaxonomyConfig } from '@/types';
import { useDashboard } from '@/context/useDashboard';
import { useAuth } from '@/context/useAuth';
import { useWidgetBuildingId } from '@/hooks/useWidgetBuildingId';
import {
  CONTENT_CATEGORIES,
  CATEGORY_LABELS,
  type ContentCategory,
} from './constants';
import type {
  BloomsTaxonomyGlobalConfig,
  BloomsTaxonomyBuildingConfig,
} from '@/types';

export const BloomsTaxonomySettings: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => {
  const { updateWidget } = useDashboard();
  const { featurePermissions } = useAuth();
  const buildingId = useWidgetBuildingId(widget) ?? '';
  const config = widget.config as BloomsTaxonomyConfig;

  // Read admin building config for available categories
  const bloomsPerm = featurePermissions.find(
    (p) => p.widgetType === 'blooms-taxonomy'
  );
  const globalConfig = bloomsPerm?.config as
    | BloomsTaxonomyGlobalConfig
    | undefined;
  const buildingConfig: BloomsTaxonomyBuildingConfig =
    globalConfig?.buildingDefaults?.[buildingId] ?? {};
  const { availableCategories, defaultEnabledCategories } = buildingConfig;

  // Honor admin's defaultEnabledCategories when widget has no saved setting
  const enabledCategories =
    config.enabledCategories ??
    defaultEnabledCategories ??
    ([...CONTENT_CATEGORIES] as string[]);

  // Only show categories the admin has made available
  const displayCategories = (
    CONTENT_CATEGORIES as readonly ContentCategory[]
  ).filter(
    (cat) => !availableCategories || availableCategories.includes(cat as string)
  );

  const toggleCategory = (cat: string) => {
    const next = enabledCategories.includes(cat)
      ? enabledCategories.filter((c) => c !== cat)
      : [...enabledCategories, cat];
    updateWidget(widget.id, {
      config: { ...config, enabledCategories: next },
    });
  };

  return (
    <div className="space-y-4 p-4">
      <div>
        <h3 className="text-sm font-semibold text-white mb-2">
          Content Categories
        </h3>
        <p className="text-xs text-slate-400 mb-3">
          Choose which categories appear when you click a level.
        </p>
        <div className="space-y-2">
          {displayCategories.map((cat) => (
            <label
              key={cat}
              className="flex items-center gap-2 cursor-pointer text-sm text-white"
            >
              <input
                type="checkbox"
                checked={enabledCategories.includes(cat)}
                onChange={() => toggleCategory(cat)}
                className="rounded border-slate-500 bg-slate-700 text-indigo-500 focus:ring-indigo-500"
              />
              {CATEGORY_LABELS[cat]}
            </label>
          ))}
        </div>
      </div>
    </div>
  );
};
