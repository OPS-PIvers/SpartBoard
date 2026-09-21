import type { WidgetType } from '@/types';
import { WIDGET_DEFAULTS } from '@/config/widgetDefaults';
import { APPEARANCE_CONFIG_KEYS } from '@/utils/widgetConfigPersistence';
import en from '@/locales/en.json';
import { GROUP_ORDER, type Field, type WidgetSettingsSchema } from './types';

export type LocaleCatalog = { [key: string]: unknown };

export type SchemaValidationResult = {
  errors: string[];
  warnings: string[];
};

export type ValidateSchemaOptions = {
  locale?: LocaleCatalog;
  defaults?: Record<string, unknown> | undefined;
};

function lookup(catalog: LocaleCatalog, path: string): unknown {
  return path
    .split('.')
    .reduce<unknown>(
      (node, part) =>
        node && typeof node === 'object'
          ? (node as Record<string, unknown>)[part]
          : undefined,
      catalog
    );
}

function resolves(catalog: LocaleCatalog, type: string, leaf: string): boolean {
  return (
    typeof lookup(catalog, `widgetSettings.${type}.${leaf}`) === 'string' ||
    typeof lookup(catalog, `widgetSettings.common.${leaf}`) === 'string'
  );
}

const LITERAL_ENGLISH = /[\sA-Z]/;

/** Option labels are i18n leaves too; a non-resolving label with a space or capital is probably literal English. */
function literalOptionLabels(
  catalog: LocaleCatalog,
  type: string,
  field: Field
): string[] {
  if (
    field.type !== 'select' &&
    field.type !== 'segmented' &&
    field.type !== 'soundPicker'
  ) {
    return [];
  }
  return field.options
    .map((option) => option.label)
    .filter(
      (label) => !resolves(catalog, type, label) && LITERAL_ENGLISH.test(label)
    );
}

/** Validates a widget settings schema against the §4.2 rules. */
export function validateSchema<C = Record<string, unknown>>(
  type: WidgetType,
  schema: WidgetSettingsSchema<C>,
  options: ValidateSchemaOptions = {}
): SchemaValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const catalog = options.locale ?? (en as LocaleCatalog);
  const defaults =
    'defaults' in options
      ? options.defaults
      : (WIDGET_DEFAULTS[type]?.config as Record<string, unknown> | undefined);

  const seenGroups = new Set<string>();
  let lastOrder = -1;
  for (const group of schema.groups) {
    const order = GROUP_ORDER.indexOf(group.id);
    if (order === -1) {
      errors.push(`${type}: unknown group id "${group.id}"`);
      continue;
    }
    if (seenGroups.has(group.id)) {
      errors.push(`${type}: duplicate group "${group.id}"`);
    }
    seenGroups.add(group.id);
    if (order < lastOrder) {
      errors.push(
        `${type}: group "${group.id}" is out of D8 order (content, behavior, display)`
      );
    }
    lastOrder = Math.max(lastOrder, order);

    const fields = (group.fields as ReadonlyArray<Field>).flatMap(
      (field): Field[] => {
        if (field.type !== 'partnerWidget') return [field];
        if (!resolves(catalog, type, field.missingHelp)) {
          errors.push(
            `${type}: missingHelp "${field.missingHelp}" resolves to neither widgetSettings.${type}.${field.missingHelp} nor widgetSettings.common.${field.missingHelp}`
          );
        }
        if (field.control.key !== field.key) {
          errors.push(
            `${type}: partner card "${field.key}" wraps a control keyed "${field.control.key}"; keys must match`
          );
        }
        return [field, field.control];
      }
    );
    for (const field of fields) {
      if (
        field.section !== undefined &&
        !resolves(catalog, type, field.section)
      ) {
        errors.push(
          `${type}: section "${field.section}" resolves to neither widgetSettings.${type}.${field.section} nor widgetSettings.common.${field.section}`
        );
      }
      if (field.key.includes('.')) {
        errors.push(
          `${type}: field key "${field.key}" is dotted; top-level config keys only`
        );
      }
      if (!resolves(catalog, type, field.label)) {
        errors.push(
          `${type}: label "${field.label}" resolves to neither widgetSettings.${type}.${field.label} nor widgetSettings.common.${field.label}`
        );
      }
      if (field.help !== undefined && !resolves(catalog, type, field.help)) {
        errors.push(
          `${type}: help "${field.help}" resolves to neither widgetSettings.${type}.${field.help} nor widgetSettings.common.${field.help}`
        );
      }
      if (
        (field.type === 'text' || field.type === 'textarea') &&
        field.placeholder !== undefined &&
        !resolves(catalog, type, field.placeholder)
      ) {
        errors.push(
          `${type}: placeholder "${field.placeholder}" resolves to neither widgetSettings.${type}.${field.placeholder} nor widgetSettings.common.${field.placeholder}`
        );
      }
      for (const searchTerm of field.searchTerms ?? []) {
        if (!resolves(catalog, type, searchTerm)) {
          errors.push(
            `${type}: search term "${searchTerm}" resolves to neither widgetSettings.${type}.${searchTerm} nor widgetSettings.common.${searchTerm}`
          );
        }
      }
      if (
        field.type !== 'custom' &&
        field.type !== 'partnerWidget' &&
        field.readValue === undefined &&
        defaults &&
        !(field.key in defaults) &&
        !field.key.includes('.')
      ) {
        warnings.push(
          `${type}: WIDGET_DEFAULTS.config has no default for "${field.key}"`
        );
      }
      for (const label of literalOptionLabels(catalog, type, field)) {
        warnings.push(
          `${type}: option label "${label}" on "${field.key}" looks like literal English; use a widgetSettings.${type} or common leaf`
        );
      }

      if (field.type === 'list') {
        for (const rowField of field.row.fields) {
          const prefix = `${type}: ${group.id}.${field.key}.row.${rowField.key}`;
          for (const label of literalOptionLabels(catalog, type, rowField)) {
            warnings.push(
              `${prefix} option label "${label}" looks like literal English; use a widgetSettings.${type} or common leaf`
            );
          }
          if (rowField.key.includes('.')) {
            errors.push(`${prefix} is dotted; top-level row keys only`);
          }
          if (!resolves(catalog, type, rowField.label)) {
            errors.push(
              `${prefix} label "${rowField.label}" resolves to neither widgetSettings.${type}.${rowField.label} nor widgetSettings.common.${rowField.label}`
            );
          }
          if (
            rowField.help !== undefined &&
            !resolves(catalog, type, rowField.help)
          ) {
            errors.push(
              `${prefix} help "${rowField.help}" resolves to neither widgetSettings.${type}.${rowField.help} nor widgetSettings.common.${rowField.help}`
            );
          }
          if (
            (rowField.type === 'text' || rowField.type === 'textarea') &&
            rowField.placeholder !== undefined &&
            !resolves(catalog, type, rowField.placeholder)
          ) {
            errors.push(
              `${prefix} placeholder "${rowField.placeholder}" resolves to neither widgetSettings.${type}.${rowField.placeholder} nor widgetSettings.common.${rowField.placeholder}`
            );
          }
          for (const searchTerm of rowField.searchTerms ?? []) {
            if (!resolves(catalog, type, searchTerm)) {
              errors.push(
                `${prefix} search term "${searchTerm}" resolves to neither widgetSettings.${type}.${searchTerm} nor widgetSettings.common.${searchTerm}`
              );
            }
          }
        }
      }
    }
  }

  for (const key of schema.styleKeys ?? []) {
    if (!APPEARANCE_CONFIG_KEYS.has(key)) {
      errors.push(
        `${type}: styleKey "${key}" is not in APPEARANCE_CONFIG_KEYS`
      );
    }
  }

  return { errors, warnings };
}
