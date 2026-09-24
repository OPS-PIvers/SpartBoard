import React, { useId } from 'react';
import { SettingsLabel } from '@/components/common/SettingsLabel';
import type { WidgetData } from '@/types';
import {
  TAB_GROUPS,
  isFieldVisible,
  type FieldCtx,
  type Group,
  type SettingsTab,
  type UpdateConfig,
  type WidgetSettingsSchema,
} from '@/components/settings/schema/types';
import { FieldRenderer } from './FieldRenderer';
import { resolveLabel } from './resolveLabel';

export type SchemaRendererProps = {
  schema: WidgetSettingsSchema;
  widget: WidgetData;
  ctx: FieldCtx;
  updateConfig: UpdateConfig;
  defaults?: Record<string, unknown>;
  /** Which tab's groups to render (D8 order within the tab). Defaults to the Settings tab. */
  tab?: SettingsTab;
  /** Rendered instead of nothing when the tab has no visible fields. */
  emptyFallback?: React.ReactNode;
};

export const SchemaRenderer: React.FC<SchemaRendererProps> = ({
  schema,
  widget,
  ctx,
  updateConfig,
  defaults,
  tab = 'settings',
  emptyFallback = null,
}) => {
  const uid = useId();

  const groups = TAB_GROUPS[tab]
    .map((id) => schema.groups.find((group) => group.id === id))
    .filter((group): group is Group => group !== undefined);
  const hasVisibleField = groups.some((group) =>
    group.fields.some((field) => isFieldVisible(field, ctx))
  );
  if (!hasVisibleField) return <>{emptyFallback}</>;

  return (
    <div className="flex flex-col gap-5">
      {groups.map((group) => {
        const visibleFields = group.fields.filter((field) =>
          isFieldVisible(field, ctx)
        );
        if (visibleFields.length === 0) return null;

        const headingId = `${uid}${widget.id}-group-${group.id}`;
        const title = resolveLabel(
          ctx.t,
          widget.type,
          group.title ?? `group.${group.id}`
        );

        return (
          <section
            key={group.id}
            role="group"
            aria-labelledby={headingId}
            data-group={group.id}
          >
            <SettingsLabel as="span" id={headingId} tone="drawer">
              {title}
            </SettingsLabel>
            <div className="divide-y divide-slate-100">
              {(() => {
                const printedSections = new Set<string>();
                return visibleFields.map((field) => {
                  const startsSection =
                    field.section !== undefined &&
                    !printedSections.has(field.section);
                  if (startsSection && field.section) {
                    printedSections.add(field.section);
                  }
                  return (
                    <React.Fragment key={field.key}>
                      {startsSection && field.section && (
                        <p
                          data-section={field.section}
                          className="pt-3 pb-1 text-xxs font-bold uppercase tracking-wider text-slate-600"
                        >
                          {resolveLabel(ctx.t, widget.type, field.section)}
                        </p>
                      )}
                      <FieldRenderer
                        field={field}
                        widget={widget}
                        ctx={ctx}
                        updateConfig={updateConfig}
                        defaults={defaults}
                      />
                    </React.Fragment>
                  );
                });
              })()}
            </div>
          </section>
        );
      })}
    </div>
  );
};
