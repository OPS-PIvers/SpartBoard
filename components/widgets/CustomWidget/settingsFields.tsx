import React, { useState } from 'react';
import type { CustomWidgetConfig, CustomWidgetSettingDef } from '@/types';
import type { CustomRenderCtx } from '@/components/settings/schema/types';
import { useCustomWidgets } from '@/context/useCustomWidgets';

type SettingValue = string | number | boolean;

function buildDefaults(
  definitions: CustomWidgetSettingDef[],
  saved: Record<string, SettingValue>
): Record<string, SettingValue> {
  const values: Record<string, SettingValue> = {};
  for (const definition of definitions) {
    values[definition.key] =
      saved[definition.key] ??
      definition.defaultValue ??
      (definition.type === 'number'
        ? 0
        : definition.type === 'boolean'
          ? false
          : '');
  }
  return { ...values, ...saved };
}

type SettingsFormProps = {
  ctx: CustomRenderCtx;
  definitions: CustomWidgetSettingDef[];
  saved: Record<string, SettingValue>;
  customWidgetId: string;
};

const CustomWidgetSettingsForm: React.FC<SettingsFormProps> = ({
  ctx,
  definitions,
  saved,
  customWidgetId,
}) => {
  const [localValues, setLocalValues] = useState<Record<string, SettingValue>>(
    () => buildDefaults(definitions, saved)
  );
  const label = (leaf: string) => ctx.t(`widgetSettings.custom-widget.${leaf}`);

  const change = (key: string, value: SettingValue) =>
    setLocalValues((current) => ({ ...current, [key]: value }));

  return (
    <div
      id={ctx.id}
      role="group"
      aria-labelledby={ctx.labelId}
      aria-describedby={ctx.describedBy}
      className="flex flex-col gap-4"
    >
      <p className="text-xs text-slate-600">
        {label('widgetId')}{' '}
        <span className="font-mono text-slate-700">{customWidgetId}</span>
      </p>
      {definitions.length > 0 ? (
        <div className="flex flex-col gap-3">
          {definitions.map((definition) => {
            const value = localValues[definition.key];
            return (
              <div key={definition.key} className="flex flex-col gap-1">
                <label
                  htmlFor={`${ctx.id}-${definition.key}`}
                  className="text-sm font-medium text-slate-700"
                >
                  {definition.label ?? definition.key}
                </label>
                {definition.type === 'boolean' ? (
                  <label className="flex cursor-pointer items-center gap-2">
                    <input
                      id={`${ctx.id}-${definition.key}`}
                      type="checkbox"
                      checked={Boolean(value)}
                      onChange={(event) =>
                        change(definition.key, event.target.checked)
                      }
                      className="h-4 w-4 accent-brand-blue-primary"
                    />
                    <span className="text-xs text-slate-600">
                      {label(value ? 'enabled' : 'disabled')}
                    </span>
                  </label>
                ) : definition.type === 'number' ? (
                  <input
                    id={`${ctx.id}-${definition.key}`}
                    type="number"
                    value={String(value ?? 0)}
                    onChange={(event) =>
                      change(
                        definition.key,
                        Number.isNaN(event.target.valueAsNumber)
                          ? 0
                          : event.target.valueAsNumber
                      )
                    }
                    className="rounded-lg border-2 border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-brand-blue-primary"
                  />
                ) : definition.type === 'select' ? (
                  <select
                    id={`${ctx.id}-${definition.key}`}
                    value={String(
                      definition.options?.includes(String(value))
                        ? value
                        : definition.defaultValue
                    )}
                    onChange={(event) =>
                      change(definition.key, event.target.value)
                    }
                    className="rounded-lg border-2 border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-brand-blue-primary"
                  >
                    {(definition.options ?? []).map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    id={`${ctx.id}-${definition.key}`}
                    type="text"
                    value={String(value ?? '')}
                    onChange={(event) =>
                      change(definition.key, event.target.value)
                    }
                    className="rounded-lg border-2 border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-brand-blue-primary"
                  />
                )}
              </div>
            );
          })}
          <button
            type="button"
            onClick={() => ctx.updateConfig({ adminSettings: localValues })}
            className="self-start rounded-lg bg-brand-blue-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-blue-light"
          >
            {label('saveSettings')}
          </button>
        </div>
      ) : (
        <p className="text-sm text-slate-600">{label('noSettings')}</p>
      )}
    </div>
  );
};

export const CustomWidgetSettingsField: React.FC<{
  ctx: CustomRenderCtx;
}> = ({ ctx }) => {
  const { customWidgets } = useCustomWidgets();
  const config = ctx.config as unknown as CustomWidgetConfig;
  const widgetDocument = customWidgets.find(
    (widget) => widget.id === config.customWidgetId
  );
  const definitions = widgetDocument?.settings ?? [];
  const saved = config.adminSettings ?? {};

  return (
    <CustomWidgetSettingsForm
      key={`${ctx.widget.id}:${widgetDocument?.id ?? 'missing'}`}
      ctx={ctx}
      definitions={definitions}
      saved={saved}
      customWidgetId={config.customWidgetId}
    />
  );
};
