import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ShortenUrlButton } from '@/components/admin/ShortenUrlButton';
import type { CreateResult } from '@/hooks/useShortLinks';

// Mutable auth value so each test can flip admin status.
const authValue: { isAdmin: boolean } = { isAdmin: true };
vi.mock('@/context/useAuth', () => ({
  useAuth: () => authValue,
}));

// createShortLink is a spy whose resolution is staged per-test.
const createShortLinkMock =
  vi.fn<
    (input: { destination: string; label?: string }) => Promise<CreateResult>
  >();
vi.mock('@/hooks/useShortLinks', () => ({
  useShortLinks: () => ({ createShortLink: createShortLinkMock }),
}));

describe('ShortenUrlButton', () => {
  beforeEach(() => {
    authValue.isAdmin = true;
    createShortLinkMock.mockReset();
  });

  it('renders nothing for non-admins', () => {
    authValue.isAdmin = false;
    const { container } = render(
      <ShortenUrlButton url="https://example.com" onShortened={vi.fn()} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('is disabled when the url is blank', () => {
    render(<ShortenUrlButton url="   " onShortened={vi.fn()} />);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('calls onShortened with the /r/ short URL on success', async () => {
    const user = userEvent.setup();
    createShortLinkMock.mockResolvedValue({
      ok: true,
      link: {
        code: 'lesson-1',
        destination: 'https://example.com/doc',
        createdBy: 'uid-1',
        createdByEmail: 'admin@example.com',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        clicks: 0,
        lastClickedAt: null,
      },
    });
    const onShortened = vi.fn();

    render(
      <ShortenUrlButton
        url="https://example.com/doc"
        label="Lesson 1"
        onShortened={onShortened}
      />
    );

    await user.click(screen.getByRole('button'));

    await waitFor(() => expect(onShortened).toHaveBeenCalledTimes(1));
    expect(createShortLinkMock).toHaveBeenCalledWith({
      destination: 'https://example.com/doc',
      label: 'Lesson 1',
    });
    const shortUrl = onShortened.mock.calls[0][0] as string;
    expect(shortUrl).toMatch(/\/r\/lesson-1$/);
  });

  it('surfaces an error and does not call onShortened on failure', async () => {
    const user = userEvent.setup();
    createShortLinkMock.mockResolvedValue({
      ok: false,
      reason: '"taken" is already taken.',
    });
    const onShortened = vi.fn();

    render(
      <ShortenUrlButton url="https://example.com" onShortened={onShortened} />
    );

    await user.click(screen.getByRole('button'));

    await waitFor(() =>
      expect(screen.getByText('"taken" is already taken.')).toBeInTheDocument()
    );
    expect(onShortened).not.toHaveBeenCalled();
  });
});
