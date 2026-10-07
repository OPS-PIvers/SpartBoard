// The production Team type defaults view on fixtures at /teams-admin-defaults-dev (auth-bypass builds only).

import React, { useState } from 'react';
import { Settings } from 'lucide-react';
import type { PlcGroupType, TeamTypeDefaults } from '@/types';
import { TeamTypeDefaultsView } from './TeamTypeDefaultsView';
import { TEAM_TYPE_LABELS, TEAM_TYPE_ORDER } from './teamTypeDefaultsModel';

const EMPTY: TeamTypeDefaults = { types: {} };

function readParams() {
  const params = new URLSearchParams(window.location.search);
  const type = params.get('type') as PlcGroupType | null;
  return {
    type: type && TEAM_TYPE_ORDER.includes(type) ? type : 'plc',
    capture: params.get('capture') === '1',
  };
}

export const TeamsAdminDefaultsDevHarness: React.FC = () => {
  const [initial] = useState(readParams);
  const [type, setType] = useState<PlcGroupType>(initial.type);
  const [defaults, setDefaults] = useState<TeamTypeDefaults>(EMPTY);

  return (
    <div
      className={`flex flex-col bg-white font-sans ${initial.capture ? 'min-h-screen' : 'h-screen [height:100dvh] overflow-hidden'}`}
    >
      <div className="flex shrink-0 flex-wrap items-center gap-4 border-b border-slate-200 bg-slate-100 px-4 py-2 text-xs text-slate-700">
        <span className="font-bold uppercase tracking-widest text-slate-500">
          Build
        </span>
        <label className="flex items-center gap-2">
          Type
          <select
            value={type}
            onChange={(e) => setType(e.target.value as PlcGroupType)}
            className="rounded border border-slate-300 bg-white px-2 py-1"
          >
            {TEAM_TYPE_ORDER.map((t) => (
              <option key={t} value={t}>
                {TEAM_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="hidden shrink-0 bg-brand-blue-dark text-white md:block md:w-[76px] lg:w-60">
          <div className="flex h-14 items-center px-4">
            <span className="hidden items-center gap-2 text-base font-bold lg:flex">
              <Settings className="h-4 w-4 text-white/70" />
              Admin Settings
            </span>
          </div>
        </div>
        <div className="min-w-0 flex-1 overflow-y-auto bg-slate-50">
          <div className="p-4 md:p-6">
            <TeamTypeDefaultsView
              key={type}
              initialType={type}
              defaults={defaults}
              onSave={(t, preset, rubric) => {
                setDefaults((d) => ({
                  types: { ...d.types, [t]: preset },
                  goalCoachRubric: rubric ?? d.goalCoachRubric,
                }));
                return Promise.resolve();
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
