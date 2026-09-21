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
import { resolveStyleFields } from '@/components/settings/schema/styleKeys';
import { FieldRenderer } from '@/components/settings/renderer/FieldRenderer';
import { SchemaRenderer } from '@/components/settings/renderer/SchemaRenderer';
import { WidgetTypographySettings } from '@/components/common/UniversalStyleSettings';

export interface SchemaAppearanceFallbackProps {
  widget: WidgetData;
}

type SchemaState = {
  type: WidgetType | null;
  schema: WidgetSettingsSchema | null | undefined;
};

// Dispatch (not setState) mirrors SettingsDrawerHost's loader — keeps the no-setState-in-effect rule happy.
const schemaReducer = (_: SchemaState, next: SchemaState): SchemaState => next;

// Flag-off fallback rendering a migrated widget's Content-tier styleKeys into the legacy panel's Style tab (item 2.8).
export const SchemaAppearanceFallback: React.FC<
  SchemaAppearanceFallbackProps
> = ({ widget }) => {
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

  if (!schema) return null;

  const styleFields = resolveStyleFields(schema.styleKeys);
  const hasDisplayGroup = schema.groups.some((g) => g.id === 'display');
  // Rendering nothing still counts as a custom appearance panel upstream, which
  // would drop the window font and text size the legacy Style tab used to show.
  if (styleFields.length === 0 && !hasDisplayGroup) {
    return (
      <WidgetTypographySettings widget={widget} updateWidget={updateWidget} />
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <SchemaRenderer
        schema={schema}
        widget={widget}
        ctx={ctx}
        updateConfig={updateConfig}
        tab="style"
      />
      {styleFields.length > 0 && (
        <div className="flex flex-col divide-y divide-slate-100">
          {styleFields.map((field) => (
            <FieldRenderer
              key={field.key}
              field={field}
              widget={widget}
              ctx={ctx}
              updateConfig={updateConfig}
            />
          ))}
        </div>
      )}
    </div>
  );
};
