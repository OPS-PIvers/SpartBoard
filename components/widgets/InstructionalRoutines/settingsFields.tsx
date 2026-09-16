import React from 'react';
import { useDashboard } from '@/context/useDashboard';
import type { CustomRenderCtx } from '@/components/settings/schema/types';
import type { InstructionalRoutinesConfig } from '@/types';

export const SwitchRoutineField: React.FC<{ ctx: CustomRenderCtx }> = ({
  ctx,
}) => {
  const { updateWidget } = useDashboard();

  return (
    <button
      id={ctx.id}
      type="button"
      aria-labelledby={ctx.labelId}
      aria-describedby={ctx.describedBy}
      onClick={() =>
        updateWidget(ctx.widget.id, {
          flipped: false,
          config: {
            ...(ctx.config as unknown as InstructionalRoutinesConfig),
            selectedRoutineId: null,
          },
        })
      }
      className="w-full rounded-xl bg-brand-blue-lighter py-2.5 text-xxs font-semibold uppercase tracking-widest text-brand-blue-primary transition-colors hover:bg-brand-blue-light/20"
    >
      {ctx.t('widgetSettings.instructionalRoutines.switchRoutine')}
    </button>
  );
};
