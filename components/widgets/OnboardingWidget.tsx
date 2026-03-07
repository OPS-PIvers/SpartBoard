import React, { useCallback, useEffect, useMemo } from 'react';
import { CheckCircle2, Circle, Rocket } from 'lucide-react';
import { OnboardingConfig, WidgetComponentProps } from '@/types';
import { useDashboard } from '@/context/useDashboard';
import { useTranslation } from 'react-i18next';

interface OnboardingTask {
  id: string;
  label: string;
  hint: string;
}

export const OnboardingWidget: React.FC<WidgetComponentProps> = ({
  widget,
}) => {
  const { t } = useTranslation();
  const { updateWidget, activeDashboard, dashboards } = useDashboard();

  const tasks: OnboardingTask[] = useMemo(
    () => [
      {
        id: 'add-widget',
        label: t('widgets.onboarding.tasks.addWidget.label'),
        hint: t('widgets.onboarding.tasks.addWidget.hint'),
      },
      {
        id: 'open-settings',
        label: t('widgets.onboarding.tasks.openSettings.label'),
        hint: t('widgets.onboarding.tasks.openSettings.hint'),
      },
      {
        id: 'create-board',
        label: t('widgets.onboarding.tasks.createBoard.label'),
        hint: t('widgets.onboarding.tasks.createBoard.hint'),
      },
      {
        id: 'open-cheatsheet',
        label: t('widgets.onboarding.tasks.openCheatsheet.label'),
        hint: t('widgets.onboarding.tasks.openCheatsheet.hint'),
      },
    ],
    [t]
  );

  const config = widget.config as OnboardingConfig;
  const completedTasks = useMemo(
    () => config.completedTasks ?? [],
    [config.completedTasks]
  );

  const markDone = useCallback(
    (taskId: string) => {
      if (completedTasks.includes(taskId)) return;
      updateWidget(widget.id, {
        config: {
          completedTasks: [...completedTasks, taskId],
        } as OnboardingConfig,
      });
    },
    [completedTasks, updateWidget, widget.id]
  );

  // Auto-detect: widget added (board has > 1 widget = onboarding + at least one more)
  useEffect(() => {
    if (!activeDashboard) return;
    const nonOnboarding = activeDashboard.widgets.filter(
      (w) => w.type !== 'onboarding'
    );
    if (nonOnboarding.length > 0) markDone('add-widget');
  }, [activeDashboard, markDone]);

  // Auto-detect: settings opened (any other widget is flipped)
  useEffect(() => {
    if (!activeDashboard) return;
    const anyFlipped = activeDashboard.widgets.some(
      (w) => w.flipped && w.id !== widget.id
    );
    if (anyFlipped) markDone('open-settings');
  }, [activeDashboard, markDone, widget.id]);

  // Auto-detect: second board created
  useEffect(() => {
    if (dashboards.length > 1) markDone('create-board');
  }, [dashboards, markDone]);

  // Auto-detect: cheat sheet opened via custom DOM event (same-tab)
  // and localStorage (cross-tab / already opened before widget was added)
  useEffect(() => {
    if (completedTasks.includes('open-cheatsheet')) return;

    if (localStorage.getItem('spart_cheatsheet_opened') === 'true') {
      markDone('open-cheatsheet');
      return;
    }

    const handler = () => markDone('open-cheatsheet');
    window.addEventListener('spart:cheatsheet-opened', handler);
    return () => window.removeEventListener('spart:cheatsheet-opened', handler);
  }, [completedTasks, markDone]);

  const allDone = tasks.every((t) => completedTasks.includes(t.id));

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
          {t('widgets.onboarding.title')}
        </span>
        {allDone && (
          <span
            className="ml-auto bg-white/20 text-white rounded-full font-bold"
            style={{
              fontSize: 'min(9px, 2.8cqmin)',
              padding: 'min(2px, 0.6cqmin) min(6px, 1.5cqmin)',
            }}
          >
            {t('widgets.onboarding.allDone')}
          </span>
        )}
      </div>

      {/* Task list */}
      <div
        className="flex-1 flex flex-col overflow-y-auto bg-white/5"
        style={{ padding: 'min(8px, 2cqmin)', gap: 'min(6px, 1.5cqmin)' }}
      >
        {tasks.map((task) => {
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
            {t('widgets.onboarding.footer')}
          </span>
        </div>
      )}
    </div>
  );
};
