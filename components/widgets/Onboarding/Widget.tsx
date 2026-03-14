import React, { useCallback, useMemo } from 'react';
import { OnboardingConfig, WidgetComponentProps } from '@/types';
import { useDashboard } from '@/context/useDashboard';
import { useTranslation } from 'react-i18next';
import { OnboardingTask } from './types';
import { useOnboardingDetectors } from './hooks/useOnboardingDetectors';
import { Header } from './components/Header';
import { TaskItem } from './components/TaskItem';
import { Footer } from './components/Footer';

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

  useOnboardingDetectors(
    activeDashboard,
    dashboards,
    widget.id,
    completedTasks,
    markDone
  );

  const allDone = tasks.every((t) => completedTasks.includes(t.id));

  return (
    <div
      className="h-full w-full flex flex-col"
      style={{ containerType: 'size' }}
    >
      <Header allDone={allDone} />
      <div
        className="flex-1 flex flex-col overflow-y-auto bg-white/5"
        style={{ padding: 'min(8px, 2cqmin)', gap: 'min(6px, 1.5cqmin)' }}
      >
        {tasks.map((task) => (
          <TaskItem
            key={task.id}
            task={task}
            done={completedTasks.includes(task.id)}
            markDone={markDone}
          />
        ))}
      </div>
      <Footer allDone={allDone} />
    </div>
  );
};
