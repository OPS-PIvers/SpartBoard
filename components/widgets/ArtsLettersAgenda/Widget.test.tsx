import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ArtsLettersAgendaWidget } from './Widget';
import { useDashboard } from '@/context/useDashboard';
import type { DashboardContextValue } from '@/context/DashboardContextValue';
import type { ArtsLettersAgendaConfig, WidgetData } from '@/types';

vi.mock('@/context/useDashboard');

const mockUpdateWidget = vi.fn();

const makeWidget = (config: ArtsLettersAgendaConfig = {}): WidgetData => ({
  id: 'agenda-1',
  type: 'arts-letters-agenda',
  x: 0,
  y: 0,
  w: 420,
  h: 420,
  z: 1,
  flipped: false,
  config,
});

const renderWidget = (config: ArtsLettersAgendaConfig = {}) =>
  render(<ArtsLettersAgendaWidget widget={makeWidget(config)} />);

describe('ArtsLettersAgendaWidget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useDashboard).mockReturnValue({
      updateWidget: mockUpdateWidget,
      activeDashboard: null,
    } as unknown as DashboardContextValue);
  });

  it('always shows Launch, Learn and Land in order', () => {
    renderWidget();
    const rows = screen.getAllByRole('listitem');
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent('Launch');
    expect(rows[1]).toHaveTextContent('Learn');
    expect(rows[2]).toHaveTextContent('Land');
  });

  it('shows saved descriptions under each part', () => {
    renderWidget({ descriptions: { learn: 'Read chapter 3' } });
    expect(screen.getByLabelText('Learn details')).toHaveValue(
      'Read chapter 3'
    );
    expect(screen.getByLabelText('Launch details')).toHaveValue('');
  });

  it('checks a part off from its box', () => {
    renderWidget();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Launch done' }));
    expect(mockUpdateWidget).toHaveBeenCalledWith('agenda-1', {
      config: { completed: { launch: true } },
    });
  });

  it('checks a part off from its name and unchecks it again', () => {
    renderWidget({ completed: { learn: true } });
    fireEvent.click(screen.getByRole('button', { name: 'Learn' }));
    expect(mockUpdateWidget).toHaveBeenCalledWith('agenda-1', {
      config: { completed: { learn: false } },
    });
  });

  it('crosses out a finished part', () => {
    renderWidget({
      completed: { launch: true },
      descriptions: { launch: 'Warm up' },
    });
    expect(
      screen.getByRole('checkbox', { name: 'Launch done' })
    ).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('button', { name: 'Launch' })).toHaveStyle({
      textDecoration: 'line-through',
    });
    expect(screen.getByLabelText('Launch details')).toHaveStyle({
      textDecoration: 'line-through',
    });
    expect(screen.getByRole('button', { name: 'Land' })).toHaveStyle({
      textDecoration: 'none',
    });
  });

  it('saves a description when the field loses focus and keeps the checks', () => {
    renderWidget({ completed: { launch: true } });
    const field = screen.getByLabelText('Land details');
    fireEvent.change(field, { target: { value: '  Exit ticket  ' } });
    fireEvent.blur(field);
    expect(mockUpdateWidget).toHaveBeenCalledWith('agenda-1', {
      config: {
        completed: { launch: true },
        descriptions: { land: 'Exit ticket' },
      },
    });
  });

  it('does not save when the description is unchanged', () => {
    renderWidget({ descriptions: { land: 'Exit ticket' } });
    fireEvent.blur(screen.getByLabelText('Land details'));
    expect(mockUpdateWidget).not.toHaveBeenCalled();
  });

  it('saves a description on Enter', () => {
    renderWidget();
    const field = screen.getByLabelText('Launch details');
    field.focus();
    fireEvent.change(field, { target: { value: 'Quick write' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(mockUpdateWidget).toHaveBeenCalledWith('agenda-1', {
      config: { descriptions: { launch: 'Quick write' } },
    });
  });

  it('resets the checks and keeps the descriptions', () => {
    renderWidget({
      completed: { launch: true, learn: true },
      descriptions: { launch: 'Warm up' },
    });
    fireEvent.click(screen.getByRole('button', { name: /reset checks/i }));
    expect(mockUpdateWidget).toHaveBeenCalledWith('agenda-1', {
      config: { completed: {}, descriptions: { launch: 'Warm up' } },
    });
  });

  it('disables reset when nothing is checked', () => {
    renderWidget();
    expect(
      screen.getByRole('button', { name: /reset checks/i })
    ).toBeDisabled();
  });
});
