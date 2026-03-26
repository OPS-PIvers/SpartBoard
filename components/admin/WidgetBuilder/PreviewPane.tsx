import React, { useState } from 'react';
import { RefreshCw, Puzzle } from 'lucide-react';

interface PreviewPaneProps {
  content: string;
  mode: 'block' | 'code';
  title?: string;
}

export const PreviewPane: React.FC<PreviewPaneProps> = ({
  content,
  mode,
  title,
}) => {
  const [key, setKey] = useState(0);

  return (
    <div className="flex flex-col h-full bg-slate-900 rounded-lg overflow-hidden border border-slate-700">
      <div className="flex items-center justify-between px-3 py-2 bg-slate-800 border-b border-slate-700">
        <span className="text-xs font-mono text-slate-400">
          Preview{title ? ` — ${title}` : ''}
        </span>
        {mode === 'code' && (
          <button
            onClick={() => setKey((k) => k + 1)}
            className="flex items-center gap-1 px-2 py-1 text-xs text-slate-400 hover:text-white hover:bg-slate-700 rounded transition-colors"
            title="Refresh preview"
          >
            <RefreshCw size={12} />
            Refresh
          </button>
        )}
      </div>

      {mode === 'code' ? (
        <iframe
          key={key}
          srcDoc={content}
          className="flex-1 w-full border-none bg-white"
          sandbox="allow-scripts allow-forms allow-modals allow-same-origin"
          title="Widget preview"
        />
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-slate-500 p-6 text-center">
          <Puzzle size={40} className="text-slate-600" />
          <p className="text-sm">
            Block preview not available here — see the grid builder
          </p>
        </div>
      )}
    </div>
  );
};
