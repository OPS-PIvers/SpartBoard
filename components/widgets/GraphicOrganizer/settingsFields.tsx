import React from 'react';
import { useAuth } from '@/context/useAuth';
import { useWidgetBuildingId } from '@/hooks/useWidgetBuildingId';
import type { CustomRenderCtx } from '@/components/settings/schema/types';
import type { GraphicOrganizerConfig, GraphicOrganizerTemplate } from '@/types';
import { tourAttr } from '@/config/tourAnchors';

const BUILT_IN_TEMPLATES = [
  { value: 'frayer', label: 'frayer' },
  { value: 't-chart', label: 'tChart' },
  { value: 'venn', label: 'venn' },
  { value: 'kwl', label: 'kwl' },
  { value: 'cause-effect', label: 'causeEffect' },
] as const;

export const GraphicOrganizerTemplateField: React.FC<{
  ctx: CustomRenderCtx;
}> = ({ ctx }) => {
  const { featurePermissions } = useAuth();
  const buildingId = useWidgetBuildingId(ctx.widget) ?? 'global';
  const featureConfig = featurePermissions.find(
    (permission) => permission.widgetType === 'graphic-organizer'
  )?.config;
  const buildingsConfig = (featureConfig?.buildings ?? {}) as Record<
    string,
    { templates?: GraphicOrganizerTemplate[] }
  >;
  const customTemplates = buildingsConfig[buildingId]?.templates ?? [];
  const config = ctx.config as unknown as GraphicOrganizerConfig;

  return (
    <div
      id={ctx.id}
      role="group"
      aria-labelledby={ctx.labelId}
      aria-describedby={ctx.describedBy}
    >
      <select
        id={`${ctx.id}-select`}
        value={config.templateType}
        onChange={(event) =>
          ctx.updateConfig({
            templateType: event.target
              .value as GraphicOrganizerConfig['templateType'],
          })
        }
        aria-labelledby={ctx.labelId}
        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
        {...tourAttr(
          'widget-settings.graphic-organizer.template',
          ctx.widget.id,
          ctx.widget.type
        )}
      >
        {BUILT_IN_TEMPLATES.map((template) => (
          <option key={template.value} value={template.value}>
            {ctx.t(`widgetSettings.graphic-organizer.${template.label}`)}
          </option>
        ))}
        {customTemplates.length > 0 && (
          <optgroup
            label={ctx.t('widgetSettings.graphic-organizer.customTemplates')}
          >
            {customTemplates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))}
          </optgroup>
        )}
      </select>
    </div>
  );
};
