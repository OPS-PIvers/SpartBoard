import React from 'react';
import type { CustomRenderCtx } from '@/components/settings/schema/types';

// One-line note for a settings tab whose content is managed elsewhere.
export const ManagedNotice: React.FC<{
  ctx: CustomRenderCtx;
  text: string;
  children?: React.ReactNode;
}> = ({ ctx, text, children }) => (
  <div
    id={ctx.id}
    role="note"
    aria-labelledby={ctx.labelId}
    aria-describedby={ctx.describedBy}
    className="flex flex-col gap-1 text-sm text-slate-600"
  >
    <p>{text}</p>
    {children}
  </div>
);
