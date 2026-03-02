import React from 'react';
import { BreathingConfig, WidgetData } from '../../../types';
import { WidgetLayout } from '../WidgetLayout';
import { BreathingVisuals } from './BreathingVisuals';
import { useBreathing } from './useBreathing';
import { Play, Pause, RotateCcw } from 'lucide-react';

export const BreathingWidget: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => {
  const config = widget.config as BreathingConfig;

  const { phase, progress, timeLeft, isActive, toggleActive, reset } =
    useBreathing(config.pattern);

  const formatTime = (seconds: number) => {
    return Math.ceil(seconds).toString();
  };

  const getPhaseText = () => {
    switch (phase) {
      case 'inhale':
        return 'Inhale';
      case 'hold1':
        return 'Hold';
      case 'exhale':
        return 'Exhale';
      case 'hold2':
        return 'Hold';
      default:
        return 'Ready';
    }
  };

  return (
    <WidgetLayout
      padding="p-0"
      content={
        <div className="flex flex-col items-center justify-center w-full h-full relative overflow-hidden bg-slate-50 dark:bg-slate-900">
          {/* Main Visual Area */}
          <div className="flex-1 flex items-center justify-center w-full relative min-h-0">
            <BreathingVisuals
              visual={config.visual}
              color={config.color}
              phase={phase}
              progress={progress}
              isActive={isActive}
            />

            {/* Overlay Text */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-10 text-slate-800 dark:text-slate-100 mix-blend-difference drop-shadow-md">
              <span
                className="text-4xl font-bold tracking-widest uppercase mb-2"
                style={{ textShadow: '0 2px 10px rgba(0,0,0,0.2)' }}
              >
                {getPhaseText()}
              </span>
              <span
                className="text-6xl font-black font-mono tabular-nums opacity-90"
                style={{ textShadow: '0 2px 10px rgba(0,0,0,0.2)' }}
              >
                {isActive ? formatTime(timeLeft) : ''}
              </span>
            </div>
          </div>

          {/* Controls */}
          <div className="shrink-0 p-4 w-full flex justify-center gap-4 bg-white/50 dark:bg-black/20 backdrop-blur-sm z-20">
            <button
              onClick={toggleActive}
              className={`flex items-center justify-center rounded-2xl transition-all shadow-md active:scale-95 ${
                isActive
                  ? 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300'
                  : 'bg-brand-blue-primary text-white shadow-brand-blue-primary/30 hover:bg-brand-blue-light'
              }`}
              style={{
                width: 'min(56px, 18cqmin)',
                height: 'min(56px, 18cqmin)',
              }}
              aria-label={isActive ? 'Pause' : 'Start'}
            >
              {isActive ? (
                <Pause
                  fill="currentColor"
                  style={{
                    width: 'min(24px, 7cqmin)',
                    height: 'min(24px, 7cqmin)',
                  }}
                />
              ) : (
                <Play
                  fill="currentColor"
                  style={{
                    width: 'min(24px, 7cqmin)',
                    height: 'min(24px, 7cqmin)',
                    marginLeft: 'min(4px, 1cqmin)',
                  }}
                />
              )}
            </button>
            <button
              onClick={reset}
              disabled={!isActive && progress === 0}
              className="flex items-center justify-center rounded-2xl bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                width: 'min(56px, 18cqmin)',
                height: 'min(56px, 18cqmin)',
              }}
              aria-label="Reset"
            >
              <RotateCcw
                style={{
                  width: 'min(24px, 7cqmin)',
                  height: 'min(24px, 7cqmin)',
                }}
              />
            </button>
          </div>
        </div>
      }
    />
  );
};
