import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { WritingPlayer } from '@/components/common/WritingPlayback';
import { WritingLogWriter } from '@/utils/writingLog';

const logOf = (steps: string[]) => {
  const w = new WritingLogWriter(undefined);
  let prev = '';
  steps.forEach((next, i) => {
    w.write(prev, next, i * 200, i === 3 ? 'pasted' : 'typed', 1e6);
    prev = next;
  });
  return w.value;
};

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe('WritingPlayer', () => {
  it('opens on the finished answer with its revision counts', () => {
    render(<WritingPlayer log={logOf(['c', 'ca', 'c', 'c pasted'])} />);
    expect(
      screen.getByText('pasted', { selector: 'mark' })
    ).toBeInTheDocument();
    expect(screen.getByText('1 (1 character)')).toBeInTheDocument();
    expect(screen.getByText(/7 characters pasted/)).toBeInTheDocument();
  });

  it('leaves out paste marks when the pasted sign is hidden', () => {
    render(
      <WritingPlayer log={logOf(['c', 'ca', 'c', 'c pasted'])} hidePasted />
    );
    expect(screen.queryByText('pasted', { selector: 'mark' })).toBeNull();
    expect(screen.queryByText(/characters pasted/)).toBeNull();
    expect(screen.queryByText('Pasted')).toBeNull();
  });

  it('replays from the start, one edit at a time', () => {
    vi.useFakeTimers();
    render(<WritingPlayer log={logOf(['c', 'ca', 'cat'])} />);
    fireEvent.click(screen.getByRole('button', { name: 'Play again' }));
    const slider = screen.getByRole('slider');
    expect(slider).toHaveValue('0');
    act(() => void vi.advanceTimersByTime(15));
    expect(slider).toHaveValue('1');
    act(() => void vi.advanceTimersByTime(110));
    expect(slider).toHaveValue('2');
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    act(() => void vi.advanceTimersByTime(1000));
    expect(slider).toHaveValue('2');
  });
});
