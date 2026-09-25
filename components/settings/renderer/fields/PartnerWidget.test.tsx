import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { WidgetData, WidgetType } from '@/types';
import type {
  FieldCtx,
  PartnerWidgetField,
} from '@/components/settings/schema/types';
import { useDashboard } from '@/context/useDashboard';
import { FieldRenderer } from '../FieldRenderer';
import { SchemaRenderer } from '../SchemaRenderer';

vi.mock('@/context/useDashboard', () => ({ useDashboard: vi.fn() }));

const mockedUseDashboard = vi.mocked(useDashboard);
const addWidget = vi.fn();

const t = (key: string, options?: Record<string, unknown>): string => {
  if (key === 'widgetSettings.common.partner.add')
    return `Add ${String(options?.name)} widget`;
  return typeof options?.defaultValue === 'string' ? options.defaultValue : key;
};

const widget = {
  id: 'w1',
  type: 'time-tool',
  x: 0,
  y: 0,
  w: 200,
  h: 200,
  z: 1,
} as WidgetData;

const field: PartnerWidgetField<string> = {
  type: 'partnerWidget',
  key: 'autoRotate',
  label: 'autoRotate',
  partner: 'stations',
  control: { type: 'toggle', key: 'autoRotate', label: 'Auto-rotate' },
};

function makeCtx(
  config: Record<string, unknown>,
  extra: Partial<FieldCtx> = {}
): FieldCtx {
  return {
    config,
    widget,
    isAdmin: false,
    canAccessFeature: () => true,
    toolLabel: (type: WidgetType) => (type === 'stations' ? 'Stations' : type),
    t,
    ...extra,
  };
}

const boardWith = (...types: WidgetType[]) =>
  mockedUseDashboard.mockReturnValue({
    activeDashboard: { widgets: types.map((type) => ({ type })) },
    addWidget,
  } as unknown as ReturnType<typeof useDashboard>);

beforeEach(() => {
  vi.clearAllMocks();
  boardWith();
});

describe('PartnerWidget', () => {
  it('titles the card by the partner name and names the group by it', () => {
    boardWith('stations');
    render(
      <FieldRenderer
        field={field}
        widget={widget}
        ctx={makeCtx({ autoRotate: true })}
        updateConfig={vi.fn()}
      />
    );
    expect(screen.getByRole('group', { name: 'Stations' })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Auto-rotate' })).toBeEnabled();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('disables the control and adds the partner on tap while it is missing', () => {
    const updateConfig = vi.fn();
    render(
      <FieldRenderer
        field={field}
        widget={widget}
        ctx={makeCtx({ autoRotate: true })}
        updateConfig={updateConfig}
      />
    );
    const toggle = screen.getByRole('switch', { name: 'Auto-rotate' });
    expect(toggle).toBeDisabled();
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(
      screen.getByRole('button', { name: 'Add Stations widget' })
    );
    expect(addWidget).toHaveBeenCalledWith('stations');
    expect(updateConfig).not.toHaveBeenCalled();
  });

  it('writes the inner control value through the shared updateConfig', () => {
    boardWith('stations');
    const updateConfig = vi.fn();
    render(
      <FieldRenderer
        field={field}
        widget={widget}
        ctx={makeCtx({ autoRotate: false })}
        updateConfig={updateConfig}
      />
    );
    fireEvent.click(screen.getByRole('switch', { name: 'Auto-rotate' }));
    expect(updateConfig).toHaveBeenCalledWith({ autoRotate: true });
  });

  it('renders nothing at all when the partner widget is permission-hidden', () => {
    const { container } = render(
      <FieldRenderer
        field={field}
        widget={widget}
        ctx={makeCtx({}, { canAccessWidget: () => false })}
        updateConfig={vi.fn()}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('drops the section heading with the cards when every partner is permission-hidden', () => {
    const sectioned = { ...field, section: 'When the timer ends' };
    const schema = {
      groups: [
        {
          id: 'behavior' as const,
          fields: [
            { type: 'toggle' as const, key: 'other', label: 'Other' },
            sectioned,
          ],
        },
      ],
    };
    const { rerender, container } = render(
      <SchemaRenderer
        schema={schema}
        widget={widget}
        ctx={makeCtx({})}
        updateConfig={vi.fn()}
      />
    );
    expect(container.querySelector('[data-section]')).toHaveTextContent(
      'When the timer ends'
    );
    rerender(
      <SchemaRenderer
        schema={schema}
        widget={widget}
        ctx={makeCtx({}, { canAccessWidget: () => false })}
        updateConfig={vi.fn()}
      />
    );
    expect(container.querySelector('[data-section]')).toBeNull();
    expect(screen.getByRole('switch', { name: 'Other' })).toBeInTheDocument();
  });
});
