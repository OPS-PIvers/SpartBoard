import React from 'react';
import {
  WidgetData,
  GraphicOrganizerConfig,
  GraphicOrganizerTemplate,
} from '@/types';
import { useDashboard } from '@/context/useDashboard';
import { useAuth } from '@/context/useAuth';
import { SurfaceColorSettings } from '@/components/common/SurfaceColorSettings';
import { TypographySettings } from '@/components/common/TypographySettings';

export const GraphicOrganizerSettings: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => {
  const { updateWidget } = useDashboard();
  const { selectedBuildings, featurePermissions } = useAuth();
  const config = widget.config as GraphicOrganizerConfig;

  const buildingId = selectedBuildings[0] ?? 'global';
  const featureObj = featurePermissions?.find(
    (p) => p.widgetType === 'graphic-organizer'
  );

  const featureConfig = featureObj?.config ?? {};
  const buildingsConfig = (featureConfig.buildings ?? {}) as Record<
    string,
    { templates?: GraphicOrganizerTemplate[] }
  >;
  const buildingConfig = buildingsConfig[buildingId] ?? { templates: [] };
  const customTemplates: GraphicOrganizerTemplate[] =
    buildingConfig.templates ?? [];

  const handleTemplateChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    updateWidget(widget.id, {
      config: {
        ...config,
        templateType: e.target.value as GraphicOrganizerConfig['templateType'],
      },
    });
  };

  return (
    <div className="p-4 space-y-4 text-slate-800">
      <div className="space-y-2">
        <label className="block text-sm font-medium">Template Type</label>
        <select
          value={config.templateType}
          onChange={handleTemplateChange}
          className="w-full p-2 bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="frayer">Frayer Model</option>
          <option value="t-chart">T-Chart</option>
          <option value="venn">Venn Diagram</option>
          <option value="kwl">KWL Chart</option>
          <option value="cause-effect">Cause & Effect</option>
          {customTemplates.length > 0 && (
            <optgroup label="Custom Templates">
              {customTemplates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </div>
    </div>
  );
};

export const GraphicOrganizerAppearanceSettings: React.FC<{
  widget: WidgetData;
}> = ({ widget }) => {
  const { updateWidget } = useDashboard();
  const config = widget.config as GraphicOrganizerConfig;
  const updateConfig = (updates: Partial<GraphicOrganizerConfig>) =>
    updateWidget(widget.id, { config: { ...config, ...updates } });

  return (
    <div className="space-y-6">
      <TypographySettings config={config} updateConfig={updateConfig} />
      <SurfaceColorSettings config={config} updateConfig={updateConfig} />
    </div>
  );
};
