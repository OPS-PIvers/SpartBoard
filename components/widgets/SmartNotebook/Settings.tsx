import React from 'react';
import { WidgetData, SmartNotebookConfig } from '@/types';
import { useDashboard } from '@/context/useDashboard';
import { SurfaceColorSettings } from '@/components/common/SurfaceColorSettings';
import { TypographySettings } from '@/components/common/TypographySettings';

export const SmartNotebookAppearanceSettings: React.FC<{
  widget: WidgetData;
}> = ({ widget }) => {
  const { updateWidget } = useDashboard();
  const config = widget.config as SmartNotebookConfig;
  const updateConfig = (updates: Partial<SmartNotebookConfig>) =>
    updateWidget(widget.id, { config: { ...config, ...updates } });

  return (
    <div className="space-y-6">
      <TypographySettings config={config} updateConfig={updateConfig} />
      <SurfaceColorSettings config={config} updateConfig={updateConfig} />
    </div>
  );
};
