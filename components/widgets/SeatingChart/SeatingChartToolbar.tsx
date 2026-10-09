import React from 'react';
import {
  RotateCw,
  RotateCcw,
  Trash2,
  Dice5,
  MousePointer2,
} from 'lucide-react';
import { Button } from '@/components/common/Button';
import { tourAttr, tourFieldAttr } from '@/config/tourAnchors';
import {
  ActiveClassChip,
  type ActiveClassChipGroupSelection,
} from '@/components/common/ActiveClassChip';

interface SeatingChartToolbarProps {
  widgetId?: string;
  mode: 'setup' | 'assign' | 'interact';
  setMode: (mode: 'setup' | 'assign' | 'interact') => void;
  pickRandom: () => void;
  isPickingRandom: boolean;
  multiSelected: boolean;
  selectedCount: number;
  rotateSelected: (delta: number) => void;
  deleteSelected: () => void;
  rosterMode: 'class' | 'custom';
  /** Passed only when class groups are switched on for this teacher. */
  groupSelection?: ActiveClassChipGroupSelection;
}

export const SeatingChartToolbar: React.FC<SeatingChartToolbarProps> = ({
  widgetId,
  mode,
  setMode,
  pickRandom,
  isPickingRandom,
  multiSelected,
  selectedCount,
  rotateSelected,
  deleteSelected,
  rosterMode,
  groupSelection,
}) => {
  return (
    <div className="h-12 bg-slate-50 border-b border-slate-200 flex items-center px-2 gap-2 justify-between shrink-0">
      <div className="flex bg-slate-100 p-1 rounded-lg shrink-0">
        <button
          {...tourFieldAttr('seating.mode', 'seating-chart', 'interact')}
          onClick={() => setMode('interact')}
          className={`px-3 py-1 text-xs font-black uppercase rounded-md transition-all ${mode === 'interact' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:bg-slate-100'}`}
        >
          Interact
        </button>
        <button
          {...tourFieldAttr('seating.mode', 'seating-chart', 'assign')}
          onClick={() => setMode('assign')}
          className={`px-3 py-1 text-xs font-black uppercase rounded-md transition-all ${mode === 'assign' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:bg-slate-100'}`}
        >
          Assign
        </button>
        <button
          {...tourFieldAttr('seating.mode', 'seating-chart', 'setup')}
          onClick={() => setMode('setup')}
          className={`px-3 py-1 text-xs font-black uppercase rounded-md transition-all ${mode === 'setup' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:bg-slate-100'}`}
        >
          Setup
        </button>
      </div>

      <div className="ml-auto flex items-center gap-2 min-w-0">
        {rosterMode === 'class' && (
          <ActiveClassChip
            compact
            {...(groupSelection ? { groupSelection } : {})}
          />
        )}

        {mode === 'interact' && (
          <Button
            {...tourAttr('seating.pick-random', widgetId, 'seating-chart')}
            onClick={pickRandom}
            variant="primary"
            size="sm"
            icon={<Dice5 className="w-4 h-4" />}
            disabled={isPickingRandom}
          >
            Pick Random
          </Button>
        )}

        {/* Multi-select group action bar */}
        {mode === 'setup' && multiSelected && (
          <div className="flex items-center gap-1 bg-indigo-50 border border-indigo-200 rounded-lg px-2 py-1">
            <MousePointer2 className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
            <span className="text-xxs font-black text-indigo-600 uppercase tracking-wide">
              {selectedCount} selected
            </span>
            <div className="w-px h-4 bg-indigo-200 mx-0.5" />
            <button
              {...tourAttr(
                'seating.rotate-selected-left',
                widgetId,
                'seating-chart'
              )}
              onClick={() => rotateSelected(-45)}
              className="p-1 hover:bg-indigo-100 rounded text-indigo-600 transition-colors"
              title="Rotate all left 45°"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
            <button
              {...tourAttr(
                'seating.rotate-selected-right',
                widgetId,
                'seating-chart'
              )}
              onClick={() => rotateSelected(45)}
              className="p-1 hover:bg-indigo-100 rounded text-indigo-600 transition-colors"
              title="Rotate all right 45°"
            >
              <RotateCw className="w-3.5 h-3.5" />
            </button>
            <div className="w-px h-4 bg-indigo-200 mx-0.5" />
            <button
              {...tourAttr(
                'seating.remove-selected',
                widgetId,
                'seating-chart'
              )}
              onClick={deleteSelected}
              className="p-1 hover:bg-red-50 rounded text-red-500 transition-colors"
              title="Delete all selected"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
