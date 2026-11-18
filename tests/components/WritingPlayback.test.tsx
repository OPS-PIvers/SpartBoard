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
import * as writingLog from '@/utils/writingLog';

vi.mock('@/utils/writingLog', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/utils/writingLog')>();
  return { ...real, summarizeWriting: vi.fn(real.summarizeWriting) };
});

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

  it('marks long pauses on the timeline and skips them', () => {
    const w = new WritingLogWriter(undefined);
    w.write('', 'a', 0, 'typed', 1e6);
    w.write('a', 'ab', 100, 'typed', 1e6);
    w.write('ab', 'abc', 30_100, 'typed', 1e6);
    render(<WritingPlayer log={w.value} />);
    expect(screen.queryByText(/shortened/)).toBeNull();
    fireEvent.click(
      screen.getByRole('button', { name: 'Jump to the 30 sec pause' })
    );
    expect(screen.getByRole('slider')).toHaveValue('2');
    expect(screen.getByText('Paused for 30 sec here')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Skip pause' }));
    expect(screen.getByRole('slider')).toHaveValue('3');
    expect(screen.queryByRole('button', { name: 'Skip pause' })).toBeNull();
  });

  it('lists writing sessions and jumps to where one starts', () => {
    const day = Date.UTC(2026, 10, 16, 15);
    const w = new WritingLogWriter(undefined);
    w.write('', 'a', 0, 'typed', 1e6, day);
    w.write('a', 'ab', 100, 'typed', 1e6, day + 100);
    w.write('ab', 'abc', 200, 'typed', 1e6, day + 86_400_000);
    render(<WritingPlayer log={w.value} />);
    expect(screen.getByText('Sessions')).toBeInTheDocument();
    expect(screen.getByText('Session 2:')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Jump to session 2' }));
    expect(screen.getByRole('slider')).toHaveValue('2');
    expect(screen.getByText(/^Session 2 starts /)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Skip pause' })).toBeNull();
  });
});

describe('WritingPlayer stats cost (security #20)', () => {
  it('never summarizes the log in facts mode', () => {
    vi.mocked(writingLog.summarizeWriting).mockClear();
    render(
      <WritingPlayer log={logOf(['c', 'ca', 'cat'])} facts={{ marks: [] }} />
    );
    expect(writingLog.summarizeWriting).not.toHaveBeenCalled();
  });
});
