import React from 'react';
import { WidgetData, TalkingToolConfig } from '@/types';
import { useDashboard } from '@/context/useDashboard';
import { SurfaceColorSettings } from '@/components/common/SurfaceColorSettings';
import { TypographySettings } from '@/components/common/TypographySettings';

export const TalkingToolSettings: React.FC<{ widget: WidgetData }> = () => {
  return (
    <div className="p-4 text-sm text-slate-600 space-y-2">
      <p className="font-semibold text-slate-700">Global content settings</p>
      <p>
        Talking stems and categories are configured by an admin via Feature
        Permissions.
      </p>
    </div>
  );
};

export const TalkingToolAppearanceSettings: React.FC<{
  widget: WidgetData;
}> = ({ widget }) => {
  const { updateWidget } = useDashboard();
  const config = widget.config as TalkingToolConfig;
  const updateConfig = (updates: Partial<TalkingToolConfig>) =>
    updateWidget(widget.id, { config: { ...config, ...updates } });

  return (
    <div className="space-y-6">
      <TypographySettings config={config} updateConfig={updateConfig} />
      <SurfaceColorSettings config={config} updateConfig={updateConfig} />
    </div>
  );
};
