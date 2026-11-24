import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { WidgetData } from '@/types';
import type {
  CustomField,
  CustomRenderCtx,
  FieldCtx,
  TranslateFn,
  UpdateConfig,
} from '@/components/settings/schema/types';
import { FieldRenderer } from '../FieldRenderer';

const t: TranslateFn = (key, options) =>
  typeof options?.defaultValue === 'string' ? options.defaultValue : key;

const widget = {
  id: 'w1',
  type: 'clock',
  x: 0,
  y: 0,
  w: 200,
  h: 200,
  z: 1,
} as WidgetData;

function makeCtx(
  config: Record<string, unknown> = {},
  translate: TranslateFn = t
): FieldCtx {
  return {
    config,
    widget,
    isAdmin: false,
    canAccessFeature: () => true,
    t: translate,
  };
}

describe('Custom field', () => {
  it('calls render with ctx plus a stable updateConfig', () => {
    const seen: UpdateConfig[] = [];
    const field: CustomField<string> = {
      type: 'custom',
      key: 'thing',
      label: 'title',
      render: (ctx) => {
        seen.push(ctx.updateConfig);
        return (
          <button onClick={() => ctx.updateConfig({ thing: 'set' })}>
            do it
          </button>
        );
      },
    };
    const updateConfig = vi.fn();
    const { rerender } = render(
      <FieldRenderer
        field={field}
        widget={widget}
        ctx={makeCtx()}
        updateConfig={updateConfig}
      />
    );

    fireEvent.click(screen.getByText('do it'));
    expect(updateConfig).toHaveBeenCalledWith({ thing: 'set' });

    rerender(
      <FieldRenderer
        field={field}
        widget={widget}
        ctx={makeCtx()}
        updateConfig={updateConfig}
      />
    );

    expect(seen.length).toBeGreaterThanOrEqual(1);
    expect(seen[0]).toBe(updateConfig);
  });

  it('hands render id/labelId/describedBy so a Custom root can be labelled by the label row', () => {
    let received: CustomRenderCtx | null = null;
    const field: CustomField<string> = {
      type: 'custom',
      key: 'thing',
      label: 'title',
      help: 'titleHelp',
      render: (ctx) => {
        received = ctx;
        return (
          <div
            id={ctx.id}
            role="group"
            aria-labelledby={ctx.labelId}
            aria-describedby={ctx.describedBy}
          >
            <span>content</span>
          </div>
        );
      },
    };
    const { container } = render(
      <FieldRenderer
        field={field}
        widget={widget}
        ctx={makeCtx()}
        updateConfig={vi.fn()}
      />
    );

    expect(received).not.toBeNull();
    const ctx = received as unknown as CustomRenderCtx;
    expect(ctx.id).toBeTruthy();
    expect(ctx.labelId).toBe(`${ctx.id}-label`);
    expect(ctx.describedBy).toBe(`${ctx.id}-help`);
    // The label row is a span (not a dangling <label for>) that the Custom root points at.
    expect(container.querySelector('label')).toBeNull();
    expect(document.getElementById(ctx.labelId)).toHaveTextContent('title');
    expect(
      screen.getByRole('group', { name: 'title' })
    ).toHaveAccessibleDescription('titleHelp');
  });

  it('re-renders on a language switch even when config is unchanged', () => {
    const renderFn = vi.fn((ctx: CustomRenderCtx) => (
      <span>{ctx.t('widgetSettings.clock.thing')}</span>
    ));
    const field: CustomField<string> = {
      type: 'custom',
      key: 'thing',
      label: 'title',
      render: renderFn,
    };
    const updateConfig = vi.fn();
    const config = { thing: 1 };
    const { rerender } = render(
      <FieldRenderer
        field={field}
        widget={widget}
        ctx={makeCtx(config)}
        updateConfig={updateConfig}
      />
    );
    expect(renderFn).toHaveBeenCalledTimes(1);

    rerender(
      <FieldRenderer
        field={field}
        widget={widget}
        ctx={makeCtx(config)}
        updateConfig={updateConfig}
      />
    );
    expect(renderFn).toHaveBeenCalledTimes(1);

    const german: TranslateFn = (key, options) =>
      key === 'widgetSettings.clock.thing' ? 'Ding' : t(key, options);
    rerender(
      <FieldRenderer
        field={field}
        widget={widget}
        ctx={makeCtx(config, german)}
        updateConfig={updateConfig}
      />
    );
    expect(renderFn).toHaveBeenCalledTimes(2);
    expect(screen.getByText('Ding')).toBeInTheDocument();
  });

  it('renders a dev-only warning for an unknown field type instead of a blank row', () => {
    const field = {
      type: 'notAField',
      key: 'a',
      label: 'title',
    } as unknown as CustomField<string>;
    const { container } = render(
      <FieldRenderer
        field={field}
        widget={widget}
        ctx={makeCtx()}
        updateConfig={vi.fn()}
      />
    );
    expect(import.meta.env.DEV).toBe(true);
    expect(container.querySelector('[data-field-key]')).toBeNull();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Unknown settings field type "notAField" for key "a".'
    );
  });
});
