import { render, screen, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { ScoreboardWidget } from './Widget';
import {
  useGlobalStyle,
  useDashboardActions,
  type DashboardActions,
} from '@/context/dashboardCanvasStore';
import {
  DEFAULT_GLOBAL_STYLE,
  type ScoreboardConfig,
  type WidgetData,
} from '@/types';

vi.mock('@/context/dashboardCanvasStore');
const access = { pro: true };
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    canAccessFeature: (id: string) => id === 'scoreboard-pro' && access.pro,
  }),
}));

const updateWidget = vi.fn();

const makeWidget = (config: ScoreboardConfig): WidgetData => ({
  id: 'sb',
  type: 'scoreboard',
  config,
  x: 0,
  y: 0,
  w: 400,
  h: 300,
  z: 1,
  flipped: false,
});

const teams = [
  { id: 'a', name: 'Team A', score: 2, color: 'bg-blue-500' },
  { id: 'b', name: 'Team B', score: 0, color: 'bg-red-500' },
];

const lastConfig = (): ScoreboardConfig =>
  (updateWidget.mock.calls.at(-1)?.[1] as { config: ScoreboardConfig }).config;

describe('ScoreboardWidget undo and history (scoreboard-pro)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    access.pro = true;
    vi.mocked(useGlobalStyle).mockReturnValue(DEFAULT_GLOBAL_STYLE);
    vi.mocked(useDashboardActions).mockReturnValue({
      updateWidget,
    } as unknown as DashboardActions);
  });

  it('records a step for each score change', () => {
    render(<ScoreboardWidget widget={makeWidget({ teams })} />);
    fireEvent.click(screen.getAllByLabelText('Increase score')[0]);
    expect(lastConfig().history?.[0].changes).toEqual([
      { teamId: 'a', from: 2, to: 3 },
    ]);
  });

  it('does not record a step that the zero floor blocked', () => {
    render(<ScoreboardWidget widget={makeWidget({ teams })} />);
    fireEvent.click(screen.getAllByLabelText('Decrease score')[1]);
    expect(lastConfig().history ?? []).toEqual([]);
  });

  it('undoes the last step from the Undo button', () => {
    const history = [
      {
        id: 'h1',
        at: 1,
        changes: [{ teamId: 'a', from: 1, to: 2 }],
      },
    ];
    render(<ScoreboardWidget widget={makeWidget({ teams, history })} />);
    fireEvent.click(screen.getByRole('button', { name: /undo/i }));
    expect(lastConfig().teams?.[0].score).toBe(1);
    expect(lastConfig().history).toEqual([]);
  });

  it('undoes on Ctrl+Z only while focus is inside the widget', () => {
    const history = [
      { id: 'h1', at: 1, changes: [{ teamId: 'a', from: 1, to: 2 }] },
    ];
    render(
      <div data-draggable-window="">
        <ScoreboardWidget widget={makeWidget({ teams, history })} />
      </div>
    );
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
    expect(updateWidget).not.toHaveBeenCalled();

    screen.getAllByLabelText('Increase score')[0].focus();
    const event = new KeyboardEvent('keydown', {
      key: 'z',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(lastConfig().teams?.[0].score).toBe(1);
  });

  it('shows recent changes per team', () => {
    const history = [
      { id: 'h1', at: 1, changes: [{ teamId: 'a', from: 0, to: 1 }] },
      { id: 'h2', at: 2, changes: [{ teamId: 'a', from: 1, to: 2 }] },
    ];
    render(<ScoreboardWidget widget={makeWidget({ teams, history })} />);
    fireEvent.click(screen.getByRole('button', { name: /history/i }));
    expect(screen.getByText('Recent changes')).toBeInTheDocument();
    expect(screen.getAllByText('+1')).toHaveLength(2);
    expect(screen.getByText('No changes yet')).toBeInTheDocument();
  });

  it('hides undo and history and records nothing while a quiz is live-syncing', () => {
    render(
      <ScoreboardWidget
        widget={makeWidget({ teams, liveQuizWidgetId: 'quiz-1' })}
      />
    );
    expect(screen.queryByRole('button', { name: /undo/i })).toBeNull();
    fireEvent.click(screen.getAllByLabelText('Increase score')[0]);
    expect(lastConfig().history).toBeUndefined();
  });

  it('adds nothing when the flag is off', () => {
    access.pro = false;
    render(<ScoreboardWidget widget={makeWidget({ teams })} />);
    expect(screen.queryByRole('button', { name: /undo/i })).toBeNull();
    fireEvent.click(screen.getAllByLabelText('Increase score')[0]);
    expect(lastConfig().history).toBeUndefined();
  });

  it('shows the teacher-set point buttons and adds that amount', () => {
    render(
      <ScoreboardWidget
        widget={makeWidget({ teams, pointValues: [1, 5, 10] })}
      />
    );
    fireEvent.click(screen.getAllByRole('button', { name: 'Add 5 points' })[0]);
    expect(lastConfig().teams?.[0].score).toBe(7);
    expect(
      screen.getAllByRole('button', { name: 'Remove 1 point' })
    ).toHaveLength(2);
  });

  it('marks the leader with an icon and text', () => {
    render(<ScoreboardWidget widget={makeWidget({ teams })} />);
    const marks = screen
      .getAllByText('Leader')
      .filter((el) => !el.classList.contains('invisible'));
    expect(marks).toHaveLength(1);
    expect(marks[0].closest('[class*="bg-blue-500"]')).not.toBeNull();
  });

  it('keeps team order in rows when sort by score is off', () => {
    const { container } = render(
      <ScoreboardWidget
        widget={makeWidget({
          teams: [
            { id: 'a', name: 'Low', score: 1 },
            { id: 'b', name: 'High', score: 9 },
          ],
          layout: 'rows',
          sortByScore: false,
        })}
      />
    );
    const text = container.textContent ?? '';
    expect(text.indexOf('Low')).toBeLessThan(text.indexOf('High'));
  });
});
