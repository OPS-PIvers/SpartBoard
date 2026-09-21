import React from 'react';
import type { CustomRenderCtx } from '@/components/settings/schema/types';
import type { PdfConfig } from '@/types';

export const PdfCurrentDocumentField: React.FC<{
  ctx: CustomRenderCtx;
}> = ({ ctx }) => {
  const config = ctx.config as unknown as PdfConfig;

  const handleBackToLibrary = () => {
    ctx.updateConfig({
      activePdfId: null,
      activePdfUrl: null,
      activePdfName: null,
    });
  };

  return (
    <div
      id={ctx.id}
      role="group"
      aria-labelledby={ctx.labelId}
      aria-describedby={ctx.describedBy}
      className="flex flex-col gap-3"
    >
      <p className="truncate text-sm font-medium text-slate-700">
        {config.activePdfName ?? ctx.t('widgetSettings.pdf.none')}
      </p>
      {config.activePdfUrl && (
        <button
          type="button"
          onClick={handleBackToLibrary}
          className="w-full rounded-lg bg-slate-100 px-4 py-2 text-xs font-black uppercase tracking-wider text-slate-700 transition-colors hover:bg-slate-200"
        >
          {ctx.t('widgetSettings.pdf.switchDocument')}
        </button>
      )}
      <p className="text-xs font-bold text-slate-400">
        {ctx.t('widgetSettings.pdf.storageNote')}
      </p>
    </div>
  );
};
