import type { Field, FieldCtx, WidgetSettingsSchema } from './schema/types';
import { TAB_GROUPS, isFieldVisible, type GroupId } from './schema/types';
import { WINDOW_STYLE_LABELS } from './schema/windowStyle';
import { resolveStyleFields } from './schema/styleKeys';

export type IndexedField = {
  /** Schema/style fields carry the field; Window-tier rows are label-only. */
  key: string;
  label: string;
  field?: Field;
};

export type IndexSection = {
  id: string;
  title: string;
  fields: IndexedField[];
  /** Window tier: one match renders the whole tier (§3 item 2). */
  atomic?: boolean;
};

export type ResolveLeaf = (leaf: string) => string;

export function normalizeQuery(query: string): string {
  return query.trim().toLowerCase();
}

export function matchesQuery(label: string, query: string): boolean {
  const normalized = normalizeQuery(query);
  if (normalized === '') return true;
  return label.toLowerCase().includes(normalized);
}

function buildGroupSections(
  schema: WidgetSettingsSchema | null | undefined,
  ids: ReadonlyArray<GroupId>,
  ctx: FieldCtx,
  resolve: ResolveLeaf
): IndexSection[] {
  if (!schema) return [];
  return ids.flatMap((id) => {
    const group = schema.groups.find((candidate) => candidate.id === id);
    if (!group) return [];
    const fields = group.fields
      .filter((field) => isFieldVisible(field, ctx))
      .map((field) => {
        const searchableLabels = [
          field.type === 'partnerWidget'
            ? `${ctx.toolLabel?.(field.partner) ?? field.partner} ${resolve(field.control.label)}`
            : resolve(field.label),
          ...(field.searchTerms ?? []).map(resolve),
          ...(field.type === 'list'
            ? field.row.fields.flatMap((rowField) => [
                resolve(rowField.label),
                ...(rowField.searchTerms ?? []).map(resolve),
              ])
            : []),
        ];
        return {
          key: field.key,
          label: searchableLabels.join(' '),
          field: field as Field,
        };
      });
    if (fields.length === 0) return [];
    return [{ id, title: resolve(group.title ?? `group.${id}`), fields }];
  });
}

/** Settings-tab sections in D8 order, excluding `visibleWhen`-hidden fields. */
export function buildSchemaSections(
  schema: WidgetSettingsSchema | null | undefined,
  ctx: FieldCtx,
  resolve: ResolveLeaf
): IndexSection[] {
  return buildGroupSections(schema, TAB_GROUPS.settings, ctx, resolve);
}

/** Style-tab sections: the widget's `display` group, the Content tier (declared `styleKeys`), then the Window tier. */
export function buildStyleSections(
  schema: WidgetSettingsSchema | null | undefined,
  ctx: FieldCtx,
  resolve: ResolveLeaf
): IndexSection[] {
  const sections: IndexSection[] = buildGroupSections(
    schema,
    TAB_GROUPS.style,
    ctx,
    resolve
  );
  const contentFields = resolveStyleFields(schema?.styleKeys)
    .filter((field) => (field.visibleWhen ? field.visibleWhen(ctx) : true))
    .map((field) => ({
      key: field.key,
      label: resolve(field.label),
      field,
    }));
  if (contentFields.length > 0) {
    sections.push({
      id: 'style',
      title: resolve('style.contentTier'),
      fields: contentFields,
    });
  }
  sections.push({
    id: 'window',
    title: resolve('style.windowTier'),
    atomic: true,
    fields: WINDOW_STYLE_LABELS.map((leaf) => ({
      key: leaf,
      label: resolve(leaf),
    })),
  });
  return sections;
}

/** Drops non-matching fields, then empty sections. Atomic sections keep all rows on any match. */
export function filterSections(
  sections: IndexSection[],
  query: string
): IndexSection[] {
  const normalized = normalizeQuery(query);
  if (normalized === '') return sections;
  return sections.flatMap((section) => {
    const matched = section.fields.filter((entry) =>
      matchesQuery(entry.label, normalized)
    );
    if (matched.length === 0) return [];
    return [{ ...section, fields: section.atomic ? section.fields : matched }];
  });
}

export function hasMatches(sections: IndexSection[]): boolean {
  return sections.some((section) => section.fields.length > 0);
}
