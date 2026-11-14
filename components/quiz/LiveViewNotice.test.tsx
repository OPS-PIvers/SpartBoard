import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { NUDGE_SHOW_MS } from '@/utils/quizNudgeNotes';
import { LiveViewNotice } from './LiveViewNotice';

describe('LiveViewNotice', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(100_000);
  });
  afterEach(() => vi.useRealTimers());

  it('shows nothing while the teacher watches silently', () => {
    const { container } = render(
      <LiveViewNotice liveView={{ until: 400_000, notify: false }} />
    );
    expect(container.textContent).toBe('');
  });

  it('shows the banner until the stamp runs out', () => {
    render(<LiveViewNotice liveView={{ until: 105_000, notify: true }} />);
    expect(screen.getByText('Your teacher is viewing your quiz')).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(5_001);
    });
    expect(screen.queryByText('Your teacher is viewing your quiz')).toBeNull();
  });

  it('shows a Nudge note once, for a few seconds', () => {
    render(
      <LiveViewNotice
        liveView={{
          until: 400_000,
          notify: false,
          nudge: { at: 100_000, noteId: 'see-me' },
        }}
      />
    );
    expect(screen.getByText('Please see me')).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(NUDGE_SHOW_MS + 1);
    });
    expect(screen.queryByText('Please see me')).toBeNull();
  });

  it('does not replay an old Nudge after a reload', () => {
    render(
      <LiveViewNotice
        liveView={{
          until: 400_000,
          notify: false,
          nudge: { at: 100_000 - NUDGE_SHOW_MS - 1, noteId: 'keep-going' },
        }}
      />
    );
    expect(screen.queryByText('Keep going')).toBeNull();
  });
});
