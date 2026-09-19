import React, { useMemo } from 'react';
import { useAuth } from '@/context/useAuth';
import { useWidgetBuildingId } from '@/hooks/useWidgetBuildingId';
import type {
  BloomsTaxonomyBuildingConfig,
  BloomsTaxonomyConfig,
  BloomsTaxonomyGlobalConfig,
} from '@/types';
import type { CustomRenderCtx } from '@/components/settings/schema/types';
import { CONTENT_CATEGORIES, type ContentCategory } from './constants';

export const BloomsCategoriesField: React.FC<{ ctx: CustomRenderCtx }> = ({
  ctx,
}) => {
  const { featurePermissions } = useAuth();
  const buildingId = useWidgetBuildingId(ctx.widget) ?? '';
  const config = ctx.config as unknown as BloomsTaxonomyConfig;
  const bloomsPermission = featurePermissions.find(
    (permission) => permission.widgetType === 'blooms-taxonomy'
  );
  const globalConfig = bloomsPermission?.config as
    | BloomsTaxonomyGlobalConfig
    | undefined;
  const buildingConfig: BloomsTaxonomyBuildingConfig =
    globalConfig?.buildingDefaults?.[buildingId] ?? {};
  const { availableCategories, defaultEnabledCategories } = buildingConfig;

  const displayCategories = useMemo(
    () =>
      CONTENT_CATEGORIES.filter(
        (category) =>
          !availableCategories || availableCategories.includes(category)
      ),
    [availableCategories]
  );
  const enabledCategories = config.enabledCategories ??
    defaultEnabledCategories ?? [...CONTENT_CATEGORIES];
  const t = (leaf: string) => ctx.t(`widgetSettings.blooms-taxonomy.${leaf}`);

  const toggleCategory = (category: ContentCategory) => {
    const next = enabledCategories.includes(category)
      ? enabledCategories.filter((item) => item !== category)
      : [...enabledCategories, category];
    ctx.updateConfig({ enabledCategories: next });
  };

  return (
    <div
      id={ctx.id}
      role="group"
      aria-labelledby={ctx.labelId}
      aria-describedby={ctx.describedBy}
      className="flex flex-col gap-2"
    >
      <p className="text-xxs text-slate-600">{t('contentCategoriesHelp')}</p>
      {displayCategories.map((category) => (
        <label
          key={category}
          className="flex items-center gap-2 text-sm text-slate-700"
        >
          <input
            type="checkbox"
            checked={enabledCategories.includes(category)}
            onChange={() => toggleCategory(category)}
            className="rounded border-slate-300 text-brand-blue-primary focus:ring-brand-blue-primary/40"
          />
          {t(category)}
        </label>
      ))}
    </div>
  );
};
