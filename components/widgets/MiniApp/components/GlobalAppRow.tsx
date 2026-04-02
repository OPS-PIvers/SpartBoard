import React, { useState } from 'react';
import { Play, BookDown, Link2, Copy, Check } from 'lucide-react';
import { GlobalMiniAppItem, MiniAppItem } from '@/types';

interface GlobalAppRowProps {
  app: GlobalMiniAppItem;
  onRun: (app: MiniAppItem) => void;
  onSaveToLibrary: (app: GlobalMiniAppItem) => void;
  isSaving: boolean;
  isLive?: boolean;
  onToggleLive?: (app: MiniAppItem) => void;
  onCopyLink?: (code: string) => Promise<boolean>;
  sessionCode?: string;
}

export const GlobalAppRow: React.FC<GlobalAppRowProps> = ({
  app,
  onRun,
  onSaveToLibrary,
  isSaving,
  isLive = false,
  onToggleLive,
  onCopyLink,
  sessionCode,
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (sessionCode && onCopyLink) {
      const didCopy = await onCopyLink(sessionCode);
      if (didCopy) {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    }
  };

  return (
    <div
      style={{ padding: 'min(10px, 2cqmin)', gap: 'min(10px, 2cqmin)' }}
      className="bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md hover:border-violet-200 transition-all flex items-center"
    >
      <div
        className={`rounded-lg flex items-center justify-center shrink-0 border transition-colors ${
          isLive
            ? 'bg-violet-100 text-violet-700 border-violet-200'
            : 'bg-violet-50 text-violet-600 border-violet-100 font-black'
        }`}
        style={{
          width: 'min(36px, 9cqmin)',
          height: 'min(36px, 9cqmin)',
          fontSize: 'min(10px, 2.5cqmin)',
        }}
      >
        {isLive ? <Link2 className="w-4 h-4" /> : 'HTML'}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h4
            className="text-slate-700 font-bold truncate"
            style={{ fontSize: 'min(13px, 3.2cqmin)' }}
          >
            {app.title}
          </h4>
          {isLive && sessionCode && (
            <div className="flex items-center gap-1">
              <span
                className="bg-violet-100 text-violet-700 font-mono font-black px-1.5 py-0.5 rounded text-xxs tracking-wider border border-violet-200 animate-in fade-in"
                title="Assignment Code"
              >
                {sessionCode}
              </span>
              <button
                onClick={() => void handleCopy()}
                className="p-1 text-slate-400 hover:text-violet-600 transition-colors"
                title="Copy Assignment Link"
              >
                {copied ? (
                  <Check className="w-3 h-3 text-emerald-500" />
                ) : (
                  <Copy className="w-3 h-3" />
                )}
              </button>
            </div>
          )}
        </div>
        <div
          className="text-slate-500 font-mono"
          style={{ fontSize: 'min(9px, 2.2cqmin)' }}
        >
          {(app.html.length / 1024).toFixed(1)} KB
        </div>
      </div>
      <div className="flex items-center" style={{ gap: 'min(4px, 1cqmin)' }}>
        <button
          onClick={() => onToggleLive?.(app)}
          className={`rounded-lg transition-all flex items-center gap-1.5 font-black uppercase tracking-widest ${
            isLive
              ? 'bg-red-500 text-white shadow-lg shadow-red-100'
              : 'bg-violet-600 hover:bg-violet-500 text-white shadow-sm'
          }`}
          style={{
            padding: 'min(6px, 1.5cqmin) min(10px, 2.5cqmin)',
            fontSize: 'min(10px, 2.5cqmin)',
          }}
          title={isLive ? 'End Assignment' : 'Assign (copy student link)'}
        >
          <Link2
            style={{
              width: 'min(14px, 3.5cqmin)',
              height: 'min(14px, 3.5cqmin)',
            }}
          />
          <span className="hidden sm:inline">
            {isLive ? 'Assigned' : 'Assign'}
          </span>
        </button>

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
};
