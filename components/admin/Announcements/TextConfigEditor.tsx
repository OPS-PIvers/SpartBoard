import React from 'react';

import { tourAttr } from '@/config/tourAnchors';
import { TextConfig } from '@/types';
import { DraftNumberField } from '@/components/admin/DraftNumberField';

const clamp = (n: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, n));

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
        {...tourAttr('admin.announcements.text-content')}
        value={config.content ?? ''}
        onChange={(e) => onChange({ ...config, content: e.target.value })}
        className="w-full h-28 px-3 py-2 text-sm border border-slate-300 rounded-lg resize-none focus:outline-hidden focus:ring-2 focus:ring-brand-blue-primary"
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
            {...tourAttr('admin.announcements.text-bg-color')}
            type="color"
            value={config.bgColor ?? '#ffeb3b'}
            onChange={(e) => onChange({ ...config, bgColor: e.target.value })}
            className="w-10 h-8 border border-slate-300 rounded-sm cursor-pointer"
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
        <DraftNumberField
          {...tourAttr('admin.announcements.text-font-size')}
          min={10}
          max={72}
          value={config.fontSize ?? 18}
          onCommit={(n) =>
            onChange({ ...config, fontSize: clamp(Math.round(n), 10, 72) })
          }
          className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-brand-blue-primary"
        />
      </div>
    </div>
  </div>
);
