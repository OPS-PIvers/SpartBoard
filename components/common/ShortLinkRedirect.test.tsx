import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { ShortLinkRedirect } from './ShortLinkRedirect';

const resolveShortLink = vi.fn();
vi.mock('@/utils/shortLinksApi', () => ({
  resolveShortLink: (code: string) => resolveShortLink(code) as unknown,
  recordShortLinkClick: vi.fn(() => Promise.resolve()),
}));
vi.mock('@/utils/logError', () => ({ logError: vi.fn() }));

describe('ShortLinkRedirect', () => {
  beforeEach(() => {
    resolveShortLink.mockReset();
    resolveShortLink.mockResolvedValue(null);
  });
  afterEach(() => {
    window.history.pushState({}, '', '/');
  });

  it('resolves a mixed-case code by its lowercase stored slug', async () => {
    window.history.pushState({}, '', '/r/Math-Help');
    render(<ShortLinkRedirect />);
    await waitFor(() => expect(resolveShortLink).toHaveBeenCalledTimes(2));
    expect(resolveShortLink).toHaveBeenNthCalledWith(1, 'Math-Help');
    expect(resolveShortLink).toHaveBeenNthCalledWith(2, 'math-help');
  });

  it('resolves an older mixed-case link by its exact id first', async () => {
    resolveShortLink.mockResolvedValueOnce({
      destination: 'https://example.com',
    });
    window.history.pushState({}, '', '/r/OldLink');
    render(<ShortLinkRedirect />);
    await waitFor(() => expect(resolveShortLink).toHaveBeenCalled());
    expect(resolveShortLink).toHaveBeenCalledTimes(1);
    expect(resolveShortLink).toHaveBeenCalledWith('OldLink');
  });
});
