import React from 'react';

import { TextConfig } from '@/types';

export const TextConfigEditor: React.FC<{
  config: Partial<TextConfig>;
  onChange: (config: Partial<TextConfig>) => void;
}> = ({ config, onChange }) => (
  <div className="space-y-3">
    <div>
      <label className="block text-xs font-semibold text-slate-700 mb-1">
        Message Content
      </label>
      <textarea
        value={config.content ?? ''}
        onChange={(e) => onChange({ ...config, content: e.target.value })}
        className="w-full h-28 px-3 py-2 text-sm border border-slate-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-brand-blue-primary"
        placeholder="Enter announcement message…"
      />
    </div>
    <div className="flex gap-3">
      <div className="flex-1">
        <label className="block text-xs font-semibold text-slate-700 mb-1">
          Background Color
        </label>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={config.bgColor ?? '#ffeb3b'}
            onChange={(e) => onChange({ ...config, bgColor: e.target.value })}
            className="w-10 h-8 border border-slate-300 rounded cursor-pointer"
          />
          <span className="text-xs text-slate-500">
            {config.bgColor ?? '#ffeb3b'}
          </span>
        </div>
      </div>
      <div className="flex-1">
        <label className="block text-xs font-semibold text-slate-700 mb-1">
          Font Size
        </label>
        <input
          type="number"
          min={10}
          max={72}
          value={config.fontSize ?? 18}
          onChange={(e) => {
            const parsed = parseInt(e.target.value, 10);
            if (!Number.isFinite(parsed)) return;
            onChange({
              ...config,
              fontSize: Math.min(72, Math.max(10, parsed)),
            });
          }}
          className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue-primary"
        />
      </div>
    </div>
  </div>
);
