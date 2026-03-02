import React from 'react';
import { useDashboard } from '@/context/useDashboard';
import { WidgetData, SeatingChartConfig } from '@/types';
import { RosterModeControl } from '@/components/common/RosterModeControl';
import { Trash2, Eraser } from 'lucide-react';
import { SettingsLabel } from '@/components/common/SettingsLabel';

export const SeatingChartSettings: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => {
  const { updateWidget } = useDashboard();
  const config = widget.config as SeatingChartConfig;
  const { rosterMode = 'class', names = '' } = config;

  const handleClearAssignments = () => {
    if (confirm('Clear all student assignments?')) {
      updateWidget(widget.id, {
        config: { ...config, assignments: {} },
      });
    }
  };

  const handleClearFurniture = () => {
    if (confirm('Clear all furniture? This will also clear assignments.')) {
      updateWidget(widget.id, {
        config: { ...config, furniture: [], assignments: {} },
      });
    }
  };

  return (
    <div className="space-y-6">
      <RosterModeControl
        rosterMode={rosterMode}
        onModeChange={(mode) =>
          updateWidget(widget.id, {
            config: { ...config, rosterMode: mode },
          })
        }
      />

      {rosterMode === 'custom' && (
        <div className="space-y-2">
          <SettingsLabel>Custom Roster</SettingsLabel>
          <textarea
            value={names}
            onChange={(e) =>
              updateWidget(widget.id, {
                config: { ...config, names: e.target.value },
              })
            }
            placeholder="Enter student names (one per line)..."
            className="w-full h-40 p-3 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-blue-primary resize-none font-sans"
          />
        </div>
      )}

      <div className="space-y-3">
        <SettingsLabel>Actions</SettingsLabel>

        <button
          onClick={handleClearAssignments}
          className="w-full flex items-center gap-2 p-3 bg-red-50 text-red-600 rounded-xl hover:bg-red-100 transition-colors text-xs font-bold"
        >
          <Eraser className="w-4 h-4" />
          Clear Assignments Only
        </button>

        <button
          onClick={handleClearFurniture}
          className="w-full flex items-center gap-2 p-3 bg-slate-100 text-slate-600 rounded-xl hover:bg-slate-200 transition-colors text-xs font-bold"
        >
          <Trash2 className="w-4 h-4" />
          Clear All (Reset)
        </button>
      </div>
    </div>
  );
};
