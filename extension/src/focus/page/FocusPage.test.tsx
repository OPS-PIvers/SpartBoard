import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { FocusActiveSession } from '@/utils/focus/contract';
import type { FocusLocalState } from '../focusState';
import { FocusView, pageMode, PARKED_TITLE } from './FocusPage';

const session: FocusActiveSession = {
  sessionId: 's1',
  teacherName: 'Ms. Rivera',
  level: 'redirect',
  sites: [
    { host: 'desmos.com', path: '' },
    { host: 'docs.google.com', path: '/document/d/abc' },
  ],
  endsAt: 10 * 60_000,
  released: false,
  showLiveSite: false,
};

const state = (over: Partial<FocusActiveSession> = {}): FocusLocalState => ({
  session: { ...session, ...over },
  offsetMs: 0,
  reported: null,
  reportedAt: 0,
  reportedHost: null,
  blockedTries: 0,
});

describe('FocusView', () => {
  it('shows the teacher, minutes left and a button per site', () => {
    render(<FocusView state={state()} now={0} />);
    expect(
      screen.getByText(/Ms\. Rivera started focus time\. 10 minutes left\./)
    ).toBeTruthy();
    const links = screen.getAllByRole('link');
    expect(links.map((a) => a.getAttribute('href'))).toEqual([
      'https://desmos.com',
      'https://docs.google.com/document/d/abc',
    ]);
    expect(screen.queryByText(/can see which site/)).toBeNull();
  });

  it('says so when the teacher can see the site', () => {
    render(
      <FocusView state={state({ showLiveSite: true })} now={9 * 60_000 + 1} />
    );
    expect(screen.getByText(/1 minute left\./)).toBeTruthy();
    expect(
      screen.getByText("Your teacher can see which site you're on.")
    ).toBeTruthy();
  });

  it('ends for a released student and when time is up', () => {
    const { rerender } = render(
      <FocusView state={state({ released: true })} now={0} />
    );
    expect(
      screen.getByText('Your teacher released you from focus time.')
    ).toBeTruthy();
    rerender(<FocusView state={state()} now={session.endsAt} />);
    expect(screen.getByText('Focus time is over.')).toBeTruthy();
    rerender(<FocusView state={null} now={0} />);
    expect(screen.getByText('Focus time is over.')).toBeTruthy();
  });
});

describe('FocusView enforcement (FS7)', () => {
  it('reads the mode from its own address', () => {
    expect(pageMode('?parked=https%3A%2F%2Fgames.example%2F')).toBe('parked');
    expect(pageMode('?notice=blocked')).toBe('notice');
    expect(pageMode('')).toBe('plain');
  });

  it('says a parked tab is paused and a blocked site was sent here', () => {
    const { rerender } = render(
      <FocusView state={state()} now={0} mode="parked" />
    );
    expect(screen.getByText(PARKED_TITLE)).toBeTruthy();
    rerender(<FocusView state={state()} now={0} mode="notice" />);
    expect(screen.getByRole('status').textContent).toBe(
      "That site isn't part of focus time."
    );
  });

  it('offers fullscreen only at Lock outside it', () => {
    const onFullscreen = vi.fn();
    const { rerender } = render(
      <FocusView
        state={state()}
        now={0}
        needsFullscreen
        onFullscreen={onFullscreen}
      />
    );
    expect(screen.queryByRole('button')).toBeNull();
    rerender(
      <FocusView
        state={state({ level: 'lock' })}
        now={0}
        needsFullscreen
        onFullscreen={onFullscreen}
      />
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Return to fullscreen' })
    );
    expect(onFullscreen).toHaveBeenCalledTimes(1);
  });
});
