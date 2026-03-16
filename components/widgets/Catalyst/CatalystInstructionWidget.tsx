import React from 'react';
import { WidgetData, CatalystInstructionConfig } from '@/types';

import { WidgetLayout } from '@/components/widgets/WidgetLayout';

export const CatalystInstructionWidget: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => {
  const config = widget.config as CatalystInstructionConfig;
  const title = config.title ?? 'Instruction Guide';
  const instructions = config.instructions ?? '';

  return (
    <WidgetLayout
      padding="p-0"
      content={
        <div
          className="bg-amber-50 h-full w-full overflow-y-auto text-slate-800 font-serif leading-relaxed custom-scrollbar shadow-inner"
          style={{ padding: 'min(16px, 3cqmin)' }}
        >
          <h3
            className="font-bold text-slate-900 border-b border-amber-200 uppercase tracking-tight"
            style={{
              fontSize: 'min(20px, 5cqmin)',
              marginBottom: 'min(12px, 2.5cqmin)',
              paddingBottom: 'min(8px, 1.5cqmin)',
            }}
          >
            {title}
          </h3>
          <div
            className="whitespace-pre-line"
            style={{ fontSize: 'min(14px, 3.5cqmin)' }}
          >
            {instructions}
          </div>
        </div>
      }
    />
  );
};

export const CatalystInstructionSettings: React.FC<{ widget: WidgetData }> = ({
  widget: _widget,
}) => {
  return (
    <div className="p-4 text-center">
      <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">
        Guide Mode Controls
      </p>
    </div>
  );
};
