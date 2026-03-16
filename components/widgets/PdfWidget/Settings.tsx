import React from 'react';
import { useDashboard } from '@/context/useDashboard';
import { WidgetData, PdfConfig } from '@/types';

export const PdfSettings: React.FC<{ widget: WidgetData }> = ({ widget }) => {
  const { updateWidget } = useDashboard();
  const config = widget.config as PdfConfig;

  const handleBackToLibrary = () => {
    updateWidget(widget.id, {
      config: {
        ...config,
        activePdfId: null,
        activePdfUrl: null,
        activePdfName: null,
      },
    });
  };

  return (
    <div className="p-4 space-y-4">
      <div>
        <p className="text-xs font-black uppercase tracking-widest text-slate-500 mb-1">
          Current Document
        </p>
        <p className="text-sm text-slate-700 font-medium truncate">
          {config.activePdfName ?? 'None — library is shown'}
        </p>
      </div>
      {config.activePdfUrl && (
        <button
          onClick={handleBackToLibrary}
          className="w-full py-2 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-black uppercase tracking-wider transition-colors"
        >
          Switch to Another PDF
        </button>
      )}
      <p className="text-xs text-slate-400 font-bold">
        PDFs are stored in your cloud library and persist across sessions.
      </p>
    </div>
  );
};
