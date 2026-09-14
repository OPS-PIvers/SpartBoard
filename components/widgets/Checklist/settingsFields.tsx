import React from 'react';
import type { CustomRenderCtx } from '@/components/settings/schema/types';
import { useDashboard } from '@/context/useDashboard';
import type {
  ChecklistItem,
  InstructionalRoutinesConfig,
  TextConfig,
} from '@/types';

export const ChecklistImportActionsField: React.FC<{
  ctx: CustomRenderCtx;
}> = ({ ctx }) => {
  const { activeDashboard, addToast } = useDashboard();

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
      className="grid grid-cols-2 gap-2"
    >
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
  );
};
