import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { JoinCodeScreen } from './JoinCodeScreen';
import type { QuizSession } from '@/types';

const session = { code: 'ABC123' } as QuizSession;

function stubClipboard(writeText: () => Promise<void>) {
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
  });
}

describe('JoinCodeScreen copy', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows Copied after a successful copy', async () => {
    stubClipboard(() => Promise.resolve());
    render(<JoinCodeScreen session={session} />);
    fireEvent.click(screen.getByRole('button', { name: /copy link/i }));
    await waitFor(() => expect(screen.getByText('Copied')).toBeTruthy());
  });

  it('does not claim Copied or leak a rejection when the clipboard is denied', async () => {
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    stubClipboard(() => Promise.reject(new Error('denied')));
    render(<JoinCodeScreen session={session} />);
    fireEvent.click(screen.getByRole('button', { name: /copy link/i }));
    await new Promise((r) => setTimeout(r, 20));
    process.off('unhandledRejection', unhandled);
    expect(screen.queryByText('Copied')).toBeNull();
    expect(unhandled).not.toHaveBeenCalled();
  });
});
