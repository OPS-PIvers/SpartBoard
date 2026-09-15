import React, { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import type { WidgetData } from '@/types';
import type { FieldCtx, ListField } from '@/components/settings/schema/types';
import { FieldRenderer } from '../FieldRenderer';
import { List } from './List';

let capturedOnReorder: ((next: unknown[]) => void) | undefined;
const mockDeleteFile = vi.fn<(url: string) => Promise<void>>();

vi.mock('@/hooks/useStorage', () => ({
  useStorage: () => ({ deleteFile: mockDeleteFile }),
}));

vi.mock('@/components/common/SortableList', () => ({
  SortableList: (props: {
    items: unknown[];
    getId: (item: unknown) => string;
    onReorder: (next: unknown[]) => void;
    renderItem: (
      item: unknown,
      handle: {
        attributes: Record<string, unknown>;
        listeners: undefined;
        isDragging: boolean;
      },
      index: number
    ) => React.ReactNode;
  }) => {
    capturedOnReorder = props.onReorder;
    return (
      <div>
        {props.items.map((item, index) => (
          <div key={props.getId(item)}>
            {props.renderItem(
              item,
              { attributes: {}, listeners: undefined, isDragging: false },
              index
            )}
          </div>
        ))}
      </div>
    );
  },
}));

const t = (key: string, options?: Record<string, unknown>): string =>
  typeof options?.defaultValue === 'string' ? options.defaultValue : key;

const widget = {
  id: 'w1',
  type: 'clock',
  x: 0,
  y: 0,
  w: 200,
  h: 200,
  z: 1,
  flipped: false,
  config: {},
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

const field: ListField<string> = {
  type: 'list',
  key: 'items',
  label: 'title',
  addLabel: 'addRow',
  row: {
    fields: [{ type: 'text', key: 'label', label: 'label' }],
    createRow: () => ({ label: '' }),
  },
};

describe('List field', () => {
  it('renders the control as a group container carrying the field id', () => {
    const { container } = render(
      <FieldRenderer
        field={field}
        widget={widget}
        ctx={makeCtx({ items: [{ label: 'a' }] })}
        updateConfig={vi.fn()}
      />
    );
    const group = container.querySelector('[role="group"][id$="-items"]');
    expect(group).not.toBeNull();
  });

  it('renders each row via the supplied renderRow and edits emit the whole updated array', () => {
    const onChange = vi.fn();
    render(
      <List
        field={field}
        value={[{ label: 'a' }, { label: 'b' }]}
        onChange={onChange}
        id="items"
        disabled={false}
        ctx={makeCtx()}
        renderRow={(row, index, onRowChange) => (
          <input
            aria-label={`row-${index}`}
            value={row.label as string}
            onChange={(e) => onRowChange({ ...row, label: e.target.value })}
          />
        )}
      />
    );
    const inputs = screen.getAllByRole('textbox');
    expect(inputs).toHaveLength(2);
    fireEvent.change(inputs[1], { target: { value: 'bee' } });
    expect(onChange).toHaveBeenCalledWith([{ label: 'a' }, { label: 'bee' }]);
  });

  it('adds a row from createRow via the add button', () => {
    const updateConfig = vi.fn();
    render(
      <FieldRenderer
        field={field}
        widget={widget}
        ctx={makeCtx({ items: [{ label: 'a' }] })}
        updateConfig={updateConfig}
      />
    );
    fireEvent.click(screen.getByText('addRow'));
    expect(updateConfig).toHaveBeenCalledWith({
      items: [{ label: 'a' }, { label: '' }],
    });
  });

  it('removes a row via its accessible remove button', () => {
    const updateConfig = vi.fn();
    render(
      <FieldRenderer
        field={field}
        widget={widget}
        ctx={makeCtx({ items: [{ label: 'a' }, { label: 'b' }] })}
        updateConfig={updateConfig}
      />
    );
    fireEvent.click(screen.getAllByRole('button', { name: 'removeRow' })[0]);
    expect(updateConfig).toHaveBeenCalledWith({ items: [{ label: 'b' }] });
  });

  it('deletes an owned row image after removing the row', () => {
    mockDeleteFile.mockResolvedValue(undefined);
    const updateConfig = vi.fn();
    render(
      <FieldRenderer
        field={{ ...field, cleanupImageKey: 'imageUrl' }}
        widget={widget}
        ctx={makeCtx({
          items: [{ label: 'a', imageUrl: 'https://cdn/image.png' }],
        })}
        updateConfig={updateConfig}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'removeRow' }));
    expect(updateConfig).toHaveBeenCalledWith({ items: [] });
    expect(mockDeleteFile).toHaveBeenCalledWith('https://cdn/image.png');
  });

  it('disables the add button once maxRows is reached', () => {
    render(
      <FieldRenderer
        field={{ ...field, maxRows: 1 }}
        widget={widget}
        ctx={makeCtx({ items: [{ label: 'a' }] })}
        updateConfig={vi.fn()}
      />
    );
    expect(screen.getByText('addRow').closest('button')).toBeDisabled();
  });

  it('keeps focus on an untouched row (by identity) when an earlier row is removed', () => {
    const Wrapper: React.FC = () => {
      const [items, setItems] = useState<Record<string, unknown>[]>([
        { label: 'a' },
        { label: 'b' },
        { label: 'c' },
      ]);
      return (
        <List
          field={field}
          value={items}
          onChange={(next) => setItems(next as Record<string, unknown>[])}
          id="items"
          disabled={false}
          ctx={makeCtx()}
          renderRow={(row, index, onRowChange) => (
            <input
              aria-label={`row-${index}`}
              value={row.label as string}
              onChange={(e) => onRowChange({ ...row, label: e.target.value })}
            />
          )}
        />
      );
    };
    render(<Wrapper />);
    const cInput = screen.getAllByRole('textbox')[2];
    cInput.focus();
    expect(document.activeElement).toBe(cInput);

    fireEvent.click(screen.getAllByRole('button', { name: 'removeRow' })[0]);

    const remaining = screen.getAllByRole('textbox');
    expect(remaining).toHaveLength(2);
    expect((document.activeElement as HTMLInputElement).value).toBe('c');
    expect(document.activeElement).toBe(cInput);
  });

  it('keeps focus on a row (by identity) when a sortable reorder moves it', () => {
    const initial = [{ label: 'a' }, { label: 'b' }, { label: 'c' }];
    const Wrapper: React.FC = () => {
      const [items, setItems] = useState<Record<string, unknown>[]>(initial);
      return (
        <List
          field={{ ...field, sortable: true }}
          value={items}
          onChange={(next) => setItems(next as Record<string, unknown>[])}
          id="items"
          disabled={false}
          ctx={makeCtx()}
          renderRow={(row, index, onRowChange) => (
            <input
              aria-label={`row-${index}`}
              value={row.label as string}
              onChange={(e) => onRowChange({ ...row, label: e.target.value })}
            />
          )}
        />
      );
    };
    render(<Wrapper />);
    const cInput = screen.getAllByRole('textbox')[2];
    cInput.focus();
    expect(document.activeElement).toBe(cInput);

    act(() => {
      capturedOnReorder?.([initial[2], initial[0], initial[1]]);
    });

    const reordered = screen.getAllByRole('textbox');
    expect(reordered.map((i) => (i as HTMLInputElement).value)).toEqual([
      'c',
      'a',
      'b',
    ]);
    expect(document.activeElement).toBe(cInput);
  });

  it('renders primitive rows without throwing on the identity map', () => {
    expect(() =>
      render(
        <List
          field={field}
          value={['a', 'b']}
          onChange={vi.fn()}
          id="items"
          disabled={false}
          ctx={makeCtx()}
          renderRow={(row) => <span>{row as unknown as React.ReactNode}</span>}
        />
      )
    ).not.toThrow();
    expect(screen.getByText('a')).toBeTruthy();
  });

  it('reorders via SortableList onReorder and emits the reordered array', () => {
    const updateConfig = vi.fn();
    render(
      <FieldRenderer
        field={{ ...field, sortable: true }}
        widget={widget}
        ctx={makeCtx({ items: [{ label: 'a' }, { label: 'b' }] })}
        updateConfig={updateConfig}
      />
    );
    expect(screen.getAllByLabelText('reorderRow')).toHaveLength(2);
    capturedOnReorder?.([{ label: 'b' }, { label: 'a' }]);
    expect(updateConfig).toHaveBeenCalledWith({
      items: [{ label: 'b' }, { label: 'a' }],
    });
  });
});
