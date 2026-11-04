import { useCallback } from 'react';
import { useAuth } from '@/context/useAuth';
import type { WidgetData } from '@/types';
import { connectionWidgetTitle } from '@/utils/connectionEditorModel';

export type WidgetTitleResolver = (widget: WidgetData) => string;

/** Names a widget the way connection UI shows it, with the admin's widget name in place of the built-in one. */
export function useConnectionWidgetTitle(): WidgetTitleResolver {
  const { featurePermissions } = useAuth();
  return useCallback(
    (widget) =>
      connectionWidgetTitle(
        widget,
        featurePermissions.find((p) => p.widgetType === widget.type)
          ?.displayName
      ),
    [featurePermissions]
  );
}
