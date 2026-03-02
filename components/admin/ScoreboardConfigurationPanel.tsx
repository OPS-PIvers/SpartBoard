import React, { useState } from 'react';
import { BUILDINGS } from '@/config/buildings';
import {
  ScoreboardGlobalConfig,
  BuildingScoreboardDefaults,
  ScoreboardDefaultTeam,
} from '@/types';
import { Plus, Trash2, GripVertical } from 'lucide-react';

interface ScoreboardConfigurationPanelProps {
  config: ScoreboardGlobalConfig;
  onChange: (newConfig: ScoreboardGlobalConfig) => void;
}

// Must match TEAM_COLORS in ScoreboardItem.tsx — these are the only valid
// color classes the scoreboard widget knows how to render.
const SCOREBOARD_COLORS = [
  'bg-blue-500',
  'bg-red-500',
  'bg-green-500',
  'bg-yellow-500',
  'bg-purple-500',
  'bg-pink-500',
  'bg-indigo-500',
  'bg-orange-500',
  'bg-teal-600',
  'bg-cyan-500',
];

const DEFAULT_TEAMS: ScoreboardDefaultTeam[] = [
  { id: crypto.randomUUID(), name: 'Team A', color: 'bg-blue-500' },
  { id: crypto.randomUUID(), name: 'Team B', color: 'bg-red-500' },
];

export const ScoreboardConfigurationPanel: React.FC<
  ScoreboardConfigurationPanelProps
> = ({ config, onChange }) => {
  const [selectedBuildingId, setSelectedBuildingId] = useState<string>(
    BUILDINGS[0].id
  );

  const buildingDefaults = config.buildingDefaults ?? {};
  const currentBuildingConfig: BuildingScoreboardDefaults = buildingDefaults[
    selectedBuildingId
  ] ?? {
    buildingId: selectedBuildingId,
    teams: DEFAULT_TEAMS,
  };

  const teams: ScoreboardDefaultTeam[] =
    currentBuildingConfig.teams ?? DEFAULT_TEAMS;

  const handleUpdateBuilding = (
    updates: Partial<BuildingScoreboardDefaults>
  ) => {
    onChange({
      ...config,
      buildingDefaults: {
        ...buildingDefaults,
        [selectedBuildingId]: {
          ...currentBuildingConfig,
          ...updates,
        },
      },
    });
  };

  const handleAddTeam = () => {
    const nextColor =
      SCOREBOARD_COLORS[teams.length % SCOREBOARD_COLORS.length];
    handleUpdateBuilding({
      teams: [
        ...teams,
        {
          id: crypto.randomUUID(),
          name: `Team ${teams.length + 1}`,
          color: nextColor,
        },
      ],
    });
  };

  const handleUpdateTeam = (
    id: string,
    updates: Partial<ScoreboardDefaultTeam>
  ) => {
    const next = teams.map((t) => (t.id === id ? { ...t, ...updates } : t));
    handleUpdateBuilding({ teams: next });
  };

  const handleRemoveTeam = (id: string) => {
    handleUpdateBuilding({ teams: teams.filter((t) => t.id !== id) });
  };

  const handleResetToDefault = () => {
    handleUpdateBuilding({ teams: DEFAULT_TEAMS });
  };

  return (
    <div className="space-y-6">
      {/* Building Selector */}
      <div>
        <label className="text-xxs font-bold text-slate-500 uppercase mb-2 block">
          Configure Building Scoreboard Defaults
        </label>
        <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar">
          {BUILDINGS.map((building) => (
            <button
              key={building.id}
              onClick={() => setSelectedBuildingId(building.id)}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg border whitespace-nowrap transition-colors ${
                selectedBuildingId === building.id
                  ? 'bg-brand-blue-primary text-white border-brand-blue-primary shadow-sm'
                  : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
              }`}
            >
              {building.name}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 space-y-4">
        <p className="text-xxs text-slate-500 leading-tight">
          These defaults will pre-populate the Scoreboard widget when a teacher
          in <b>{BUILDINGS.find((b) => b.id === selectedBuildingId)?.name}</b>{' '}
          adds it to their dashboard.
        </p>

        {/* Team List */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xxs font-bold text-slate-500 uppercase block">
              Default Teams ({teams.length})
            </label>
            <button
              onClick={handleResetToDefault}
              className="text-xxs text-slate-400 hover:text-slate-600 font-medium transition-colors"
            >
              Reset to defaults
            </button>
          </div>

          <div className="space-y-1.5 mb-3">
            {teams.map((team) => (
              <div key={team.id} className="space-y-1.5">
                <div className="bg-white border border-slate-200 rounded-lg px-2 py-1.5 flex items-center gap-2 shadow-sm">
                  <GripVertical className="w-3.5 h-3.5 text-slate-300 shrink-0" />

                  {/* Color swatch showing current color */}
                  <div
                    className={`w-4 h-4 rounded-full shrink-0 ${team.color ?? 'bg-blue-500'}`}
                  />

                  <input
                    type="text"
                    value={team.name}
                    onChange={(e) =>
                      handleUpdateTeam(team.id, { name: e.target.value })
                    }
                    className="flex-1 text-xs border-none outline-none bg-transparent font-medium"
                    placeholder="Team name..."
                  />

                  <button
                    onClick={() => handleRemoveTeam(team.id)}
                    disabled={teams.length <= 2}
                    className="text-red-400 hover:text-red-600 p-0.5 shrink-0 disabled:opacity-30 disabled:cursor-not-allowed"
                    title={
                      teams.length <= 2
                        ? 'Minimum 2 teams required'
                        : 'Remove team'
                    }
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Color palette row */}
                <div className="flex gap-1 pl-6">
                  {SCOREBOARD_COLORS.map((colorClass) => (
                    <button
                      key={colorClass}
                      onClick={() =>
                        handleUpdateTeam(team.id, { color: colorClass })
                      }
                      className={`w-4 h-4 rounded-full ${colorClass} transition-transform hover:scale-125 ${
                        team.color === colorClass
                          ? 'ring-2 ring-offset-1 ring-slate-400'
                          : ''
                      }`}
                      title={colorClass}
                    />
                  ))}
                </div>
              </div>
            ))}

            {teams.length === 0 && (
              <div className="text-center py-4 border-2 border-dashed border-slate-200 rounded-xl text-slate-400 text-xxs italic">
                No default teams configured.
              </div>
            )}
          </div>

          {/* Add team button */}
          <button
            onClick={handleAddTeam}
            disabled={teams.length >= 8}
            className="flex items-center gap-1 px-3 py-1.5 text-xxs font-bold bg-brand-blue-primary text-white rounded hover:bg-brand-blue-dark disabled:opacity-40 disabled:cursor-not-allowed transition-colors w-full justify-center"
          >
            <Plus className="w-3 h-3" /> Add Team
          </button>
          {teams.length >= 8 && (
            <p className="text-xxs text-slate-400 text-center mt-1">
              Maximum 8 teams
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
