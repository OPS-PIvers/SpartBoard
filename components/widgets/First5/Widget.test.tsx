import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { WidgetData } from '@/types';
import { First5Widget } from './Widget';
import { useFirst5Url } from './hooks/useFirst5Url';

vi.mock('./hooks/useFirst5Url');

const mockUseFirst5Url = vi.mocked(useFirst5Url);

const createWidget = (): WidgetData =>
  ({
    id: 'first5-1',
    type: 'first-5',
    x: 0,
    y: 0,
    w: 400,
    h: 300,
    z: 1,
    config: {},
  }) as WidgetData;

describe('First5Widget', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('exposes an accessible label on the external-link control when a URL is loaded', () => {
    mockUseFirst5Url.mockReturnValue({
      url: 'https://www.edtomorrow.com/today/1j',
      error: null,
      isLoading: false,
    });

    render(<First5Widget widget={createWidget()} />);

    // The icon-only link must be reachable by its accessible name for screen
    // readers; the title attribute is preserved for sighted hover users.
    const link = screen.getByRole('link', { name: 'Open in new tab' });
    expect(link).toHaveAttribute('href', 'https://www.edtomorrow.com/today/1j');
    expect(link).toHaveAttribute('title', 'Open in new tab');
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('renders an empty state (no link) when no URL is available', () => {
    mockUseFirst5Url.mockReturnValue({
      url: null,
      error: 'Unable to load First 5 content.',
      isLoading: false,
    });

    render(<First5Widget widget={createWidget()} />);

    expect(
      screen.queryByRole('link', { name: 'Open in new tab' })
    ).not.toBeInTheDocument();
  });
});
