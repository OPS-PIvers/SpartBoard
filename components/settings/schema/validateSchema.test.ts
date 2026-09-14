import { describe, expect, it } from 'vitest';
import { defineSettings } from './defineSettings';
import { validateSchema, type LocaleCatalog } from './validateSchema';
import type { WidgetSettingsSchema } from './types';

const locale: LocaleCatalog = {
  widgetSettings: {
    common: { title: 'Title', titleHelp: 'Shown in the header' },
    clock: { showSeconds: 'Show seconds' },
  },
};

const base = { locale, defaults: { showSeconds: true } };

describe('validateSchema', () => {
  it('accepts a well-formed schema', () => {
    const schema: WidgetSettingsSchema = {
      groups: [
        {
          id: 'content',
          fields: [
            {
              type: 'text',
              key: 'showSeconds',
              label: 'title',
              help: 'titleHelp',
            },
          ],
        },
        {
          id: 'display',
          fields: [
            { type: 'toggle', key: 'showSeconds', label: 'showSeconds' },
          ],
        },
      ],
      styleKeys: ['fontFamily', 'cardColor'],
    };
    expect(validateSchema('clock', schema, base)).toEqual({
      errors: [],
      warnings: [],
    });
  });

  it('rejects groups out of D8 order', () => {
    const result = validateSchema(
      'clock',
      {
        groups: [
          { id: 'display', fields: [] },
          { id: 'content', fields: [] },
        ],
      },
      base
    );
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('out of D8 order');
  });

  it('rejects duplicate groups', () => {
    const result = validateSchema(
      'clock',
      {
        groups: [
          { id: 'content', fields: [] },
          { id: 'content', fields: [] },
        ],
      },
      base
    );
    expect(result.errors[0]).toContain('duplicate group');
  });

  it('rejects an unknown group id', () => {
    const result = validateSchema(
      'clock',
      {
        groups: [{ id: 'advanced', fields: [] }],
      } as unknown as WidgetSettingsSchema,
      base
    );
    expect(result.errors[0]).toContain('unknown group id');
  });

  it('rejects a dotted key', () => {
    const result = validateSchema(
      'clock',
      {
        groups: [
          {
            id: 'content',
            fields: [
              { type: 'text', key: 'a.b', label: 'title' },
            ] as unknown as WidgetSettingsSchema['groups'][number]['fields'],
          },
        ],
      },
      base
    );
    expect(result.errors[0]).toContain('is dotted');
  });

  it('rejects a styleKey outside APPEARANCE_CONFIG_KEYS', () => {
    const result = validateSchema(
      'clock',
      {
        groups: [],
        styleKeys: ['items'] as unknown as WidgetSettingsSchema['styleKeys'],
      },
      base
    );
    expect(result.errors[0]).toContain('not in APPEARANCE_CONFIG_KEYS');
  });

  it('rejects a label with no i18n key', () => {
    const result = validateSchema(
      'clock',
      {
        groups: [
          {
            id: 'content',
            fields: [{ type: 'toggle', key: 'showSeconds', label: 'nope' }],
          },
        ],
      },
      base
    );
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('resolves to neither');
  });

  it('rejects an explicit search term with no i18n key', () => {
    const result = validateSchema(
      'clock',
      {
        groups: [
          {
            id: 'content',
            fields: [
              {
                type: 'toggle',
                key: 'showSeconds',
                label: 'showSeconds',
                searchTerms: ['nope'],
              },
            ],
          },
        ],
      },
      base
    );
    expect(result.errors[0]).toContain('search term "nope"');
  });

  it('warns, not errors, when defaults lack a field key', () => {
    const result = validateSchema(
      'clock',
      {
        groups: [
          {
            id: 'content',
            fields: [
              { type: 'toggle', key: 'showSeconds', label: 'showSeconds' },
            ],
          },
        ],
      },
      { locale, defaults: {} }
    );
    expect(result.errors).toEqual([]);
    expect(result.warnings[0]).toContain('no default for "showSeconds"');
  });

  it('allows Custom fields and skips their defaults check', () => {
    const result = validateSchema(
      'clock',
      {
        groups: [
          {
            id: 'behavior',
            fields: [
              {
                type: 'custom',
                key: 'showSeconds',
                label: 'title',
                render: () => null,
              },
            ],
          },
        ],
      },
      { locale, defaults: {} }
    );
    expect(result).toEqual({ errors: [], warnings: [] });
  });

  it('accepts a List field whose row labels resolve', () => {
    const result = validateSchema(
      'clock',
      {
        groups: [
          {
            id: 'content',
            fields: [
              {
                type: 'list',
                key: 'showSeconds',
                label: 'title',
                row: {
                  fields: [{ type: 'text', key: 'label', label: 'title' }],
                },
              },
            ],
          },
        ],
      },
      { locale, defaults: {} }
    );
    expect(result.errors).toEqual([]);
  });

  it('rejects a List row field with no i18n key', () => {
    const result = validateSchema(
      'clock',
      {
        groups: [
          {
            id: 'content',
            fields: [
              {
                type: 'list',
                key: 'showSeconds',
                label: 'title',
                row: {
                  fields: [{ type: 'text', key: 'label', label: 'nope' }],
                },
              },
            ],
          },
        ],
      },
      { locale, defaults: {} }
    );
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('content.showSeconds.row.label');
    expect(result.errors[0]).toContain('resolves to neither');
  });

  it('does not warn about missing defaults coverage for row fields', () => {
    const result = validateSchema(
      'clock',
      {
        groups: [
          {
            id: 'content',
            fields: [
              {
                type: 'list',
                key: 'showSeconds',
                label: 'title',
                row: {
                  fields: [{ type: 'text', key: 'label', label: 'title' }],
                },
              },
            ],
          },
        ],
      },
      { locale, defaults: { showSeconds: [] } }
    );
    expect(result.warnings).toEqual([]);
  });

  it('warns for select/segmented option labels that look like literal English', () => {
    const result = validateSchema(
      'clock',
      {
        groups: [
          {
            id: 'display',
            fields: [
              {
                type: 'select',
                key: 'showSeconds',
                label: 'title',
                options: [
                  { value: 0, label: 'Disabled' },
                  { value: 1, label: 'Every 1 Minute' },
                ],
              },
              {
                type: 'segmented',
                key: 'showSeconds',
                label: 'title',
                options: [{ value: 'a', label: 'Left Side' }],
              },
            ],
          },
        ],
      },
      base
    );
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([
      'clock: option label "Disabled" on "showSeconds" looks like literal English; use a widgetSettings.clock or common leaf',
      'clock: option label "Every 1 Minute" on "showSeconds" looks like literal English; use a widgetSettings.clock or common leaf',
      'clock: option label "Left Side" on "showSeconds" looks like literal English; use a widgetSettings.clock or common leaf',
    ]);
  });

  it('does not warn for option labels that resolve or look like leaves', () => {
    const result = validateSchema(
      'clock',
      {
        groups: [
          {
            id: 'display',
            fields: [
              {
                type: 'segmented',
                key: 'showSeconds',
                label: 'title',
                options: [
                  { value: 'a', label: 'showSeconds' },
                  { value: 'b', label: 'title' },
                  { value: 'c', label: 'styles.modern' },
                ],
              },
              {
                type: 'list',
                key: 'showSeconds',
                label: 'title',
                row: {
                  fields: [
                    {
                      type: 'select',
                      key: 'kind',
                      label: 'title',
                      options: [{ value: 'x', label: 'Literal Row Label' }],
                    },
                  ],
                },
              },
            ],
          },
        ],
      },
      base
    );
    expect(result.warnings).toEqual([
      'clock: display.showSeconds.row.kind option label "Literal Row Label" looks like literal English; use a widgetSettings.clock or common leaf',
    ]);
  });

  it('defineSettings returns the schema unchanged', () => {
    const schema = defineSettings<{ showSeconds: boolean }>({
      groups: [
        {
          id: 'display',
          fields: [
            { type: 'toggle', key: 'showSeconds', label: 'showSeconds' },
          ],
        },
      ],
    });
    expect(validateSchema('clock', schema, base).errors).toEqual([]);
  });
});
