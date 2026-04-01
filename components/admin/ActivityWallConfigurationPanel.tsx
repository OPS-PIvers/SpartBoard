import React from 'react';

interface ActivityWallConfigurationPanelProps {
  config: Record<string, unknown>;
  onChange: (newConfig: Record<string, unknown>) => void;
}

export const ActivityWallConfigurationPanel: React.FC<
  ActivityWallConfigurationPanelProps
> = ({ config, onChange }) => {
  const rawEnabledByDefault = config.enabledByDefault;
  const enabledByDefault =
    typeof rawEnabledByDefault === 'boolean' ? rawEnabledByDefault : true;

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">
        Set simple building-wide defaults for the Activity Wall widget.
      </p>
      <label className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2">
        <span className="text-sm font-semibold text-slate-700">
          Enable for teachers by default
        </span>
        <input
          type="checkbox"
          checked={enabledByDefault}
          onChange={(event) =>
            onChange({
              ...config,
              enabledByDefault: event.target.checked,
            })
          }
          className="h-4 w-4 accent-brand-blue-primary"
        />
      </label>
    </div>
  );
};
