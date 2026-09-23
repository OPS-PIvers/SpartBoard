import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

const launch = vi.fn();
const reset = vi.fn();
let state = {
  status: 'idle' as string,
  result: null as { sessionId: string; code: string } | null,
  error: null as string | null,
};
vi.mock('@/hooks/useSubLaunch', () => ({
  useSubLaunch: () => ({ ...state, launch, reset }),
}));

let enabled = true;
vi.mock('@/hooks/useSubLaunchAsTeacherSettings', () => ({
  useSubLaunchAsTeacherSettings: () => ({ enabled }),
}));

import { SubLaunchPanel } from './SubLaunchPanel';
import { SubShareContentContext } from '@/context/SubShareContentContextValue';
import { subShareContextValue } from '@/tests/helpers/subShareContext';
import type { SubstituteShareRoster } from '@/types';

const roster = (id: string, name: string) =>
  ({ id, name, driveFileId: `d-${id}` }) as SubstituteShareRoster;

const show = (
  rosters: SubstituteShareRoster[],
  itemId: string | null = 'q-1'
) =>
  render(
    <SubShareContentContext.Provider value={subShareContextValue({ rosters })}>
      <SubLaunchPanel kind="quiz" widgetId="w1" itemId={itemId} label="quiz" />
    </SubShareContentContext.Provider>
  );

beforeEach(() => {
  vi.clearAllMocks();
  enabled = true;
  state = { status: 'idle', result: null, error: null };
});

describe('SubLaunchPanel', () => {
  // Absent rather than disabled: a board a sub cannot launch from should look
  // exactly as it did before this shipped.
  it('is absent while the org switch is off', () => {
    enabled = false;
    show([roster('r1', 'Period 3')]);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('is absent when the teacher shared no class', () => {
    show([]);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('is absent when the widget has no activity open', () => {
    show([roster('r1', 'Period 3')], null);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  // A sub day is usually one class, so asking which is a question with one
  // answer.
  it('starts one shared class in a single press', async () => {
    show([roster('r1', 'Period 3')]);

    await userEvent.click(
      screen.getByRole('button', { name: /Start quiz with Period 3/ })
    );

    expect(launch).toHaveBeenCalledWith(['r1']);
  });

  it('asks which class when the share carries several', async () => {
    show([roster('r1', 'Period 3'), roster('r2', 'Period 5')]);

    await userEvent.click(screen.getByRole('button', { name: 'Start quiz' }));
    expect(launch).not.toHaveBeenCalled();
    expect(screen.getByText('Which class?')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Period 5' }));
    expect(launch).toHaveBeenCalledWith(['r2']);
  });

  it('lets the sub back out of the class list', async () => {
    show([roster('r1', 'Period 3'), roster('r2', 'Period 5')]);

    await userEvent.click(screen.getByRole('button', { name: 'Start quiz' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByText('Which class?')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start quiz' })).toBeVisible();
    expect(launch).not.toHaveBeenCalled();
  });

  it('says what is happening while the run is starting', () => {
    state = { status: 'launching', result: null, error: null };
    show([roster('r1', 'Period 3')]);

    expect(screen.getByText('Starting quiz…')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('becomes the join code to read to the class', () => {
    state = {
      status: 'launched',
      result: { sessionId: 's1', code: 'AB12CD' },
      error: null,
    };
    show([roster('r1', 'Period 3')]);

    expect(screen.getByText('AB12CD')).toBeInTheDocument();
    expect(screen.getByText(/Students join with this code/)).toBeVisible();
  });

  // The teacher's Results will carry the sub's name, which the sub should know
  // before they start rather than discover afterwards.
  it('says the run belongs to the teacher', () => {
    state = {
      status: 'launched',
      result: { sessionId: 's1', code: 'AB12CD' },
      error: null,
    };
    show([roster('r1', 'Period 3')]);

    expect(
      screen.getByText(/Running in the teacher's account/)
    ).toBeInTheDocument();
  });

  // A video activity is reached by class, so a code panel would be a blank.
  it('says where students find a run that has no code', () => {
    state = {
      status: 'launched',
      result: { sessionId: 's1' } as { sessionId: string; code: string },
      error: null,
    };
    show([roster('r1', 'Period 3')]);

    expect(screen.getByText('Started')).toBeInTheDocument();
    expect(
      screen.getByText(/Students will find it in their assignments/)
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Students join with this code/)
    ).not.toBeInTheDocument();
  });

  it('shows the refusal and a way back to the button', async () => {
    state = { status: 'error', result: null, error: 'This share has expired.' };
    show([roster('r1', 'Period 3')]);

    expect(screen.getByText('This share has expired.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(reset).toHaveBeenCalled();
  });
});
