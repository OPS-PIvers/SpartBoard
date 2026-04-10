import React from 'react';
import { Sparkles, Loader2, X } from 'lucide-react';

interface AiPanelProps {
  topic: string;
  onTopicChange: (topic: string) => void;
  result: string | null;
  loading: boolean;
  onDismiss: () => void;
}

export const AiPanel: React.FC<AiPanelProps> = ({
  topic,
  onTopicChange,
  result,
  loading,
  onDismiss,
}) => {
  return (
    <div className="relative shrink-0 w-full">
      {/* Input bar */}
      <div
        className="flex items-center w-full"
        style={{
          gap: 'min(6px, 1.5cqmin)',
          padding: 'min(6px, 1.5cqmin) min(10px, 2.5cqmin)',
        }}
      >
        <Sparkles
          className="shrink-0 text-amber-400"
          style={{
            width: 'min(16px, 4.5cqmin)',
            height: 'min(16px, 4.5cqmin)',
          }}
        />
        <input
          type="text"
          value={topic}
          onChange={(e) => onTopicChange(e.target.value)}
          placeholder="Enter a topic, then click a level…"
          className="flex-1 min-w-0 bg-white/10 border border-white/20 rounded text-white placeholder-white/40 outline-none focus:border-amber-400/60"
          style={{
            fontSize: 'min(12px, 3.5cqmin)',
            padding: 'min(4px, 1cqmin) min(8px, 2cqmin)',
          }}
        />
        {loading && (
          <Loader2
            className="shrink-0 text-amber-400 animate-spin"
            style={{
              width: 'min(14px, 4cqmin)',
              height: 'min(14px, 4cqmin)',
            }}
          />
        )}
      </div>

      {/* Result overlay */}
      {result && (
        <div
          className="absolute left-0 right-0 bg-slate-900/95 backdrop-blur-sm border border-white/20 rounded-lg shadow-xl overflow-auto z-10"
          style={{
            top: '100%',
            maxHeight: 'min(300px, 60cqmin)',
            padding: 'min(12px, 3cqmin)',
            margin: '0 min(6px, 1.5cqmin)',
          }}
        >
          <div className="flex items-start justify-between">
            <pre
              className="text-white whitespace-pre-wrap font-sans flex-1"
              style={{ fontSize: 'min(12px, 3.5cqmin)' }}
            >
              {result}
            </pre>
            <button
              onClick={onDismiss}
              className="shrink-0 text-white/50 hover:text-white ml-2"
            >
              <X
                style={{
                  width: 'min(14px, 4cqmin)',
                  height: 'min(14px, 4cqmin)',
                }}
              />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
