import React from 'react';
import { First5GlobalConfig } from '@/types';
import { Calendar, Hash } from 'lucide-react';

interface First5ConfigurationPanelProps {
  config: First5GlobalConfig;
  onChange: (newConfig: First5GlobalConfig) => void;
}

export const First5ConfigurationPanel: React.FC<
  First5ConfigurationPanelProps
> = ({ config, onChange }) => {
  return (
    <div className="space-y-6">
      <div className="bg-slate-50 rounded-xl border border-slate-200 p-5 space-y-4 shadow-sm">
        <h3 className="text-sm font-bold text-slate-700 uppercase tracking-widest flex items-center gap-2">
          <Hash size={16} className="text-brand-blue-primary" />
          First 5 Admin Controls
        </h3>

        <p className="text-xxs text-slate-500 leading-tight">
          The First 5 widget uses the active day number and reference date to
          automatically calculate the current day&apos;s content URL, skipping
          weekends.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xxs font-bold text-slate-500 uppercase mb-1">
              Active Day Number
            </label>
            <div className="flex items-center gap-2">
              <Hash size={14} className="text-slate-400" />
              <input
                type="number"
                min="1"
                value={config.activeDayNumber ?? ''}
                onChange={(e) => {
                  const val = parseInt(e.target.value);
                  onChange({
                    ...config,
                    activeDayNumber: isNaN(val) ? undefined : val,
                  });
                }}
                className="w-full px-3 py-1.5 text-xs font-bold border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-blue-primary outline-none"
                placeholder="e.g., 42"
              />
            </div>
            <p className="text-[10px] text-slate-400 mt-1">
              The day number corresponding to the reference date below.
            </p>
          </div>

          <div>
            <label className="block text-xxs font-bold text-slate-500 uppercase mb-1">
              Reference Date
            </label>
            <div className="flex items-center gap-2">
              <Calendar size={14} className="text-slate-400" />
              <input
                type="date"
                value={config.referenceDate ?? ''}
                onChange={(e) =>
                  onChange({
                    ...config,
                    referenceDate: e.target.value,
                  })
                }
                className="w-full px-3 py-1.5 text-xs font-bold border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-blue-primary outline-none"
              />
            </div>
            <p className="text-[10px] text-slate-400 mt-1">
              The date when the Active Day Number was reached.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
