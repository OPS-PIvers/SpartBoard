import React, { useLayoutEffect, useRef } from 'react';
import { Pencil, Save, Trash2 } from 'lucide-react';
import type { SeatingChartConfig } from '@/types';
import { useDialog } from '@/context/useDialog';
import { tourAttr } from '@/config/tourAnchors';
import {
  MAX_SEATING_PLANS,
  cleanPlanName,
  deletePlan,
  getActivePlan,
  hasUnsavedSeats,
  renamePlan,
  saveAsNewPlan,
  switchPlan,
} from './seatingPlans';

interface SeatingPlanPickerProps {
  widgetId: string;
  config: SeatingChartConfig;
  onChange: (patch: Partial<SeatingChartConfig>) => void;
  addToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

export const SeatingPlanPicker: React.FC<SeatingPlanPickerProps> = ({
  widgetId,
  config,
  onChange,
  addToast,
}) => {
  const { showPrompt, showConfirm } = useDialog();
  // Dialogs are async; read the newest config when they resolve.
  const configRef = useRef(config);
  useLayoutEffect(() => {
    configRef.current = config;
  });

  const plans = config.savedPlans ?? [];
  const active = getActivePlan(config);

  const handleSave = async () => {
    if (plans.length >= MAX_SEATING_PLANS) {
      addToast(
        `You can save up to ${MAX_SEATING_PLANS} seating plans.`,
        'info'
      );
      return;
    }
    const current = getActivePlan(configRef.current);
    const name = await showPrompt(
      current ? 'Name the new seating plan.' : 'Name this seating plan.',
      {
        title: current ? 'Duplicate plan' : 'Save seating plan',
        placeholder: current ? 'Groups' : 'Test day',
        confirmLabel: 'Save',
      }
    );
    if (name === null) return;
    const clean = cleanPlanName(name);
    if (!clean) return;
    onChange(saveAsNewPlan(configRef.current, clean));
    addToast(`Saved "${clean}".`, 'success');
  };

  const handleSwitch = async (targetId: string) => {
    const latest = configRef.current;
    if (hasUnsavedSeats(latest)) {
      const ok = await showConfirm(
        "The seats on screen aren't saved in a plan. Switch anyway?",
        { title: 'Switch seating plan', confirmLabel: 'Switch' }
      );
      if (!ok) return;
    }
    const patch = switchPlan(configRef.current, targetId);
    if (patch) onChange(patch);
  };

  const handleRename = async () => {
    if (!active) return;
    const name = await showPrompt('New name for this seating plan.', {
      title: 'Rename plan',
      defaultValue: active.name,
      confirmLabel: 'Rename',
    });
    if (name === null) return;
    const clean = cleanPlanName(name);
    if (!clean) return;
    onChange(renamePlan(configRef.current, active.id, clean));
  };

  const handleDelete = async () => {
    if (!active) return;
    const ok = await showConfirm(`Delete the "${active.name}" seating plan?`, {
      title: 'Delete plan',
      variant: 'danger',
      confirmLabel: 'Delete',
    });
    if (!ok) return;
    onChange(deletePlan(configRef.current, active.id));
  };

  const iconButton =
    'p-1.5 rounded-md text-slate-500 hover:bg-slate-200 hover:text-slate-700 transition-colors disabled:opacity-40 disabled:hover:bg-transparent';

  return (
    <div className="p-2 border-b border-slate-200 space-y-1.5">
      <p className="text-xxs font-black text-slate-500 uppercase tracking-widest">
        Seating plan
      </p>
      {plans.length > 0 && (
        <div className="flex items-center gap-1">
          <select
            aria-label="Seating plan"
            {...tourAttr('seating.plan-select', widgetId, 'seating-chart')}
            value={active?.id ?? ''}
            onChange={(e) => {
              if (e.target.value) void handleSwitch(e.target.value);
            }}
            className="flex-1 min-w-0 p-1.5 text-xs border border-slate-200 bg-white rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none font-bold text-slate-700"
          >
            {!active && <option value="">Unsaved seats</option>}
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          {active && (
            <>
              <button
                type="button"
                {...tourAttr('seating.rename-plan', widgetId, 'seating-chart')}
                onClick={() => void handleRename()}
                className={iconButton}
                title="Rename plan"
                aria-label="Rename plan"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                {...tourAttr('seating.delete-plan', widgetId, 'seating-chart')}
                onClick={() => void handleDelete()}
                className={iconButton}
                title="Delete plan"
                aria-label="Delete plan"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </>
          )}
        </div>
      )}
      <button
        type="button"
        {...tourAttr('seating.save-plan', widgetId, 'seating-chart')}
        onClick={() => void handleSave()}
        className="w-full flex items-center justify-center gap-1.5 p-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg transition-colors text-xxs font-black uppercase tracking-wider"
      >
        <Save className="w-3.5 h-3.5 shrink-0" />
        {active ? 'Duplicate plan' : 'Save seating plan'}
      </button>
    </div>
  );
};
