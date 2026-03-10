import React from 'react';
import { WidgetData, ExpectationsConfig } from '@/types';

interface RemoteExpectationsControlProps {
  widget: WidgetData;
  updateWidget: (id: string, updates: Partial<WidgetData>) => void;
}

const VOICE_LEVELS = [
  {
    level: 0,
    label: 'Silent',
    icon: '🤫',
    color: 'bg-slate-500/30 border-slate-400/40 text-slate-300',
  },
  {
    level: 1,
    label: 'Whisper',
    icon: '🤫',
    color: 'bg-blue-500/20 border-blue-400/40 text-blue-300',
  },
  {
    level: 2,
    label: 'Inside',
    icon: '🗣️',
    color: 'bg-green-500/20 border-green-400/40 text-green-300',
  },
  {
    level: 3,
    label: 'Partner',
    icon: '👥',
    color: 'bg-yellow-500/20 border-yellow-400/40 text-yellow-300',
  },
  {
    level: 4,
    label: 'Presenter',
    icon: '📢',
    color: 'bg-red-500/20 border-red-400/40 text-red-300',
  },
] as const;

const WORK_MODES = [
  { value: 'individual', label: 'Individual', icon: '🧑' },
  { value: 'partner', label: 'Partner', icon: '👫' },
  { value: 'group', label: 'Group', icon: '👥' },
] as const;

const INTERACTION_MODES = [
  { value: 'none', label: 'None', icon: '—' },
  { value: 'respectful', label: 'Respectful', icon: '🤝' },
  { value: 'listening', label: 'Listening', icon: '👂' },
  { value: 'productive', label: 'Productive', icon: '⚡' },
  { value: 'discussion', label: 'Discussion', icon: '💬' },
] as const;

export const RemoteExpectationsControl: React.FC<
  RemoteExpectationsControlProps
> = ({ widget, updateWidget }) => {
  const config = widget.config as ExpectationsConfig;

  const setVoiceLevel = (level: number) => {
    updateWidget(widget.id, {
      config: {
        ...config,
        voiceLevel: config.voiceLevel === level ? null : level,
      },
    });
  };

  const setWorkMode = (mode: ExpectationsConfig['workMode']) => {
    updateWidget(widget.id, {
      config: {
        ...config,
        workMode: config.workMode === mode ? null : mode,
      },
    });
  };

  const setInteractionMode = (mode: ExpectationsConfig['interactionMode']) => {
    updateWidget(widget.id, {
      config: {
        ...config,
        interactionMode: config.interactionMode === mode ? null : mode,
      },
    });
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="p-4 flex flex-col gap-5">
        {/* Voice Level */}
        <div>
          <div className="text-white/60 text-xs uppercase tracking-widest font-bold mb-3">
            Voice Level
          </div>
          <div className="flex gap-2">
            {VOICE_LEVELS.map(({ level, label, color }) => {
              const isActive = config.voiceLevel === level;
              return (
                <button
                  key={level}
                  onClick={() => setVoiceLevel(level)}
                  className={`flex-1 flex flex-col items-center gap-1 py-3 rounded-2xl border font-bold transition-all active:scale-95 ${
                    isActive
                      ? color
                      : 'bg-white/5 border-white/10 text-white/40'
                  }`}
                  aria-label={`Voice level ${level}: ${label}`}
                  aria-pressed={isActive}
                >
                  <span className="text-xl font-black">{level}</span>
                  <span className="text-[10px] uppercase tracking-wide leading-none hidden sm:block">
                    {label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Work Mode */}
        <div>
          <div className="text-white/60 text-xs uppercase tracking-widest font-bold mb-3">
            Work Mode
          </div>
          <div className="flex gap-2">
            {WORK_MODES.map(({ value, label, icon }) => {
              const isActive = config.workMode === value;
              return (
                <button
                  key={value}
                  onClick={() => setWorkMode(value)}
                  className={`flex-1 flex flex-col items-center gap-1.5 py-3 rounded-2xl border font-bold transition-all active:scale-95 ${
                    isActive
                      ? 'bg-blue-500/20 border-blue-400/50 text-blue-300'
                      : 'bg-white/5 border-white/10 text-white/50'
                  }`}
                  aria-pressed={isActive}
                >
                  <span className="text-xl">{icon}</span>
                  <span className="text-xs">{label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Interaction Mode */}
        <div>
          <div className="text-white/60 text-xs uppercase tracking-widest font-bold mb-3">
            Interaction
          </div>
          <div className="flex flex-wrap gap-2">
            {INTERACTION_MODES.map(({ value, label, icon }) => {
              const isActive = config.interactionMode === value;
              return (
                <button
                  key={value}
                  onClick={() => setInteractionMode(value)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-bold transition-all active:scale-95 ${
                    isActive
                      ? 'bg-purple-500/20 border-purple-400/50 text-purple-300'
                      : 'bg-white/5 border-white/10 text-white/50'
                  }`}
                  aria-pressed={isActive}
                >
                  <span>{icon}</span>
                  <span>{label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
