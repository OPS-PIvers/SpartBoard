import React, { useId, useState } from 'react';
import type { CustomRenderCtx } from '@/components/settings/schema/types';
import { useDashboard } from '@/context/useDashboard';
import { useRosterGroupsGate } from '@/hooks/useRosterGroupsGate';
import { RosterGroupSelect } from '@/components/common/RosterGroupSelect';
import type {
  ChecklistItem,
  InstructionalRoutinesConfig,
  TextConfig,
} from '@/types';

export const ChecklistImportActionsField: React.FC<{
  ctx: CustomRenderCtx;
}> = ({ ctx }) => {
  const { activeDashboard, addToast } = useDashboard();
  const [pasted, setPasted] = useState('');
  const pasteId = useId();
  const pastedLines = pasted
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const addPastedTasks = () => {
    if (pastedLines.length === 0) return;
    const existing = (ctx.config.items as ChecklistItem[] | undefined) ?? [];
    ctx.updateConfig({
      items: [
        ...existing,
        ...pastedLines.map((text) => ({
          id: crypto.randomUUID(),
          text,
          completed: false,
        })),
      ],
      mode: 'manual',
    });
    setPasted('');
  };

  const writeItems = (items: ChecklistItem[], successMessage: string) => {
    ctx.updateConfig({ items, mode: 'manual' });
    addToast(successMessage, 'success');
  };

  const importRoutine = () => {
    const routine = activeDashboard?.widgets.find(
      (widget) => widget.type === 'instructionalRoutines'
    );
    if (!routine) {
      addToast(ctx.t('widgetSettings.checklist.noRoutine'), 'error');
      return;
    }
    const steps = (routine.config as InstructionalRoutinesConfig).customSteps;
    if (!steps?.length) {
      addToast(ctx.t('widgetSettings.checklist.emptyRoutine'), 'info');
      return;
    }
    writeItems(
      steps.map((step) => ({
        id: crypto.randomUUID(),
        text: step.text,
        completed: false,
      })),
      ctx.t('widgetSettings.checklist.routineImported')
    );
  };

  const importText = () => {
    const textWidgets =
      activeDashboard?.widgets.filter((widget) => widget.type === 'text') ?? [];
    for (const textWidget of textWidgets) {
      const raw = (textWidget.config as TextConfig).content ?? '';
      const parsed = new DOMParser().parseFromString(raw, 'text/html');
      const plain = (parsed.body.innerText ?? parsed.body.textContent ?? '')
        .replace(/\r\n/g, '\n')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
      if (plain.length > 0) {
        writeItems(
          plain.map((text) => ({
            id: crypto.randomUUID(),
            text,
            completed: false,
          })),
          ctx.t('widgetSettings.checklist.textImported')
        );
        return;
      }
    }
    addToast(
      ctx.t(
        textWidgets.length === 0
          ? 'widgetSettings.checklist.noTextWidget'
          : 'widgetSettings.checklist.emptyTextWidget'
      ),
      textWidgets.length === 0 ? 'error' : 'info'
    );
  };

  return (
    <div
      id={ctx.id}
      role="group"
      aria-labelledby={ctx.labelId}
      aria-describedby={ctx.describedBy}
      className="flex flex-col gap-2"
    >
      <label
        htmlFor={pasteId}
        className="text-xxs font-semibold text-slate-600"
      >
        {ctx.t('widgetSettings.checklist.pasteTasks')}
      </label>
      <textarea
        id={pasteId}
        value={pasted}
        onChange={(e) => setPasted(e.target.value)}
        placeholder={ctx.t('widgetSettings.checklist.pasteTasksPlaceholder')}
        rows={4}
        className="w-full text-xs border border-slate-200 bg-white rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <button
        type="button"
        onClick={addPastedTasks}
        disabled={pastedLines.length === 0}
        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:border-brand-blue-primary hover:text-brand-blue-primary disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {ctx.t('widgetSettings.checklist.addPastedTasks', {
          count: pastedLines.length,
        })}
      </button>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={importRoutine}
          className="rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
        >
          {ctx.t('widgetSettings.checklist.importRoutine')}
        </button>
        <button
          type="button"
          onClick={importText}
          className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
        >
          {ctx.t('widgetSettings.checklist.importText')}
        </button>
      </div>
    </div>
  );
};

/**
 * Pool picker (docs/plans/ROSTER_GROUPS_INTEGRATION.md D22). Checklist has no
 * class chip to hang the group submenu off, so the pool lives here instead —
 * the one deviation from D8's "class-picker submenu" placement.
 */
export const ChecklistPoolGroupField: React.FC<{ ctx: CustomRenderCtx }> = ({
  ctx,
}) => {
  const { rosters, activeRosterId } = useDashboard();
  const enabled = useRosterGroupsGate();
  const activeRoster = rosters.find((roster) => roster.id === activeRosterId);

  if (!enabled) {
    return (
      <p id={ctx.id} className="text-xs text-slate-500">
        {ctx.t('widgetSettings.checklist.rosterGroupsOff')}
      </p>
    );
  }
  if ((activeRoster?.groups?.length ?? 0) === 0) {
    return (
      <p id={ctx.id} className="text-xs text-slate-500">
        {ctx.t('widgetSettings.checklist.poolGroupEmpty')}
      </p>
    );
  }

  return (
    <RosterGroupSelect
      id={ctx.id}
      roster={activeRoster}
      value={(ctx.config.rosterPoolGroupId as string | null) ?? null}
      onChange={(groupId) => ctx.updateConfig({ rosterPoolGroupId: groupId })}
      wholeClassLabel={ctx.t('widgetSettings.checklist.poolWholeClass')}
      ariaLabel={ctx.t('widgetSettings.checklist.poolGroup')}
    />
  );
};
