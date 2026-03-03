import React from 'react';
import { Play, BookDown } from 'lucide-react';
import { GlobalMiniAppItem, MiniAppItem } from '@/types';

interface GlobalAppRowProps {
  app: GlobalMiniAppItem;
  onRun: (app: MiniAppItem) => void;
  onSaveToLibrary: (app: GlobalMiniAppItem) => void;
  isSaving: boolean;
}

export const GlobalAppRow: React.FC<GlobalAppRowProps> = ({
  app,
  onRun,
  onSaveToLibrary,
  isSaving,
}) => (
  <div
    style={{ padding: 'min(10px, 2cqmin)', gap: 'min(10px, 2cqmin)' }}
    className="bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md hover:border-violet-200 transition-all flex items-center"
  >
    <div
      className="bg-violet-50 text-violet-600 rounded-lg flex items-center justify-center shrink-0 border border-violet-100 font-black"
      style={{
        width: 'min(36px, 9cqmin)',
        height: 'min(36px, 9cqmin)',
        fontSize: 'min(10px, 2.5cqmin)',
      }}
    >
      HTML
    </div>
    <div className="flex-1 min-w-0">
      <h4
        className="text-slate-700 font-bold truncate"
        style={{ fontSize: 'min(13px, 3.2cqmin)' }}
      >
        {app.title}
      </h4>
      <div
        className="text-slate-500 font-mono"
        style={{ fontSize: 'min(9px, 2.2cqmin)' }}
      >
        {(app.html.length / 1024).toFixed(1)} KB
      </div>
    </div>
    <div className="flex items-center" style={{ gap: 'min(4px, 1cqmin)' }}>
      <button
        onClick={() => onRun(app)}
        className="bg-emerald-50/50 text-emerald-600 hover:bg-emerald-100 rounded-lg transition-colors"
        style={{ padding: 'min(7px, 1.8cqmin)' }}
        title="Run App"
        aria-label="Run App"
      >
        <Play
          className="fill-current"
          style={{
            width: 'min(14px, 3.5cqmin)',
            height: 'min(14px, 3.5cqmin)',
          }}
        />
      </button>
      <button
        onClick={() => onSaveToLibrary(app)}
        disabled={isSaving}
        className="text-slate-400 hover:text-violet-600 hover:bg-violet-50 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg transition-colors"
        style={{ padding: 'min(7px, 1.8cqmin)' }}
        title="Save to My Library"
        aria-label="Save to My Library"
      >
        <BookDown
          style={{
            width: 'min(14px, 3.5cqmin)',
            height: 'min(14px, 3.5cqmin)',
          }}
        />
      </button>
    </div>
  </div>
);
