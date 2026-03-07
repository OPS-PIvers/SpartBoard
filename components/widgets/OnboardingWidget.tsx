import React, { useEffect } from 'react';
import { CheckCircle2, Circle, Rocket } from 'lucide-react';
import { WidgetComponentProps } from '@/types';
import { useDashboard } from '@/context/useDashboard';

interface OnboardingTask {
  id: string;
  label: string;
  hint: string;
}

const TASKS: OnboardingTask[] = [
  {
    id: 'add-widget',
    label: 'Add a widget from the Dock',
    hint: 'Click any icon in the toolbar at the bottom',
  },
  {
    id: 'open-settings',
    label: "Open a widget's settings",
    hint: 'Click a widget, then press Alt+S or click the gear icon',
  },
  {
    id: 'create-board',
    label: 'Create a second board',
    hint: 'Open the sidebar and click + New Board',
  },
  {
    id: 'open-cheatsheet',
    label: 'Open the Cheat Sheet',
    hint: 'Press Ctrl+/ or click the ? button in the bottom-right',
  },
];

export const OnboardingWidget: React.FC<WidgetComponentProps> = ({
  widget,
}) => {
  const { updateWidget, activeDashboard, dashboards } = useDashboard();
  const completedTasks: string[] =
    (widget.config.completedTasks as string[]) ?? [];

  const markDone = (taskId: string) => {
    if (completedTasks.includes(taskId)) return;
    updateWidget(widget.id, {
      config: { ...widget.config, completedTasks: [...completedTasks, taskId] },
    });
  };

  // Auto-detect: widget added (board has > 1 widget = onboarding + at least one more)
  useEffect(() => {
    if (!activeDashboard) return;
    const nonOnboarding = activeDashboard.widgets.filter(
      (w) => w.type !== 'onboarding'
    );
    if (nonOnboarding.length > 0) {
      markDone('add-widget');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDashboard?.widgets.length]);

  // Auto-detect: settings opened (any other widget is flipped)
  useEffect(() => {
    if (!activeDashboard) return;
    const anyFlipped = activeDashboard.widgets.some(
      (w) => w.flipped && w.id !== widget.id
    );
    if (anyFlipped) markDone('open-settings');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDashboard?.widgets]);

  // Auto-detect: second board created
  useEffect(() => {
    if (dashboards.length > 1) markDone('create-board');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dashboards.length]);

  // Auto-detect: cheat sheet opened (localStorage flag)
  useEffect(() => {
    const poll = setInterval(() => {
      if (localStorage.getItem('spart_cheatsheet_opened') === 'true') {
        markDone('open-cheatsheet');
        clearInterval(poll);
      }
    }, 1000);
    return () => clearInterval(poll);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completedTasks]);

  const allDone = TASKS.every((t) => completedTasks.includes(t.id));

  return (
    <div
      className="h-full w-full flex flex-col"
      style={{ containerType: 'size' }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2 bg-gradient-to-r from-indigo-600 to-purple-600 shrink-0"
        style={{ padding: 'min(10px, 2.5cqmin) min(14px, 3cqmin)' }}
      >
        <Rocket
          style={{
            width: 'min(18px, 5cqmin)',
            height: 'min(18px, 5cqmin)',
            color: 'white',
            flexShrink: 0,
          }}
        />
        <span
          className="text-white font-black uppercase tracking-widest"
          style={{ fontSize: 'min(11px, 3.5cqmin)' }}
        >
          Getting Started
        </span>
        {allDone && (
          <span
            className="ml-auto bg-white/20 text-white rounded-full font-bold"
            style={{
              fontSize: 'min(9px, 2.8cqmin)',
              padding: 'min(2px, 0.6cqmin) min(6px, 1.5cqmin)',
            }}
          >
            All done!
          </span>
        )}
      </div>

      {/* Task list */}
      <div
        className="flex-1 flex flex-col overflow-y-auto bg-white/5"
        style={{ padding: 'min(8px, 2cqmin)', gap: 'min(6px, 1.5cqmin)' }}
      >
        {TASKS.map((task) => {
          const done = completedTasks.includes(task.id);
          return (
            <button
              key={task.id}
              onClick={() => markDone(task.id)}
              className={`w-full text-left rounded-lg border transition-all ${
                done
                  ? 'bg-green-500/10 border-green-500/30'
                  : 'bg-white/5 border-white/10 hover:bg-white/10'
              }`}
              style={{ padding: 'min(8px, 2cqmin) min(10px, 2.5cqmin)' }}
            >
              <div
                className="flex items-start"
                style={{ gap: 'min(8px, 2cqmin)' }}
              >
                {done ? (
                  <CheckCircle2
                    className="text-green-400 shrink-0"
                    style={{
                      width: 'min(16px, 4.5cqmin)',
                      height: 'min(16px, 4.5cqmin)',
                      marginTop: 'min(1px, 0.3cqmin)',
                    }}
                  />
                ) : (
                  <Circle
                    className="text-slate-400 shrink-0"
                    style={{
                      width: 'min(16px, 4.5cqmin)',
                      height: 'min(16px, 4.5cqmin)',
                      marginTop: 'min(1px, 0.3cqmin)',
                    }}
                  />
                )}
                <div
                  className="flex flex-col"
                  style={{ gap: 'min(2px, 0.5cqmin)' }}
                >
                  <span
                    className={`font-semibold ${done ? 'line-through text-slate-400' : 'text-white'}`}
                    style={{ fontSize: 'min(12px, 3.5cqmin)' }}
                  >
                    {task.label}
                  </span>
                  {!done && (
                    <span
                      className="text-slate-400 leading-snug"
                      style={{ fontSize: 'min(10px, 2.8cqmin)' }}
                    >
                      {task.hint}
                    </span>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Footer */}
      {allDone && (
        <div
          className="shrink-0 bg-green-600/20 border-t border-green-500/20 text-center"
          style={{ padding: 'min(8px, 2cqmin)' }}
        >
          <span
            className="text-green-300 font-bold"
            style={{ fontSize: 'min(11px, 3cqmin)' }}
          >
            You&apos;re all set — close this widget anytime!
          </span>
        </div>
      )}
    </div>
  );
};
