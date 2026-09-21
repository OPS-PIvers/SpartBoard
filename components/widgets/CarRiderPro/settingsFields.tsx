import React from 'react';
import { CarFront } from 'lucide-react';
import type { CustomRenderCtx } from '@/components/settings/schema/types';

export const CarRiderProManagedField: React.FC<{
  ctx: CustomRenderCtx;
}> = ({ ctx }) => (
  <div
    id={ctx.id}
    role="note"
    aria-labelledby={ctx.labelId}
    aria-describedby={ctx.describedBy}
    className="flex flex-col items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 p-4 text-center"
  >
    <CarFront className="h-6 w-6 text-slate-400" aria-hidden="true" />
    <p className="text-sm leading-relaxed text-slate-600">
      {ctx.t('widgetSettings.car-rider-pro.managedHelp')}
    </p>
  </div>
);
