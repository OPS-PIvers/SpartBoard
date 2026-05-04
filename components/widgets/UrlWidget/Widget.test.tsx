import { render, screen, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { UrlWidget } from './Widget';
import { WidgetData, UrlWidgetConfig } from '@/types';

let mockOpen: ReturnType<typeof vi.spyOn>;

const createMockWidget = (
  config: Partial<UrlWidgetConfig> = {}
): WidgetData => ({
  id: 'test-widget-id',
  type: 'url',
  x: 0,
  y: 0,
  w: 2,
  h: 2,
  z: 1,
  flipped: false,
  config: {
    urls: [
      {
        id: 'url-1',
        url: 'https://example.com',
        title: 'Example',
        color: '#123456',
      },
    ],
    ...config,
  },
});

describe('UrlWidget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOpen = vi.spyOn(window, 'open').mockImplementation(() => null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders correctly with URLs', () => {
    const widget = createMockWidget();
    render(<UrlWidget widget={widget} />);
    expect(screen.getByText('Example')).toBeInTheDocument();
  });

  it('opens URL in a new tab when the card is clicked', () => {
    const widget = createMockWidget();
    render(<UrlWidget widget={widget} />);

    const textElement = screen.getByText('Example');
    fireEvent.click(textElement);

    expect(mockOpen).toHaveBeenCalledWith(
      'https://example.com',
      '_blank',
      'noopener,noreferrer'
    );
  });

  it('does not render a corner Create QR Code button (paste flow handles QR choice)', () => {
    const widget = createMockWidget();
    render(<UrlWidget widget={widget} />);

    expect(screen.queryByTitle('Create QR Code')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Create QR Code')).not.toBeInTheDocument();
  });

  it('renders an image-background tile (with bottom text plate) when imageUrl is set', () => {
    const widget = createMockWidget({
      urls: [
        {
          id: 'url-img',
          url: 'https://example.com',
          title: 'With Image',
          imageUrl: 'https://images.example.com/photo.jpg',
        },
      ],
    });
    const { container } = render(<UrlWidget widget={widget} />);

    const img = container.querySelector(
      'img[src="https://images.example.com/photo.jpg"]'
    );
    expect(img).not.toBeNull();
    expect(screen.getByText('With Image')).toBeInTheDocument();
  });

  it('does NOT render an image when imageUrl uses an unsafe (non-https) protocol', () => {
    const widget = createMockWidget({
      urls: [
        {
          id: 'url-bad',
          url: 'https://example.com',
          title: 'Unsafe',
          imageUrl: 'http://insecure.example.com/photo.jpg',
        },
      ],
    });
    const { container } = render(<UrlWidget widget={widget} />);

    const img = container.querySelector(
      'img[src^="http://insecure.example.com"]'
    );
    expect(img).toBeNull();
  });

  it('applies a circular shape when shape is "circle"', () => {
    const widget = createMockWidget({
      urls: [
        {
          id: 'url-circle',
          url: 'https://example.com',
          title: 'Round',
          color: '#ef4444',
          shape: 'circle',
        },
      ],
    });
    const { container } = render(<UrlWidget widget={widget} />);

    const circle = container.querySelector('.rounded-full.aspect-square');
    expect(circle).not.toBeNull();
  });
});
