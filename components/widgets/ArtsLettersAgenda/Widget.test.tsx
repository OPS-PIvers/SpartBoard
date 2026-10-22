import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ArtsLettersAgendaWidget } from './Widget';
import type { ArtsLettersAgendaConfig, WidgetData } from '@/types';

const mockUpdateWidget = vi.fn();

const auth = vi.hoisted(() => ({
  featurePermissions: [] as unknown[],
  selectedBuildings: ['schumann'],
}));

vi.mock('@/context/useAuth', () => ({
  useAuth: () => auth,
}));

const withLists = (lists: {
  simpleParts?: { id: string; label: string }[];
  detailedParts?: { id: string; label: string }[];
}) => {
  auth.featurePermissions = [
    {
      widgetType: 'arts-letters-agenda',
      config: {
        buildingDefaults: {
          schumann: { buildingId: 'schumann', ...lists },
        },
      },
    },
  ];
};

vi.mock('@/context/dashboardCanvasStore', () => ({
  useDashboardActions: () => ({ updateWidget: mockUpdateWidget }),
  useGlobalStyle: () => ({ fontFamily: 'sans' }),
}));

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
    auth.featurePermissions = [];
    auth.selectedBuildings = ['schumann'];
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
    fireEvent.click(screen.getByText('Learn'));
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
    expect(screen.getByText('Launch')).toHaveClass('line-through');
    expect(screen.getByLabelText('Launch details')).toHaveClass('line-through');
    expect(screen.getByText('Land')).not.toHaveClass('line-through');
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

  it('shows the admin Simple list by default and the Detailed list when Detailed is chosen', () => {
    withLists({
      simpleParts: [
        { id: 'launch', label: 'Launch' },
        { id: 'learn', label: 'Learn' },
        { id: 'land', label: 'Land' },
      ],
      detailedParts: [
        { id: 'a', label: 'Warm up' },
        { id: 'b', label: 'Mini lesson' },
        { id: 'c', label: 'Practice' },
        { id: 'd', label: 'Share out' },
      ],
    });
    const { rerender } = renderWidget();
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    rerender(
      <ArtsLettersAgendaWidget widget={makeWidget({ version: 'detailed' })} />
    );
    const rows = screen.getAllByRole('listitem');
    expect(rows).toHaveLength(4);
    expect(rows[0]).toHaveTextContent('Warm up');
    expect(rows[3]).toHaveTextContent('Share out');
  });

  it('lets teachers add details to every Detailed box', () => {
    withLists({
      detailedParts: [
        { id: 'a', label: 'Warm up' },
        { id: 'b', label: 'Practice' },
      ],
    });
    renderWidget({ version: 'detailed' });
    const field = screen.getByLabelText('Practice details');
    fireEvent.change(field, { target: { value: 'Pages 4 to 6' } });
    fireEvent.blur(field);
    expect(mockUpdateWidget).toHaveBeenCalledWith('agenda-1', {
      config: { version: 'detailed', descriptions: { b: 'Pages 4 to 6' } },
    });
  });

  it('has no Simple and Detailed switch on the widget face', () => {
    withLists({ detailedParts: [{ id: 'a', label: 'Warm up' }] });
    renderWidget();
    expect(screen.queryByRole('radio', { name: 'Detailed' })).toBeNull();
  });

  it('keeps checks and descriptions by box when an admin renames a box', () => {
    withLists({
      simpleParts: [
        { id: 'launch', label: 'Hook' },
        { id: 'learn', label: 'Learn' },
      ],
    });
    renderWidget({
      completed: { launch: true },
      descriptions: { launch: 'Quick write' },
    });
    expect(screen.getByLabelText('Hook details')).toHaveValue('Quick write');
    expect(screen.getByRole('checkbox', { name: 'Hook done' })).toHaveAttribute(
      'aria-checked',
      'true'
    );
  });

  it('ignores a malformed admin list and falls back to the defaults', () => {
    withLists({
      simpleParts: [{ id: '', label: 'x' }, null as unknown as never],
    });
    renderWidget();
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getByText('Launch')).toBeInTheDocument();
  });

  it('only counts checks on visible boxes for the reset button', () => {
    withLists({ simpleParts: [{ id: 'launch', label: 'Launch' }] });
    renderWidget({ completed: { land: true } });
    expect(
      screen.getByRole('button', { name: /reset checks/i })
    ).toBeDisabled();
  });
});
