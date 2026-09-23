import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AuthContext } from '@/context/AuthContextValue';
import type { TabExit } from '@/types';
import { TabExitsPopover } from './TabExitsPopover';

const exits: TabExit[] = [
  {
    leftAt: Date.UTC(2026, 8, 23, 15, 32, 14),
    durationMs: 4_000,
    questionIndex: 1,
    attempt: 0,
    outcome: 'returned',
  },
  {
    leftAt: Date.UTC(2026, 8, 23, 15, 41, 50),
    durationMs: 37_000,
    questionIndex: 6,
    attempt: 0,
    outcome: 'over-limit',
  },
];

const renderPopover = (
  flagOn: boolean,
  log: TabExit[] | undefined,
  warnings = 2
) =>
  render(
    <AuthContext.Provider
      value={
        {
          canAccessFeature: (f: string) => flagOn && f === 'tab-away-timer',
        } as never
      }
    >
      <TabExitsPopover
        exits={log}
        warnings={warnings}
        studentName="Avery"
        completed={false}
        sessionEnded={false}
      >
        <span>{warnings}</span>
      </TabExitsPopover>
    </AuthContext.Provider>
  );

describe('TabExitsPopover', () => {
  it('leaves the count as plain text without the flag', () => {
    renderPopover(false, exits);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('opens every exit with its time away and the total', () => {
    renderPopover(true, exits);
    fireEvent.click(
      screen.getByRole('button', { name: 'Show when Avery left' })
    );
    const dialog = screen.getByRole('dialog', { name: 'Times Avery left' });
    expect(dialog).toHaveTextContent('Avery left 2 times');
    expect(dialog).toHaveTextContent('Q2');
    expect(dialog).toHaveTextContent('0:04');
    expect(dialog).toHaveTextContent('Returned');
    expect(dialog).toHaveTextContent('Q7');
    expect(dialog).toHaveTextContent('0:37');
    expect(dialog).toHaveTextContent('Over limit');
    expect(dialog).toHaveTextContent('Total away: 0:41');
  });

  it('says when an attempt predates the log', () => {
    renderPopover(true, undefined, 3);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByRole('dialog')).toHaveTextContent(
      "Exit details weren't recorded for this attempt."
    );
  });

  it('closes on Escape', () => {
    renderPopover(true, exits);
    fireEvent.click(screen.getByRole('button'));
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
