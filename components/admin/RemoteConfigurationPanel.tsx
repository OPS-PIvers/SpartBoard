import React from 'react';
import { RemoteGlobalConfig } from '@/types';

interface RemoteConfigurationPanelProps {
  config: RemoteGlobalConfig | Record<string, unknown>;
  onChange: (newConfig: Record<string, unknown>) => void;
}

export const RemoteConfigurationPanel: React.FC<
  RemoteConfigurationPanelProps
> = () => {
  return (
    <div className="text-center py-12 border-2 border-dashed border-slate-200 rounded-3xl bg-white">
      <p className="text-sm font-bold text-slate-500 mb-2">
        No additional global settings available.
      </p>
      <p className="text-xs text-slate-400">
        Dock visibility is configured above. The remote tool uses automatic
        snapshot syncing and requires no other global setup.
      </p>
    </div>
  );
};
