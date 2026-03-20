import React from 'react';
import { QuizGlobalConfig } from '@/types';
import { DockDefaultsPanel } from './DockDefaultsPanel';

interface QuizConfigurationPanelProps {
  config: Record<string, unknown>;
  onChange: (newConfig: Record<string, unknown>) => void;
}

export const QuizConfigurationPanel: React.FC<QuizConfigurationPanelProps> = ({
  config,
  onChange,
}) => {
  const globalConfig = config as QuizGlobalConfig;

  const handleDockDefaultsChange = (dockDefaults: Record<string, boolean>) => {
    onChange({
      ...config,
      dockDefaults,
    });
  };

  return (
    <div className="space-y-4">
      <DockDefaultsPanel
        config={{ dockDefaults: globalConfig.dockDefaults ?? {} }}
        onChange={handleDockDefaultsChange}
      />
    </div>
  );
};
