import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { WidgetData } from '@/types';
import type {
  FieldCtx,
  UpdateConfig,
  WidgetSettingsSchema,
} from '@/components/settings/schema/types';
import { SchemaRenderer } from './SchemaRenderer';
import { FieldRenderer } from './FieldRenderer';
import { resolveLabel } from './resolveLabel';

const CATALOG: Record<string, string> = {
  'widgetSettings.clock.showSeconds': 'Show seconds',
  'widgetSettings.common.title': 'Title',
  'widgetSettings.common.titleHelp': 'Shown in the header',
  'widgetSettings.common.group.content': 'Content',
  'widgetSettings.common.group.behavior': 'Behavior',
  'widgetSettings.common.group.display': 'Display',
  'widgetSettings.common.reset': 'Reset',
};

const t = (key: string, options?: Record<string, unknown>): string => {
  if (key in CATALOG) return CATALOG[key];
  return typeof options?.defaultValue === 'string' ? options.defaultValue : key;
};

const widget = {
  id: 'w1',
  type: 'clock',
  x: 0,
  y: 0,
  w: 200,
  h: 200,
  z: 1,
} as WidgetData;

function makeCtx(config: Record<string, unknown> = {}): FieldCtx {
  return {
    config,
    widget,
    isAdmin: false,
    canAccessFeature: () => true,
    t,
  };
}

describe('resolveLabel', () => {
  it('prefers the widget-scoped key', () => {
    expect(resolveLabel(t, 'clock', 'showSeconds')).toBe('Show seconds');
  });

  it('falls back to widgetSettings.common', () => {
    expect(resolveLabel(t, 'clock', 'title')).toBe('Title');
  });

  it('falls back to the bare leaf when neither resolves', () => {
    expect(resolveLabel(t, 'clock', 'nope')).toBe('nope');
  });
});

describe('SchemaRenderer', () => {
  it('renders the Settings-tab groups in D8 order and routes display to the Style tab', () => {
    const schema: WidgetSettingsSchema = {
      groups: [
        {
          id: 'display',
          fields: [{ type: 'toggle', key: 'a', label: 'title' }],
        },
        {
          id: 'content',
          fields: [{ type: 'text', key: 'b', label: 'title' }],
        },
        {
          id: 'behavior',
          fields: [{ type: 'text', key: 'c', label: 'title' }],
        },
      ],
    };
    const { container } = render(
      <SchemaRenderer
        schema={schema}
        widget={widget}
        ctx={makeCtx()}
        updateConfig={vi.fn()}
      />
    );
    const order = Array.from(container.querySelectorAll('[data-group]')).map(
      (el) => el.getAttribute('data-group')
    );
    expect(order).toEqual(['content', 'behavior']);
    const style = render(
      <SchemaRenderer
        schema={schema}
        widget={widget}
        ctx={makeCtx()}
        updateConfig={vi.fn()}
        tab="style"
      />
    );
    const styleOrder = Array.from(
      style.container.querySelectorAll('[data-group]')
    ).map((el) => el.getAttribute('data-group'));
    expect(styleOrder).toEqual(['display']);
  });

  it('omits a group whose fields are all hidden', () => {
    const schema: WidgetSettingsSchema = {
      groups: [
        {
          id: 'content',
          fields: [{ type: 'text', key: 'b', label: 'title' }],
        },
        {
          id: 'display',
          fields: [
            {
              type: 'toggle',
              key: 'a',
              label: 'title',
              visibleWhen: () => false,
            },
          ],
        },
      ],
    };
    const { container } = render(
      <SchemaRenderer
        schema={schema}
        widget={widget}
        ctx={makeCtx()}
        updateConfig={vi.fn()}
      />
    );
    expect(container.querySelectorAll('[data-group]')).toHaveLength(1);
    expect(
      container.querySelector('[data-group]')?.getAttribute('data-group')
    ).toBe('content');
  });

  it('labels each section with its group heading', () => {
    const schema: WidgetSettingsSchema = {
      groups: [
        { id: 'content', fields: [{ type: 'text', key: 'b', label: 'title' }] },
      ],
    };
    render(
      <SchemaRenderer
        schema={schema}
        widget={widget}
        ctx={makeCtx()}
        updateConfig={vi.fn()}
      />
    );
    expect(screen.getByRole('group', { name: 'Content' })).toBeInTheDocument();
  });

  it('prints a repeated field.section heading only once per group, even when a differently-sectioned field interrupts the run', () => {
    const schema: WidgetSettingsSchema = {
      groups: [
        {
          id: 'behavior',
          fields: [
            { type: 'text', key: 'a', label: 'title', section: 'timerEnd' },
            { type: 'text', key: 'mid', label: 'title' },
            { type: 'text', key: 'b', label: 'title', section: 'timerEnd' },
          ],
        },
      ],
    };
    const { container } = render(
      <SchemaRenderer
        schema={schema}
        widget={widget}
        ctx={makeCtx()}
        updateConfig={vi.fn()}
      />
    );
    expect(
      container.querySelectorAll('[data-section="timerEnd"]')
    ).toHaveLength(1);
  });
});

describe('FieldRenderer', () => {
  const renderField = (
    field: WidgetSettingsSchema['groups'][number]['fields'][number],
    config: Record<string, unknown> = {},
    extra: {
      updateConfig?: UpdateConfig;
      defaults?: Record<string, unknown>;
    } = {}
  ) =>
    render(
      <FieldRenderer
        field={field}
        widget={widget}
        ctx={makeCtx(config)}
        updateConfig={extra.updateConfig ?? vi.fn()}
        defaults={extra.defaults}
      />
    );

  it('renders nothing when visibleWhen is false', () => {
    const { container } = renderField({
      type: 'text',
      key: 'b',
      label: 'title',
      visibleWhen: () => false,
    });
    expect(container.firstChild).toBeNull();
  });

  it('disables the control when disabledWhen is true', () => {
    const { container } = renderField({
      type: 'text',
      key: 'b',
      label: 'title',
      disabledWhen: () => true,
    });
    expect(container.querySelector('fieldset')).toBeDisabled();
  });

  it('wires htmlFor and aria-describedby', () => {
    const { container } = renderField({
      type: 'text',
      key: 'b',
      label: 'title',
      help: 'titleHelp',
    });
    const label = container.querySelector('label');
    const help = screen.getByText('Shown in the header');
    expect(label?.getAttribute('for')).toBeTruthy();
    expect(help.id).toBe(`${label?.getAttribute('for')}-help`);
  });

  it('uses the inline layout for toggle and stacked for text', () => {
    const { container: a } = renderField({
      type: 'toggle',
      key: 'b',
      label: 'title',
    });
    const { container: b } = renderField({
      type: 'text',
      key: 'c',
      label: 'title',
    });
    expect(a.firstElementChild?.getAttribute('data-layout')).toBe('inline');
    expect(b.firstElementChild?.getAttribute('data-layout')).toBe('stacked');
  });

  it('renders a dev-only warning for an unknown field type', () => {
    const { container } = renderField({
      type: 'notAField',
      key: 'b',
      label: 'title',
    } as unknown as WidgetSettingsSchema['groups'][number]['fields'][number]);
    expect(container.querySelector('[data-field-key="b"]')).toBeNull();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Unknown settings field type "notAField" for key "b".'
    );
  });

  it('writes exactly { [key]: value } through updateConfig', () => {
    const updateConfig = vi.fn();
    renderField(
      { type: 'text', key: 'b', label: 'title' },
      { b: 'changed' },
      { updateConfig, defaults: { b: 'original' } }
    );
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    expect(updateConfig).toHaveBeenCalledTimes(1);
    expect(updateConfig).toHaveBeenCalledWith({ b: 'original' });
  });

  it('never renders the reset link for a custom field, even when its value differs from default', () => {
    const field = {
      type: 'custom' as const,
      key: 'mode',
      label: 'title',
      render: () => <span>custom</span>,
    };
    renderField(
      field,
      { mode: 'countdown' },
      { defaults: { mode: 'stopwatch' } }
    );
    expect(screen.queryByRole('button', { name: 'Reset' })).toBeNull();
  });

  it('gives Custom a stable updateConfig and re-renders only when its config changes', () => {
    const updateConfig = vi.fn();
    const seen: Array<(patch: Record<string, unknown>) => void> = [];
    const renderFn = vi.fn(
      (
        ctx: FieldCtx & { updateConfig: (p: Record<string, unknown>) => void }
      ) => {
        seen.push(ctx.updateConfig);
        return <span>custom</span>;
      }
    );
    const field = {
      type: 'custom' as const,
      key: 'b',
      label: 'title',
      render: renderFn,
    };
    const ctx = makeCtx({ other: 1 });
    const { rerender } = render(
      <FieldRenderer
        field={field}
        widget={widget}
        ctx={ctx}
        updateConfig={updateConfig}
      />
    );
    rerender(
      <FieldRenderer
        field={field}
        widget={widget}
        ctx={{ ...ctx, config: { other: 1 } }}
        updateConfig={updateConfig}
      />
    );
    expect(renderFn).toHaveBeenCalledTimes(1);

    rerender(
      <FieldRenderer
        field={field}
        widget={widget}
        ctx={{ ...ctx, config: { other: 2 } }}
        updateConfig={updateConfig}
      />
    );
    expect(renderFn).toHaveBeenCalledTimes(2);
    expect(seen[0]).toBe(updateConfig);
  });
});
