import React, { useCallback, useEffect, useMemo, useReducer } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/context/useAuth';
import { useToolLabel } from '@/hooks/useToolLabel';
import { useDashboardActions } from '@/context/dashboardCanvasStore';
import { WIDGET_SETTINGS_SCHEMAS } from '@/components/widgets/WidgetRegistry';
import type { WidgetData, WidgetType } from '@/types';
import type {
  FieldCtx,
  WidgetSettingsSchema,
} from '@/components/settings/schema/types';
import { SchemaRenderer } from '@/components/settings/renderer/SchemaRenderer';

export interface SchemaSettingsFallbackProps {
  widget: WidgetData;
}

type SchemaState = {
  type: WidgetType | null;
  schema: WidgetSettingsSchema | null | undefined;
};

// Dispatch (not setState) mirrors SettingsDrawerHost's loader — keeps the no-setState-in-effect rule happy.
const schemaReducer = (_: SchemaState, next: SchemaState): SchemaState => next;

// Flag-off fallback rendering a migrated widget's schema groups into the legacy panel's Settings tab (item 2.8).
export const SchemaSettingsFallback: React.FC<SchemaSettingsFallbackProps> = ({
  widget,
}) => {
  const { t } = useTranslation();
  const { isAdmin, canAccessFeature, canAccessWidget, profileLoaded } =
    useAuth();
  const toolLabel = useToolLabel();
  const { updateWidget } = useDashboardActions();

  const [schemaState, dispatchSchema] = useReducer(schemaReducer, {
    type: null,
    schema: null,
  });
  useEffect(() => {
    const loader = WIDGET_SETTINGS_SCHEMAS[widget.type];
    if (!loader) {
      dispatchSchema({ type: widget.type, schema: null });
      return undefined;
    }
    dispatchSchema({ type: widget.type, schema: undefined });
    let cancelled = false;
    void loader()
      .then((loaded) => {
        if (!cancelled) dispatchSchema({ type: widget.type, schema: loaded });
      })
      .catch(() => {
        if (!cancelled) dispatchSchema({ type: widget.type, schema: null });
      });
    return () => {
      cancelled = true;
    };
  }, [widget.type]);
  const schema =
    schemaState.type === widget.type ? schemaState.schema : undefined;

  const widgetId = widget.id;
  const widgetConfig = widget.config;
  const updateConfig = useCallback(
    (patch: Record<string, unknown>) => {
      updateWidget(widgetId, {
        config: { ...(widgetConfig ?? {}), ...patch },
      });
    },
    [widgetId, widgetConfig, updateWidget]
  );

  const config = useMemo(
    () => (widget.config ?? {}) as Record<string, unknown>,
    [widget.config]
  );

  const ctx: FieldCtx = useMemo(
    () => ({
      config,
      widget,
      isAdmin: isAdmin === true,
      canAccessFeature,
      canAccessWidget,
      profileLoaded,
      toolLabel,
      t,
    }),
    [
      config,
      widget,
      isAdmin,
      canAccessFeature,
      canAccessWidget,
      profileLoaded,
      toolLabel,
      t,
    ]
  );

  if (schema === undefined) {
    return (
      <div
        className="flex flex-col gap-3"
        data-testid="widget-settings-fallback-skeleton"
        aria-busy="true"
      >
        <span className="sr-only">{t('widgetSettings.common.loading')}</span>
        {[0, 1, 2].map((row) => (
          <div key={row} className="h-8 rounded-lg bg-slate-100" />
        ))}
      </div>
    );
  }

  if (!schema) {
    return (
      <p className="text-sm text-slate-500 italic">
        {t('widgetSettings.common.empty')}
      </p>
    );
  }

  return (
    <SchemaRenderer
      schema={schema}
      widget={widget}
      ctx={ctx}
      updateConfig={updateConfig}
    />
  );
};
