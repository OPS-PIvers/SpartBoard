import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LazyChunkErrorBoundary } from '@/components/common/LazyChunkErrorBoundary';

const Bomb = ({ error }: { error: Error }) => {
  throw error;
};

const buildChunkError = () =>
  new TypeError(
    'Failed to fetch dynamically imported module: /assets/Widget-abc123.js'
  );

describe('LazyChunkErrorBoundary', () => {
  let reloadSpy: ReturnType<typeof vi.fn>;
  let originalLocation: Location;
  const noop = () => {
    /* swallow logs in tests */
  };

  beforeEach(() => {
    window.sessionStorage.clear();
    reloadSpy = vi.fn();
    originalLocation = window.location;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, reload: reloadSpy },
    });
    // React logs caught errors to console.error; silence to keep test output readable.
    vi.spyOn(console, 'warn').mockImplementation(noop);
    vi.spyOn(console, 'error').mockImplementation(noop);
  });

  afterEach(() => {
    window.sessionStorage.clear();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    });
    vi.restoreAllMocks();
  });

  it('renders children when no error occurs', () => {
    render(
      <LazyChunkErrorBoundary>
        <p>healthy widget</p>
      </LazyChunkErrorBoundary>
    );
    expect(screen.getByText('healthy widget')).toBeInTheDocument();
  });

  it('triggers a reload and shows the updating spinner on a stale-chunk error', () => {
    render(
      <LazyChunkErrorBoundary>
        <Bomb error={buildChunkError()} />
      </LazyChunkErrorBoundary>
    );

    expect(reloadSpy).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Updating…')).toBeInTheDocument();
  });

  it('shows the retry tile when chunk reload was already attempted this session', () => {
    window.sessionStorage.setItem('spartboard:chunk-reload-attempted', '1');

    render(
      <LazyChunkErrorBoundary>
        <Bomb error={buildChunkError()} />
      </LazyChunkErrorBoundary>
    );

    expect(reloadSpy).not.toHaveBeenCalled();
    expect(screen.getByText('Widget failed to load')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('renders a retry tile for non-chunk render errors and recovers when Retry is clicked', () => {
    let shouldThrow = true;
    const Conditional = () => {
      if (shouldThrow) throw new Error('boom');
      return <p>recovered</p>;
    };

    render(
      <LazyChunkErrorBoundary>
        <Conditional />
      </LazyChunkErrorBoundary>
    );

    expect(reloadSpy).not.toHaveBeenCalled();
    expect(screen.getByText('Widget failed to load')).toBeInTheDocument();

    shouldThrow = false;
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(screen.getByText('recovered')).toBeInTheDocument();
  });
});
