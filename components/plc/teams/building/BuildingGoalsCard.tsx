// Building Hub goals: every goal the team keeps, SMART or plain, with the goal editor for leads.

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import type { Plc, PlcGoal } from '@/types';
import { GoalEditorModal } from '@/components/plc/goals/GoalEditorModal';
import { useGoalGradeLevels } from '@/components/plc/goals/routineOptions';
import { SectionHead, TextLink } from '@/components/plc/redesignMockup/ui';
import { GoalProgressMeter } from '../data/GoalProgressMeter';
import { useGoals } from '../data/useDataOverview';
import { tourAttr, tourFieldAttr } from '@/config/tourAnchors';

export const BuildingGoalsView: React.FC<{
  goals: PlcGoal[];
  isLead: boolean;
  onAdd?: () => void;
  onEdit?: (goal: PlcGoal) => void;
}> = ({ goals, isLead, onAdd, onEdit }) => {
  const { t } = useTranslation();
  return (
    <div className="min-w-0">
      <SectionHead title={t('plcGoals.goals', { defaultValue: 'Goals' })}>
        {isLead && onAdd && (
          <TextLink
            icon={Plus}
            {...tourAttr('teams.building.add-goal')}
            onClick={onAdd}
          >
            {t('plcGoals.add', { defaultValue: 'Add goal' })}
          </TextLink>
        )}
      </SectionHead>
      {goals.length === 0 ? (
        <p className="text-sm text-slate-500">
          {t('plcGoals.empty', { defaultValue: 'No goals yet.' })}
        </p>
      ) : (
        <ol className="divide-y divide-slate-100">
          {goals.map((goal) => (
            <li key={goal.id} className="py-3 first:pt-0">
              <div className="flex items-start gap-4">
                <p className="min-w-0 flex-1 text-base leading-relaxed text-slate-800">
                  {goal.title}
                </p>
                {isLead && onEdit && (
                  <TextLink
                    quiet
                    className="mt-1"
                    {...tourFieldAttr(
                      'teams.building.edit-goal',
                      'teams-building',
                      goal.id
                    )}
                    onClick={() => onEdit(goal)}
                  >
                    {t('plcDashboard.comments.edit', { defaultValue: 'Edit' })}
                  </TextLink>
                )}
              </div>
              {goal.current !== undefined && goal.target !== undefined && (
                <div className="max-w-xl">
                  <GoalProgressMeter
                    current={goal.current}
                    target={goal.target}
                    {...(goal.baseline !== undefined
                      ? { baseline: goal.baseline }
                      : {})}
                  />
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
};

export const BuildingGoalsCard: React.FC<{ plc: Plc; isLead: boolean }> = ({
  plc,
  isLead,
}) => {
  const { goals, saveGoal, deleteGoal, routines } = useGoals(plc);
  const gradeLevels = useGoalGradeLevels(plc);
  const [editing, setEditing] = useState<PlcGoal | 'new' | null>(null);
  return (
    <>
      <BuildingGoalsView
        goals={goals}
        isLead={isLead}
        onAdd={() => setEditing('new')}
        onEdit={setEditing}
      />
      {editing && (
        <GoalEditorModal
          goal={editing === 'new' ? null : editing}
          allowPlain
          showProgress
          nextOrder={goals.length}
          routines={routines}
          gradeLevels={gradeLevels}
          onSave={async (draft) => {
            await saveGoal(draft);
          }}
          onDelete={
            editing === 'new' ? undefined : () => deleteGoal(editing.id)
          }
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
};
