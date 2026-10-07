// The Admin Settings tab: live defaults plus the save, around the presentational view.

import React from 'react';
import { Loader2 } from 'lucide-react';
import { useDashboard } from '@/context/useDashboard';
import { useTeamTypeDefaults } from '@/hooks/useTeamLayout';
import type { GoalCoachCriterion, PlcGroupType, TeamTypePreset } from '@/types';
import { TeamTypeDefaultsView } from './TeamTypeDefaultsView';
import { saveTeamTypeDefaults } from './saveTeamTypeDefaults';

export const TeamTypeDefaultsPanel: React.FC = () => {
  const defaults = useTeamTypeDefaults();
  const { addToast } = useDashboard();

  const handleSave = async (
    type: PlcGroupType,
    preset: TeamTypePreset,
    rubric?: GoalCoachCriterion[]
  ) => {
    try {
      await saveTeamTypeDefaults(type, preset, rubric);
    } catch (err) {
      console.error('[TeamTypeDefaults] save failed:', err);
      addToast('That change could not be saved.', 'error');
      throw err;
    }
  };

  if (!defaults) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-slate-400" aria-hidden />
      </div>
    );
  }
  return <TeamTypeDefaultsView defaults={defaults} onSave={handleSave} />;
};
