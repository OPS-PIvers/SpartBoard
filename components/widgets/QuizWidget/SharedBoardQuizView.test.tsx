import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DashboardContext } from '@/context/DashboardContextValue';
import type { DashboardContextValue } from '@/context/DashboardContextValue';
import { SharedBoardQuizUnavailable } from './SharedBoardQuizView';

const withBoard = (node: React.ReactNode) => (
  <DashboardContext.Provider
    value={
      {
        activeDashboard: {
          linkedShareHostUid: 'host',
          linkedShareHostName: 'Ms. Rivera',
        },
      } as unknown as DashboardContextValue
    }
  >
    {node}
  </DashboardContext.Provider>
);

describe('SharedBoardQuizUnavailable', () => {
  it('names the quiz and the board host who owns it', () => {
    render(
      withBoard(
        <SharedBoardQuizUnavailable
          loading={false}
          title="Ratios warm-up"
          ownerUid="host"
        />
      )
    );
    expect(
      screen.getByText(`"Ratios warm-up" isn't available on this board yet`)
    ).toBeTruthy();
    expect(
      screen.getByText(
        'It shows up here after Ms. Rivera next opens this board.'
      )
    ).toBeTruthy();
  });

  it('does not name the host for a quiz another member owns', () => {
    render(
      withBoard(
        <SharedBoardQuizUnavailable
          loading={false}
          title={null}
          ownerUid="someone-else"
        />
      )
    );
    expect(
      screen.getByText("This quiz isn't available on this board yet")
    ).toBeTruthy();
    expect(
      screen.getByText(
        'It shows up here after the teacher who owns it next opens this board.'
      )
    ).toBeTruthy();
  });

  it('shows a loading state, not the explanation, while the copy loads', () => {
    render(
      withBoard(
        <SharedBoardQuizUnavailable
          loading
          title="Ratios warm-up"
          ownerUid="host"
        />
      )
    );
    expect(screen.getByText('Loading quiz…')).toBeTruthy();
    expect(screen.queryByText(/isn't available/)).toBeNull();
  });
});
