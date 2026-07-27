import React, { useId } from 'react';
import { useDashboard } from '@/context/useDashboard';
import { SettingsLabel } from '@/components/common/SettingsLabel';

interface RosterModeControlProps {
  rosterMode: 'class' | 'custom';
  onModeChange: (mode: 'class' | 'custom') => void;
}

export const RosterModeControl: React.FC<RosterModeControlProps> = ({
  rosterMode,
  onModeChange,
}) => {
  const { activeRosterId, rosters } = useDashboard();
  const activeRoster = rosters.find((r) => r.id === activeRosterId);
  const rosterModeLabelId = useId();

  return (
    <div className="space-y-2 mb-4">
      <div className="flex items-center justify-between p-2 bg-slate-50 rounded-xl border border-slate-100">
        <SettingsLabel as="span" id={rosterModeLabelId} className="mb-0">
          Roster Selection
        </SettingsLabel>
        <div
          role="group"
          aria-labelledby={rosterModeLabelId}
          className="flex bg-slate-200/50 p-0.5 rounded-lg"
        >
          <button
            type="button"
            onClick={() => onModeChange('class')}
            className={`px-3 py-1 text-xxs font-bold uppercase rounded-md transition-[color,background-color,box-shadow] ${
              rosterMode === 'class'
                ? 'bg-white text-brand-blue-primary shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Auto
          </button>
          <button
            type="button"
            onClick={() => onModeChange('custom')}
            className={`px-3 py-1 text-xxs font-bold uppercase rounded-md transition-[color,background-color,box-shadow] ${
              rosterMode === 'custom'
                ? 'bg-white text-brand-blue-primary shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Custom
          </button>
        </div>
      </div>

      {rosterMode === 'class' && (
        <div className="px-2 py-1.5 bg-blue-50/50 border border-blue-100 rounded-lg flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
            <span className="text-xxs font-bold text-blue-700 uppercase tracking-tight truncate max-w-[150px]">
              {activeRoster
                ? `Active: ${activeRoster.name}`
                : 'No Active Class'}
            </span>
          </div>
          {activeRoster && (
            <span className="text-xxxs font-black text-blue-400 bg-white px-1.5 py-0.5 rounded-md border border-blue-100 whitespace-nowrap">
              {activeRoster.students.length} Students
            </span>
          )}
        </div>
      )}
    </div>
  );
};
