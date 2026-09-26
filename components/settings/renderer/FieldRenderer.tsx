import React, { useCallback, useId } from 'react';
import type { WidgetData } from '@/types';
import {
  isFieldVisible,
  type Field,
  type FieldCtx,
  type UpdateConfig,
} from '@/components/settings/schema/types';
import { FIELD_COMPONENTS } from './fields';
import { resolveLabel } from './resolveLabel';
import { tourFieldAttr } from '@/config/tourAnchors';

export type FieldRendererProps = {
  field: Field;
  widget: WidgetData;
  ctx: FieldCtx;
  updateConfig: UpdateConfig;
  defaults?: Record<string, unknown>;
  /** Set by a PartnerWidget card while its partner is off the board. */
  forceDisabled?: boolean;
  /** Tour field key for list rows, e.g. `urls.2.url`; defaults to the field key. */
  tourKey?: string;
};

// Control roots that are not native labelable elements; they take aria-labelledby instead of <label for>.
const LABELLEDBY_TYPES = new Set<Field['type']>([
  'segmented',
  'list',
  'fontFamily',
  'textSizePreset',
  'surfaceColor',
  'color',
  'accentColor',
  'iconPicker',
  'emojiPicker',
  'imageUpload',
  'soundPicker',
  'rosterPicker',
  'custom',
  'partnerWidget',
]);

export const FieldRenderer: React.FC<FieldRendererProps> = ({
  field,
  widget,
  ctx,
  updateConfig,
  defaults,
  forceDisabled = false,
  tourKey,
}) => {
  const uid = useId();
  const id = `${uid}${widget.id}-${field.key}`;
  const helpId = `${id}-help`;
  const labelId = `${id}-label`;

  const onChange = useCallback(
    (value: unknown) =>
      updateConfig(
        field.toPatch ? field.toPatch(value, ctx) : { [field.key]: value }
      ),
    [updateConfig, field, ctx]
  );

  const label =
    field.type === 'partnerWidget' && ctx.toolLabel
      ? ctx.toolLabel(field.partner)
      : resolveLabel(ctx.t, widget.type, field.label);
  const help = field.help
    ? resolveLabel(ctx.t, widget.type, field.help)
    : undefined;

  const visible = isFieldVisible(field, ctx);
  const disabled =
    forceDisabled || (field.disabledWhen ? field.disabledWhen(ctx) : false);
  const value = field.readValue ? field.readValue(ctx) : ctx.config[field.key];

  const defaultValue = defaults ? defaults[field.key] : undefined;
  const canReset =
    field.type !== 'custom' &&
    field.type !== 'partnerWidget' &&
    defaults !== undefined &&
    defaultValue !== undefined &&
    value !== undefined &&
    value !== defaultValue;

  const usesLabelledBy = LABELLEDBY_TYPES.has(field.type);

  // Not memoized: `ctx` is a fresh object every render, so only Custom's own React.memo can skip work.
  const Component = FIELD_COMPONENTS[field.type];
  if (!Component) {
    if (!import.meta.env.DEV) return null;
    return (
      <p role="alert" className="text-xxs text-brand-red-primary py-2">
        Unknown settings field type &quot;{String(field.type)}&quot; for key
        &quot;{field.key}&quot;.
      </p>
    );
  }
  const renderRow =
    field.type === 'list'
      ? (
          row: Record<string, unknown>,
          rowIndex: number,
          onRowChange: (nextRow: Record<string, unknown>) => void
        ) => (
          <div className="flex flex-col gap-1">
            {field.row.fields.map((rowField) => (
              <FieldRenderer
                key={rowField.key}
                field={rowField}
                tourKey={`${field.key}.${rowIndex + 1}.${rowField.key}`}
                widget={widget}
                ctx={{ ...ctx, config: row }}
                updateConfig={(patch) => onRowChange({ ...row, ...patch })}
              />
            ))}
          </div>
        )
      : undefined;
  const renderField =
    field.type === 'partnerWidget'
      ? (inner: Field, innerForceDisabled: boolean) => (
          <FieldRenderer
            field={inner}
            widget={widget}
            ctx={ctx}
            updateConfig={updateConfig}
            defaults={defaults}
            forceDisabled={innerForceDisabled}
          />
        )
      : undefined;
  const control = (
    <Component
      field={field}
      value={value}
      onChange={onChange}
      id={id}
      describedBy={help ? helpId : undefined}
      labelId={usesLabelledBy ? labelId : undefined}
      disabled={disabled}
      ctx={ctx}
      updateConfig={updateConfig}
      renderRow={renderRow}
      renderField={renderField}
    />
  );

  if (!visible) return null;

  const inline = field.type === 'toggle';
  const labelClass = 'text-xs font-semibold text-slate-700';

  const labelRow = (
    <div className="flex items-center justify-between gap-2">
      {usesLabelledBy ? (
        <span id={labelId} className={labelClass}>
          {label}
        </span>
      ) : (
        <label htmlFor={id} id={labelId} className={labelClass}>
          {label}
        </label>
      )}
      {canReset && (
        <button
          type="button"
          onClick={() => onChange(defaultValue)}
          className="text-xxs text-slate-600 hover:text-slate-800 underline"
        >
          {resolveLabel(ctx.t, widget.type, 'reset')}
        </button>
      )}
    </div>
  );

  const helpLine = help ? (
    <p id={helpId} className="text-xxs text-slate-600">
      {help}
    </p>
  ) : null;

  return (
    <div
      data-layout={inline ? 'inline' : 'stacked'}
      data-field-key={field.key}
      {...tourFieldAttr('settings.field', widget.type, tourKey ?? field.key)}
      className={
        inline
          ? 'flex items-start justify-between gap-3 py-2'
          : 'flex flex-col gap-1.5 py-2'
      }
    >
      {inline ? (
        <>
          <div className="flex flex-col gap-0.5 min-w-0">
            {labelRow}
            {helpLine}
          </div>
          <fieldset disabled={disabled} className="contents">
            {control}
          </fieldset>
        </>
      ) : (
        <>
          {labelRow}
          <fieldset disabled={disabled} className="contents">
            {control}
          </fieldset>
          {helpLine}
        </>
      )}
    </div>
  );
};
