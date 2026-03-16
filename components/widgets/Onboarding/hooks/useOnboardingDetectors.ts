import { useEffect } from 'react';
import { Dashboard } from '@/types';

export const useOnboardingDetectors = (
  activeDashboard: Dashboard | null,
  dashboards: Dashboard[],
  widgetId: string,
  completedTasks: string[],
  markDone: (taskId: string) => void
) => {
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
      (w) => w.flipped && w.id !== widgetId
    );
    if (anyFlipped) markDone('open-settings');
  }, [activeDashboard, markDone, widgetId]);

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
};
