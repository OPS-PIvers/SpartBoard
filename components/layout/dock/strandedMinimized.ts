import { WidgetType, WidgetData, InternalToolType } from '@/types';
import { TOOLS } from '@/config/tools';

// Widget types with a minimized instance but no dock button of their own get a temporary dock slot so the same instance can be restored.
export function strandedMinimizedTypes(
  minimizedWidgetsByType: Partial<Record<WidgetType, WidgetData[]>>,
  shownTypes: ReadonlySet<string>,
  canAccessTool: (type: WidgetType | InternalToolType) => boolean
): WidgetType[] {
  return (Object.keys(minimizedWidgetsByType) as WidgetType[]).filter(
    (type) =>
      type !== 'custom-widget' &&
      (minimizedWidgetsByType[type]?.length ?? 0) > 0 &&
      !shownTypes.has(type) &&
      TOOLS.some((t) => t.type === type) &&
      canAccessTool(type)
  );
}
