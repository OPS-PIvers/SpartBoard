import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import RemoteControlMenu from './RemoteControlMenu';
import { useDashboard } from '@/context/useDashboard';
import { useAuth } from '@/context/useAuth';

vi.mock('@/context/useDashboard', () => ({
  useDashboard: vi.fn(),
}));

vi.mock('@/context/useAuth', () => ({
  useAuth: vi.fn(),
}));

describe('RemoteControlMenu', () => {
  const updateAccountPreferences = vi.fn();
  const onClose = vi.fn();
  const anchorRect = {
    left: 20,
    top: 40,
    right: 120,
    bottom: 80,
    width: 100,
    height: 40,
    x: 20,
    y: 40,
    toJSON: () => ({}),
  } as DOMRect;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('open', vi.fn(() => null) as unknown as typeof window.open);
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: new URL('https://spart.test/dashboard'),
    });

    (useDashboard as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      activeDashboard: {
        id: 'board-123',
        name: 'Board 123',
      },
    });

    (useAuth as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      remoteControlEnabled: true,
      updateAccountPreferences,
    });
  });

  it('renders a board-specific remote URL and opens that targeted view', async () => {
    const user = userEvent.setup();

    render(<RemoteControlMenu onClose={onClose} anchorRect={anchorRect} />);

    expect(
      screen.getByText('https://spart.test/remote?boardId=board-123')
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /open remote view/i }));

    expect(window.open).toHaveBeenCalledWith(
      'https://spart.test/remote?boardId=board-123',
      '_blank'
    );
    expect(onClose).toHaveBeenCalled();
  });

  describe('copy link "copied" indicator', () => {
    const writeText = vi.fn().mockResolvedValue(undefined);

    beforeEach(() => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText },
      });
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('keeps showing "copied" for a full 2s after the most recent click, not the first', async () => {
      render(<RemoteControlMenu onClose={onClose} anchorRect={anchorRect} />);
      const copyButton = screen.getByTitle('Copy Remote Link');

      await act(async () => {
        fireEvent.click(copyButton);
        await Promise.resolve();
      });
      expect(copyButton.className).toContain('bg-green-500');

      // Re-click 1s later, before the first timer fires; this should restart the 2s countdown.
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      await act(async () => {
        fireEvent.click(copyButton);
        await Promise.resolve();
      });
      expect(copyButton.className).toContain('bg-green-500');

      // 2s after the first click, but only 1s after the second — must still be showing.
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(copyButton.className).toContain('bg-green-500');

      // 2s after the second (most recent) click — now it clears.
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(copyButton.className).not.toContain('bg-green-500');
    });
  });
});
