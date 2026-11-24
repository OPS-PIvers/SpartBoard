import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { axe } from 'jest-axe';
import type { ClassRoster } from '@/types';
import type { RosterPickerField } from '@/components/settings/schema/types';
import { makeCtx, widget } from './testUtils';

const dashboardState: {
  activeRosterId: string | null;
  rosters: ClassRoster[];
} = { activeRosterId: null, rosters: [] };

vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => dashboardState,
}));

import { FieldRenderer } from '../FieldRenderer';

const STRUCTURAL_ONLY = { rules: { 'color-contrast': { enabled: false } } };

const roster = {
  id: 'r1',
  name: 'Room 12',
  driveFileId: null,
  studentCount: 2,
  createdAt: 0,
  students: [
    { id: 's1', name: 'Ada' },
    { id: 's2', name: 'Grace' },
  ],
} as unknown as ClassRoster;

const field: RosterPickerField<string> = {
  type: 'rosterPicker',
  key: 'rosterMode',
  label: 'label',
};

function renderField(
  config: Record<string, unknown>,
  updateConfig = vi.fn(),
  override: Partial<RosterPickerField<string>> = {}
) {
  return render(
    <FieldRenderer
      field={{ ...field, ...override }}
      widget={widget}
      ctx={makeCtx(config)}
      updateConfig={updateConfig}
    />
  );
}

beforeEach(() => {
  dashboardState.activeRosterId = null;
  dashboardState.rosters = [];
});

describe('RosterPicker field', () => {
  it('defaults to Auto and reports no active class', () => {
    renderField({});
    expect(screen.getByRole('group', { name: 'Label' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'rosterAuto' })).toHaveAttribute(
      'aria-checked',
      'true'
    );
    expect(screen.getByRole('radio', { name: 'rosterCustom' })).toHaveAttribute(
      'aria-checked',
      'false'
    );
    expect(screen.getByTestId('roster-picker-status')).toHaveTextContent(
      'rosterNone'
    );
  });

  it('shows the active roster name and student count in Auto mode', () => {
    dashboardState.rosters = [roster];
    dashboardState.activeRosterId = 'r1';
    renderField({ rosterMode: 'class' });
    expect(screen.getByTestId('roster-picker-status')).toHaveTextContent(
      'rosterActive: Room 12 · 2 students'
    );
  });

  it('looks disabled inside an ancestor <fieldset disabled> (read-only drawer)', () => {
    render(
      <fieldset disabled>
        <FieldRenderer
          field={field}
          widget={widget}
          ctx={makeCtx({ rosterMode: 'class' })}
          updateConfig={vi.fn()}
        />
      </fieldset>
    );
    const radio = screen.getByRole('radio', { name: 'rosterAuto' });
    expect(radio).toBeDisabled();
    expect(radio.className).toContain('disabled:opacity-50');
    expect(radio.className).toContain('disabled:cursor-not-allowed');
  });

  it('hides the roster status in Custom mode', () => {
    dashboardState.rosters = [roster];
    dashboardState.activeRosterId = 'r1';
    renderField({ rosterMode: 'custom' });
    expect(screen.getByRole('radio', { name: 'rosterCustom' })).toHaveAttribute(
      'aria-checked',
      'true'
    );
    expect(screen.queryByTestId('roster-picker-status')).toBeNull();
  });

  it('writes the picked mode through onChange', () => {
    const updateConfig = vi.fn();
    renderField({ rosterMode: 'class' }, updateConfig);
    fireEvent.click(screen.getByRole('radio', { name: 'rosterCustom' }));
    expect(updateConfig).toHaveBeenCalledWith({ rosterMode: 'custom' });
  });

  it('keeps one tab stop and moves selection with arrow keys', () => {
    const updateConfig = vi.fn();
    renderField({ rosterMode: 'class' }, updateConfig);
    const radios = screen.getAllByRole('radio');
    expect(radios.filter((r) => r.tabIndex === 0)).toHaveLength(1);
    const auto = screen.getByRole('radio', { name: 'rosterAuto' });
    auto.focus();
    fireEvent.keyDown(auto, { key: 'ArrowRight' });
    expect(updateConfig).toHaveBeenCalledWith({ rosterMode: 'custom' });
    expect(screen.getByRole('radio', { name: 'rosterCustom' })).toHaveFocus();
  });

  it('honours disabled', () => {
    renderField({ rosterMode: 'class' }, vi.fn(), {
      disabledWhen: () => true,
    });
    screen.getAllByRole('radio').forEach((r) => expect(r).toBeDisabled());
  });

  it('has no structural axe violations', async () => {
    dashboardState.rosters = [roster];
    dashboardState.activeRosterId = 'r1';
    const { container } = renderField({ rosterMode: 'class' });
    expect(await axe(container, STRUCTURAL_ONLY)).toHaveNoViolations();
  });
});
