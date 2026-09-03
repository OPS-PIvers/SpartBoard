import React from 'react';
import { WidgetData, ActivityWallConfig } from '@/types';
import { useDashboard } from '@/context/useDashboard';
import { SurfaceColorSettings } from '@/components/common/SurfaceColorSettings';
import { TypographySettings } from '@/components/common/TypographySettings';

export const ActivityWallSettings: React.FC<{ widget: WidgetData }> = () => (
  <div className="p-4 text-sm text-slate-600 space-y-2">
    <p className="font-semibold text-slate-700">
      Walls are managed from the widget face.
    </p>
    <p>
      Use the Library button to pick, create, edit, duplicate, or delete a wall.
      Each wall carries its own layout, appearance, and posting rules.
    </p>
  </div>
);

export const ActivityWallAppearanceSettings: React.FC<{
  widget: WidgetData;
}> = ({ widget }) => {
  const { updateWidget } = useDashboard();
  const config = widget.config as ActivityWallConfig;
  const updateConfig = (updates: Partial<ActivityWallConfig>) =>
    updateWidget(widget.id, { config: { ...config, ...updates } });

  return (
    <div className="space-y-6">
      <TypographySettings config={config} updateConfig={updateConfig} />
      <SurfaceColorSettings config={config} updateConfig={updateConfig} />
    </div>
  );
};
