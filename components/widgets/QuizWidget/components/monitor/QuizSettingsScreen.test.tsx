import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { QuizConfig, QuizSession } from '@/types';
import { QuizSettingsScreen } from './QuizSettingsScreen';

const session = {} as QuizSession;
const base = {
  session,
  hideLiveScoreboard: false,
  hasNames: true,
  onUpdateSession: vi.fn(),
  onUpdateConfig: vi.fn(),
};

describe('QuizSettingsScreen live scores', () => {
  it('shows the sync switch when no Scoreboard is connected', () => {
    render(<QuizSettingsScreen {...base} config={{} as QuizConfig} />);
    expect(
      screen.getByRole('switch', { name: 'Sync to scoreboard widget' })
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Scoreboard display')).toBeNull();
  });

  it('replaces the switch with the connected Scoreboard and keeps the scoring choices', () => {
    const onEdit = vi.fn();
    render(
      <QuizSettingsScreen
        {...base}
        config={{} as QuizConfig}
        liveScoreboardLink={{ name: 'Scoreboard', onEdit }}
      />
    );
    expect(
      screen.queryByRole('switch', { name: 'Sync to scoreboard widget' })
    ).toBeNull();
    expect(screen.getByText('Scores go to Scoreboard')).toBeInTheDocument();
    expect(screen.getByLabelText('Scoreboard display')).toHaveValue('name');
    fireEvent.click(screen.getByRole('button', { name: 'Edit connection' }));
    expect(onEdit).toHaveBeenCalledOnce();
  });
});
