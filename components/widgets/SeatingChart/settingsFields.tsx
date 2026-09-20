import React from 'react';
import type { CustomRenderCtx } from '@/components/settings/schema/types';
import type { SeatingChartConfig } from '@/types';
import { useDialog } from '@/context/useDialog';
import { Eraser, Trash2 } from 'lucide-react';

const translate = (ctx: CustomRenderCtx, leaf: string) =>
  ctx.t(`widgetSettings.seating-chart.${leaf}`);

export const SeatingChartActionsField: React.FC<{
  ctx: CustomRenderCtx;
}> = ({ ctx }) => {
  const { showConfirm } = useDialog();

  const updateConfig = (patch: Partial<SeatingChartConfig>) =>
    ctx.updateConfig(patch as Record<string, unknown>);

  const handleClearAssignments = async () => {
    const confirmed = await showConfirm(
      translate(ctx, 'clearAssignmentsConfirmBody'),
      {
        title: translate(ctx, 'clearAssignmentsConfirmTitle'),
        variant: 'warning',
        confirmLabel: translate(ctx, 'clear'),
      }
    );
    if (confirmed) updateConfig({ assignments: {} });
  };

  const handleClearFurniture = async () => {
    const confirmed = await showConfirm(
      translate(ctx, 'clearFurnitureConfirmBody'),
      {
        title: translate(ctx, 'clearFurnitureConfirmTitle'),
        variant: 'danger',
        confirmLabel: translate(ctx, 'clearAll'),
      }
    );
    if (confirmed) updateConfig({ furniture: [], assignments: {} });
  };

  return (
    <div
      id={ctx.id}
      role="group"
      aria-labelledby={ctx.labelId}
      aria-describedby={ctx.describedBy}
      className="flex flex-col gap-2"
    >
      <button
        type="button"
        onClick={() => void handleClearAssignments()}
        className="flex w-full items-center gap-2 rounded-lg bg-red-50 p-3 text-left text-xs font-bold text-red-600 transition-colors hover:bg-red-100"
      >
        <Eraser className="h-4 w-4" aria-hidden="true" />
        {translate(ctx, 'clearAssignments')}
      </button>
      <button
        type="button"
        onClick={() => void handleClearFurniture()}
        className="flex w-full items-center gap-2 rounded-lg bg-slate-100 p-3 text-left text-xs font-bold text-slate-600 transition-colors hover:bg-slate-200"
      >
        <Trash2 className="h-4 w-4" aria-hidden="true" />
        {translate(ctx, 'clearFurniture')}
      </button>
    </div>
  );
};
