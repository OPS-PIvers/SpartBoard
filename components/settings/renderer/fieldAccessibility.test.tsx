import React, { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { Field } from '@/components/settings/schema/types';
import { FieldRenderer } from './FieldRenderer';
import { makeCtx, widget } from './fields/testUtils';

vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({ activeRosterId: null, rosters: [] }),
}));
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ user: { uid: 'u1' } }),
}));
vi.mock('@/hooks/useStorage', () => ({
  useStorage: () => ({ uploadSticker: vi.fn(), uploadHotspotImage: vi.fn() }),
}));
vi.mock('@/hooks/useGooglePicker', () => ({
  useGooglePicker: () => ({ openPicker: vi.fn(), isConnected: false }),
}));
vi.mock('@/hooks/useGoogleDrive', () => ({
  useGoogleDrive: () => ({ getDriveFileAsBlob: vi.fn() }),
}));

type Case = {
  name: string;
  field: Field;
  role: string;
  config?: Record<string, unknown>;
};

const CASES: Case[] = [
  {
    name: 'toggle',
    field: { type: 'toggle', key: 'a', label: 'label' },
    role: 'switch',
  },
  {
    name: 'text',
    field: { type: 'text', key: 'a', label: 'label' },
    role: 'textbox',
  },
  {
    name: 'textarea',
    field: { type: 'textarea', key: 'a', label: 'label' },
    role: 'textbox',
  },
  {
    name: 'number',
    field: { type: 'number', key: 'a', label: 'label' },
    role: 'spinbutton',
  },
  {
    name: 'select',
    field: {
      type: 'select',
      key: 'a',
      label: 'label',
      options: [{ value: 'x', label: 'X' }],
    },
    role: 'combobox',
  },
  {
    name: 'segmented',
    field: {
      type: 'segmented',
      key: 'a',
      label: 'label',
      options: [
        { value: 'x', label: 'X' },
        { value: 'y', label: 'Y' },
      ],
    },
    role: 'radiogroup',
  },
  {
    name: 'slider',
    field: { type: 'slider', key: 'a', label: 'label', min: 0, max: 10 },
    role: 'slider',
  },
  {
    name: 'color',
    field: { type: 'color', key: 'a', label: 'label' },
    role: 'group',
  },
  {
    name: 'accentColor',
    field: { type: 'accentColor', key: 'a', label: 'label' },
    role: 'group',
  },
  {
    name: 'fontFamily',
    field: { type: 'fontFamily', key: 'a', label: 'label' },
    role: 'radiogroup',
  },
  {
    name: 'textSizePreset',
    field: { type: 'textSizePreset', key: 'a', label: 'label' },
    role: 'radiogroup',
  },
  {
    name: 'surfaceColor',
    field: { type: 'surfaceColor', key: 'a', label: 'label' },
    role: 'group',
  },
  {
    name: 'list',
    field: {
      type: 'list',
      key: 'a',
      label: 'label',
      row: { fields: [], createRow: () => ({}) },
    },
    role: 'group',
    config: { a: [] },
  },
  {
    name: 'iconPicker',
    field: { type: 'iconPicker', key: 'a', label: 'label' },
    role: 'group',
  },
  {
    name: 'emojiPicker',
    field: { type: 'emojiPicker', key: 'a', label: 'label' },
    role: 'group',
  },
  {
    name: 'imageUpload',
    field: { type: 'imageUpload', key: 'a', label: 'label' },
    role: 'group',
  },
  {
    name: 'soundPicker',
    field: {
      type: 'soundPicker',
      key: 'a',
      label: 'label',
      options: [
        { value: 'x', label: 'X' },
        { value: 'y', label: 'Y' },
      ],
    },
    role: 'radiogroup',
  },
  {
    name: 'rosterPicker',
    field: { type: 'rosterPicker', key: 'a', label: 'label' },
    role: 'group',
  },
];

describe('field accessible names', () => {
  it.each(CASES)(
    '$name resolves by role and label and links its help text',
    ({ field, role, config }) => {
      render(
        <FieldRenderer
          field={{ ...field, help: 'labelHelp' } as Field}
          widget={widget}
          ctx={makeCtx(config ?? {})}
          updateConfig={vi.fn()}
        />
      );
      const named = screen.getByRole(role, { name: 'Label' });
      const help = screen.getByText('labelHelp');
      expect(named.getAttribute('aria-describedby')).toBe(help.id);
    }
  );
});

describe('shared-component wrappers', () => {
  const WRAPPED: Field[] = [
    { type: 'fontFamily', key: 'a', label: 'label' },
    { type: 'textSizePreset', key: 'a', label: 'label' },
    { type: 'accentColor', key: 'a', label: 'label' },
    { type: 'surfaceColor', key: 'a', label: 'label' },
  ];

  it.each(WRAPPED)('renders the $type label exactly once', (field) => {
    render(
      <FieldRenderer
        field={field}
        widget={widget}
        ctx={makeCtx({})}
        updateConfig={vi.fn()}
      />
    );
    expect(screen.getAllByText('Label')).toHaveLength(1);
  });
});

describe('SegmentedField keyboard', () => {
  const field: Field = {
    type: 'segmented',
    key: 'align',
    label: 'label',
    options: [
      { value: 'left', label: 'Left' },
      { value: 'mid', label: 'Mid' },
      { value: 'right', label: 'Right' },
    ],
  };

  it('exposes a single tab stop', () => {
    render(
      <FieldRenderer
        field={field}
        widget={widget}
        ctx={makeCtx({ align: 'mid' })}
        updateConfig={vi.fn()}
      />
    );
    const tabbable = screen
      .getAllByRole('radio')
      .filter((r) => r.getAttribute('tabindex') === '0');
    expect(tabbable).toHaveLength(1);
    expect(tabbable[0]).toHaveAccessibleName('Mid');
  });

  it('moves selection with arrow keys', () => {
    const updateConfig = vi.fn();
    render(
      <FieldRenderer
        field={field}
        widget={widget}
        ctx={makeCtx({ align: 'mid' })}
        updateConfig={updateConfig}
      />
    );
    const group = screen.getByRole('radiogroup');
    screen.getByRole('radio', { name: 'Mid' }).focus();
    fireEvent.keyDown(group, { key: 'ArrowRight' });
    expect(updateConfig).toHaveBeenCalledWith({ align: 'right' });
    expect(screen.getByRole('radio', { name: 'Right' })).toHaveFocus();
    fireEvent.keyDown(group, { key: 'ArrowUp' });
    expect(updateConfig).toHaveBeenLastCalledWith({ align: 'mid' });
  });
});

const StatefulHost: React.FC<{
  field: Field;
  initial: Record<string, unknown>;
}> = ({ field, initial }) => {
  const [config, setConfig] = useState(initial);
  return (
    <FieldRenderer
      field={field}
      widget={widget}
      ctx={makeCtx(config)}
      updateConfig={(patch) => setConfig((prev) => ({ ...prev, ...patch }))}
    />
  );
};

describe('List row editing', () => {
  it('keeps focus in a row text input across keystrokes', () => {
    const field: Field = {
      type: 'list',
      key: 'items',
      label: 'label',
      row: {
        fields: [{ type: 'text', key: 'text', label: 'label' }],
        createRow: () => ({ text: '' }),
      },
    };
    render(<StatefulHost field={field} initial={{ items: [{ text: '' }] }} />);
    const input = screen.getByRole('textbox');
    input.focus();
    fireEvent.change(input, { target: { value: 'a' } });
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'ab' } });
    const after = screen.getByRole('textbox');
    expect(after).toBe(input);
    expect(after).toHaveFocus();
    expect(after).toHaveValue('ab');
  });

  it('gives each list row field its own tour field key', () => {
    const field: Field = {
      type: 'list',
      key: 'items',
      label: 'label',
      row: {
        fields: [{ type: 'text', key: 'text', label: 'label' }],
        createRow: () => ({ text: '' }),
      },
    };
    const { container } = render(
      <StatefulHost
        field={field}
        initial={{ items: [{ text: 'a' }, { text: 'b' }] }}
      />
    );
    const keys = [...container.querySelectorAll('[data-tour-field]')].map(
      (el) => el.getAttribute('data-tour-field')
    );
    expect(keys).toEqual(['items', 'items.1.text', 'items.2.text']);
  });
});

describe('NumberField draft', () => {
  it('allows clearing and retyping in one motion', () => {
    const field: Field = { type: 'number', key: 'count', label: 'label' };
    render(<StatefulHost field={field} initial={{ count: 5 }} />);
    const input = screen.getByRole('spinbutton');
    fireEvent.change(input, { target: { value: '' } });
    expect(input).toHaveValue(null);
    fireEvent.change(input, { target: { value: '12' } });
    expect(input).toHaveValue(12);
    fireEvent.blur(input);
    expect(input).toHaveValue(12);
  });

  it('snaps back to the committed value when left empty', () => {
    const field: Field = { type: 'number', key: 'count', label: 'label' };
    render(<StatefulHost field={field} initial={{ count: 5 }} />);
    const input = screen.getByRole('spinbutton');
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.blur(input);
    expect(input).toHaveValue(5);
  });
});
