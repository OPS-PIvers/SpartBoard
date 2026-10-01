// Goals tile: the group's goals and the practices each one leans on.

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Info, Pencil, Plus, Target } from 'lucide-react';
import type { PlcGoal, RoutineGuideRoutine } from '@/types';
import { hasRoutineInfo } from '@/config/routineGuide';
import { RoutineInfoModal } from '@/components/widgets/RoutineGuide/RoutineInfoModal';
import { usePlcGoals } from '@/hooks/usePlcGoals';
import { canEditPlcContent } from '@/utils/plc';
import { GoalEditorModal } from '@/components/plc/goals/GoalEditorModal';
import {
  routineFor,
  useGoalRoutineOptions,
} from '@/components/plc/goals/routineOptions';
import { TileEmpty, TileFrame } from './TileFrame';
import type { PlcHomeTileProps } from './tileTypes';

const COMPACT_LIMIT = 3;

export const GoalsTile: React.FC<PlcHomeTileProps> = ({
  ctx,
  hero,
  controls,
}) => {
  const { t } = useTranslation();
  const { plc, uid } = ctx;
  const { goals, loading, saveGoal, deleteGoal } = usePlcGoals(plc.id);
  const routines = useGoalRoutineOptions();
  const canEdit = !!uid && canEditPlcContent(plc, uid);
  const [editing, setEditing] = useState<PlcGoal | 'new' | null>(null);
  const [info, setInfo] = useState<RoutineGuideRoutine | null>(null);

  const shown = hero ? goals : goals.slice(0, COMPACT_LIMIT);

  return (
    <TileFrame
      icon={Target}
      title={t('plcGoals.title', { defaultValue: 'Goals' })}
      hero={hero}
      headerExtra={
        <>
          {canEdit && (
            <button
              type="button"
              onClick={() => setEditing('new')}
              aria-label={t('plcGoals.add', { defaultValue: 'Add goal' })}
              title={t('plcGoals.add', { defaultValue: 'Add goal' })}
              className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary/40"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
          {controls}
        </>
      }
    >
      {loading ? null : goals.length === 0 ? (
        <TileEmpty>
          {t('plcGoals.empty', { defaultValue: 'No goals yet.' })}
        </TileEmpty>
      ) : (
        <ol className="flex flex-col divide-y divide-slate-100">
          {shown.map((goal) => (
            <li key={goal.id} className="group py-2.5 first:pt-0">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p
                    className={`font-semibold text-slate-800 ${hero ? 'text-base' : 'text-sm'}`}
                  >
                    {goal.title}
                  </p>
                  {goal.measure && (
                    <p className="text-xs text-slate-500">{goal.measure}</p>
                  )}
                </div>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => setEditing(goal)}
                    aria-label={t('plcGoals.edit', {
                      title: goal.title,
                      defaultValue: 'Edit {{title}}',
                    })}
                    className="shrink-0 rounded-md p-1 text-slate-300 hover:bg-slate-100 hover:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary/40"
                  >
                    <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                )}
              </div>
              {goal.practices.length > 0 && (
                <ul className="mt-1.5 flex flex-col gap-1">
                  {goal.practices.map((p) => {
                    const routine = p.routineId
                      ? routineFor(routines, p.routineId)
                      : null;
                    return (
                      <li
                        key={p.id}
                        className="flex items-center gap-2 text-sm text-slate-700"
                      >
                        <span
                          className="h-1.5 w-1.5 shrink-0 rounded-full bg-slate-300"
                          aria-hidden="true"
                        />
                        <span className="min-w-0">
                          {routine?.name ?? p.text}
                        </span>
                        {routine && hasRoutineInfo(routine) && (
                          <button
                            type="button"
                            onClick={() => setInfo(routine)}
                            aria-label={t('plcGoals.routineInfo', {
                              name: routine.name,
                              defaultValue: 'About {{name}}',
                            })}
                            title={t('plcGoals.routineInfo', {
                              name: routine.name,
                              defaultValue: 'About {{name}}',
                            })}
                            className="shrink-0 rounded-md p-0.5 text-slate-400 hover:bg-slate-100 hover:text-brand-blue-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary/40"
                          >
                            <Info className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          ))}
          {!hero && goals.length > COMPACT_LIMIT && (
            <li className="pt-2 text-xs text-slate-500">
              {t('plcGoals.more', {
                count: goals.length - COMPACT_LIMIT,
                defaultValue: '{{count}} more',
              })}
            </li>
          )}
        </ol>
      )}
      {info && (
        <RoutineInfoModal routine={info} onClose={() => setInfo(null)} />
      )}
      {editing && (
        <GoalEditorModal
          goal={editing === 'new' ? null : editing}
          nextOrder={goals.length}
          routines={routines}
          onSave={async (draft) => {
            await saveGoal(draft);
          }}
          onDelete={
            editing === 'new' ? undefined : () => deleteGoal(editing.id)
          }
          onClose={() => setEditing(null)}
        />
      )}
    </TileFrame>
  );
};
