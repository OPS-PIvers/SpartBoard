import React from 'react';
import { WidgetData, GuidedLearningConfig } from '@/types';
import { useDashboard } from '@/context/useDashboard';

export const GuidedLearningSettings: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => {
  const { updateWidget } = useDashboard();
  const config = widget.config as GuidedLearningConfig;

  const update = (patch: Partial<GuidedLearningConfig>) => {
    updateWidget(widget.id, {
      config: { ...config, ...patch } as GuidedLearningConfig,
    });
  };

  return (
    <div className="p-4 space-y-4">
      <h3 className="text-white font-semibold text-sm">
        Guided Learning Settings
      </h3>
      <div className="text-slate-400 text-xs">
        Use the main widget panel to create, edit, and assign guided learning
        sets. Settings are configured per-set inside the editor.
      </div>
      <button
        onClick={() => update({ view: 'library' })}
        className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm rounded-lg transition-colors"
      >
        Go to Library
      </button>
    </div>
  );
};
