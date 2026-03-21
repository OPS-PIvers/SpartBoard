import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ScoreboardItem } from './ScoreboardItem';
import { ScoreboardTeam } from '@/types';

const plusSpy = vi.fn();
vi.mock('lucide-react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('lucide-react')>();
  return {
    ...actual,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Plus: (props: any) => {
      plusSpy(props);
      return <div data-testid="plus-icon" />;
    },
  };
});

describe('ScoreboardItem', () => {
  const mockTeam: ScoreboardTeam = {
    id: 'team-1',
    name: 'Alpha',
    score: 10,
    color: 'bg-blue-500',
  };

  const mockOnUpdateScore = vi.fn();

  beforeEach(() => {
    mockOnUpdateScore.mockClear();
    plusSpy.mockClear();
  });

  it('renders team name and score', () => {
    render(
      <ScoreboardItem team={mockTeam} onUpdateScore={mockOnUpdateScore} />
    );

    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
  });

  it('calls onUpdateScore with correct arguments when increment button is clicked', () => {
    render(
      <ScoreboardItem team={mockTeam} onUpdateScore={mockOnUpdateScore} />
    );

    const plusBtn = screen.getByRole('button', { name: /increase score/i });

    fireEvent.click(plusBtn);
    expect(mockOnUpdateScore).toHaveBeenCalledWith('team-1', 1);
  });

  it('calls onUpdateScore with correct arguments when decrement button is clicked', () => {
    render(
      <ScoreboardItem team={mockTeam} onUpdateScore={mockOnUpdateScore} />
    );

    const minusBtn = screen.getByRole('button', { name: /decrease score/i });

    fireEvent.click(minusBtn);
    expect(mockOnUpdateScore).toHaveBeenCalledWith('team-1', -1);
  });

  it('applies fallback styles for unknown color', () => {
    const unknownColorTeam = { ...mockTeam, color: 'bg-unknown-500' };
    render(
      <ScoreboardItem
        team={unknownColorTeam}
        onUpdateScore={mockOnUpdateScore}
      />
    );
    const teamName = screen.getByText('Alpha');
    expect(teamName).toBeInTheDocument();
    expect(teamName).toHaveClass('text-blue-600');
  });

  it('applies default styles when no color is provided', () => {
    const noColorTeam: ScoreboardTeam = {
      id: 'team-3',
      name: 'Delta',
      score: 5,
      // color is undefined
    };

    render(
      <ScoreboardItem team={noColorTeam} onUpdateScore={mockOnUpdateScore} />
    );
    const teamName = screen.getByText('Delta');
    expect(teamName).toBeInTheDocument();
    expect(teamName).toHaveClass('text-blue-600');
  });
  it('does not re-render if props are equal, but does if linkedGroupId changes', () => {
    const onUpdateScore = vi.fn();
    const team1: ScoreboardTeam = {
      id: 'team-1',
      name: 'Alpha',
      score: 10,
      color: 'bg-blue-500',
    };

    const { rerender } = render(
      <ScoreboardItem team={team1} onUpdateScore={onUpdateScore} />
    );

    // First render
    expect(plusSpy).toHaveBeenCalledTimes(1);

    // Rerender with the EXACT same props (cloned object)
    const team2 = { ...team1 };
    rerender(<ScoreboardItem team={team2} onUpdateScore={onUpdateScore} />);

    // Memoization works: render is skipped, call count remains 1
    expect(plusSpy).toHaveBeenCalledTimes(1);

    // Rerender with a change to linkedGroupId
    const team3 = { ...team1, linkedGroupId: 'new-group-id' };
    rerender(<ScoreboardItem team={team3} onUpdateScore={onUpdateScore} />);

    // Memoization busts: render occurs, call count becomes 2
    expect(plusSpy).toHaveBeenCalledTimes(2);
  });
});
