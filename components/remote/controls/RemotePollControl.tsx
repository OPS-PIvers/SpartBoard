import React from 'react';
import { Plus, Minus, RotateCcw } from 'lucide-react';
import { WidgetData, PollConfig, PollOption } from '@/types';

interface RemotePollControlProps {
  widget: WidgetData;
  updateWidget: (id: string, updates: Partial<WidgetData>) => void;
}

const OPTION_COLORS = [
  'bg-blue-500/20 border-blue-400/40 text-blue-300',
  'bg-purple-500/20 border-purple-400/40 text-purple-300',
  'bg-green-500/20 border-green-400/40 text-green-300',
  'bg-orange-500/20 border-orange-400/40 text-orange-300',
  'bg-pink-500/20 border-pink-400/40 text-pink-300',
];

const BAR_COLORS = [
  'bg-blue-500',
  'bg-purple-500',
  'bg-green-500',
  'bg-orange-500',
  'bg-pink-500',
];

export const RemotePollControl: React.FC<RemotePollControlProps> = ({
  widget,
  updateWidget,
}) => {
  const config = widget.config as PollConfig;
  const options: PollOption[] = config.options ?? [];
  const totalVotes = options.reduce((s, o) => s + (o.votes ?? 0), 0);

  const adjustVote = (index: number, delta: number) => {
    const updated = options.map((opt, i) =>
      i === index
        ? { ...opt, votes: Math.max(0, (opt.votes ?? 0) + delta) }
        : opt
    );
    updateWidget(widget.id, { config: { ...config, options: updated } });
  };

  const resetVotes = () => {
    const updated = options.map((opt) => ({ ...opt, votes: 0 }));
    updateWidget(widget.id, { config: { ...config, options: updated } });
  };

  return (
    <div className="flex flex-col h-full">
      {/* Question + Reset */}
      <div className="px-4 py-3 border-b border-white/10 shrink-0">
        <div className="text-white/60 text-xs uppercase tracking-widest font-bold mb-1">
          Poll
        </div>
        {config.question && (
          <p className="text-white font-semibold text-sm leading-snug line-clamp-2">
            {config.question}
          </p>
        )}
      </div>

      {/* Options */}
      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3">
        {options.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-white/30 text-sm italic">
            No options — configure in widget settings.
          </div>
        ) : (
          options.map((opt, i) => {
            const pct =
              totalVotes > 0 ? ((opt.votes ?? 0) / totalVotes) * 100 : 0;
            return (
              <div
                key={i}
                className={`rounded-2xl border p-3 ${OPTION_COLORS[i % OPTION_COLORS.length]}`}
              >
                {/* Label + Vote count */}
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-sm flex-1 mr-2 truncate">
                    {opt.label}
                  </span>
                  <span className="font-black text-lg tabular-nums shrink-0">
                    {opt.votes ?? 0}
                  </span>
                </div>

                {/* Progress bar */}
                <div className="w-full h-1.5 rounded-full bg-white/10 mb-3 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${BAR_COLORS[i % BAR_COLORS.length]}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>

                {/* +/- buttons */}
                <div className="flex gap-2">
                  <button
                    onClick={() => adjustVote(i, -1)}
                    disabled={(opt.votes ?? 0) <= 0}
                    className="flex-1 py-2 rounded-xl bg-white/10 hover:bg-white/20 disabled:opacity-40 font-bold flex items-center justify-center transition-all active:scale-95"
                    aria-label={`Remove vote from ${opt.label}`}
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => adjustVote(i, 1)}
                    className="flex-1 py-2 rounded-xl bg-white/20 hover:bg-white/30 font-bold flex items-center justify-center transition-all active:scale-95"
                    aria-label={`Add vote to ${opt.label}`}
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer Reset */}
      {options.length > 0 && (
        <div className="px-4 pb-3 shrink-0">
          <button
            onClick={resetVotes}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-white/60 font-bold transition-all active:scale-95"
          >
            <RotateCcw className="w-4 h-4" />
            Reset All Votes
          </button>
        </div>
      )}
    </div>
  );
};
