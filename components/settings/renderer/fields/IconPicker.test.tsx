import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { axe } from 'jest-axe';
import { FieldRenderer } from '../FieldRenderer';
import type { IconPickerField } from '@/components/settings/schema/types';
import { makeCtx, widget } from './testUtils';

const STRUCTURAL_ONLY = { rules: { 'color-contrast': { enabled: false } } };

const field: IconPickerField<string> = {
  type: 'iconPicker',
  key: 'icon',
  label: 'label',
};

function renderField(
  config: Record<string, unknown>,
  updateConfig = vi.fn(),
  override: Partial<IconPickerField<string>> = {}
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

describe('IconPicker field', () => {
  it('renders a labelled group with the current icon checked', () => {
    renderField({ icon: 'Star' });
    expect(screen.getByRole('group', { name: 'Label' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Star' })).toHaveAttribute(
      'aria-checked',
      'true'
    );
    expect(screen.getByRole('radio', { name: 'Zap' })).toHaveAttribute(
      'aria-checked',
      'false'
    );
  });

  it('writes the picked icon name through onChange', () => {
    const updateConfig = vi.fn();
    renderField({ icon: 'Star' }, updateConfig);
    fireEvent.click(screen.getByRole('radio', { name: 'Lightbulb' }));
    expect(updateConfig).toHaveBeenCalledWith({ icon: 'Lightbulb' });
  });

  it('filters the grid by the search box and shows an empty state', () => {
    renderField({});
    const search = screen.getByRole('searchbox', { name: 'searchIcons' });
    fireEvent.change(search, { target: { value: 'lightb' } });
    expect(screen.getAllByRole('radio')).toHaveLength(1);
    expect(screen.getByRole('radio', { name: 'Lightbulb' })).toBeVisible();
    fireEvent.change(search, { target: { value: 'zzzz' } });
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
    expect(screen.getByText('noMatchingIcons')).toBeInTheDocument();
  });

  it('honours a custom icon list and keeps one tab stop', () => {
    renderField({ icon: 'Bell' }, vi.fn(), { icons: ['Bell', 'Clock'] });
    const radios = screen.getAllByRole('radio');
    expect(radios.map((r) => r.getAttribute('aria-label'))).toEqual([
      'Bell',
      'Clock',
    ]);
    expect(radios.filter((r) => r.tabIndex === 0)).toHaveLength(1);
  });

  it('moves selection with arrow keys', () => {
    const updateConfig = vi.fn();
    renderField({ icon: 'Bell' }, updateConfig, { icons: ['Bell', 'Clock'] });
    const bell = screen.getByRole('radio', { name: 'Bell' });
    bell.focus();
    fireEvent.keyDown(bell, { key: 'ArrowRight' });
    expect(updateConfig).toHaveBeenCalledWith({ icon: 'Clock' });
    expect(screen.getByRole('radio', { name: 'Clock' })).toHaveFocus();
  });

  it('honours disabled', () => {
    renderField({ icon: 'Bell' }, vi.fn(), {
      icons: ['Bell'],
      disabledWhen: () => true,
    });
    expect(screen.getByRole('radio', { name: 'Bell' })).toBeDisabled();
    expect(screen.getByRole('searchbox')).toBeDisabled();
  });

  it('has no structural axe violations', async () => {
    const { container } = renderField({ icon: 'Bell' }, vi.fn(), {
      icons: ['Bell', 'Clock'],
    });
    expect(await axe(container, STRUCTURAL_ONLY)).toHaveNoViolations();
  });
});
