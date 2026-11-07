import type { DashboardSettings, WidgetData } from '@/types';

export function isSpotlightLive(
  settings: DashboardSettings | undefined,
  widgets: readonly WidgetData[]
): boolean {
  const id = settings?.spotlightWidgetId;
  if (!id) return false;
  return widgets.some((w) => w.id === id && !w.minimized);
}
