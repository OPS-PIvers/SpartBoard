import React from 'react';
import { CarRiderProGlobalConfig } from '@/types';

interface CarRiderConfigurationPanelProps {
  config: CarRiderProGlobalConfig;
  onChange: (newConfig: CarRiderProGlobalConfig) => void;
}

export const CarRiderConfigurationPanel: React.FC<
  CarRiderConfigurationPanelProps
> = ({ config, onChange }) => {
  return (
    <div className="space-y-4">
      <div>
        <label
          htmlFor="car-rider-pro-url"
          className="text-xxs font-bold text-slate-500 uppercase mb-2 block"
        >
          District Portal URL
        </label>
        <input
          id="car-rider-pro-url"
          type="url"
          value={config.url ?? ''}
          onChange={(e) => onChange({ ...config, url: e.target.value })}
          placeholder="https://carriderpro.com/login/your-district"
          className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
        />
        <p className="text-xxs text-slate-400 mt-1">
          Enter the global district login URL for the Car Rider Pro dismissal
          widget. This URL will be used for all classrooms.
        </p>
      </div>
    </div>
  );
};
