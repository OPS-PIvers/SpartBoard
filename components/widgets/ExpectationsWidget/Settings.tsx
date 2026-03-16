import React from 'react';
import { useDashboard } from '@/context/useDashboard';
import { WidgetData, ExpectationsConfig } from '@/types';
import { LayoutGrid, LayoutList } from 'lucide-react';

const LAYOUTS: {
  id: 'secondary' | 'elementary';
  label: string;
  icon: typeof LayoutList;
}[] = [
  { id: 'secondary', label: 'Secondary', icon: LayoutList },
  { id: 'elementary', label: 'Elementary', icon: LayoutGrid },
];

export const ExpectationsSettings: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => {
  const { updateWidget } = useDashboard();
  const config = widget.config as ExpectationsConfig;

  return (
    <div className="space-y-6">
      <div>
        <label className="text-xxs text-slate-400 uppercase tracking-widest mb-3 block flex items-center gap-2">
          Layout Mode
        </label>
        <div className="grid grid-cols-2 gap-2">
          {LAYOUTS.map((l) => (
            <button
              key={l.id}
              onClick={() =>
                updateWidget(widget.id, {
                  config: {
                    ...config,
                    layout: l.id,
                  },
                })
              }
              className={`p-3 rounded-xl border-2 flex flex-col items-center gap-2 transition-all ${
                (config.layout ?? 'secondary') === l.id
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-slate-100 bg-white text-slate-500 hover:border-slate-200'
              }`}
            >
              <l.icon size={20} />
              <span className="text-xxs font-bold uppercase tracking-tight">
                {l.label}
              </span>
            </button>
          ))}
        </div>
        <p className="mt-2 text-xxxs text-slate-400 leading-relaxed">
          Secondary uses a single column list. Elementary uses a two-column
          grid.
        </p>
      </div>
    </div>
  );
};
