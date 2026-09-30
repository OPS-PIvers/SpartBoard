import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { GradebookSettingsModalView } from './GradebookSettingsModal';
import type { GradebookScaleOption } from '@/hooks/useGradebookSettings';
import type { GradebookConfigRef } from '@/utils/gradebook/gradebookCore';
import {
  defaultSettingsBody,
  resolveClassConfig,
  type GradebookConfigEntry,
} from '@/utils/gradebook/settingsConfig';

vi.mock('@/utils/plcPath', () => ({
  buildPlcPath: (id: string, s: string) => `/plc/${id}/${s}`,
  spaNavigate: vi.fn(),
}));

const personal = (id: string, name: string): GradebookConfigEntry => ({
  key: `personal:${id}`,
  ref: { source: 'personal', configId: id },
  source: 'personal',
  name,
  body: defaultSettingsBody(name),
  readOnly: false,
});

const scaleOptions: GradebookScaleOption[] = [
  {
    value: 'district',
    label: 'Orono district scale',
    scale: {
      proficient: 80,
      approaching: 60,
      levelNames: ['Proficient', 'Approaching', 'Beginning'],
    },
  },
  { value: 'custom', label: 'Custom', scale: null },
];

function setup(extra: GradebookConfigEntry[] = []) {
  const mine = personal('a', 'My settings');
  const honors = personal('b', 'Honors');
  const entries = [mine, honors, ...extra];
  const classRefs = new Map<string, GradebookConfigRef | null>([
    ['p2', mine.ref],
    ['p6', honors.ref],
  ]);
  const actions = {
    createConfig: vi.fn((_b: unknown, id?: string) =>
      Promise.resolve(id ?? 'new')
    ),
    saveConfig: vi.fn(() => Promise.resolve()),
    deleteConfig: vi.fn(() => Promise.resolve()),
    setClassConfig: vi.fn(() => Promise.resolve()),
    newConfigId: vi.fn(() => 'n1'),
  };
  render(
    <GradebookSettingsModalView
      onClose={vi.fn()}
      classes={[
        { id: 'p2', name: 'Period 2' },
        { id: 'p4', name: 'Period 4' },
        { id: 'p6', name: 'Period 6' },
      ]}
      currentClassId="p2"
      entries={entries}
      classRefs={classRefs}
      scaleOptions={scaleOptions}
      configForClass={(id) => resolveClassConfig(id, classRefs, entries)}
      actions={actions}
    />
  );
  return actions;
}

describe('GradebookSettingsModalView', () => {
  it("opens on the current class's configuration", () => {
    setup();
    expect(screen.getByLabelText('Configuration')).toHaveValue('personal:a');
    expect(
      screen.getByRole('button', { name: 'Applies to' })
    ).toHaveTextContent('Period 2');
  });

  it('refuses a key another flag uses', () => {
    const actions = setup();
    const key = screen.getByLabelText('Late key');
    fireEvent.change(key, { target: { value: 'M' } });
    fireEvent.blur(key);
    expect(screen.getByRole('status')).toHaveTextContent(
      'Missing already uses M.'
    );
    expect(actions.saveConfig).not.toHaveBeenCalled();
  });

  it('adds a flag with the next free key and offers Undo', () => {
    const actions = setup();
    fireEvent.click(screen.getByRole('button', { name: '+ Add flag' }));
    const [, body] = actions.saveConfig.mock.calls[0] as unknown as [
      string,
      { flags: { key: string; name: string }[] },
    ];
    expect(body.flags.at(-1)).toMatchObject({ key: 'N', name: 'New flag' });
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(actions.saveConfig).toHaveBeenCalledTimes(2);
    expect(
      (
        actions.saveConfig.mock.calls[1] as unknown as [
          string,
          { flags: unknown[] },
        ]
      )[1].flags
    ).toHaveLength(5);
  });

  it('moves a class from another configuration with a toast', () => {
    const actions = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Applies to' }));
    const menu = screen.getByRole('menu', { name: 'Applies to' });
    const p6 = within(menu).getByRole('menuitemcheckbox', { name: /Period 6/ });
    expect(p6).toHaveTextContent('Honors');
    fireEvent.click(p6);
    expect(actions.setClassConfig).toHaveBeenCalledWith('p6', {
      source: 'personal',
      configId: 'a',
    });
    expect(screen.getByRole('status')).toHaveTextContent(
      'Moved Period 6 from Honors to My settings'
    );
    fireEvent.click(
      within(menu).getByRole('menuitemcheckbox', { name: /Period 4/ })
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      'Period 4 now uses My settings'
    );
  });

  it('confirms delete in place and names the classes that go back to defaults', () => {
    const actions = setup();
    fireEvent.click(
      screen.getByRole('button', { name: 'Delete configuration' })
    );
    expect(
      screen.getByText(/1 class goes back to the default settings/)
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(actions.setClassConfig).toHaveBeenCalledWith('p2', null);
    expect(screen.getByLabelText('Configuration')).toHaveValue('personal:b');
  });

  it('shows a PLC set read-only with copy and Open in PLC', () => {
    const plc: GradebookConfigEntry = {
      ...personal('x', 'Grade 8 ELA PLC'),
      key: 'plc:p1',
      ref: { source: 'plc', plcId: 'p1' },
      source: 'plc',
      readOnly: true,
    };
    const actions = setup([plc]);
    fireEvent.change(screen.getByLabelText('Configuration'), {
      target: { value: 'plc:p1' },
    });
    expect(
      screen.getByText(/Your PLC lead manages this configuration/)
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Rename configuration' })
    ).toBeNull();
    expect(screen.getByLabelText('Missing key')).toBeDisabled();
    fireEvent.click(
      screen.getByRole('button', { name: 'Duplicate configuration' })
    );
    expect(actions.createConfig).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Grade 8 ELA PLC' }),
      'n1'
    );
  });

  it('switching to a custom scale copies the shown scale and unlocks the cutoffs', () => {
    const actions = setup();
    expect(screen.getByLabelText('Proficient cutoff')).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Scale'), {
      target: { value: 'custom' },
    });
    const [, body] = actions.saveConfig.mock.calls[0] as unknown as [
      string,
      { scale: unknown },
    ];
    expect(body.scale).toEqual({
      source: 'custom',
      scale: {
        proficient: 80,
        approaching: 60,
        levelNames: ['Proficient', 'Approaching', 'Beginning'],
      },
    });
  });
});
